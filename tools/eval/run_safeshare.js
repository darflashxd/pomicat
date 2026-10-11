// Usage: node tools/eval/run_safeshare.js gold.jsonl [--presidio http://127.0.0.1:5002] [--profile public|trusted] > out.jsonl
// Gold rows follow the ai4privacy format: { id?, source_text, privacy_mask: [{ value, label }] }.
// Each row is redacted on its own (no cross-row state).
const fs = require("fs");
const readline = require("readline");
const { redact } = require("../../bin/safeshare.js");

const args = process.argv.slice(3);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const policy = { presidio: opt("--presidio"), profile: opt("--profile") };

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]) });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const output = (await redact([{ role: "user", content: row.source_text }], policy))[0].content;
    process.stdout.write(JSON.stringify({ id: row.id ?? n, output }) + "\n");
    n++;
  }
})();
