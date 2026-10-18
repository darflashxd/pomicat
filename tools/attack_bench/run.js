// node tools/attack_bench/run.js [--cases 40] [--llm] [--out tools/attack_bench/RESULTS.md]
//
// How often can an attacker recover a hidden salary from a redacted AI chat?
// Fictional chats only (generated below, fixed seed). For each chat the user states a salary and
// the assistant replies with figures derived from it, as assistants do. Each redactor hides what it
// hides; each attacker then tries to recover the salary. Recovered = within 1% of the truth.
//
// Redactors: none · naive (hides only the stated salary) · Presidio (default recognizers, needs
//            .venv-eval with presidio + en_core_web_lg) · SafeShare (bin/safeshare.js redact)
// Attackers: arithmetic (policy.invert, no key needed) · LLM (--llm; one of:
//            OPENAI_API_KEY + LLM_MODEL, ANTHROPIC_API_KEY + LLM_MODEL). Keys are read from the
//            environment only, never written anywhere. Only fictional chats are sent.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { redact } = require("../../bin/safeshare.js");
const { invert } = require("../../extension/engine/policy.js");

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const N = Number(opt("--cases", 40));
const OUT = opt("--out", path.join(__dirname, "RESULTS.md"));
const USE_LLM = args.includes("--llm");

// Deterministic fictional cases -------------------------------------------------------------
let seed = 1337;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const fmt = (v, lang) => lang === "id"
  ? `Rp ${Math.round(v).toLocaleString("de-DE")}`
  : `$${Math.round(v).toLocaleString("en-US")}`;

function makeCase(i) {
  const lang = i % 2 ? "id" : "en";
  const salary = lang === "id" ? pick([3, 4.5, 6, 7.5, 8, 12, 15]) * 1e6 : pick([2400, 3800, 5000, 6200, 7500, 9000]);
  const p = pick([0.1, 0.15, 0.2, 0.25, 0.3]);
  const k = 1 + (i % 3); // how many derived figures the assistant gives (1-3)
  const pct = `${Math.round(p * 100)}%`;
  const monthly = salary * p, yearly = salary * p * 12, rest = salary * (1 - p);
  const user = lang === "id"
    ? `Gaji saya ${fmt(salary, lang)} per bulan. Kalau saya nabung ${pct}, berapa per bulan dan setahun?`
    : `My salary is ${fmt(salary, lang)} a month. If I save ${pct}, how much is that per month and per year?`;
  const parts = lang === "id"
    ? [`Kalau kamu menabung ${pct}, itu ${fmt(monthly, lang)} per bulan`, `${fmt(yearly, lang)} setahun`, `sisanya ${fmt(rest, lang)} per bulan`]
    : [`Saving ${pct} gives ${fmt(monthly, lang)} a month`, `${fmt(yearly, lang)} a year`, `and ${fmt(rest, lang)} is left each month`];
  return { id: i + 1, lang, salary, turns: [{ role: "user", content: user }, { role: "assistant", content: parts.slice(0, k).join(", ") + "." }], k };
}

// Redactors -------------------------------------------------------------------------------
const naive = (c) => c.turns.map((t, i) => ({ ...t, content: i === 0 ? t.content.replace(/(?:Rp|\$)\s?[\d.,]+/, "[REDACTED]") : t.content }));

function presidioAll(cases) {
  const py = path.join(__dirname, "..", "..", ".venv-eval", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (!fs.existsSync(py)) return null;
  const rows = cases.flatMap((c) => c.turns.map((t, j) => ({ id: `${c.id}:${j}`, source_text: t.content })));
  const tmp = path.join(os.tmpdir(), `attack_bench_${process.pid}.jsonl`);
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n"));
  const r = spawnSync(py, [path.join(__dirname, "..", "eval", "run_presidio.py"), tmp], { encoding: "utf8", maxBuffer: 1 << 26 });
  fs.unlinkSync(tmp);
  if (r.status !== 0) { console.error("Presidio failed:", r.stderr.slice(-500)); return null; }
  const out = new Map(r.stdout.trim().split("\n").map((l) => JSON.parse(l)).map((o) => [o.id, o.output]));
  return cases.map((c) => c.turns.map((t, j) => ({ ...t, content: out.get(`${c.id}:${j}`) ?? t.content })));
}

// Attackers -------------------------------------------------------------------------------
const chatText = (turns) => turns.map((t) => `${t.role}: ${t.content}`).join("\n");
const arithmetic = async (turns) => { const f = invert(chatText(turns)); return f.length ? f[0].value : null; };

async function llm(turns) {
  const prompt = "This chat was partly redacted. Work out the user's exact monthly salary from everything " +
    "that is still visible. Reply with only the number (no currency, no words); reply 0 if impossible.\n\n" + chatText(turns);
  const model = process.env.LLM_MODEL;
  let text;
  if (process.env.OPENAI_API_KEY) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
    });
    text = (await r.json()).choices?.[0]?.message?.content;
  } else if (process.env.ANTHROPIC_API_KEY) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 50, messages: [{ role: "user", content: prompt }] })
    });
    text = (await r.json()).content?.[0]?.text;
  }
  const n = Number(String(text || "").replace(/[^\d.]/g, "").replace(/\.(?=.*\.)/g, ""));
  return n > 0 ? n : null;
}

// Run --------------------------------------------------------------------------------------
(async () => {
  if (USE_LLM && !(process.env.LLM_MODEL && (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY))) {
    console.error("--llm needs LLM_MODEL plus OPENAI_API_KEY or ANTHROPIC_API_KEY in the environment.");
    process.exit(1);
  }
  const cases = Array.from({ length: N }, (_, i) => makeCase(i));
  const redactors = { none: cases.map((c) => c.turns), naive: cases.map(naive) };
  const pres = presidioAll(cases);
  if (pres) redactors.presidio = pres;
  redactors.safeshare = await Promise.all(cases.map((c) => redact(c.turns)));
  const attackers = { arithmetic };
  if (USE_LLM) attackers[`llm:${process.env.LLM_MODEL}`] = llm;

  const rows = [];
  for (const [rname, all] of Object.entries(redactors)) {
    for (const [aname, attack] of Object.entries(attackers)) {
      let exposed = 0, recovered = 0;
      for (let i = 0; i < cases.length; i++) {
        const text = chatText(all[i]);
        const visible = text.includes(fmt(cases[i].salary, cases[i].lang));
        if (visible) { exposed++; continue; }
        const guess = await attack(all[i]);
        if (guess && Math.abs(guess - cases[i].salary) <= cases[i].salary * 0.01) recovered++;
      }
      rows.push({ redactor: rname, attacker: aname, exposed, recovered, leaked: exposed + recovered, n: cases.length });
    }
  }
  const pct = (x, n) => `${Math.round((100 * x) / n)}%`;
  const md = ["# Attack bench: recovering a hidden salary from a redacted AI chat", "",
    `${N} fictional chats (half Indonesian, half English; assistant gives 1–3 derived figures). Generated by`,
    "`tools/attack_bench/run.js` with a fixed seed: rerun to reproduce. Replies are templated, not real model output.", "",
    "| Redactor | Attacker | Salary left visible | Recovered from the rest | Total leaked |", "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.redactor} | ${r.attacker} | ${pct(r.exposed, r.n)} | ${pct(r.recovered, r.n)} | **${pct(r.leaked, r.n)}** |`), "",
    "Recovered = attacker's answer within 1% of the true salary. \"Visible\" = the redactor didn't hide the salary at all.",
    ""].join("\n");
  fs.writeFileSync(OUT, md);
  console.log(md);
})();
