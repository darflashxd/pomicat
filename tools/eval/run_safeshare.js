// Usage: node tools/eval/run_safeshare.js gold.jsonl > out_safeshare.jsonl
// Gold rows follow the ai4privacy format: { id?, source_text, privacy_mask: [{ value, label }] }.
// Each row is redacted on its own (no cross-row state).
const fs = require("fs");
const readline = require("readline");
const { redactTurns } = require("../../bin/safeshare.js");

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]) });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const output = redactTurns([{ role: "user", content: row.source_text }])[0].content;
    process.stdout.write(JSON.stringify({ id: row.id ?? n, output }) + "\n");
    n++;
  }
})();
