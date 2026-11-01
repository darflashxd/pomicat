#!/usr/bin/env node
/**
 * SafeShare CLI and library.
 *
 *   pomicat redact [file] [options] [--json]
 *   pomicat invert [file] [--json]
 *   pomicat share  [file] [options] [--relay http://127.0.0.1:8787] [--ttl 3600] [--burn]
 *   pomicat proxy  [options] [--port 8788] [--upstream https://api.openai.com]
 *
 * options: --profile public|trusted, --numbers remove|range, --presidio <url>, --policy <file>
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
const { invert, inferBirthYears, inferDates, quasiIdentifiers, bucket, formatRange, generalizeNumbers } = require("../extension/engine/policy.js");

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

// Profiles answer "who will read this?":
//   public  (default) everything personal goes, including your own numbers and anything derived
//   trusted           keep names and your own numbers; remove only IDs, keys, cards and contacts
const PROFILES = ["public", "trusted"];
const NUMBER_MODES = ["remove", "range"];

function checkPolicy(policy) {
  if (policy.profile && !PROFILES.includes(policy.profile)) {
    throw new Error(`Unknown profile "${policy.profile}". Use one of: ${PROFILES.join(", ")}`);
  }
  if (policy.numbers && !NUMBER_MODES.includes(policy.numbers)) {
    throw new Error(`Unknown numbers mode "${policy.numbers}". Use one of: ${NUMBER_MODES.join(", ")}`);
  }
}

// Step 1: hard patterns (keys, IDs, cards, contacts) and contextual hits.
function scanTurns(turns, policy) {
  checkPolicy(policy);
  const { heuristics, contextual, filterContextual } = buildEngines(policy);
  const trusted = policy.profile === "trusted";
  const intermediate = [];
  const hits = [];
  turns.forEach((t, i) => {
    const h = heuristics.scan(t.content);
    if (!trusted) hits.push(...filterContextual(contextual.classifyTurn(h.baseText, i, h.detections)));
    intermediate.push({ role: t.role, content: h.sanitizedText });
  });
  return { intermediate, hits };
}

// Step 2: consistent placeholders, the inversion defense, and optional range generalization.
function finishTurns(intermediate, hits, policy) {
  const pseudonymizer = new ConsistentPseudonymizer();
  const removed = pseudonymizer.anonymizeConversation(intermediate, hits, [], {
    keepNames: policy.profile === "trusted"
  }).anonymizedTurns;
  if (policy.numbers !== "range") return removed;
  // Only amounts the user stated get a range; figures the assistant derived stay removed.
  const userAmounts = new Set(
    hits.filter((h) => h.category === "SENSITIVE_FINANCIAL" && intermediate[h.turnIndex]?.role === "user")
      .map((h) => h.raw.trim().toLowerCase())
  );
  return generalizeNumbers(removed, pseudonymizer, userAmounts);
}

/** Synchronous redaction with the built-in engines. */
function redactTurns(turns, policy = {}) {
  const { intermediate, hits } = scanTurns(turns, policy);
  return finishTurns(intermediate, hits, policy);
}

/** Redaction that can also use an external Presidio analyzer (policy.presidio). */
async function redact(turns, policy = {}) {
  const { intermediate, hits } = scanTurns(turns, policy);
  if (policy.presidio) hits.push(...(await presidioHits(intermediate, policy)));
  return finishTurns(intermediate, hits, policy);
}

// ---------------------------------------------------------------------------
// Presidio: names, places and contacts the rules can't find
// ---------------------------------------------------------------------------

// Presidio entity -> pseudonymizer category. PERSON reuses SafeShare's name handling so a
// name stays the same placeholder in every turn. DATE_TIME and NRP are left out by default:
// in chats they mostly hit phrases like "a year" or nationalities.
const PRESIDIO_CATEGORIES = {
  PERSON: "USER",
  LOCATION: "LOCATION",
  EMAIL_ADDRESS: "EMAIL",
  PHONE_NUMBER: "PHONE",
  CREDIT_CARD: "CARD",
  IBAN_CODE: "ACCOUNT",
  US_BANK_NUMBER: "ACCOUNT",
  US_SSN: "ID",
  US_PASSPORT: "ID",
  US_DRIVER_LICENSE: "ID",
  UK_NHS: "ID",
  MEDICAL_LICENSE: "ID",
  IP_ADDRESS: "IP_ADDRESS",
  DATE_TIME: "DATE",
  NRP: "GROUP"
};
// Every Presidio recognizer runs except these, which are noisy in chats ("a year", "French", links)
const PRESIDIO_SKIP = new Set(["DATE_TIME", "NRP", "URL"]);
// A trusted reader may see names and places; contacts and IDs still go.
const PRESIDIO_TRUSTED_SKIP = new Set(["PERSON", "LOCATION"]);
const NAME_PARTICLES = /^(?:van|von|de|der|den|du|del|della|da|di|la|le|bin|binti|al|el)$/;
// names: "personal" (default) keeps a name/place only when the user's own sentence ties it to
// them ("my wife Rina", "I live in Bandung", "teman saya Budi"). Celebrities, story characters
// and places in essays pass through. names: "all" redacts every name Presidio finds.
// The name or place must come right after words that tie it to the user (shared with the extension).
const { PERSONAL_BEFORE } = ConsistentPseudonymizer;
// Presidio's ID recognizers (driver licence, bank number, ...) fire on short codes; ask for some confidence.
const PRESIDIO_MIN_SCORE = { US_DRIVER_LICENSE: 0.3, US_BANK_NUMBER: 0.3, US_ITIN: 0.3, US_PASSPORT: 0.3 };

