// Run: node tests/run_all.js
const { readdirSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const files = readdirSync(__dirname).filter(f => /^(test_.*|autonomous_deep_audit|.*\.test)\.(m?js)$/.test(f)).sort();
const failed = files.filter(f => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "pipe", encoding: "utf8", env: { ...process.env, SAFESHARE_OFFLINE_TESTS: "1" } });
  console.log(`${r.status === 0 ? "PASS" : "FAIL"} ${f}`);
  if (r.status !== 0) console.log((r.stdout + r.stderr).split("\n").slice(-15).join("\n"));
  return r.status !== 0;
});
console.log(`\n${files.length - failed.length}/${files.length} passed`);
process.exit(failed.length ? 1 : 0);
