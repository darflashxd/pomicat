/**
 * Redacting proxy for LLM APIs.
 * Point an SDK at http://127.0.0.1:8788/v1 and the text of every message is redacted by the
 * SafeShare engine before it is forwarded upstream.
 *
 * Supported (request bodies redacted):
 *   POST …/chat/completions   OpenAI Chat Completions   text, function arguments, tool replies
 *   POST …/responses          OpenAI Responses          text, function calls and text tool outputs
 *   POST …/messages           Anthropic Messages        text, tool_use input, tool_result text
 * Text-only payloads and custom function tools only; unknown content/items fail closed (400).
 * Request bodies are limited to 1 MiB (413); redacted JSON tool/config data must remain valid JSON.
 * Requests without a body (GET/HEAD, e.g. listing models) pass through.
 * Any other request with a body is REFUSED (403): the proxy is a privacy boundary, so it never
 * forwards text it doesn't know how to redact.
 *
 * ponytail: responses are not re-hydrated (placeholders stay as placeholders); map them back
 * with the pseudonymizer's entity map if callers need the original values.
 */
const http = require("http");
const { Readable } = require("stream");

// Each adapter validates its payload before returning writable text slots.
function invalid(message = "malformed or unsupported text/tool payload; not forwarded.") {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
}
function fields(value, allowed) {
  object(value);
  if (Object.keys(value).some((key) => !allowed.split(" ").includes(key))) invalid();
}
function textSlot(parent, key, role = "user") {
  if (typeof parent[key] !== "string") invalid();
  return { role, get: () => parent[key], set: (v) => { parent[key] = v; } };
}
// Redact structured tool data as JSON too (including keys and numeric identifiers).
// If redaction would break JSON, refuse rather than forward raw data or corrupt a tool call.
function jsonSlot(parent, key, encoded = false, role = "user") {
  if (encoded) {
    textSlot(parent, key);
    try { JSON.parse(parent[key]); } catch { invalid("tool arguments must be valid JSON; not forwarded."); }
  }
  return {
    role,
    get: () => encoded ? JSON.stringify(JSON.parse(parent[key])) : JSON.stringify(parent[key]),
    set: (v) => {
      let parsed;
      try { parsed = JSON.parse(v); } catch { invalid("redacted tool/config data is not valid JSON; not forwarded."); }
      parent[key] = encoded ? v : parsed;
    }
  };
}
function contentSlots(parent, key, role, api) {
  if (typeof parent[key] === "string") return [textSlot(parent, key, role)];
  if (!Array.isArray(parent[key])) invalid();
  const slots = [];
  for (const part of parent[key]) {
    object(part);
    const types = api === "responses" ? ["input_text", "output_text"] : ["text"];
    if (types.includes(part.type)) {
      fields(part, "type text cache_control annotations");
      if (part.annotations !== undefined && (!Array.isArray(part.annotations) || part.annotations.length)) invalid();
      slots.push(textSlot(part, "text", role));
      if (part.cache_control !== undefined) slots.push(jsonSlot(part, "cache_control"));
    } else if (api === "anthropic" && part.type === "tool_result") {
      fields(part, "type tool_use_id content is_error cache_control");
      if (typeof part.tool_use_id !== "string" || (part.is_error !== undefined && typeof part.is_error !== "boolean")) invalid();
      slots.push(textSlot(part, "tool_use_id"));
      // Nested tool results may contain text, never images/documents or another tool result.
      if (part.content !== undefined) slots.push(...contentSlots(part, "content", role, "text"));
      if (part.cache_control !== undefined) slots.push(jsonSlot(part, "cache_control"));
    } else if (api === "anthropic" && part.type === "tool_use") {
      fields(part, "type id name input cache_control");
      if (typeof part.id !== "string" || typeof part.name !== "string") invalid();
      object(part.input);
      slots.push(textSlot(part, "id"), textSlot(part, "name"), jsonSlot(part, "input", false, "assistant"));
      if (part.cache_control !== undefined) slots.push(jsonSlot(part, "cache_control"));
    } else invalid("unsupported content block (only text and supported function tools allowed); not forwarded.");
  }
  return slots;
}
function functionSlots(call, role) {
  fields(call, "name arguments");
  if (typeof call.name !== "string") invalid();
  return [textSlot(call, "name", role), jsonSlot(call, "arguments", true, role)];
}
function messageSlots(messages, api = "chat") {
  if (!Array.isArray(messages) || !messages.length) invalid();
  const slots = [];
  for (const m of messages) {
    fields(m, "role content name tool_call_id tool_calls function_call type id status");
    const roles = api === "anthropic" ? ["user", "assistant"] : ["system", "developer", "user", "assistant", "tool", "function"];
    if (!roles.includes(m.role) || (m.type !== undefined && m.type !== "message")) invalid();
    if (api !== "chat" && (m.tool_calls !== undefined || m.function_call !== undefined)) invalid();
    const role = m.role === "assistant" ? "assistant" : "user";
    for (const key of ["name", "tool_call_id", "id", "status"]) {
      if (m[key] !== undefined) slots.push(textSlot(m, key, role));
    }
    let hasCall = false;
    if (m.tool_calls !== undefined) {
      if (m.role !== "assistant" || !Array.isArray(m.tool_calls) || !m.tool_calls.length) invalid();
      for (const call of m.tool_calls) {
        fields(call, "id type function");
        if (call.type !== "function" || typeof call.id !== "string") invalid();
        slots.push(textSlot(call, "id", role), ...functionSlots(call.function, role));
      }
      hasCall = true;
    }
    if (m.function_call !== undefined) {
      if (m.role !== "assistant") invalid();
      slots.push(...functionSlots(m.function_call, role));
      hasCall = true;
    }
    if (!(hasCall && m.content == null)) slots.push(...contentSlots(m, "content", role, api));
  }
  return slots;
}
function bodySlots(b, api) {
  object(b);
  // Config stays SDK-compatible; unknown top-level fields fail closed. Config text is redacted too.
  const common = "model stream temperature top_p max_tokens stop metadata tools tool_choice parallel_tool_calls service_tier user prompt_cache_key prompt_cache_retention safety_identifier";
  const config = api === "chat"
    ? "frequency_penalty presence_penalty n logprobs top_logprobs logit_bias seed response_format max_completion_tokens reasoning_effort verbosity store stream_options functions function_call prediction modalities audio web_search_options"
    : api === "responses"
      ? "max_output_tokens previous_response_id conversation reasoning text truncation include store background stream_options prompt prompt_cache_key prompt_cache_retention safety_identifier max_tool_calls"
      : "max_tokens stop_sequences top_k thinking betas container mcp_servers";
  const payload = api === "responses" ? "input instructions" : api === "anthropic" ? "messages system" : "messages";
  fields(b, `${common} ${config} ${payload}`);
  // No binary, server-side prompts, remote tools or hidden reasoning can be inspected locally.
  for (const key of ["audio", "prediction", "web_search_options", "prompt", "thinking", "container", "mcp_servers"]) {
    if (b[key] != null) invalid(`unsupported ${key} payload; not forwarded.`);
  }
  if (b.modalities !== undefined && (!Array.isArray(b.modalities) || b.modalities.some((v) => v !== "text"))) invalid();
  if (b.tools !== undefined) {
    if (!Array.isArray(b.tools)) invalid();
    for (const tool of b.tools) {
      object(tool);
      if (api === "anthropic") {
        fields(tool, "type name description input_schema cache_control strict");
        if ((tool.type !== undefined && tool.type !== "custom") || typeof tool.name !== "string") invalid();
        object(tool.input_schema);
      } else {
        if (tool.type !== "function") invalid();
        const definition = api === "chat" ? tool.function : tool;
        fields(tool, api === "chat" ? "type function" : "type name description parameters strict");
        fields(definition, api === "chat" ? "name description parameters strict" : "type name description parameters strict");
        if (typeof definition.name !== "string") invalid();
        if (definition.parameters !== undefined) object(definition.parameters);
      }
    }
  }
  const slots = [];
  for (const key of Object.keys(b)) {
    if (!payload.split(" ").includes(key)) slots.push(jsonSlot(b, key));
  }
  if (api !== "responses") {
    slots.push(...messageSlots(b.messages, api));
    if (api === "anthropic" && b.system !== undefined) slots.push(...contentSlots(b, "system", "user", "text"));
  } else {
    if (b.instructions != null) slots.push(textSlot(b, "instructions"));
    if (typeof b.input === "string") slots.push(textSlot(b, "input"));
    else {
      if (!Array.isArray(b.input) || !b.input.length) invalid();
      for (const item of b.input) {
        object(item);
        if (!item.type || item.type === "message") slots.push(...messageSlots([item], api));
        else if (item.type === "function_call_output") {
          fields(item, "type id call_id output status");
          if (typeof item.call_id !== "string") invalid();
          for (const key of ["call_id", "id", "status"]) {
            if (item[key] !== undefined) slots.push(textSlot(item, key));
          }
          if (typeof item.output === "string") slots.push(textSlot(item, "output"));
          else slots.push(...contentSlots(item, "output", "user", "responses"));
        } else if (item.type === "function_call") {
          fields(item, "type id call_id name arguments status");
          if (typeof item.call_id !== "string" || typeof item.name !== "string") invalid();
          slots.push(textSlot(item, "call_id"), textSlot(item, "name"), jsonSlot(item, "arguments", true, "assistant"));
          for (const key of ["id", "status"]) {
            if (item[key] !== undefined) slots.push(textSlot(item, key));
          }
        } else invalid("unsupported Responses input item; not forwarded.");
      }
    }
  }
  return slots;
}

