// Run: node tests/relay_local.test.js
// The local relay must not answer 201 "stored" when it couldn't save the share.
const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");

const port = 18000 + Math.floor(Math.random() * 1000);
const py = process.platform === "win32" ? "python" : "python3";
const relay = spawn(py, [path.join(__dirname, "..", "relay", "server_local.py")], {
  env: { ...process.env, SAFESHARE_PORT: String(port), SAFESHARE_STORAGE: path.join(os.tmpdir(), "no-such-dir-" + randomUUID(), "storage.json") },
  stdio: "pipe"
});

(async () => {
  try {
    let res;
    for (let i = 0; i < 50 && !res; i++) {
      await new Promise((r) => setTimeout(r, 100));
      res = await fetch(`http://127.0.0.1:${port}/api/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: randomUUID(), ciphertext: "abc", ttl: 3600 })
      }).catch(() => null);
    }
    assert(res, "relay did not start");
    assert.strictEqual(res.status, 500, "unsaved share must not be reported as stored");
    console.log("relay_local: all checks passed");
  } finally {
    relay.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
