/**
 * SafeShare-AI — Offscreen Document for Local ML Inference (Gate 2)
 *
 * Runs persistent local ONNX WASM runtime in Chrome Manifest V3 without service worker termination.
 * Security Invariant: connect-src 'self' (Enforced via CSP in offscreen.html).
 * Zero remote telemetry, zero network leakage.
 */

console.log("[Blackline Offscreen] Isolated NER runtime initialized with connect-src 'self' (local assets only).");

const nerExtApi = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);

let session = null;
let id2label = null;
let vocab = null;
let loadingPromise = null;

// Small bounded cache: reopening the same review or re-checking an unchanged message should not
// run the model again. Keyed by exact text, so a different string never reuses a result.
const INFERENCE_CACHE_LIMIT = 24;
const inferenceCache = new Map();
function rememberInference(text, spans) {
  inferenceCache.delete(text);
  inferenceCache.set(text, spans.map(span => ({ ...span })));
  while (inferenceCache.size > INFERENCE_CACHE_LIMIT) {
    inferenceCache.delete(inferenceCache.keys().next().value);
  }
}

// Tokenizer: engine/wordpiece.js (loaded before this file by offscreen.html)
const { encode } = typeof SafeShareWordPiece !== "undefined" ? SafeShareWordPiece : require("./engine/wordpiece.js");

// Compatibility aliases for structured labels; PERSON and LOCATION retain their meaning.
const LABEL_CANONICAL_MAP = {
  "EMAIL_ADDRESS": "EMAIL",
  "PHONE_NUMBER": "PHONE",
  "IBAN_CODE": "BANK_ACCOUNT",
  "US_BANK_NUMBER": "BANK_ACCOUNT",
  "US_SSN": "GOVERNMENT_ID",
  "US_PASSPORT": "PASSPORT",
  "US_DRIVER_LICENSE": "DRIVERS_LICENSE",
  "US_ITIN": "TAX_ID"
};

function extractSpans(text, enc, logits, review = false, labels = id2label) {
  if (!labels || !Object.keys(labels).length) throw new Error("Missing model label configuration");
  const numLabels = Object.keys(labels).length;
  const seqLen = enc.inputIds.length;
  if (logits.length !== seqLen * numLabels) throw new Error("Model output shape does not match labels");
  if (!Array.from(logits).every(Number.isFinite)) throw new Error("Invalid model output");
  const spans = [];
  let currentSpan = null;

  for (let i = 1; i < seqLen - 1; i++) {
    let maxVal = -Infinity;
    let maxIdx = 0;
    for (let c = 0; c < numLabels; c++) {
      const v = logits[i * numLabels + c];
      if (v > maxVal) {
        maxVal = v;
        maxIdx = c;
      }
    }
    // Softmax probability of the winning label
    let expSum = 0;
    for (let c = 0; c < numLabels; c++) expSum += Math.exp(logits[i * numLabels + c] - maxVal);
    let prob = 1 / expSum;

    if (!Number.isFinite(maxVal)) throw new Error("Invalid model output");
    const originalTag = labels[String(maxIdx)];
    if (!originalTag || originalTag === "O") {
      if (currentSpan) {
        currentSpan.text = text.slice(currentSpan.start, currentSpan.end);
        spans.push(currentSpan);
        currentSpan = null;
      }
      continue;
    }

    const prefix = originalTag.slice(0, 2);
    const rawCategory = originalTag.slice(2);
    const labelType = LABEL_CANONICAL_MAP[rawCategory] || rawCategory;
    const tokenSpan = enc.tokenSpans[i];

    if (prefix === "B-" || (currentSpan && currentSpan.label !== labelType)) {
      if (currentSpan) {
        currentSpan.text = text.slice(currentSpan.start, currentSpan.end);
        spans.push(currentSpan);
      }
      currentSpan = {
        label: labelType,
        start: tokenSpan.start,
        end: tokenSpan.end,
        score: prob
      };
    } else if (prefix === "I-" && currentSpan && currentSpan.label === labelType) {
      currentSpan.end = Math.max(currentSpan.end, tokenSpan.end);
      currentSpan.score = Math.min(currentSpan.score, prob);
    } else {
      if (currentSpan) {
        currentSpan.text = text.slice(currentSpan.start, currentSpan.end);
        spans.push(currentSpan);
      }
      currentSpan = {
        label: labelType,
        start: tokenSpan.start,
        end: tokenSpan.end,
        score: prob
      };
    }
  }

  if (currentSpan) {
    currentSpan.text = text.slice(currentSpan.start, currentSpan.end);
    spans.push(currentSpan);
  }

  return spans;
}

function mergeSpans(spans) {
  if (!spans || !spans.length) return [];
  const merged = [Object.assign({}, spans[0])];
  for (let i = 1; i < spans.length; i++) {
    const cur = spans[i];
    const prev = merged[merged.length - 1];
    if (prev.label === cur.label && cur.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, cur.end);
      prev.score = Math.min(prev.score, cur.score);
    } else {
      merged.push(Object.assign({}, cur));
    }
  }
  return merged;
}

