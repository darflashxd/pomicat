// Run: node tests/proxy.test.js
// Starts a fake upstream that echoes what it receives, and checks the proxy redacted it.
const assert = require("assert");
const http = require("http");
const { start } = require("../bin/proxy.js");

const upstream = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ path: req.url, auth: req.headers.authorization, got: JSON.parse(Buffer.concat(chunks)) }));
  });
});

upstream.listen(0, "127.0.0.1", async () => {
  const proxy = start({ port: 0, upstream: `http://127.0.0.1:${upstream.address().port}` });
  await new Promise((r) => proxy.on("listening", r));
  try {
    const res = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      body: JSON.stringify({
        model: "any",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "My NIK is 3201012304950001, email jane@personal.dev" },
          { role: "user", content: [{ type: "text", text: "Key: sk-proj-ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv" }] }
        ]
      })
    });
    const echo = await res.json();
    const sent = JSON.stringify(echo.got.messages);
    assert.strictEqual(echo.path, "/v1/chat/completions");
    assert.strictEqual(echo.auth, "Bearer test-key", "auth header must pass through");
    assert(!sent.includes("3201012304950001"), sent);
    assert(!sent.includes("jane@personal.dev"), sent);
    assert(!sent.includes("sk-proj-ab12"), sent);
    assert(sent.includes("You are helpful."), sent);
    console.log("proxy: all checks passed");
  } finally {
    proxy.close();
    upstream.close();
  }
});
