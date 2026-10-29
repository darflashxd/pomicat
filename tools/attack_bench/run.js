// node tools/attack_bench/run.js [--cases 40] [--llm | --llm-cli] [--out tools/attack_bench/RESULTS.md]
//
// How often can an attacker recover a hidden salary from a redacted AI chat?
// Fictional chats only (generated below, fixed seed). For each chat the user states a salary and
// the assistant replies with figures derived from it, as assistants do. Each redactor hides what it
// hides; each attacker then tries to recover the salary. Recovered = within 1% of the truth.
//
// Redactors: none · naive (hides only the stated salary) · Presidio (default recognizers, needs
//            .venv-eval with presidio + en_core_web_lg) · SafeShare (bin/safeshare.js redact)
// Attackers: arithmetic (policy.invert, no key needed) · LLM API (--llm; one of:
//            OPENAI_API_KEY + LLM_MODEL, ANTHROPIC_API_KEY + LLM_MODEL) · LLM through the local
//            OpenCode CLI (--llm-cli; default model opencode/deepseek-v4.1-flash-free, no API key) ·
//            LLM through the Claude Code CLI (--llm-claude; your own `claude` login, no API key;
//            default model claude-sonnet-5-5, change with --llm-model).
//            Keys are read from the environment only, never written anywhere. Only fictional chats
//            are sent. The --llm-cli path runs one chat per fresh session in an empty temp folder.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { createHash } = require("crypto");
const { redact } = require("../../bin/safeshare.js");
const { invert } = require("../../extension/engine/policy.js");
const { chatText, buildPrompt, parseLlmAnswer, withinTolerance } = require("./llm.js");

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const N = Number(opt("--cases", 40));
const OUT = opt("--out", path.join(__dirname, "RESULTS.md"));
const USE_LLM = args.includes("--llm");
const USE_LLM_CLAUDE = args.includes("--llm-claude");
const USE_LLM_CLI = args.includes("--llm-cli") || USE_LLM_CLAUDE;
const API_MODEL = process.env.LLM_MODEL;
const CLI_MODEL = opt("--llm-model", USE_LLM_CLAUDE ? "claude-sonnet-5-5" : "opencode/deepseek-v4.1-flash-free");
const LLM_TIMEOUT = Number(opt("--llm-timeout", 120000));
const LLM_RETRIES = Number(opt("--llm-retries", 2));
const LLM_LOG = opt("--llm-log", path.join(os.tmpdir(), `safeshare-llm-${process.pid}.jsonl`));
const LLM_DELAY = Number(opt("--llm-delay", 2500));
const LLM_CACHE = opt("--llm-cache", path.join(os.tmpdir(), "safeshare-llm-cache.json"));
const CLI_NAME = USE_LLM_CLAUDE ? "Claude Code CLI" : "OpenCode CLI";
const LANG = opt("--lang", "mixed");

// Deterministic fictional cases -------------------------------------------------------------
let seed = 1337;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const fmt = (v, lang) => lang === "id"
  ? `Rp ${Math.round(v).toLocaleString("de-DE")}`
  : `$${Math.round(v).toLocaleString("en-US")}`;

function makeCase(i) {
  const lang = LANG === "mixed" ? (i % 2 ? "id" : "en") : LANG;
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
const arithmetic = async (turns) => {
  const f = invert(chatText(turns));
  return { kind: f.length ? "number" : "no_guess", value: f.length ? f[0].value : null };
};

async function llmApi(turns) {
  const prompt = buildPrompt(turns);
  let text;
  try {
    if (process.env.OPENAI_API_KEY) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: API_MODEL, messages: [{ role: "user", content: prompt }] })
      });
      if (!r.ok) return { kind: "invalid", value: null, error: `OpenAI HTTP ${r.status}` };
      text = (await r.json()).choices?.[0]?.message?.content;
    } else if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: API_MODEL, max_tokens: 50, messages: [{ role: "user", content: prompt }] })
      });
      if (!r.ok) return { kind: "invalid", value: null, error: `Anthropic HTTP ${r.status}` };
      text = (await r.json()).content?.[0]?.text;
    } else {
      return { kind: "invalid", value: null, error: "no API key" };
    }
  } catch (err) {
    return { kind: "invalid", value: null, error: err.message || String(err) };
  }
  return { ...parseLlmAnswer(text), raw: text, model: API_MODEL };
}