const ADAPTERS = [
  { name: "chat.completions", match: /\/chat\/completions\/?$/, slots: (b) => bodySlots(b, "chat") },
  { name: "responses", match: /\/responses\/?$/, slots: (b) => bodySlots(b, "responses") },
  { name: "anthropic.messages", match: /\/messages\/?$/, slots: (b) => bodySlots(b, "anthropic") }
];

/** Redacts all slots together, so placeholders stay consistent across the conversation. */
async function redactSlots(slots, policy) {
  if (!slots.length) return;
  const { redact } = require("./pomicat.js");
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
  res.end(JSON.stringify({ error: { type: "safeshare_proxy", message: `Blackline proxy: ${message}` } }));
}

function start({ port = 8788, upstream = "https://api.openai.com", policy = {} } = {}) {
  const server = http.createServer(async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    res.once('close', () => { clearTimeout(timeout); controller.abort(); });
    try {
      if (!req.url.startsWith("/") || req.url.startsWith("//") || req.url.includes("\\")) return refuse(res, 400, "only origin-relative request paths are allowed.");
      const target = new URL(req.url, upstream);
      if (target.origin !== new URL(upstream).origin) return refuse(res, 400, "request target must use the configured upstream.");
      const chunks = [];
      let size = 0;
      for await (const c of req.iterator({ destroyOnReturn: false })) {
        size += c.length;
        if (size > 1024 * 1024) {
          req.resume();
          return refuse(res, 413, "request body exceeds 1 MiB; not forwarded.");
        }
        chunks.push(c);
      }
      let body = Buffer.concat(chunks);
      const path = req.url.split("?")[0];
      const adapter = ADAPTERS.find((a) => a.match.test(path));
      if (adapter && req.method !== "GET" && req.method !== "HEAD" && !body.length) {
        return refuse(res, 400, "supported endpoint requires a JSON body; not forwarded.");
      }

      if (body.length) {
        if (!adapter) {
          return refuse(res, 403, `refusing to forward a request body to unsupported endpoint ${path} ` +
            "(it can't be redacted). Supported: /chat/completions, /responses, /messages.");
        }
        if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity") {
          return refuse(res, 415, "compressed request bodies are unsupported; not forwarded.");
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
      delete headers["transfer-encoding"]; // body is buffered; fetch sets new framing
      const upstreamRes = await fetch(target, {
        method: req.method,
        headers,
        redirect: "error",
        signal: controller.signal,
        body: body.length ? body : undefined
      });

      const outHeaders = Object.fromEntries(upstreamRes.headers);
      delete outHeaders["content-encoding"]; // fetch already decoded the body
      delete outHeaders["content-length"];
      res.writeHead(upstreamRes.status, outHeaders);
      if (upstreamRes.body) Readable.fromWeb(upstreamRes.body).on('error', error => res.destroy(error)).pipe(res);
      else res.end();
    } catch (err) {
      if (!res.destroyed && !res.headersSent) refuse(res, err.status || 502, err.status ? err.message : "redaction or upstream request failed; not forwarded successfully.");
      else res.destroy();
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Blackline proxy on http://127.0.0.1:${server.address().port}/v1 -> ${upstream}`);
  });
  return server;
}

module.exports = { start, redactMessages, ADAPTERS };
