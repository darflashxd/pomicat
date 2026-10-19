/**
 * Test Suite for Offscreen NER & Tokenization Pipeline
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createHash } = require('node:crypto');
const offscreen = require("../extension/offscreen.js");
const { basicTokenize, wordPieces, encode } = require("../extension/engine/wordpiece.js");

function testOffscreenTokenizer() {
  console.log("================================================================================");
  console.log("   SAFESHARE-AI: OFFSCREEN NER TOKENIZER & SPAN EXTRACTION AUDIT");
  console.log("================================================================================");

  // 1. Basic Tokenizer
  const sample = "Billing address: Sara Schwarz, 28245 Puruntie 82 Apt. 595";
  const words = basicTokenize(sample);
  assert(words.length > 5, "Should tokenize basic alphanumeric words and punctuation");
  assert.strictEqual(words[0].text, "billing"); // uncased model: lowercased like BertTokenizer
  assert.strictEqual(words[0].start, 0);
  assert.strictEqual(words[0].end, 7);

  // 2. Span merging
  const testSpans = [
    { label: "STREET_NAME", start: 10, end: 15, score: 9.5 },
    { label: "STREET_NAME", start: 15, end: 20, score: 9.8 },
    { label: "CITY", start: 25, end: 32, score: 8.5 }
  ];
  const merged = offscreen.mergeSpans(testSpans);
  assert.strictEqual(merged.length, 2, "Adjacent sub-tokens with matching label must be merged");
  assert.strictEqual(merged[0].label, "STREET_NAME");
  assert.strictEqual(merged[0].start, 10);
  assert.strictEqual(merged[0].end, 20);
  assert.strictEqual(merged[1].label, "CITY");

  // 3. Same rules as the Hugging Face BertTokenizer (uncased) the model was benchmarked with
  const t = (x) => basicTokenize(x).map((w) => w.text);
  assert.deepStrictEqual(t("José Müller"), ["jose", "muller"], "accents stripped, word kept whole");
  assert.deepStrictEqual(t("user_name=a$b"), ["user", "_", "name", "=", "a", "$", "b"], "underscore and symbols are punctuation");
  assert.deepStrictEqual(t("東京 Tower"), ["東", "京", "tower"], "CJK characters split");
  assert.deepStrictEqual(t("a\u200bb"), ["ab"], "zero-width (format) characters dropped");
  const mu = basicTokenize("Hi José!");
  assert.deepStrictEqual(mu.map((w) => "Hi José!".slice(w.start, w.end)), ["Hi", "José", "!"], "offsets point into the original text");

  // 4. With the shipped vocabulary
  const vocab = new Map();
  const modelDir = path.join(__dirname, '../extension/models');
  const info = JSON.parse(fs.readFileSync(path.join(modelDir, 'MODEL_INFO.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(modelDir, 'config.json'), 'utf8'));
  const weights = fs.readFileSync(path.join(modelDir, info.bundled_file));
  assert.equal(weights.length, info.weight_bytes);
  assert.equal(createHash('sha256').update(weights).digest('hex'), info.weight_sha256);
  assert.equal(Object.keys(config.id2label).length, info.labels);
  fs.readFileSync(path.join(__dirname, "../extension/models/vocab.txt"), "utf8").split(/\r?\n/).forEach((w, i) => w && vocab.set(w, i));
  const unkId = BigInt(vocab.get("[UNK]"));
  const clsId = BigInt(vocab.get("[CLS]"));
  const sepId = BigInt(vocab.get("[SEP]"));
  assert.equal(vocab.size, info.vocab_size);
  for (const [token, id] of Object.entries(info.special_tokens)) assert.equal(vocab.get(token), id);
  assert.deepStrictEqual(wordPieces("john", vocab), [BigInt(vocab.get("john"))]);
  assert.deepStrictEqual(wordPieces("x".repeat(101), vocab), [unkId], "over 100 characters -> [UNK]");
  assert.strictEqual(wordPieces("jose", vocab)[0] !== unkId || wordPieces("jose", vocab).length > 1, true, "accent-stripped name tokenizes");

  // 5. Long text: several overlapping windows of at most 128 ids, the last word still covered
  const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ") + " Rina";
  const wins = encode(long, vocab);
  assert(wins.length > 1, "long text is split into windows");
  assert(wins.every((w) => w.inputIds.length <= 128 && w.inputIds[0] === clsId && w.inputIds[w.inputIds.length - 1] === sepId));
  assert(wins[wins.length - 1].tokenSpans.some((s) => long.slice(s.start, s.end) === "Rina"), "text past 128 pieces is checked");
  assert.strictEqual(encode("Hello Rina", vocab).length, 1);

  console.log("  [✓] All offscreen tokenizer and span merge tests passed!");
}

testOffscreenTokenizer();
