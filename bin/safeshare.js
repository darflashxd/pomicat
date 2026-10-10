#!/usr/bin/env node
/**
 * SafeShare CLI and library.
 *
 *   safeshare redact [file] [--policy policy.json] [--json]
 *   safeshare invert [file] [--json]
 *   safeshare share  [file] [--relay http://127.0.0.1:8787] [--ttl 3600] [--burn] [--policy policy.json]
 *   safeshare proxy  [--port 8788] [--upstream https://api.openai.com] [--policy policy.json]
 *
 * Input is a file or stdin: either a JSON array of {role, content}, or plain text where
 * turns start with "User:" / "Assistant:" (anything else is one user turn).
 *
 * `invert` is the attack: given a chat that was already redacted (by any tool), it looks for
 * hidden values that several visible numbers agree on, e.g. "save 30% = Rp 900.000/month,
 * Rp 10.800.000/year" -> salary Rp 3.000.000. Use it on synthetic data only.
 */
const fs = require("fs");
const path = require("path");
const HeuristicsRedactor = require("../extension/engine/heuristics.js");
const ContextualClassifier = require("../extension/engine/contextual.js");
const ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");
const { AdversaryOracleSolver } = ConsistentPseudonymizer;

// ---------------------------------------------------------------------------
// Policy: presets, custom rules, allowlist
// ---------------------------------------------------------------------------

// Presets narrow redaction to the categories a team cares about. They are scoping aids,
// not a compliance certification.
const PRESETS = {
  pci: ["FINANCIAL", "CREDENTIALS"],
  hipaa: ["HEALTH", "PROFILE", "GOV_ID", "SENSITIVE_HEALTH", "SENSITIVE_USER"],
  gdpr: ["PROFILE", "GOV_ID", "HEALTH", "SENSITIVE_HEALTH", "SENSITIVE_USER", "SENSITIVE_LEGAL_HR"]
};

/**
 * policy = {
 *   preset: "pci" | "hipaa" | "gdpr",          // optional
 *   disable: ["EMAIL", "SYSTEM"],               // pattern ids or categories to turn off
 *   allow: ["support@acme.com", "/^ACME-\\d+$/"],// never redact these (string or /regex/)
 *   rules: [{ id: "ACME_TICKET", pattern: "ACME-\\d{6}", flags: "g", replacement: "[TICKET]" }]
 * }
 */
