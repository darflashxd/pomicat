/**
 * SafeShare-AI — Offscreen Document for Local ML Inference (Gate 2)
 *
 * Runs persistent local ONNX WASM runtime in Chrome Manifest V3 without service worker termination.
 * Security Invariant: connect-src 'self' (Enforced via CSP in offscreen.html).
 * Zero remote telemetry, zero network leakage.
 */

console.log("[SafeShare-AI Offscreen] Isolated NER runtime initialized with connect-src 'self' (local assets only).");

const webExtApi = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);

let session = null;
let id2label = null;
let vocab = null;
let loadingPromise = null;

function basicTokenize(text) {
  const tokens = [];
  const regex = /[a-zA-Z0-9]+|[^\s\w]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return tokens;
}

function wordPieceTokenize(words, maxLen = 128) {
  const inputIds = [2n]; // [CLS]
  const tokenSpans = [{ start: 0, end: 0, text: "[CLS]" }];

  for (const word of words) {
    if (inputIds.length >= maxLen - 1) break;
    const lower = word.text.toLowerCase();
    if (vocab.has(lower)) {
      inputIds.push(BigInt(vocab.get(lower)));
      tokenSpans.push(word);
      continue;
    }

    let isBad = false;
    let start = 0;
    const subTokens = [];

    while (start < lower.length) {
      let end = lower.length;
      let curSub = null;
      let curId = null;

      while (start < end) {
        let substr = lower.slice(start, end);
        if (start > 0) substr = "##" + substr;
        if (vocab.has(substr)) {
          curSub = substr;
          curId = vocab.get(substr);
          break;
        }
        end--;
      }

      if (curSub === null) {
        isBad = true;
        break;
      }

      subTokens.push({ id: BigInt(curId), text: curSub });
      start = end;
    }

    if (isBad || subTokens.length === 0) {
      inputIds.push(1n); // [UNK]
      tokenSpans.push(word);
    } else {
      for (const st of subTokens) {
        if (inputIds.length >= maxLen - 1) break;
        inputIds.push(st.id);
        tokenSpans.push({ start: word.start, end: word.end, text: st.text });
      }
    }
  }

  inputIds.push(3n); // [SEP]
  tokenSpans.push({ start: 0, end: 0, text: "[SEP]" });

  const mask = new BigInt64Array(inputIds.length).fill(1n);
  const typeIds = new BigInt64Array(inputIds.length).fill(0n);

  return {
    inputIds: new BigInt64Array(inputIds),
    attentionMask: mask,
    tokenTypeIds: typeIds,
    tokenSpans
  };
}

function extractSpans(text, enc, logits) {
  const numLabels = 35;
  const seqLen = enc.inputIds.length;
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
    // Softmax probability of the winning label: span_arbiter's thresholds (0.30-0.45) are
    // probabilities, and raw logits would pass them almost always
    let expSum = 0;
    for (let c = 0; c < numLabels; c++) expSum += Math.exp(logits[i * numLabels + c] - maxVal);
    const prob = 1 / expSum;
    const rawTag = id2label[String(maxIdx)];
    if (!rawTag || rawTag === "O") {
      if (currentSpan) {
        currentSpan.text = text.slice(currentSpan.start, currentSpan.end);
        spans.push(currentSpan);
        currentSpan = null;
      }
      continue;
    }

    const prefix = rawTag.slice(0, 2);
    const labelType = rawTag.slice(2);
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
      currentSpan.score = Math.max(currentSpan.score, prob);
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
      prev.score = Math.max(prev.score, cur.score);
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
      ort.env.wasm.wasmPaths = "models/";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
    }

    const [cfgRes, vocabRes, modelRes] = await Promise.all([
      fetch("models/config.json").then((r) => r.json()),
      fetch("models/vocab.txt").then((r) => r.text()),
      fetch("models/model_q4.onnx").then((r) => r.arrayBuffer())
    ]);

    id2label = cfgRes.id2label;
    vocab = new Map();
    vocabRes.split(/\r?\n/).forEach((w, idx) => {
      if (w) vocab.set(w, idx);
    });

    session = await ort.InferenceSession.create(modelRes, {
      executionProviders: ["wasm"]
    });
    console.log("[SafeShare-AI Offscreen] ONNX MiniLM Q4 session initialized.");
    return session;
  } catch (err) {
    console.error("[SafeShare-AI Offscreen] Failed to load ONNX model:", err);
    throw err;
  }
}

// ponytail: single-sequence maxLen=128 truncation without sliding window stride. Add stride when multi-paragraph legal documents need Gate 2 ML NER.
async function runInference(text) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return [];
  }
  await (loadingPromise || (loadingPromise = loadModel()));
  const words = basicTokenize(text);
  if (!words.length) return [];
  const enc = wordPieceTokenize(words);
  const feeds = {
    input_ids: new ort.Tensor("int64", enc.inputIds, [1, enc.inputIds.length]),
    attention_mask: new ort.Tensor("int64", enc.attentionMask, [1, enc.attentionMask.length]),
    token_type_ids: new ort.Tensor("int64", enc.tokenTypeIds, [1, enc.tokenTypeIds.length])
  };
  const results = await session.run(feeds);
  const rawSpans = extractSpans(text, enc, results.logits.data);
  const merged = mergeSpans(rawSpans);
  for (const s of merged) {
    s.text = text.slice(s.start, s.end);
  }
  return merged;
}

// Warm up model in background
if (typeof fetch !== "undefined") {
  loadingPromise = loadModel().catch((err) => {
    console.warn("[SafeShare-AI Offscreen] Background model warmup deferred:", err.message);
  });
}

// 1-Hop Direct Port Receiver (Connects directly with Content Script, bypassing SW proxy)
if (webExtApi && webExtApi.runtime && webExtApi.runtime.onConnect) {
  webExtApi.runtime.onConnect.addListener((port) => {
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

if (webExtApi && webExtApi.runtime && webExtApi.runtime.onMessage) {
  webExtApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_NER_INFERENCE") {
      const { text } = request;
      const t0 = performance.now();

      runInference(text)
        .then((spans) => {
          sendResponse({
            success: true,
            spans,
            latencyMs: performance.now() - t0,
            isolated: true,
            networkAllowed: false
          });
        })
        .catch((err) => {
          sendResponse({
            success: false,
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
    basicTokenize,
    wordPieceTokenize,
    extractSpans,
    mergeSpans,
    loadModel,
    runInference
  };
}
