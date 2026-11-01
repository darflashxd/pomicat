(() => {
  const previous = document.getElementById("safeshare-word-launcher");
  if (previous) {
    previous.dispatchEvent(new Event("safeshare-word-dispose"));
    previous.remove();
  }
  const isWord = () => location.hostname === "docs.google.com" && /^\/document\/(?:u\/\d+\/)?d\//.test(location.pathname) || /\/doc2?\.aspx$/i.test(location.pathname) && /\.docx$/i.test(new URLSearchParams(location.search).get("file") || "") || /\/word(?:\/|$)|wordeditor/i.test(location.pathname);
  const host = document.createElement("div");
  host.id = "safeshare-word-launcher";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = ':host{position:fixed;right:24px;bottom:24px;z-index:2147483646}button{padding:0;border:0;background:transparent;cursor:pointer;line-height:0;border-radius:14px;box-shadow:0 3px 14px #0004}button:has(img){width:48px;height:48px;padding:6px;background:rgba(39,39,47,.88);border:1px solid rgba(255,255,255,.1)}button:focus-visible{outline:3px solid #c8b6ff;outline-offset:3px}img{display:block;width:100%;height:100%;object-fit:contain}';
  const pillLogo = typeof POMICAT_MARK === "string" ? POMICAT_MARK : "";
  const button = document.createElement("button");
  button.type = "button";
  if (pillLogo) {
    button.innerHTML = `<img src="${pillLogo}" alt="">`;
  } else {
    button.textContent = "PomiCat";
    button.setAttribute("style", 'display:flex;align-items:center;gap:8px;background:#20242a;color:#f0f2f5;border:1px solid #737d8a;border-radius:24px;padding:12px 18px;font:600 14px system-ui,sans-serif;min-height:44px');
  }
  button.setAttribute("aria-label", "Open PomiCat document review");
  button.title = "Review and redact a copy of this document before sharing";
  const unavailable = () => {
    button.innerHTML = "";
    button.textContent = "Refresh Word to reconnect";
    button.setAttribute("style", 'display:flex;align-items:center;background:#20242a;color:#f0f2f5;border:1px solid #737d8a;border-radius:24px;padding:12px 18px;font:600 14px system-ui,sans-serif;min-height:44px');
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
