// Usage: node tools/eval/run_safeshare.js gold.jsonl [--presidio URL] [--profile public|trusted] [--heuristics-trace] > out.jsonl
// --heuristics-trace evaluates ONLY the production deterministic scanner, not the full CLI.
// Gold rows follow the ai4privacy format: { id?, source_text, privacy_mask: [{ value, label }] }.
// Each row is redacted on its own (no cross-row state).
const fs = require("fs");
const readline = require("readline");
const { redact } = require("../../bin/safeshare.js");
const Heuristics = require('../../extension/engine/heuristics.js');

const args = process.argv.slice(3);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const policy = { presidio: opt("--presidio"), profile: opt("--profile") };

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]) });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (args.includes('--heuristics-trace')) {
      const result = new Heuristics().scan(row.source_text);
      if (result.baseText !== row.source_text) throw new Error('Trace export requires unchanged base text; normalization edits need explicit provenance');
      const pointOffset = offset => [...row.source_text.slice(0, offset)].length;
      const edits = [...result.detections].sort((a,b)=>a.index-b.index).map(d=>{
        if (!Number.isInteger(d.valueStart) || !Number.isInteger(d.valueEnd)) throw new Error('Missing explicit value bounds');
        const prefix = row.source_text.slice(d.index,d.valueStart);
        const suffix = row.source_text.slice(d.valueEnd,d.index+d.length);
        if (!d.replacement.startsWith(prefix) || !d.replacement.endsWith(suffix)) throw new Error('Replacement changed context outside explicit value');
        return {start:pointOffset(d.valueStart),end:pointOffset(d.valueEnd),
          replacement:d.replacement.slice(prefix.length,d.replacement.length-suffix.length)};
      });
      process.stdout.write(JSON.stringify({id:row.id ?? n,output:result.sanitizedText,edits,scope:'heuristics-only'})+'\n');
      n++;
      continue;
    }
    const output = (await redact([{ role: "user", content: row.source_text }], policy))[0].content;
    process.stdout.write(JSON.stringify({ id: row.id ?? n, output }) + "\n");
    n++;
  }
})();
