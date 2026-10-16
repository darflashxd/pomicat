/**
 * Redacting proxy for LLM APIs.
 * Point an SDK at http://127.0.0.1:8788/v1 and the text of every message is redacted by the
 * SafeShare engine before it is forwarded upstream.
 *
 * Supported (request bodies redacted):
 *   POST …/chat/completions   OpenAI Chat Completions   messages[].content (string or text parts)
 *   POST …/responses          OpenAI Responses          input (string or items), instructions
 *   POST …/messages           Anthropic Messages        messages[].content, system
 * Requests without a body (GET/HEAD, e.g. listing models) pass through.
 * Any other request with a body is REFUSED (403): the proxy is a privacy boundary, so it never
 * forwards text it doesn't know how to redact.
 *
 * ponytail: responses are not re-hydrated (placeholders stay as placeholders); map them back
 * with the pseudonymizer's entity map if callers need the original values.
 */
const http = require("http");
const { Readable } = require("stream");

// Each adapter returns the text "slots" in a request body: { get(), set(value), role }.
function partSlots(content, role) {
  if (typeof content === "string") return null; // handled by the caller (needs the parent)
  if (!Array.isArray(content)) return [];
  return content
    .map((part) => (part && typeof part.text === "string" && /^(?:text|input_text|output_text)$/.test(part.type || "text")
      ? { role, get: () => part.text, set: (v) => { part.text = v; } } : null))
    .filter(Boolean);
}

function messageSlots(messages) {
  const slots = [];
  for (const m of messages || []) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    if (typeof m.content === "string") slots.push({ role, get: () => m.content, set: (v) => { m.content = v; } });
    else slots.push(...partSlots(m.content, role));
  }
  return slots;
}

const ADAPTERS = [
  { name: "chat.completions", match: /\/chat\/completions\/?$/, slots: (b) => messageSlots(b.messages) },
  {
    name: "responses",
    match: /\/responses\/?$/,
    slots: (b) => {
      const slots = [];
      if (typeof b.instructions === "string") slots.push({ role: "user", get: () => b.instructions, set: (v) => { b.instructions = v; } });
      if (typeof b.input === "string") slots.push({ role: "user", get: () => b.input, set: (v) => { b.input = v; } });
      else if (Array.isArray(b.input)) slots.push(...messageSlots(b.input.filter((it) => !it.type || it.type === "message")));
      return slots;
    }
  },
  {
    name: "anthropic.messages",
    match: /\/messages\/?$/,
    slots: (b) => {
      const slots = messageSlots(b.messages);
      if (typeof b.system === "string") slots.push({ role: "user", get: () => b.system, set: (v) => { b.system = v; } });
      else slots.push(...partSlots(b.system, "user"));
      return slots;
    }
  }
];

/** Redacts all slots together, so placeholders stay consistent across the conversation. */
async function redactSlots(slots, policy) {
  if (!slots.length) return;
  const { redact } = require("./safeshare.js");
  const redacted = await redact(slots.map((s) => ({ role: s.role, content: s.get() })), policy);
  slots.forEach((s, k) => s.set(redacted[k].content));
}

/** Kept for callers of the old API: redacts an OpenAI-style messages array. */
async function redactMessages(messages, policy) {
  const out = JSON.parse(JSON.stringify(messages));
  await redactSlots(messageSlots(out), policy);
  return out;
}

function refuse(res, status, message) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { type: "safeshare_proxy", message: `SafeShare proxy: ${message}` } }));
}

function start({ port = 8788, upstream = "https://api.openai.com", policy = {} } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = Buffer.concat(chunks);
      const path = req.url.split("?")[0];

      if (body.length) {
        const adapter = ADAPTERS.find((a) => a.match.test(path));
        if (!adapter) {
          return refuse(res, 403, `refusing to forward a request body to unsupported endpoint ${path} ` +
            "(it can't be redacted). Supported: /chat/completions, /responses, /messages.");
        }
        let json;
        try {
          json = JSON.parse(body.toString("utf8"));
        } catch {
          return refuse(res, 400, "request body is not valid JSON; not forwarded.");
        }
        await redactSlots(adapter.slots(json), policy);
        body = Buffer.from(JSON.stringify(json));
      }

      const headers = { ...req.headers };
      delete headers.host;
      delete headers["content-length"];
      const upstreamRes = await fetch(new URL(req.url, upstream), {
        method: req.method,
        headers,
        body: body.length ? body : undefined
      });

      const outHeaders = Object.fromEntries(upstreamRes.headers);
      delete outHeaders["content-encoding"]; // fetch already decoded the body
      delete outHeaders["content-length"];
      res.writeHead(upstreamRes.status, outHeaders);
      if (upstreamRes.body) Readable.fromWeb(upstreamRes.body).pipe(res);
      else res.end();
    } catch (err) {
      refuse(res, 502, err.message);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`SafeShare proxy on http://127.0.0.1:${server.address().port}/v1 -> ${upstream}`);
  });
  return server;
}

module.exports = { start, redactMessages, ADAPTERS };