/**
 * policy.presidio = "http://127.0.0.1:5002"
 *   or { url, names: "personal"|"all", entities: ["PERSON", ...], skip: ["DATE_TIME"], threshold: 0, language: "en" }
 * Without `entities`, all recognizers run except `skip` (default PRESIDIO_SKIP).
 */
async function presidioHits(turns, policy) {
  const cfg = typeof policy.presidio === "string" ? { url: policy.presidio } : policy.presidio;
  const skip = new Set(cfg.skip ?? PRESIDIO_SKIP);
  const wanted = (type) =>
    (cfg.entities ? cfg.entities.includes(type) : !skip.has(type)) &&
    (policy.profile !== "trusted" || !PRESIDIO_TRUSTED_SKIP.has(type));
  const isPlaceholder = /^\[[^\]]*\]$|^\[|\]$/;
  const hits = [];
  for (const [i, t] of turns.entries()) {
    if (!t.content.trim()) continue;
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t.content, language: cfg.language || "en", entities: cfg.entities, score_threshold: cfg.threshold ?? 0 })
    });
    if (!res.ok) throw new Error(`Presidio returned ${res.status}: ${await res.text()}`);
    const codeSpans = [...t.content.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g)].map((m) => [m.index, m.index + m[0].length]);
    for (const r of await res.json()) {
      if (!wanted(r.entity_type)) continue;
      if (r.score < (PRESIDIO_MIN_SCORE[r.entity_type] || 0)) continue;
      let raw = t.content.slice(r.start, r.end);
      // ID-style hits must look like an ID: 5+ chars with a digit, not part of a URL or identifier
      // (skips "O3", "x86", "n_vocab", DOI fragments)
      if (/(?:https?:\/\/|doi\.org\/|www\.)\S*$/i.test(t.content.slice(Math.max(0, r.start - 200), r.start))) continue;
      if (["ID", "ACCOUNT"].includes(PRESIDIO_CATEGORIES[r.entity_type])) {
        if (raw.length < 5 || !/\d/.test(raw) || /[_]/.test(raw)) continue;
        if (/[\w.-]$/.test(t.content[r.start - 1] || "") || /^[\w-]/.test(t.content[r.end] || "")) continue;
      }
      // Don't re-redact SafeShare's own placeholders
      if (!raw.trim() || isPlaceholder.test(raw.trim())) continue;
      // Skip anything inside code: code blocks, or lines with code signals ("Jane (my wife)" is fine)
      const line = t.content.slice(t.content.lastIndexOf("\n", r.start) + 1, (t.content.indexOf("\n", r.end) + 1 || t.content.length + 1) - 1);
      if (codeSpans.some(([s, e]) => r.start >= s && r.start < e)) continue;
      if (/[{};]|=>|->|==|\s=\s|\b\w+\(|^\s*(?:#define|def|class|import|from|const|let|var|val|fn|func|public|private|return)\b/.test(line)) continue;
      // Names and places: only capitalised words ("mov", "val", "client.x" are not names)
      if (r.entity_type === "PERSON" || r.entity_type === "LOCATION") {
        // All-caps acronyms ("NIK", "API") are not people
        if (r.entity_type === "PERSON" && /^[A-Z]{2,6}$/.test(raw.trim())) continue;
        // Places may contain numbers ("Southeast 28th Street", "Grid Road 641"); names may not.
        const ok = (w, k) => /^\p{Lu}[\p{L}'’.-]*:?$/u.test(w) || (k > 0 && NAME_PARTICLES.test(w)) ||
          (r.entity_type === "LOCATION" && /^\d+\p{L}*,?$/u.test(w));
        // Trim stray words Presidio includes at the edges ("5:26:32 AM Vãnia Viviana:" -> "Vãnia Viviana")
        const words = raw.trim().split(/\s+/);
        while (words.length && !(ok(words[0], 0) && words[0] !== "AM" && words[0] !== "PM")) words.shift();
        while (words.length && !ok(words[words.length - 1], 1)) words.pop();
        if (!words.length || !words.every(ok)) continue;
        raw = words.join(" ").replace(/[:,]$/, "");
        const at = t.content.indexOf(raw, r.start);
        if (at === -1) continue;
        if ((cfg.names || "personal") === "personal") {
          if (t.role !== "user") continue;
          if (!PERSONAL_BEFORE[r.entity_type].test(t.content.slice(Math.max(0, at - 60), at))) continue;
        }
      }
      hits.push({ turnIndex: i, raw, category: PRESIDIO_CATEGORIES[r.entity_type] || r.entity_type });
    }
  }
  return hits;
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
  // A JSON array of turns; plain text can start with "[" too ("[REDACTED_DATE] is ...")
  if (trimmed.startsWith("[")) {
    try {
      const turns = JSON.parse(trimmed);
      if (Array.isArray(turns)) return turns;
    } catch (_) {}
  }
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
  const policy = loadPolicy(flag("--policy"));
  // Command-line switches override the policy file
  for (const [name, key] of [["--profile", "profile"], ["--numbers", "numbers"], ["--presidio", "presidio"]]) {
    const v = flag(name);
    if (v !== undefined) policy[key] = v;
  }
  const opts = {
    json: bool("--json"),
    burn: bool("--burn"),
    policy,
    relay: flag("--relay") || "http://127.0.0.1:8787",
    ttl: Number(flag("--ttl") || 86400),
    port: Number(flag("--port") || 8788),
    upstream: flag("--upstream") || "https://api.openai.com"
  };

  if (cmd === "proxy") return require("./proxy.js").start(opts);

  if (!Number.isFinite(opts.ttl) || opts.ttl < 300 || opts.ttl > 604800) {
    console.error(`Invalid --ttl "${opts.ttl}": must be 300..604800 seconds (5 min..7 days).`);
    process.exit(1);
  }

  if (!["redact", "invert", "share"].includes(cmd)) {
    console.error(
      "Usage:\n" +
      "  pomicat redact [file] [options] [--json]\n" +
      "  pomicat invert [file] [--json]\n" +
      "  pomicat share  [file] [options] [--relay http://127.0.0.1:8787] [--ttl 3600] [--burn]\n" +
      "  pomicat proxy  [options] [--port 8788] [--upstream https://api.openai.com]\n" +
      "\n" +
      "Options:\n" +
      "  --profile public|trusted   who will read it (default public)\n" +
      "  --numbers remove|range     remove your amounts, or show them as ranges like Rp 2–5 juta\n" +
      "  --presidio <url>           also use a Presidio analyzer for names, places, contacts\n" +
      "  --policy <file>            rules, allowlist, presets (see README)"
    );
    process.exit(cmd ? 1 : 0);
  }

  const input = fs.readFileSync(rest[0] ? path.resolve(rest[0]) : 0, "utf8");
  const fail = (e) => {
    console.error(e.message);
    process.exitCode = 1;
  };

  if (cmd === "redact") {
    return redact(parseTurns(input), opts.policy).then((t) => console.log(formatTurns(t, opts.json)), fail);
  }
  if (cmd === "share") {
    return redact(parseTurns(input), opts.policy).then((t) => share(t, opts)).catch(fail);
  }

  const turns = parseTurns(input);
  const text = turns.map((t) => t.content).join("\n");
  // Details that together may point at one person: a warning, not a recovered value
  const quasi = turns.map((t, i) => ({ turn: i + 1, ...quasiIdentifiers(t.content) }))
    .filter((q, i) => turns[i].role === "user" && q.risky);
  for (const q of opts.json ? [] : quasi) {
    console.log(`Warning: message ${q.turn} combines ${q.kinds.join(", ")}${q.unique ? ' and "the only"' : ""}; ` +
      "together these may point at one person. Consider making one of them vaguer.");
  }
  const found = invert(text);
  // Birth years only matter when the text actually hides a birth date
  const hidesBirthDate = /\[[^\]]*(?:DOB|BIRTH)[^\]]*\]|<DATE_TIME>/i.test(text);
  const births = hidesBirthDate ? inferBirthYears(text) : [];
  // A date counts as recovered when the clues leave a handful of possibilities in two years
  const dates = inferDates(text).filter((d) => d.candidates.length && d.candidates.length <= 14);
  if (found.length || births.length || dates.length) process.exitCode = 2;
  if (opts.json) return console.log(JSON.stringify({ amounts: found, birthYears: births, dates, combinations: quasi }, null, 2));
  if (!found.length && !births.length && !dates.length) return console.log("No hidden values recovered.");
  found.forEach((f, i) => {
    const label = i === 0 ? "Most likely hidden value" : "Alternative";
    console.log(`${label}: ${formatMoney(f.value, f.currency)} (agreed by ${f.support} visible numbers)`);
    for (const d of f.derivations) console.log(`    ${d}`);
  });
  if (births.length) {
    const b = births[0];
    console.log(`Hidden birth date, but the birth year is ${b.year}${births[1] && births[1].support === b.support ? ` or ${births[1].year}` : ""} (from ${b.support} statement${b.support > 1 ? "s" : ""}):`);
    for (const d of b.derivations) console.log(`    age ${d}`);
  }
  for (const d of dates) {
    console.log(`Hidden date ${d.placeholder} is one of ${d.candidates.length} date${d.candidates.length > 1 ? "s" : ""}: ${d.candidates.join(", ")}`);
    for (const c of d.clues) console.log(`    ${c}`);
  }
  process.exitCode = 2; // non-zero so CI can fail on a leaky redaction
}

module.exports = { redact, redactTurns, invert, inferDates, presidioHits, buildEngines, PRESETS, bucket, formatRange };

if (require.main === module) main(process.argv.slice(2));
