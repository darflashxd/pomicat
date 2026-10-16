/**
 * SafeShare-AI — WordPiece tokenizer for the MiniLM NER model (offscreen.js), matching the
 * original Hugging Face BertTokenizer (uncased) the model was trained and benchmarked with:
 * drop control characters, split on whitespace, punctuation and CJK characters, lowercase,
 * strip accents ("José" -> "jose"), greedy longest-match WordPiece, words over 100 characters
 * -> [UNK]. Unlike the original it keeps character offsets into the original text.
 * Special ids follow vocab.txt: [PAD] 0, [UNK] 1, [CLS] 2, [SEP] 3.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SafeShareWordPiece = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const UNK = 1n, CLS = 2n, SEP = 3n;
  const MAX_WORD_CHARS = 100;

  const isWhitespace = (c) => /^[\s\p{Zs}]$/u.test(c);
  const isControl = (c) => c !== "\t" && c !== "\n" && c !== "\r" && /^[\p{Cc}\p{Cf}]$/u.test(c);
  // BERT counts all non-alphanumeric ASCII as punctuation ($, +, ^, `, ...), plus Unicode P*
  const isPunct = (c) => {
    const cp = c.codePointAt(0);
    return (cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) ||
      (cp >= 123 && cp <= 126) || /^\p{P}$/u.test(c);
  };
  const isCJK = (c) => {
    const cp = c.codePointAt(0);
    return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x20000 && cp <= 0x2a6df) ||
      (cp >= 0x2a700 && cp <= 0x2ceaf) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x2f800 && cp <= 0x2fa1f);
  };
  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");

  /** Words with offsets in the original text: [{ text (normalised), start, end }] */
  function basicTokenize(text) {
    const words = [];
    let cur = null;
    const flush = () => {
      if (cur) {
        const norm = normalize(cur.raw);
        if (norm) words.push({ text: norm, start: cur.start, end: cur.end });
        cur = null;
      }
    };
    for (let i = 0; i < text.length;) {
      const c = String.fromCodePoint(text.codePointAt(i));
      const next = i + c.length;
      if (c === "\0" || c === "�" || isControl(c)) {
        // dropped, like BERT's clean_text
      } else if (isWhitespace(c)) {
        flush();
      } else if (isPunct(c) || isCJK(c)) {
        flush();
        const norm = normalize(c);
        if (norm) words.push({ text: norm, start: i, end: next });
      } else {
        if (!cur) cur = { raw: "", start: i, end: i };
        cur.raw += c;
        cur.end = next;
      }
      i = next;
    }
    flush();
    return words;
  }

  /** WordPiece ids for one word: [bigint] */
  function wordPieces(word, vocab) {
    const chars = [...word];
    if (chars.length > MAX_WORD_CHARS) return [UNK];
    const ids = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let id = null;
      for (; end > start; end--) {
        const sub = (start > 0 ? "##" : "") + chars.slice(start, end).join("");
        if (vocab.has(sub)) {
          id = vocab.get(sub);
          break;
        }
      }
      if (id === null) return [UNK];
      ids.push(BigInt(id));
      start = end;
    }
    return ids;
  }

  /**
   * Model inputs for the whole text, as windows of at most maxLen ids ([CLS] ... [SEP]).
   * Long texts get several windows overlapping by `overlap` pieces, so nothing past the first
   * 128 pieces goes unchecked.
   * Each window: { inputIds, attentionMask, tokenTypeIds, tokenSpans } (tokenSpans[i] = word of id i)
   */
  function encode(text, vocab, { maxLen = 128, overlap = 32 } = {}) {
    const pieces = [];
    for (const w of basicTokenize(text)) {
      for (const id of wordPieces(w.text, vocab)) pieces.push({ id, span: w });
    }
    const room = maxLen - 2;
    const windows = [];
    for (let from = 0; from < pieces.length || (from === 0 && !windows.length); from += room - overlap) {
      const part = pieces.slice(from, from + room);
      const ids = [CLS, ...part.map((p) => p.id), SEP];
      windows.push({
        inputIds: new BigInt64Array(ids),
        attentionMask: new BigInt64Array(ids.length).fill(1n),
        tokenTypeIds: new BigInt64Array(ids.length).fill(0n),
        tokenSpans: [{ start: 0, end: 0, text: "[CLS]" }, ...part.map((p) => p.span), { start: 0, end: 0, text: "[SEP]" }]
      });
      if (from + room >= pieces.length) break;
    }
    return windows;
  }

  return { basicTokenize, wordPieces, encode };
});
