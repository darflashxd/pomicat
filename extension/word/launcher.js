(() => {
  const previous = document.getElementById("safeshare-word-launcher");
  if (previous) {
    previous.dispatchEvent(new Event("safeshare-word-dispose"));
    previous.remove();
  }
  const isWord = () => /\/doc2?\.aspx$/i.test(location.pathname) && /\.docx$/i.test(new URLSearchParams(location.search).get("file") || "") || /\/word(?:\/|$)|wordeditor/i.test(location.pathname);
  const host = document.createElement("div");
  host.id = "safeshare-word-launcher";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = ':host{position:fixed;right:24px;bottom:24px;z-index:2147483646}button{display:flex;align-items:center;gap:8px;background:#20242a;color:#f0f2f5;border:1px solid #737d8a;border-radius:24px;padding:12px 18px;font:600 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 14px #0004;min-height:44px}button:focus-visible{outline:3px solid #dcebc1;outline-offset:3px}svg{width:18px;height:18px}';
  const button = document.createElement("button");
  button.type = "button"; button.textContent = "PomiCat";
  button.setAttribute("aria-label", "Open PomiCat Word review");
  button.title = "Review and redact a saved Word copy before sharing";
  const unavailable = () => {
    button.textContent = "Refresh Word to reconnect";
    button.title = "Save your document, then refresh this Word tab to reconnect PomiCat.";
    button.setAttribute("aria-label", button.title);
    button.disabled = true;
  };
  button.addEventListener("click", async () => {
    try {
      const api = typeof browser !== "undefined" ? browser : chrome;
      if (!api.runtime?.id) { unavailable(); return; }
      await api.runtime.sendMessage({action:"OPEN_WORD_SETUP"});
    } catch (_) { unavailable(); }
  });
  shadow.append(style, button);
  document.documentElement.append(host);
  const update = () => {
    try {
      const api = typeof browser !== "undefined" ? browser : chrome;
      if (!api.runtime?.id) { clearInterval(timer); unavailable(); }
    } catch (_) { clearInterval(timer); unavailable(); }
    host.hidden = !isWord();
  };
  let timer;
  update();
  // Detect SPA route changes without reading editor content or observing every keystroke.
  timer = setInterval(() => {
    if (!host.isConnected) { clearInterval(timer); return; }
    update();
  }, 1500);
  host.addEventListener("safeshare-word-dispose", () => clearInterval(timer), { once: true });
})();
