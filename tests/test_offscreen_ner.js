/**
 * Test Suite for Offscreen NER & Tokenization Pipeline
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const offscreen = require("../extension/offscreen.js");

function testOffscreenTokenizer() {
  console.log("================================================================================");
  console.log("   SAFESHARE-AI: OFFSCREEN NER TOKENIZER & SPAN EXTRACTION AUDIT");
  console.log("================================================================================");

  // 1. Basic Tokenizer
  const sample = "Billing address: Sara Schwarz, 28245 Puruntie 82 Apt. 595";
  const words = offscreen.basicTokenize(sample);
  assert(words.length > 5, "Should tokenize basic alphanumeric words and punctuation");
  assert.strictEqual(words[0].text, "Billing");
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

  console.log("  [✓] All offscreen tokenizer and span merge tests passed!");
}

testOffscreenTokenizer();