async function loadModel() {
  if (session) return session;
  try {
    if (typeof ort !== "undefined" && ort.env && ort.env.wasm) {
      ort.env.wasm.wasmPaths = nerExtApi ? nerExtApi.runtime.getURL("models/") : new URL("models/", location.href).href;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
    }

    const [cfgRes, vocabRes, modelRes] = await Promise.all([
      fetch("models/config.json").then((r) => { if (!r.ok) throw new Error("Model config missing"); return r.json(); }),
      fetch("models/vocab.txt").then((r) => { if (!r.ok) throw new Error("Model vocabulary missing"); return r.text(); }),
      fetch("models/model_q4.onnx").then((r) => { if (!r.ok) throw new Error("Model missing"); return r.arrayBuffer(); })
    ]);

    id2label = cfgRes.id2label;
    vocab = new Map();
    vocabRes.split(/\r?\n/).forEach((w, idx) => {
      if (w) vocab.set(w, idx);
    });

    session = await ort.InferenceSession.create(modelRes, {
      executionProviders: ["wasm"]
    });
    console.log("[Blackline Offscreen] BERT-small INT8 session initialized (English-focused).");
    return session;
  } catch (err) {
    console.error("[Blackline Offscreen] Failed to load ONNX model:", err);
    throw err;
  }
}

async function runInference(text, review = false) {
  if (typeof text !== "string" || text.length > 512 * 1024) throw new Error("Invalid inference text (max 512 KB)");
  if (!text || typeof text !== "string" || !text.trim()) {
    return [];
  }
  if (!session) {
    loadingPromise ||= loadModel().catch(err => { loadingPromise = null; throw err; });
    await loadingPromise;
  }
  const cached = inferenceCache.get(text);
  if (cached) return cached.map(span => ({ ...span }));
  const spans = [];
  // 16-piece overlap instead of 32: still wide enough for names and addresses, but ~14% fewer
  // windows on long messages. MergeSpans below rejoins a span that crosses a window boundary.
  for (const enc of encode(text, vocab, { overlap: 16 })) {
    if (enc.inputIds.length <= 2) continue;
    const feeds = {
      input_ids: new ort.Tensor("int64", enc.inputIds, [1, enc.inputIds.length]),
      attention_mask: new ort.Tensor("int64", enc.attentionMask, [1, enc.attentionMask.length]),
      token_type_ids: new ort.Tensor("int64", enc.tokenTypeIds, [1, enc.tokenTypeIds.length])
    };
    if (session && session.inputNames) {
      for (const name of Object.keys(feeds)) {
        if (!session.inputNames.includes(name)) delete feeds[name];
      }
    }
    const results = await session.run(feeds);
    spans.push(...extractSpans(text, enc, results.logits.data, review));
  }
  // Windows overlap: the same span can come twice; mergeSpans joins overlapping same-label spans
  const merged = mergeSpans(spans.sort((a, b) => a.start - b.start));
  for (const s of merged) {
    s.text = text.slice(s.start, s.end);
  }
  rememberInference(text, merged);
  return merged;
}

// Warm up model in background
// Load on demand; Firefox event pages may restart. Failed loads can be retried.

// 1-Hop Direct Port Receiver (Connects directly with Content Script, bypassing SW proxy)
if (nerExtApi && nerExtApi.runtime && nerExtApi.runtime.onConnect) {
  nerExtApi.runtime.onConnect.addListener((port) => {
    if (port.name !== "OFFSCREEN_DIRECT_NER") return;

    port.onMessage.addListener(async (msg) => {
      const { requestId, text } = msg;
      const t0 = performance.now();
      try {
        const spans = await runInference(text);
        const latencyMs = performance.now() - t0;
        port.postMessage({
          ok: true,
          requestId,
          spans,
          latencyMs,
          isolated: true
        });
      } catch (err) {
        port.postMessage({
          ok: false,
          requestId,
          error: String(err)
        });
      }
    });
  });
}

if (nerExtApi && nerExtApi.runtime && nerExtApi.runtime.onMessage &&
    typeof location !== "undefined" && location.pathname.endsWith("/offscreen.html")) {
  nerExtApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_NER_INFERENCE" && request.target === "NER_RUNTIME") {
      const { text } = request;
      const t0 = performance.now();

      runInference(text, request.review === true)
        .then((spans) => {
          sendResponse({
            success: true,
            state: "checked",
            spans,
            latencyMs: performance.now() - t0,
            isolated: true,
            networkAllowed: false
          });
        })
        .catch((err) => {
          sendResponse({
            success: false,
            state: "failed",
            error: String(err),
            latencyMs: performance.now() - t0
          });
        });
      return true;
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    extractSpans,
    mergeSpans,
    loadModel,
    runInference
  };
}