function loadPolicy(file) {
  return file ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function toMatcher(entry) {
  const m = /^\/(.*)\/([a-z]*)$/.exec(entry);
  if (m) {
    const rx = new RegExp(m[1], m[2]);
    return (s) => rx.test(s);
  }
  return (s) => s === entry;
}

function buildEngines(policy = {}) {
  if (policy.preset && !PRESETS[policy.preset]) {
    throw new Error(`Unknown preset "${policy.preset}". Use one of: ${Object.keys(PRESETS).join(", ")}`);
  }
  const only = policy.preset ? new Set(PRESETS[policy.preset]) : null;
  const disabled = new Set(policy.disable || []);
  const allowed = (policy.allow || []).map(toMatcher);
  const isAllowed = (raw) => allowed.some((f) => f(String(raw).trim()));
  const keep = (id, category) =>
    !disabled.has(id) && !disabled.has(category) && (!only || only.has(category) || category === "CUSTOM");

  const heuristics = new HeuristicsRedactor();
  for (const r of policy.rules || []) {
    heuristics.patterns.push({
      id: r.id,
      name: r.name || r.id,
      category: "CUSTOM",
      regex: new RegExp(r.pattern, r.flags || "g"),
      replacement: r.replacement || `[REDACTED_${r.id}]`
    });
  }
  heuristics.patterns = heuristics.patterns
    .filter((p) => keep(p.id, p.category || "GENERAL"))
    .map((p) => {
      if (!allowed.length) return p;
      const validator = p.validator;
      return { ...p, validator: (raw, i, text) => !isAllowed(raw) && (!validator || validator(raw, i, text)) };
    });

  const contextual = new ContextualClassifier();
  const filterContextual = (hits) => hits.filter((h) => keep(h.category, h.category) && !isAllowed(h.raw));
  return { heuristics, contextual, filterContextual };
}

// ---------------------------------------------------------------------------
// Redact
// ---------------------------------------------------------------------------

function redactTurns(turns, policy = {}) {
  const { heuristics, contextual, filterContextual } = buildEngines(policy);
  const pseudonymizer = new ConsistentPseudonymizer();
  const intermediate = [];
  const contextHits = [];
  turns.forEach((t, i) => {
    const h = heuristics.scan(t.content);
    contextHits.push(...filterContextual(contextual.classifyTurn(h.sanitizedText, i)));
    intermediate.push({ role: t.role, content: h.sanitizedText });
  });
  return pseudonymizer.anonymizeConversation(intermediate, contextHits).anonymizedTurns;
}

// ---------------------------------------------------------------------------
// Invert (the attack)
// ---------------------------------------------------------------------------

const PERIODS = [12, 52, 4, 2, 3, 24, 36, 60]; // months, weeks, quarters, multi-year spans
// Occam weighting: monthly<->yearly (12) is the usual step, other periods are less likely.
const periodCost = (c) => (c === 12 ? 1 : 2);

/**
 * Returns hidden-value candidates that at least `minSupport` distinct visible numbers agree
 * on. Consistent numbers also agree on every rescaled value (x2, /60, ...), so candidates are
 * ranked by support, then by how simple the explanation is (total operation cost).
 * Result: [{ value, support, cost, derivations: [string], currency }]
 */
function invert(text, { tolerance = 0.015, minSupport = 2, limit = 3 } = {}) {
  const tokens = new AdversaryOracleSolver(tolerance).lexNumericSpans(text);
  const amounts = tokens.filter((t) => !t.isRatio && !t.isSmallInt);
  const ratios = tokens.filter((t) => t.isRatio && t.val > 0 && t.val < 1);
  const factors = [
    ...ratios.map((r) => ({ v: r.val, label: r.raw })),
    ...ratios.map((r) => ({ v: 1 - r.val, label: `(100% - ${r.raw})` }))
  ];

  const near = (a, b) => Math.abs(a - b) / b <= tolerance;
  const visible = amounts.map((a) => a.val);
  const cands = [];
  for (const a of amounts) {
    const add = (v, how, cost) => {
      if (v >= 100 && !visible.some((x) => near(v, x))) cands.push({ v, how, cost, src: a.start });
    };
    for (const c of PERIODS) {
      add(a.val / c, `${a.raw} / ${c}`, periodCost(c));
      add(a.val * c, `${a.raw} × ${c}`, periodCost(c));
    }
    for (const f of factors) {
      add(a.val / f.v, `${a.raw} / ${f.label}`, 1);
      for (const c of PERIODS) {
        add(a.val / c / f.v, `${a.raw} / ${c} / ${f.label}`, 1 + periodCost(c));
        add((a.val * c) / f.v, `${a.raw} × ${c} / ${f.label}`, 1 + periodCost(c));
      }
    }
  }

  // Cluster candidates that land on the same value; keep the cheapest derivation per source.
  const clusters = [];
  for (const c of cands) {
    let k = clusters.find((k) => near(c.v, k.value));
    if (!k) clusters.push((k = { value: c.v, bySource: new Map() }));
    const prev = k.bySource.get(c.src);
    if (!prev || c.cost < prev.cost) k.bySource.set(c.src, c);
  }

  const currency = (amounts.find((a) => /Rp|IDR/i.test(a.raw)) && "IDR") ||
    (amounts.find((a) => /\$|USD/.test(a.raw)) && "USD") || null;
  return clusters
    .map((k) => {
      const ds = [...k.bySource.values()];
      return {
        value: k.value,
        support: ds.length,
        cost: ds.reduce((n, d) => n + d.cost, 0),
        derivations: ds.map((d) => d.how),
        currency
      };
    })
    .filter((k) => k.support >= minSupport)
    .sort((a, b) => b.support - a.support || a.cost - b.cost)
    .slice(0, limit);
}

function formatMoney(v, currency) {
  const n = Math.round(v);
  if (currency === "IDR") return "Rp " + n.toLocaleString("id-ID");
  if (currency === "USD") return "$" + n.toLocaleString("en-US");
  return n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Share: redact -> encrypt locally -> upload ciphertext -> print link
// ---------------------------------------------------------------------------

async function share(turns, { relay, ttl, burn }) {
  const SafeShareCrypto = require("../extension/engine/crypto.js");
  const enc = await new SafeShareCrypto(relay, relay).encrypt({ turns, timestamp: new Date().toISOString(), ttl });
  const res = await fetch(`${relay}/api/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: enc.shareId, ciphertext: enc.ciphertext, ttl, burn_on_read: burn })
  });
  if (!res.ok) throw new Error(`Relay returned ${res.status}: ${await res.text()}`);
  const { revoke_token } = await res.json();
  console.log(formatTurns(turns, false));
  console.log(`\nLink${burn ? " (burns after one read)" : ""}, expires in ${ttl}s:\n  ${enc.fullShareUrl}`);
  console.log(`Revoke:\n  curl -X POST ${relay}/api/revoke/${enc.shareId} -H "Content-Type: application/json" -d '{"token":"${revoke_token}"}'`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseTurns(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  const turns = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const m = /^(user|assistant)\s*:\s*(.*)$/i.exec(line);
    if (m) turns.push({ role: m[1].toLowerCase(), content: m[2] });
    else if (turns.length) turns[turns.length - 1].content += "\n" + line;
    else turns.push({ role: "user", content: line });
  }
  return turns;
}

function formatTurns(turns, asJson) {
  if (asJson) return JSON.stringify(turns, null, 2);
  return turns.map((t) => `${t.role[0].toUpperCase()}${t.role.slice(1)}: ${t.content}`).join("\n");
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i === -1 ? undefined : rest.splice(i, 2)[1];
  };
  const bool = (name) => rest.includes(name) && rest.splice(rest.indexOf(name), 1).length > 0;
  const opts = {
    json: bool("--json"),
    burn: bool("--burn"),
    policy: loadPolicy(flag("--policy")),
    relay: flag("--relay") || "http://127.0.0.1:8787",
    ttl: Number(flag("--ttl") || 86400),
    port: Number(flag("--port") || 8788),
    upstream: flag("--upstream") || "https://api.openai.com"
  };

  if (cmd === "proxy") return require("./proxy.js").start(opts);

  if (!["redact", "invert", "share"].includes(cmd)) {
    console.error(
      "Usage:\n" +
      "  safeshare redact [file] [--policy policy.json] [--json]\n" +
      "  safeshare invert [file] [--json]\n" +
      "  safeshare share  [file] [--relay http://127.0.0.1:8787] [--ttl 3600] [--burn] [--policy policy.json]\n" +
      "  safeshare proxy  [--port 8788] [--upstream https://api.openai.com] [--policy policy.json]"
    );
    process.exit(cmd ? 1 : 0);
  }

  const input = fs.readFileSync(rest[0] ? path.resolve(rest[0]) : 0, "utf8");

  if (cmd === "redact") return console.log(formatTurns(redactTurns(parseTurns(input), opts.policy), opts.json));
  if (cmd === "share") {
    return share(redactTurns(parseTurns(input), opts.policy), opts).catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
  }

  const text = input.trim().startsWith("[") ? JSON.parse(input).map((t) => t.content).join("\n") : input;
  const found = invert(text);
  if (opts.json) return console.log(JSON.stringify(found, null, 2));
  if (!found.length) return console.log("No hidden values recovered.");
  found.forEach((f, i) => {
    const label = i === 0 ? "Most likely hidden value" : "Alternative";
    console.log(`${label}: ${formatMoney(f.value, f.currency)} (agreed by ${f.support} visible numbers)`);
    for (const d of f.derivations) console.log(`    ${d}`);
  });
  process.exitCode = 2; // non-zero so CI can fail on a leaky redaction
}

module.exports = { redactTurns, invert, buildEngines, PRESETS };

if (require.main === module) main(process.argv.slice(2));