function findOpenCodeCli() {
  if (process.env.OPENCODE_CLI) {
    return fs.existsSync(process.env.OPENCODE_CLI) ? process.env.OPENCODE_CLI : null;
  }
  const names = process.platform === "win32" ? ["opencode-cli.exe", "opencode.exe"] : ["opencode-cli", "opencode"];
  for (const name of names) {
    const r = spawnSync(process.platform === "win32" ? "where.exe" : "which", [name], { encoding: "utf8", timeout: 15000 });
    if (r.status === 0) {
      const found = String(r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (found && fs.existsSync(found)) return found;
    }
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    const root = path.join(process.env.APPDATA, "ai.opencode.desktop", "cli");
    try {
      if (fs.existsSync(root)) {
        const versions = fs.readdirSync(root)
          .filter((d) => { try { return fs.statSync(path.join(root, d)).isDirectory(); } catch { return false; } })
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const version of versions) {
          const candidate = path.join(root, version, "opencode-cli.exe");
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch {}
  }
  return null;
}

function getCliVersion(cli) {
  const r = spawnSync(cli, ["--version"], { encoding: "utf8", timeout: 15000 });
  return String(r.stdout || "").trim().split(/\r?\n/)[0] || "unknown";
}

function parseCliOutput(stdout) {
  let text = "", sessionID = null, tool = false, error = null;
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    let ev;
    try { ev = JSON.parse(s); } catch { continue; }
    if (!sessionID) sessionID = ev.sessionID || ev.part?.sessionID || null;
    if (ev.type === "text" && ev.part?.text) text += ev.part.text;
    if (ev.type === "tool" || ev.part?.type === "tool") tool = true;
    if (ev.type === "error") error = ev.error?.message || ev.message || "error event";
  }
  return { text, sessionID, tool, error };
}

function deleteSession(cli, sessionID, cwd) {
  if (!sessionID) return;
  spawnSync(cli, ["session", "delete", sessionID], { cwd, encoding: "utf8", timeout: 15000 });
}

// One attacker call through a CLI: returns the process result and { text, sessionID, tool, error }
function openCodeInvoke(cli, model, cwd, timeout) {
  return (prompt, env) => {
    const r = spawnSync(cli, ["run", "--agent", "plan", "--model", model, "--format", "json", "--title", "ss-attack", prompt],
      { cwd, encoding: "utf8", timeout, maxBuffer: 1 << 20, env });
    const out = parseCliOutput(r.stdout);
    deleteSession(cli, out.sessionID, cwd);
    return { r, out };
  };
}

// Claude Code (`claude -p`) on your own login: no tools, no MCP servers, nothing saved, prompt on stdin
function claudeInvoke(model, cwd, timeout) {
  const win = process.platform === "win32";
  const args = ["-p", "--model", model, "--output-format", "json", "--tools", win ? '""' : "",
    "--no-session-persistence", "--strict-mcp-config", "--disable-slash-commands"];
  return (prompt, env) => {
    const r = spawnSync(win ? "claude.cmd" : "claude", args,
      { cwd, input: prompt, encoding: "utf8", timeout, maxBuffer: 1 << 20, env, shell: win });
    let out = { text: "", sessionID: null, tool: false, error: null };
    try {
      const j = JSON.parse(String(r.stdout || "").trim().split(/\r?\n/).pop());
      out = { text: j.is_error ? "" : String(j.result || ""), sessionID: null, tool: (j.num_turns || 1) > 1,
        error: j.is_error ? String(j.result || j.terminal_reason || "error") : null };
    } catch {}
    return { r, out };
  };
}

function appendLog(file, entry) {
  try { fs.appendFileSync(file, JSON.stringify(entry) + "\n"); } catch {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(text) {
  return /\b(?:rate.?limit|too many requests|429|50[023]|overloaded|over ?capacity|busy|timeout|timed out|temporar|throttl|try again|later|slow down|internal server error|service unavailable|bad gateway)\b/i.test(String(text));
}

function isFatal(text) {
  return /\b(?:free usage limit|usage limit reached|retryafterms|subscribe|connect a provider|no longer available|model not available|model not found|invalid api key|unauthori[sz]ed|authenticat(?:e|ion)|oauth|not logged in|no credits|insufficient balance)\b/i.test(String(text));
}

function describeError(r, out) {
  const parts = [];
  if (out.error) parts.push(out.error);
  if (out.text && String(out.text).trim()) parts.push(`text=${String(out.text).trim().slice(-200)}`);
  const stderr = String(r.stderr || "").trim();
  const stdout = String(r.stdout || "").trim();
  if (stderr) parts.push(stderr.slice(-300));
  else if (stdout) parts.push(stdout.slice(-300));
  return parts.join(" | ") || "(no output)";
}

function loadCache(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveCache(file, cache) {
  try { fs.writeFileSync(file, JSON.stringify(cache, null, 2)); } catch {}
}

function makeCliAttacker({ invoke, model, retries, log, delay, cache, cacheFile }) {
  return async (turns, meta = {}) => {
    const key = meta.cacheKey;
    if (cache && key && cache[key] && cache[key].kind !== "invalid") return cache[key];

    let last = { kind: "invalid", value: null, error: "no attempt", service: false };
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt && last.service && delay) await sleep(delay * (2 ** (attempt - 1)));
      const prompt = buildPrompt(turns) + (attempt ? "\n\nYour previous reply could not be parsed. Output only one integer." : "");
      const env = { ...process.env };
      delete env.OPENAI_API_KEY;
      delete env.ANTHROPIC_API_KEY;
      const { r, out } = invoke(prompt, env);
      const errText = describeError(r, out);
      const fatal = isFatal(errText);
      if (r.error) {
        last = { kind: "invalid", value: null, error: errText || r.error.message || String(r.error), service: true, transient: isTransient(errText) || r.error.code === "ETIMEDOUT", fatal };
      } else if (r.status !== 0) {
        last = { kind: "invalid", value: null, error: `exit ${r.status}: ${errText}`, service: true, transient: isTransient(errText), fatal };
      } else if (out.tool) {
        last = { kind: "invalid", value: null, error: "model used a tool", service: false };
      } else if (out.error) {
        last = { kind: "invalid", value: null, error: out.error, service: true, transient: isTransient(out.error), fatal };
      } else {
        const answer = parseLlmAnswer(out.text);
        if (answer.kind !== "invalid") {
          const result = { ...answer, raw: out.text, model, attempt };
          appendLog(log, { ...meta, ...result, status: "ok" });
          if (cache && key) {
            cache[key] = { kind: answer.kind, value: answer.value };
            saveCache(cacheFile, cache);
          }
          return result;
        }
        last = { kind: "invalid", value: null, error: "unparseable answer", raw: out.text, model, attempt, service: false };
      }
      appendLog(log, { ...meta, ...last, status: "retry", transient: last.transient || false });
    }
    appendLog(log, { ...meta, ...last, status: "failed" });
    return last;
  };
}

// Run --------------------------------------------------------------------------------------
(async () => {
  if ([USE_LLM, args.includes("--llm-cli"), USE_LLM_CLAUDE].filter(Boolean).length > 1) {
    console.error("Use one of --llm (API), --llm-cli (OpenCode CLI) or --llm-claude (Claude Code CLI).");
    process.exit(1);
  }
  if (USE_LLM && !(API_MODEL && (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY))) {
    console.error("--llm needs LLM_MODEL plus OPENAI_API_KEY or ANTHROPIC_API_KEY in the environment.");
    process.exit(1);
  }

  let cli = null, cliVer = null, workDir = null;
  if (USE_LLM_CLAUDE) {
    const v = spawnSync(process.platform === "win32" ? "claude.cmd" : "claude", ["--version"],
      { encoding: "utf8", timeout: 30000, shell: process.platform === "win32" });
    if (v.status !== 0) {
      console.error("--llm-claude could not run `claude`. Install Claude Code and sign in (`claude auth login`).");
      process.exit(1);
    }
    cliVer = String(v.stdout || "").trim().split(/\r?\n/)[0];
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeshare-llm-attack-"));
    process.on("exit", () => { if (workDir) { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} } });
  } else if (USE_LLM_CLI) {
    cli = findOpenCodeCli();
    if (!cli) {
      console.error("--llm-cli could not find the OpenCode CLI. Set OPENCODE_CLI to opencode-cli.exe or opencode.");
      process.exit(1);
    }
    cliVer = getCliVersion(cli);
    const models = spawnSync(cli, ["models"], { encoding: "utf8", timeout: 30000 });
    if (models.status !== 0 || !String(models.stdout || "").includes(CLI_MODEL)) {
      console.error(`--llm-cli model not available: ${CLI_MODEL}`);
      process.exit(1);
    }
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "safeshare-llm-attack-"));
    process.on("exit", () => { if (workDir) { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {} } });
  }

  const cases = Array.from({ length: N }, (_, i) => makeCase(i));
  const redactors = { none: cases.map((c) => c.turns), naive: cases.map(naive) };
  const pres = presidioAll(cases);
  if (pres) redactors.presidio = pres;
  redactors.safeshare = await Promise.all(cases.map((c) => redact(c.turns)));
  const llmCache = USE_LLM_CLI ? loadCache(LLM_CACHE) : null;
  const attackers = { arithmetic };
  if (USE_LLM) attackers[`llm:${API_MODEL}`] = llmApi;
  if (USE_LLM_CLI) {
    const invoke = USE_LLM_CLAUDE ? claudeInvoke(CLI_MODEL, workDir, LLM_TIMEOUT) : openCodeInvoke(cli, CLI_MODEL, workDir, LLM_TIMEOUT);
    attackers[`llm:${CLI_MODEL}`] = makeCliAttacker({ invoke, model: CLI_MODEL, retries: LLM_RETRIES, log: LLM_LOG, delay: LLM_DELAY, cache: llmCache, cacheFile: LLM_CACHE });
  }

  const rows = [];
  let aborted = false;
  let consecutiveServiceFailures = 0;
  for (const [rname, all] of Object.entries(redactors)) {
    for (const [aname, attack] of Object.entries(attackers)) {
      let exposed = 0, recovered = 0;
      const rs = { number: 0, zero: 0, refusal: 0, invalid: 0, no_guess: 0 };
      const isLlm = aname.startsWith("llm");
      for (let i = 0; i < cases.length; i++) {
        const text = chatText(all[i]);
        const visible = text.includes(fmt(cases[i].salary, cases[i].lang));
        if (visible) { exposed++; continue; }
        const result = await attack(all[i], { redactor: rname, caseIndex: i, caseId: cases[i].id, cacheKey: `${aname}|${createHash("sha256").update(text).digest("hex")}` });
        const kind = result && result.kind ? result.kind : "invalid";
        rs[kind] = (rs[kind] || 0) + 1;
        if (withinTolerance(result && result.value, cases[i].salary)) recovered++;
        if (isLlm) {
          console.error(`[${aname}] ${rname} ${i + 1}/${cases.length}: ${kind}${result?.value ? ` ${result.value}` : ""}${result?.error ? ` (${result.error})` : ""}`);
          if (result && result.fatal) {
            aborted = true;
            break;
          }
          if (result && result.service) {
            consecutiveServiceFailures++;
            if (consecutiveServiceFailures >= 8) { aborted = true; break; }
          } else {
            consecutiveServiceFailures = 0;
          }
          if (LLM_DELAY && i < cases.length - 1) await sleep(LLM_DELAY);
        }
      }
      if (aborted) break;
      rows.push({ redactor: rname, attacker: aname, exposed, recovered, leaked: exposed + recovered, n: cases.length, rs });
    }
    if (aborted) break;
  }

  const pct = (x, n) => `${Math.round((100 * x) / n)}%`;
  const llmRows = rows.filter((r) => r.attacker.startsWith("llm"));
  const totalInvalid = llmRows.reduce((a, r) => a + r.rs.invalid, 0);
  const totalLlm = llmRows.reduce((a, r) => a + r.rs.number + r.rs.zero + r.rs.refusal + r.rs.invalid, 0);

  const langLabel = LANG === "mixed" ? "half Indonesian, half English" : LANG === "id" ? "Indonesian" : "English";
  const isLlm = !!(USE_LLM || USE_LLM_CLI);
  const modelLabel = USE_LLM_CLI ? CLI_MODEL : API_MODEL;
  const modelShort = (modelLabel || "").split("/").pop(); // arithmetic-only runs have no model
  const llmRow = (redactor) => rows.find((r) => r.redactor === redactor && r.attacker.startsWith("llm"));
  const arithRow = (redactor) => rows.find((r) => r.redactor === redactor && r.attacker === "arithmetic");

  let md;
  if (isLlm) {
    const readable = [];
    if (!aborted && !totalInvalid) {
      const naive = llmRow("naive");
      const presLlm = llmRow("presidio");
      const safe = llmRow("safeshare");
      if (naive && safe) {
        const presTxt = presLlm ? `, Presidio left ${pct(presLlm.exposed, presLlm.n)} of salaries visible` : "";
        readable.push(
          `**Against the LLM attacker (${modelShort}): naive redaction leaked ${pct(naive.leaked, naive.n)}${presTxt}, and SafeShare held at ${pct(safe.leaked, safe.n)}.**`,
          "",
          `${N} fictional ${langLabel} chats: each states a monthly salary, and the assistant replies with figures derived from it.`,
          "Each redactor hides what it hides; the LLM attacker then reads the redacted chat and tries to recover the salary.",
          "",
          "| Redaction | Salary leaked to the LLM |",
          "|---|---|",
          `| naive — hides only the stated salary | **${pct(naive.leaked, naive.n)}** |`,
          ...(presLlm ? [`| Presidio — generic PII tool | **${pct(presLlm.leaked, presLlm.n)}** |`] : []),
          `| SafeShare — hides the amounts too | **${pct(safe.leaked, safe.n)}** |`,
          "",
          "**What this means**",
          "",
           "- Entity-only masking can leave arithmetic clues. Recovery above is measured on this run's templated cases, not all conversations.",
          ...(presLlm ? ["- **Presidio does not cover amounts.** A widely-used PII tool leaves the salary fully visible because its default recognizers target names, emails, phones and cards — not financial figures."] : []),
          `- SafeShare: ${safe.recovered}/${safe.n} salaries recovered after masking; ${safe.exposed}/${safe.n} left directly visible.`,
          ""
        );
        const aNaive = arithRow("naive");
        if (aNaive) readable.push(`For reference, a rule-based arithmetic attacker already recovers ${pct(aNaive.recovered, aNaive.n)} from naive redaction — the LLM is the stronger attacker.`, "");
      }
    }
    const repro = USE_LLM_CLI
      ? `node tools/attack_bench/run.js --cases ${N} --lang ${LANG} ${USE_LLM_CLAUDE ? "--llm-claude" : "--llm-cli"} --llm-model ${modelLabel}`
      : `node tools/attack_bench/run.js --cases ${N} --lang ${LANG} --llm  # needs LLM_MODEL + API key`;
    md = [
      "# Can an LLM recover a hidden salary from a redacted chat?",
      "",
      ...readable,
      "### How it was measured",
      `- ${N} fictional ${langLabel} chats, fixed seed, templated replies.`,
      "- \"Recovered\" = the attacker's answer is within 1% of the true salary; \"leaked\" = left visible or recovered.",
      ...(USE_LLM_CLI ? [
        `- Attacker model: \`${modelLabel}\`, one chat per call in a fresh session, empty folder, no tools, no ground truth in the prompt.`,
        `- Run through the ${CLI_NAME} (version \`${cliVer}\`).`,
        "- Fictional data only; inference on the model provider's service.",
      ] : []),
      ...(USE_LLM ? [`- Attacker model: \`${modelLabel}\` via the provider API.`] : []),
      ...(!pres ? ["- Presidio was skipped (`.venv-eval` absent)."] : []),
      ...(aborted ? ["- **Status: BLOCKED — run incomplete; do not read as a clean result.**"] : []),
      ...(totalInvalid && !aborted ? [`- **Incomplete evidence:** ${totalInvalid} of ${totalLlm} LLM calls were invalid. Leakage percentages are observed lower bounds, not defense success rates.`] : []),
      "",
      "### Limits",
      "- One attacker model only (the roadmap targets 2–3 models).",
      "- Templated replies, not real model output.",
      "- Only salary/amounts; simple arithmetic cases.",
      "- Not a proof of safety in general.",
      "",
      "### Reproduce",
      `    ${repro} --out ${OUT}`,
      ...(USE_LLM_CLI ? [`Raw transcript: \`${LLM_LOG}\` (local only).`] : []),
      "",
      "### Full results",
      "| Redactor | Attacker | Salary left visible | Recovered from the rest | Observed leaked | No-information answer | Refusal | Invalid |",
      "|---|---|---|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.redactor} | ${r.attacker} | ${pct(r.exposed, r.n)} | ${pct(r.recovered, r.n)} | **${pct(r.leaked, r.n)}** | ${r.rs.zero} | ${r.rs.refusal} | ${r.rs.invalid} |`),
      ""
    ].join("\n");
  } else {
    md = [
      "# Attack bench: recovering a hidden salary from a redacted AI chat",
      "",
      `${N} fictional chats (${langLabel}; assistant gives 1–3 derived figures). Generated by`,
      "`tools/attack_bench/run.js` with a fixed seed: rerun to reproduce. Replies are templated, not real model output.",
      "",
      "| Redactor | Attacker | Salary left visible | Recovered from the rest | Total leaked |",
      "|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.redactor} | ${r.attacker} | ${pct(r.exposed, r.n)} | ${pct(r.recovered, r.n)} | **${pct(r.leaked, r.n)}** |`),
      "",
      "Recovered = attacker's answer within 1% of the true salary. \"Visible\" = the redactor didn't hide the salary at all.",
      ""
    ].join("\n");
  }
  fs.writeFileSync(OUT, md);
  console.log(md);
  if (aborted || totalInvalid) process.exitCode = 1;
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
