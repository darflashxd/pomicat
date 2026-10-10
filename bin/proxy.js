/**
 * OpenAI-compatible redacting proxy.
 * Point an OpenAI SDK at http://localhost:8788/v1 and every chat message is redacted by the
 * SafeShare engine before it is forwarded upstream. Everything else is passed through untouched.
 *
 * ponytail: responses are not re-hydrated (placeholders stay as placeholders); map them back
 * with the pseudonymizer's entity map if callers need the original values.
 */
const http = require("http");
const { Readable } = require("stream");

function redactMessages(messages, policy) {
  const { redactTurns } = require("./safeshare.js");
  // Collect every text segment as a turn so the pseudonymizer keeps placeholders consistent.
  const slots = [];
  messages.forEach((m, i) => {
    if (typeof m.content === "string") slots.push({ i, role: m.role, content: m.content });
    else if (Array.isArray(m.content)) {
      m.content.forEach((part, j) => {
        if (part && part.type === "text") slots.push({ i, j, role: m.role, content: part.text });
      });
    }
  });
  const redacted = redactTurns(slots.map(({ role, content }) => ({ role, content })), policy);
  const out = JSON.parse(JSON.stringify(messages));
  slots.forEach((s, k) => {
    if (s.j === undefined) out[s.i].content = redacted[k].content;
    else out[s.i].content[s.j].text = redacted[k].content;
  });
  return out;
}

function start({ port = 8788, upstream = "https://api.openai.com", policy = {} } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = Buffer.concat(chunks);

      if (req.method === "POST" && /\/chat\/completions$/.test(req.url) && body.length) {
        const json = JSON.parse(body.toString("utf8"));
        if (Array.isArray(json.messages)) json.messages = redactMessages(json.messages, policy);
        body = Buffer.from(JSON.stringify(json));
      }

      const headers = { ...req.headers };
      delete headers.host;
      delete headers["content-length"];
      const upstreamRes = await fetch(new URL(req.url, upstream), {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : body
      });

      const outHeaders = Object.fromEntries(upstreamRes.headers);
      delete outHeaders["content-encoding"]; // fetch already decoded the body
      delete outHeaders["content-length"];
      res.writeHead(upstreamRes.status, outHeaders);
      if (upstreamRes.body) Readable.fromWeb(upstreamRes.body).pipe(res);
      else res.end();
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: `SafeShare proxy: ${err.message}` } }));
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`SafeShare proxy on http://127.0.0.1:${server.address().port}/v1 -> ${upstream}`);
  });
  return server;
}

module.exports = { start, redactMessages };
