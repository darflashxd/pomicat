// Run: node tests/relay_worker.test.mjs
// Exercises relay/worker.js against an in-memory stand-in for Cloudflare D1.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const src = readFileSync(new URL("../relay/worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(src))).default;

// Minimal D1 stand-in: understands only the statements worker.js issues.
const rows = new Map();
const DB = {
  prepare(sql) {
    let args = [];
    const stmt = {
      bind(...a) { args = a; return stmt; },
      async first() {
        const r = rows.get(args[0]);
        return r ? { ...r } : null;
      },
      async run() {
        let changes = 0;
        if (sql.startsWith("INSERT INTO shares")) {
          if (rows.has(args[0])) throw new Error("UNIQUE constraint failed: shares.id");
          const [id, ciphertext, created_at, expires_at, burn_on_read, revoke_hash] = args;
          rows.set(id, { id, ciphertext, created_at, expires_at, burn_on_read, view_count: 0, revoke_hash });
          changes = 1;
        } else if (sql.includes("WHERE id = ? AND revoke_hash = ?")) {
          const r = rows.get(args[0]);
          if (r && r.revoke_hash === args[1]) { rows.delete(args[0]); changes = 1; }
        } else if (sql.includes("WHERE expires_at < ?")) {
          for (const [k, r] of rows) if (r.expires_at < args[0]) { rows.delete(k); changes++; }
        } else if (sql.startsWith("DELETE FROM shares WHERE id = ?")) {
          changes = rows.delete(args[0]) ? 1 : 0;
        } else if (sql.includes("AND view_count = 0")) {
          const r = rows.get(args[0]);
          if (r && r.view_count === 0) { r.view_count++; changes = 1; }
        } else if (sql.startsWith("UPDATE shares SET view_count")) {
          const r = rows.get(args[0]);
          if (r) { r.view_count++; changes = 1; }
        } else throw new Error("unmocked SQL: " + sql);
        return { meta: { changes } };
      }
    };
    return stmt;
  }
};
const env = { DB };
const ctx = { waitUntil: (p) => p };
const call = (path, init = {}) => worker.fetch(new Request("https://relay.test" + path, init), env, ctx);
const post = (path, body, headers = {}) =>
  call(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

const id = crypto.randomUUID();

// Non-UUID ids are rejected
assert.equal((await post("/api/share", { id: "../admin", ciphertext: "x" })).status, 400);

// Create returns a revoke token
let res = await post("/api/share", { id, ciphertext: "CT1", ttl: 3600 });
assert.equal(res.status, 201);
const { revoke_token } = await res.json();
assert.match(revoke_token, /^[0-9a-f]{64}$/);
assert.notEqual(rows.get(id).revoke_hash, revoke_token, "token must be stored hashed");

// Same id cannot overwrite the existing share
assert.equal((await post("/api/share", { id, ciphertext: "EVIL" })).status, 409);
assert.equal(rows.get(id).ciphertext, "CT1");

// Revoke: GET is refused, missing or wrong token is refused
assert.equal((await call(`/api/revoke/${id}`)).status, 405);
assert.equal((await post(`/api/revoke/${id}`, {})).status, 401);
assert.equal((await post(`/api/revoke/${id}`, { token: "0".repeat(64) })).status, 404);
assert.ok(rows.has(id));

// Correct token deletes it
assert.equal((await post(`/api/revoke/${id}`, { token: revoke_token })).status, 200);
assert.ok(!rows.has(id));

// CORS: chat origins are echoed back, anything else gets "null"
res = await call("/api/share", { method: "OPTIONS", headers: { Origin: "https://claude.ai" } });
assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://claude.ai");
res = await call("/api/share", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
assert.equal(res.headers.get("Access-Control-Allow-Origin"), "null");

// Burn-after-read still works
const burnId = crypto.randomUUID();
await post("/api/share", { id: burnId, ciphertext: "CT2", burn_on_read: true });
assert.equal((await call(`/api/share/${burnId}`)).status, 200);
assert.equal((await call(`/api/share/${burnId}`)).status, 404);

// Size cap: 512 KB of ciphertext, refused before or after parsing
assert.equal((await post("/api/share", { id: crypto.randomUUID(), ciphertext: "x".repeat(512 * 1024 + 1) })).status, 413);

// Rate limits: a fake limiter that allows 2 calls per key
const counts = new Map();
const fakeLimiter = { async limit({ key }) { const n = (counts.get(key) || 0) + 1; counts.set(key, n); return { success: n <= 2 }; } };
const limitedEnv = { DB, UPLOAD_LIMITER: fakeLimiter };
const up = () => worker.fetch(new Request("https://relay.test/api/share", {
  method: "POST",
  headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
  body: JSON.stringify({ id: crypto.randomUUID(), ciphertext: "CT" })
}), limitedEnv, ctx);
assert.equal((await up()).status, 201);
assert.equal((await up()).status, 201);
res = await up();
assert.equal(res.status, 429);
assert.equal(res.headers.get("Retry-After"), "60");

// Daily cron deletes expired shares
rows.set("old", { id: "old", ciphertext: "X", expires_at: Date.now() - 1000, burn_on_read: 0, view_count: 0 });
const waits = [];
await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
await Promise.all(waits);
assert.ok(!rows.has("old"), "expired share must be purged by the cron");

console.log("relay worker: all checks passed");
