/** Bounded local extension messaging, shared by Chrome offscreen and Firefox background. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SafeShareNer = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function analyze(text, timeout = 30000, review = false) {
    if (typeof text !== "string" || text.length > 512 * 1024) return Promise.resolve({ success: false, state: "failed", error: "Invalid inference text" });
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({ success: false, state: "failed", error: "Local model timed out" }), timeout);
      const finish = result => {
        clearTimeout(timer);
        if (!result) return resolve({ success: false, state: "failed", error: "No runtime response" });
        if (!result.success) return resolve({ ...result, state: result.state || "failed" });
        if ((result.state && !["ready", "checked"].includes(result.state)) || !Array.isArray(result.spans) || result.spans.some(s =>
          !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > text.length ||
          typeof s.label !== "string" || !s.label || !Number.isFinite(s.score) || s.score < 0 || s.score > 1)) {
          return resolve({ success: false, state: "failed", error: "Invalid or incomplete model response" });
        }
        resolve({ ...result, state: "checked" });
      };
      try {
        if (typeof browser !== "undefined") browser.runtime.sendMessage({ action: "RUN_NER_INFERENCE", text, review }).then(finish, err => finish({ success: false, state: "failed", error: err.message }));
        else if (typeof chrome !== "undefined" && chrome.runtime) chrome.runtime.sendMessage({ action: "RUN_NER_INFERENCE", text, review }, result =>
          finish(chrome.runtime.lastError ? { success: false, state: "failed", error: chrome.runtime.lastError.message } : result));
        else finish({ success: false, state: "unsupported", error: "Extension runtime unavailable" });
      } catch (err) { finish({ success: false, state: "failed", error: err.message }); }
    });
  }
  return { analyze };
});
