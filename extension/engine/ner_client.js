/** Bounded local extension messaging, shared by Chrome offscreen and Firefox background. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SafeShareNer = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function analyze(text, timeout = 30000, review = false) {
    if (typeof text !== "string" || text.length > 512 * 1024) return Promise.resolve({ success: false, state: "failed", error: "Invalid inference text" });
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({ success: false, state: "failed", error: "Local model timed out" }), timeout);
      const finish = result => { clearTimeout(timer); resolve(result || { success: false, state: "failed", error: "No runtime response" }); };
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
