// Run: node tests/word_redact_zip.test.js
// Node cannot parse OOXML (no DOMParser), so this covers the archive layer that the
// redaction engine depends on: read a real DOCX, rewrite it, and confirm bytes survive.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../extension/word/redact.js"), "utf8");
const sandbox = { module: { exports: {} }, TextDecoder, TextEncoder, Blob, Response, Uint8Array, DataView,
  CompressionStream, DecompressionStream, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.module.exports;

async function main() {
  const fixture = path.join(__dirname, "../.playwright-mcp/priority/Confidential - Employee Compensation Review.docx");
  if (!fs.existsSync(fixture)) {
    console.log("word_redact_zip: fixture absent, archive round-trip skipped");
    return;
  }
  const bytes = new Uint8Array(fs.readFileSync(fixture));
  const parts = await api.unzip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.ok(parts.has("word/document.xml"));
  assert.ok([...parts.keys()].some(name => name.startsWith("word/media/")));

  const rebuilt = await api.zip(parts);
  const again = await api.unzip(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength));
  assert.equal(again.size, parts.size);
  for (const [name, data] of parts) {
    assert.deepEqual(Buffer.from(again.get(name)), Buffer.from(data), name);
  }

  const verifier = await api.verifyDocx(rebuilt, [{ value: "A. Whitfield" }]);
  assert.equal(verifier.clean, false, "verifier must find a value that is still present");
  const text = await api.documentText(rebuilt);
  assert.match(text, /Whitfield/, "attack-check text must include body content");
  const header = [...parts.keys()].find(name => /^word\/header\d*\.xml$/.test(name));
  if (header) {
    const bodyOnly = new TextEncoder().encode('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:body></w:document>');
    const withHeader = await api.documentText(await api.zip(new Map([["word/document.xml", bodyOnly], [header, parts.get(header)]])));
    assert.ok(withHeader.split("\n").filter(Boolean).length > 1, "header/footer text must be scanned too");
  }
  console.log(`word_redact_zip: ${parts.size} parts round-tripped byte-identically`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
