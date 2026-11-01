// Usage: node tools/eval/wildchat_fp.js 500 tools/eval/data/wildchat_redactions.jsonl [--presidio http://127.0.0.1:5002 [--names personal|all]]
// Samples English WildChat-1M conversations (real user<->ChatGPT chats, no PII labels) via the
// Hugging Face datasets-server, runs SafeShare on each, and writes every redaction with its
// context so they can be hand-labelled as true or false positives.
// The data stays local (tools/eval/data is gitignored); it can contain real personal data.
const fs = require("fs");
const { redact } = require("../../bin/pomicat.js");

const [n = "500", outPath = "tools/eval/data/wildchat_redactions.jsonl", ...rest] = process.argv.slice(2);
const arg = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const policy = arg("--presidio") ? { presidio: { url: arg("--presidio"), names: arg("--names") || "personal" } } : {};
// Any SafeShare placeholder ([REDACTED_X], [User_A], [LOCATION_2], [user], ...); ones already in the source are skipped below
const PLACEHOLDER = /\[[A-Za-z][A-Za-z_]*(?:_\d+)?\]|\[user_\d+@protected\.local\]|sk-dummy[\w-]*|ghp_dummy\w*|placeholder_password/g;

async function rows(offset, length) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=allenai/WildChat-1M&config=default&split=train&offset=${offset}&length=${length}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res && res.ok) return (await res.json()).rows.map((r) => r.row);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error("datasets-server kept failing at offset " + offset);
}

(async () => {
  const out = fs.createWriteStream(outPath);
  let seen = 0, flagged = 0, redactions = 0, offset = 0;
  while (seen < Number(n)) {
    for (const row of await rows(offset, 100)) {
      if (row.language !== "English" || seen >= Number(n)) continue;
      seen++;
      const turns = row.conversation.map((t) => ({ role: t.role, content: t.content || "" }));
      let red;
      try { red = await redact(turns, policy); } catch { continue; }
      let hit = false;
      red.forEach((t, i) => {
        for (const m of t.content.matchAll(PLACEHOLDER)) {
          if (turns[i].content.includes(m[0])) continue; // already in the source (e.g. code like arr[i])
          hit = true;
          redactions++;
          const ctx = t.content.slice(Math.max(0, m.index - 80), m.index + m[0].length + 40);
          out.write(JSON.stringify({ conv: row.conversation_hash, turn: i, role: t.role, tag: m[0], context: ctx }) + "\n");
        }
      });
      flagged += hit;
    }
    offset += 100;
  }
  out.end();
  console.log(`${seen} English conversations, ${flagged} with at least one redaction (${(100 * flagged / seen).toFixed(1)}%), ${redactions} redactions -> ${outPath}`);
})();
