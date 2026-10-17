// Run: node tests/proxy_tools.test.js (localhost only; no provider calls).
const assert = require("assert");
const http = require("http");
const { start } = require("../bin/proxy.js");

(async () => {
  const received = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    received.push(raw);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(raw ? JSON.parse(raw) : {}));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = start({ port: 0, upstream: `http://127.0.0.1:${upstream.address().port}` });
  await new Promise((resolve) => proxy.once("listening", resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  // Fictitious identifiers; assert against bytes received upstream, not only proxy response.
  const id = "3201012304950001";
  const email = "jane@personal.dev";
  const secret = `NIK ${id}, email ${email}`;
  const post = (path, body) => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  async function accepted(path, body) {
    const hits = received.length;
    const response = await post(path, body);
    const result = await response.json();
    assert.strictEqual(response.status, 200, JSON.stringify(result));
    assert.strictEqual(received.length, hits + 1);
    assert(!received[hits].includes(id), received[hits]);
    assert(!received[hits].includes(email), received[hits]);
    return result;
  }
  async function refused(path, body, status = 400) {
    const hits = received.length;
    const response = await post(path, body);
    assert.strictEqual(response.status, status, await response.text());
    assert.strictEqual(received.length, hits, "refused body reached upstream");
  }
  try {
    const responses = await accepted("/v1/responses", {
      model: "gpt-test", stream: true, store: false, max_output_tokens: 128,
      tools: [{ type: "function", name: "lookup", parameters: { type: "object", properties: {} }, strict: true }],
      input: [
        { role: "user", content: [{ type: "input_text", text: secret }] },
        { type: "function_call", id: "fc_1", call_id: "call_1", name: "lookup", arguments: JSON.stringify({ query: secret }) },
        { type: "function_call_output", call_id: "call_1", output: secret },
        { type: "function_call_output", call_id: "call_2", output: [{ type: "input_text", text: secret }] },
        { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: secret, annotations: [] }] }
      ], instructions: "Keep short."
    });
    assert.strictEqual(responses.stream, true);
    assert.strictEqual(responses.max_output_tokens, 128);
    assert.strictEqual(responses.input[1].call_id, "call_1");
    assert.strictEqual(typeof JSON.parse(responses.input[1].arguments).query, "string");
    assert.strictEqual(responses.input[2].type, "function_call_output");

    const anthropic = await accepted("/v1/messages", {
      model: "claude-test", max_tokens: 128,
      system: [{ type: "text", text: secret, cache_control: { type: "ephemeral" } }],
      tools: [{ name: "lookup", description: "Find contact", input_schema: { type: "object", properties: {} } }],
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "lookup", input: { query: secret, nested: [email] } }] },
        { role: "user", content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: secret },
          { type: "tool_result", tool_use_id: "toolu_2", is_error: false, content: [{ type: "text", text: secret }] },
          { type: "tool_result", tool_use_id: "toolu_3" }
        ] }
      ]
    });
    assert.strictEqual(anthropic.messages[0].content[0].id, "toolu_1");
    assert(Array.isArray(anthropic.messages[0].content[0].input.nested));
    assert.strictEqual(anthropic.system[0].cache_control.type, "ephemeral");

    const chat = await accepted("/v1/chat/completions", {
      model: "gpt-test", stream: true, stream_options: { include_usage: true },
      tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} } } }],
      messages: [
        { role: "developer", content: "Keep short." },
        { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: JSON.stringify({ query: secret }) } }] },
        { role: "tool", tool_call_id: "call_1", content: secret },
        { role: "assistant", function_call: { name: "lookup", arguments: JSON.stringify({ query: secret }) } },
        { role: "function", name: "lookup", content: [{ type: "text", text: secret }] }
      ]
    });
    assert.strictEqual(chat.messages[1].content, null);
    assert.strictEqual(chat.messages[2].tool_call_id, "call_1");
    assert.strictEqual(chat.messages[3].content, undefined);
    assert.strictEqual(typeof JSON.parse(chat.messages[1].tool_calls[0].function.arguments).query, "string");
    const escaped = await accepted("/v1/responses", {
      input: [{ type: "function_call", call_id: "call_1", name: "lookup", arguments: JSON.stringify({ email }).replace("@", "\\u0040") }]
    });
    assert(!JSON.parse(escaped.input[0].arguments).email.includes(email), "JSON escapes must not bypass scanning");

    for (const path of ["/v1/responses", "/v1/messages", "/v1/chat/completions"]) {
      for (const body of [null, [], "text", {}, { messages: {} }, { input: {} }]) await refused(path, body);
      const hits = received.length;
      for (const body of ["", "not JSON"]) {
        const response = await fetch(base + path, { method: "POST", body });
        assert.strictEqual(response.status, 400);
      }
      assert.strictEqual(received.length, hits);
    }
    for (const input of [
      [{ type: "function_call_output", call_id: "call_1", output: { text: secret } }],
      [{ type: "function_call_output", call_id: "call_1", output: [{ type: "input_image", image_url: email }] }],
      [{ type: "function_call_output", call_id: "call_1" }],
      [{ type: "function_call_output", call_id: "call_1", output: secret, extra: secret }],
      [{ type: "function_call", call_id: "call_1", name: "lookup", arguments: { text: secret } }],
      [{ type: "function_call", call_id: "call_1", name: "lookup", arguments: "not JSON" }],
      [{ type: "reasoning", encrypted_content: secret }],
      [{ type: "item_reference", id: secret }],
      [{ role: "user", content: [{ type: "input_file", file_data: secret }] }],
      [{ role: "user", content: [{ type: "input_text", text: secret, hidden: secret }] }]
    ]) await refused("/v1/responses", { input });
    for (const content of [
      [{ type: "tool_result", tool_use_id: "toolu_1", content: { text: secret } }],
      [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "image", source: { data: secret } }] }],
      [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "tool_result", tool_use_id: "toolu_2", content: secret }] }],
      [{ type: "tool_use", id: "toolu_1", name: "lookup", input: secret }],
      [{ type: "thinking", thinking: secret }],
      null, {}, [null], [{ type: "text", text: 123 }]
    ]) await refused("/v1/messages", { messages: [{ role: "user", content }] });
    for (const message of [
      { role: "user", content: [{ type: "image_url", image_url: { url: email } }] },
      { role: "assistant", content: null },
      { role: "assistant", content: "", tool_calls: {} },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "custom", custom: { input: secret } }] },
      { role: "assistant", function_call: { name: "lookup", arguments: "not JSON" } },
      { role: "user", content: "Hi", hidden: secret }
    ]) await refused("/v1/chat/completions", { messages: [message] });
    await refused("/v1/responses", { input: "Hi", tools: [{ type: "web_search_preview" }] });
    await refused("/v1/responses", { input: "Hi", surprise: secret });
    await refused("/v1/responses", { input: "Hi", prompt: { id: secret } });
    await refused("/v1/messages", { messages: [{ role: "user", content: "Hi" }], thinking: { type: "enabled", budget_tokens: 1024 } });
    // Numeric IDs cannot be replaced by bare placeholders inside JSON. Refuse, never corrupt/forward.
    await refused("/v1/messages", { messages: [{ role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "lookup", input: { nik: Number(id), email } }] }] });
    await refused("/v1/responses", { input: "x".repeat(1024 * 1024) }, 413);
    const hits = received.length;
    const compressed = await fetch(base + "/v1/responses", { method: "POST", headers: { "Content-Encoding": "gzip" }, body: "{}" });
    assert.strictEqual(compressed.status, 415);
    const get = await fetch(base + "/v1/models");
    assert.strictEqual(get.status, 200);
    assert.strictEqual(received.length, hits + 1, "only bodyless GET should pass");
    assert(received.every((raw) => !raw.includes(id) && !raw.includes(email)));
    console.log("proxy tools: all checks passed");
  } finally {
    proxy.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise((resolve) => proxy.close(resolve)), new Promise((resolve) => upstream.close(resolve))]);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
