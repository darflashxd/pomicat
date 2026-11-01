// Usage: node tools/eval/make_label_sheet.js [rows=300] [--presidio http://127.0.0.1:5002]
//
// Builds a labelling sheet for the "does this belong to the person writing?" question, from the
// cached WildChat conversations (run tools/eval/inversion_wild.js first to fill the cache).
//
// Each row is one candidate from a USER message, shown in context with the item marked «like
// this»: names and places (Presidio, every name), amounts and health terms (SafeShare's
// contextual rules). Labellers answer one column: is this about the person writing?
//
// Output: tools/eval/data/label_sheet.csv (gitignored: real people's text, keep it private).
const fs = require("fs");
const path = require("path");
const { presidioHits } = require("../../bin/pomicat.js");
const ContextualClassifier = require("../../extension/engine/contextual.js");

const args = process.argv.slice(2);
const ROWS = Number(args.find((a) => /^\d+$/.test(a)) || 300);
const PRESIDIO = args.includes("--presidio") ? args[args.indexOf("--presidio") + 1] : null;
const CACHE = path.join(__dirname, "data", "wildchat_cache.jsonl");
const OUT = path.join(__dirname, "data", "label_sheet.csv");

// Same mix as the problem: names/places (the hard case), amounts, health
const QUOTA = { name: Math.round(ROWS * 0.5), amount: Math.round(ROWS * 0.35), health: ROWS - Math.round(ROWS * 0.5) - Math.round(ROWS * 0.35) };

const csv = (s) => `"${String(s).replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;
function contextOf(text, raw) {
  const i = text.indexOf(raw);
  if (i < 0) return null;
  const start = Math.max(0, i - 160);
  const end = Math.min(text.length, i + raw.length + 120);
  return (start ? "…" : "") + text.slice(start, i) + "«" + raw + "»" + text.slice(i + raw.length, end) + (end < text.length ? "…" : "");
}

(async () => {
  if (!fs.existsSync(CACHE)) throw new Error("No cache yet: run node tools/eval/inversion_wild.js first");
  const convs = fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const ctx = new ContextualClassifier();
  const picked = { name: [], amount: [], health: [] };
  const seen = new Set();

  // Deterministic shuffle so the same sheet comes out every time
  let seed = 1337;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const order = convs.map((c, i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => convs[i]);

  for (const c of order) {
    if (Object.keys(QUOTA).every((k) => picked[k].length >= QUOTA[k])) break;
    const userTurns = c.turns.map((t, i) => ({ ...t, i })).filter((t) => t.role === "user" && t.content.length < 4000);
    if (!userTurns.length) continue;
    const cands = [];
    for (const t of userTurns) {
      for (const h of ctx.classifyTurn(t.content, t.i)) {
        if (h.category === "SENSITIVE_FINANCIAL") cands.push({ kind: "amount", raw: h.raw.trim(), text: t.content });
        if (h.category === "SENSITIVE_HEALTH") cands.push({ kind: "health", raw: h.raw.trim(), text: t.content });
      }
    }
    if (PRESIDIO && picked.name.length < QUOTA.name) {
      const hits = await presidioHits(userTurns.map((t) => ({ role: "user", content: t.content })), {
        presidio: { url: PRESIDIO, names: "all", entities: ["PERSON", "LOCATION"] }
      }).catch(() => []);
      for (const h of hits) cands.push({ kind: "name", raw: h.raw, text: userTurns[h.turnIndex].content });
    }
    // At most one row per kind per conversation, so no single chat dominates
    const usedKinds = new Set();
    for (const cand of cands) {
      if (usedKinds.has(cand.kind) || picked[cand.kind].length >= QUOTA[cand.kind]) continue;
      const key = cand.kind + "::" + cand.raw.toLowerCase();
      if (seen.has(key) || cand.raw.length < 2) continue;
      const context = contextOf(cand.text, cand.raw);
      if (!context) continue;
      seen.add(key);
      usedKinds.add(cand.kind);
      picked[cand.kind].push({ conv: c.hash, kind: cand.kind, item: cand.raw, context });
    }
  }

  const rows = [...picked.name, ...picked.amount, ...picked.health].map((r) => [rand(), r]).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  const header = "id,type,item,context,about_writer (yes/no/unsure),notes";
  const lines = rows.map((r, i) => [i + 1, r.kind, csv(r.item), csv(r.context), "", ""].join(","));
  fs.writeFileSync(OUT, "﻿" + [header, ...lines].join("\r\n") + "\r\n"); // BOM so Excel reads UTF-8
  console.log(`${rows.length} rows -> ${OUT} (names ${picked.name.length}, amounts ${picked.amount.length}, health ${picked.health.length})`);
  if (!PRESIDIO) console.log("No --presidio: no name/place rows. Start tools/presidio_server.py and pass --presidio.");
})();
