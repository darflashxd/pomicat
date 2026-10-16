// Run: node tests/package.test.js
// Packs the npm tarball, installs it into an empty temp project, and runs the CLI and library
// from the installed copy. Catches modules missing from package.json "files".
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "safeshare-pkg-"));
// npm is a .cmd script on Windows and needs a shell; node does not (and its path has spaces)
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", shell: cmd === npm && process.platform === "win32", ...opts });

try {
  const tgz = run(npm, ["pack", "--silent", "--pack-destination", tmp], { cwd: root }).trim().split("\n").pop();
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "pkg-test", version: "1.0.0", private: true }));
  run(npm, ["install", "--silent", "--no-audit", "--no-fund", path.join(tmp, tgz)], { cwd: tmp });

  const installed = path.join(tmp, "node_modules", "safeshare-ai");
  const cli = path.join(installed, "bin", "safeshare.js");
  const chat = path.join(tmp, "chat.txt");
  fs.writeFileSync(chat, "User: My salary is $5,000 a month and my NIK is 3201012304950001.\nAssistant: Saving 20% is $1,000 a month, $12,000 a year.\n");

  const redacted = run(process.execPath, [cli, "redact", chat]);
  assert(!redacted.includes("3201012304950001") && !redacted.includes("$5,000"), redacted);

  fs.writeFileSync(path.join(tmp, "naive.txt"), "User: My salary is [REDACTED] a month.\nAssistant: Saving 20% means $1,000 per month, leaving $4,000. Over a year that adds up to $12,000.\n");
  let attack = "";
  try { run(process.execPath, [cli, "invert", path.join(tmp, "naive.txt")]); } catch (e) { attack = e.stdout; }
  assert(/\$5,000/.test(attack), "invert from the installed package: " + attack);

  const lib = require(installed);
  assert.strictEqual(typeof lib.redactTurns, "function");
  assert.strictEqual(typeof lib.invert, "function");
  // share needs crypto.js: load it the way the CLI does
  require(path.join(installed, "extension", "engine", "crypto.js"));
  console.log("package: installed tarball works (redact, invert, library, crypto)");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
