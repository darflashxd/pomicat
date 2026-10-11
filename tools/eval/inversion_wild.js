// Usage: node tools/eval/inversion_wild.js [conversations=6000]
//
// How often does the inversion attack recover a redacted amount in REAL chats?
//
// Data: English WildChat-1M conversations (real user <-> ChatGPT chats), cached in
// tools/eval/data/wildchat_cache.jsonl (gitignored: real people's text, keep it local).
//
// For every conversation where the user states an amount ("my salary is $4,500"):
//   1. entity redaction: mask each amount the user stated, everywhere it appears, and nothing
//      else. This is the best an entity-by-entity redactor can do.
//   2. attack: run invert(); "recovered" = a top-3 guess within 1.5% of a masked amount.
//   3. SafeShare: redact with SafeShare (default settings) and attack again.
//   4. control: score the same guesses against a decoy (amount x 1.37) to measure chance hits.
const fs = require("fs");
const path = require("path");
const { redactTurns, invert } = require("../../bin/safeshare.js");
const ContextualClassifier = require("../../extension/engine/contextual.js");
const ConsistentPseudonymizer = require("../../extension/engine/pseudonymizer.js");

const N = Number(process.argv[2] || 6000);
const CACHE = path.join(__dirname, "data", "wildchat_cache.jsonl");
const TOL = 0.015;
// "Personal money": the amount sits in a sentence where the user talks about their own finances
const PERSONAL = /\b(?:my|our|i|i'm|we)\b[^.\n]{0,60}\b(?:salary|income|earn|earning|paid|pay|rent|budget|saving|savings|debt|loan|mortgage|spend|spending|bills?|allowance|wage|gaji|penghasilan)\b/i;

async function rows(offset) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=allenai/WildChat-1M&config=default&split=train&offset=${offset}&length=100`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res && res.ok) return (await res.json()).rows.map((r) => r.row);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error("datasets-server kept failing at offset " + offset);
}

async function loadConversations() {
  const have = fs.existsSync(CACHE) ? fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean).map(JSON.parse) : [];
  if (have.length >= N) return have.slice(0, N);
  const out = fs.createWriteStream(CACHE, { flags: "a" });
  let offset = have.length ? have[have.length - 1].offset + 100 : 0;
  while (have.length < N) {
    for (const row of await rows(offset)) {
      if (row.language !== "English" || have.length >= N) continue;
      const conv = {
        offset,
        hash: row.conversation_hash,
        turns: row.conversation.map((t) => ({ role: t.role, content: t.content || "" }))
      };
      have.push(conv);
      out.write(JSON.stringify(conv) + "\n");
    }
    offset += 100;
    if (offset % 2000 === 0) process.stderr.write(`  fetched ${have.length} English conversations\n`);
  }
  out.end();
  return have;
}

const near = (a, b) => Math.abs(a - b) / b <= TOL;
const recovered = (text, targets) => {
  const guesses = invert(text, { limit: 3 });
  return targets.some((s) => guesses.some((g) => near(g.value, s)));
};

(async () => {
  const convs = await loadConversations();
  const ctx = new ContextualClassifier();
  const parser = new ConsistentPseudonymizer();

  let withAmounts = 0, withDerived = 0, entityHit = 0, entityTop1 = 0, safeHit = 0, decoyHit = 0;
  let echoVisible = 0, echoAfterSafeShare = 0;
  const personal = { n: 0, echo: 0, invert: 0, safeEcho: 0 };
  const echoes = [];
  const { AdversaryOracleSolver } = ConsistentPseudonymizer;
  const lexer = new AdversaryOracleSolver(TOL);
  // Is a masked amount still visible in another format ("$5,000" masked, assistant wrote "5k")?
  const stillVisible = (text, secrets) => {
    const vals = lexer.lexNumericSpans(text).filter((t) => !t.isRatio && !t.isSmallInt).map((t) => t.val);
    return secrets.some((s) => vals.some((v) => near(v, s)));
  };
  const examples = [];
  const safeMisses = [];

  for (const c of convs) {
    if (!c.turns.some((t) => t.role === "assistant")) continue;
    // Amounts the user stated, according to SafeShare's contextual rules
    const stated = [];
    c.turns.forEach((t, i) => {
      if (t.role !== "user") return;
      for (const h of ctx.classifyTurn(t.content, i)) {
        if (h.category !== "SENSITIVE_FINANCIAL") continue;
        const v = parser.parseFinancialValue(h.raw);
        if (v >= 100 && !stated.some((s) => s.raw === h.raw)) stated.push({ raw: h.raw.trim(), v, personal: PERSONAL.test(h.sentence || "") && v < 1e8 });
      }
    });
    if (!stated.length) continue;
    withAmounts++;

    // 1. entity redaction: mask exactly those amounts, everywhere
    const masked = c.turns.map((t) => {
      let s = t.content;
      for (const a of stated) s = s.split(a.raw).join("[REDACTED]");
      return s;
    }).join("\n\n");
    const secrets = stated.map((a) => a.v);

    // Only conversations where the assistant actually wrote numbers can leak
    if (!/\d/.test(c.turns.filter((t) => t.role === "assistant").map((t) => t.content).join(" "))) continue;
    withDerived++;
    const isPersonal = stated.some((a) => a.personal);
    if (isPersonal) personal.n++;

    if (stillVisible(masked, secrets)) {
      echoVisible++;
      if (isPersonal) personal.echo++;
      if (echoes.length < 12) echoes.push({ conv: c.hash, stated: stated.map((a) => a.raw) });
    }

    const top = invert(masked, { limit: 3 });
    const hit = secrets.some((s) => top.some((g) => near(g.value, s)));
    if (hit) {
      entityHit++;
      if (isPersonal) personal.invert++;
      if (top[0] && secrets.some((s) => near(top[0].value, s))) entityTop1++;
      const g = top.find((g) => secrets.some((s) => near(g.value, s)));
      examples.push({ conv: c.hash, stated: stated.map((a) => a.raw), recovered: Math.round(g.value), from: g.derivations.slice(0, 3) });
    }
    if (top.some((g) => secrets.some((s) => near(g.value, s * 1.37)))) decoyHit++;

    // 3. SafeShare
    let safeText;
    try { safeText = redactTurns(c.turns).map((t) => t.content).join("\n\n"); } catch { continue; }
    if (stillVisible(safeText, secrets)) {
      echoAfterSafeShare++;
      if (isPersonal) personal.safeEcho++;
    }
    if (recovered(safeText, secrets)) {
      safeHit++;
      safeMisses.push({ conv: c.hash, stated: stated.map((a) => a.raw), guesses: invert(safeText, { limit: 3 }).map((g) => [Math.round(g.value), g.derivations.slice(0, 2)]) });
    }
  }

  const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "n/a");
  const report = {
    date: new Date().toISOString().slice(0, 10),
    conversations: convs.length,
    userStatesAmount: withAmounts,
    assistantRepliesWithNumbers: withDerived,
    stillVisibleInAnotherFormat: `${echoVisible} (${pct(echoVisible, withDerived)})`,
    stillVisibleAfterSafeShare: `${echoAfterSafeShare} (${pct(echoAfterSafeShare, withDerived)})`,
    recoveredAfterEntityRedaction: `${entityHit} (${pct(entityHit, withDerived)})`,
    recoveredTop1: `${entityTop1} (${pct(entityTop1, withDerived)})`,
    chanceHitsOnDecoy: `${decoyHit} (${pct(decoyHit, withDerived)})`,
    recoveredAfterSafeShare: `${safeHit} (${pct(safeHit, withDerived)})`,
    personalMoneySubset: personal,
    examples,
    safeMisses,
    echoes
  };
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(__dirname, "data", "inversion_wild_report.json"), JSON.stringify(report, null, 2));
})();
