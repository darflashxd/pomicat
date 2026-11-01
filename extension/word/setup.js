const api = typeof browser !== "undefined" ? browser : chrome;
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
let origin;
let sourceBytes = null;
let lastDoc = null;
let providedFindings = null;
let sanitizedBytes = null;
let reviewGeneration = 0;
let appliedSnapshot = null;
const scanner = new HeuristicsRedactor();
try {
  const parsed = new URL(query.get("origin"));
  if (parsed.protocol === "https:" && (/(^|\.)(sharepoint\.com|officeapps\.live\.com|word\.cloud\.microsoft)$/.test(parsed.hostname) || parsed.hostname === "docs.google.com")) origin = parsed.origin;
} catch (_) {}
// The launcher is declared statically, so this page only needs to know which
// Word tab to read. No permission request happens here.
const sharepointOrigin = (() => {
  try {
    const parsed = new URL(origin);
    return /(^|\.)sharepoint\.com$/.test(parsed.hostname) || parsed.hostname === "docs.google.com" ? parsed.origin : null;
  } catch (_) { return null; }
})();
if (sharepointOrigin) {
  $("capture-section").hidden = false;
  if (new URL(sharepointOrigin).hostname === "docs.google.com") {
    document.querySelector(".word-hero .eyebrow").textContent = "Google Docs · Experimental integration";
    document.querySelector(".word-hero h1").innerHTML = "Private sharing.<br>From Google Docs.";
    document.querySelector(".word-hero .intro").textContent = "Review a separate copy before sharing. Your original Google Doc stays unchanged.";
    $("capture-section").querySelector("h2").textContent = "Inspect the document";
  }
  $("capture-intro").textContent = new URL(sharepointOrigin).hostname === "docs.google.com"
    ? "Connected to Google Docs. Exports a DOCX copy through your Google session; the original document is not changed. DOCX up to 10 MiB."
    : `Connected to ${new URL(sharepointOrigin).hostname}. Reads the saved copy only; the original document is not changed.`;
}

// Fetches a DOCX with a size cap. Self-contained: it is also injected into the Word tab.
// origins: exact origins, or ".suffix" for any https host under that domain.
const captureDocx=async (target,maxBytes,opts)=>{
  const allowed=href=>{const u=new URL(href);return opts.origins.some(o=>o.startsWith(".")?u.protocol==="https:"&&u.hostname.endsWith(o):u.origin===o);};
  if(!allowed(target))return {error:true};
  try{
    const response=await fetch(target,{credentials:opts.credentials,redirect:opts.redirect,signal:AbortSignal.timeout(20000)});
    if(!response.ok || !allowed(response.url) || /text\/html/i.test(response.headers.get("content-type")||"")){await response.body?.cancel();return {error:"access"};}
    if(Number(response.headers.get("content-length")||0)>maxBytes){await response.body?.cancel();return {error:"size"};}
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes)return {error:"size"};chunks.push(part.value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    if(bytes[0]!==80||bytes[1]!==75)return {error:true};
    let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {data:btoa(binary)};
  }catch(_){return {error:true};}
};// end captureDocx

async function runCapture(){
  if ($("capture").disabled) return;
  const generation = ++reviewGeneration;
  sourceBytes = null;
  lastDoc = null;
  providedFindings = null;
  sanitizedBytes = null;
  appliedSnapshot = null;
  $("review-section").hidden = true;
  $("download-sanitized").hidden = true;
  $("verify").hidden = true;
  $("sanitized-preview").replaceChildren();
  $("create-link").disabled = true;
  $("share-panel").hidden = true;
  $("capture").disabled=true;$("error").hidden=true;$("document-preview").replaceChildren();
  $("capture-status").textContent="Reading saved DOCX…";
  try {
    const tabId=Number(query.get("tab"));
    const tab=await api.tabs.get(tabId);
    if(new URL(tab.url).origin!==origin)throw new Error("The source tab changed. Reopen PomiCat from the document.");
    const url=SafeShareWordSource.downloadUrl(tab.url);
    // SharePoint: fetch inside the Word tab (isolated world), so its session cookies stay there.
    // Google Docs: the export redirects to *.googleusercontent.com, which a page on
    // docs.google.com may not read; this extension page (host access) follows it with the
    // browser's Google session instead.
    const google=new URL(tab.url).hostname==="docs.google.com";
    const data=google
      ? await captureDocx(url,10*1024*1024,{credentials:"include",redirect:"follow",origins:["https://docs.google.com",".googleusercontent.com"]})
      : (await api.scripting.executeScript({target:{tabId},func:captureDocx,args:[url,10*1024*1024,{credentials:"same-origin",redirect:"error",origins:[origin]}]}))[0]?.result;
    if(data?.error==="size")throw new Error("The DOCX copy is larger than 10 MiB. Use a smaller document.");
    if(!data?.data||data.error)throw new Error("Could not read a DOCX copy. Check that you can open and download this document, then retry.");
    const bytes=Uint8Array.from(atob(data.data),c=>c.charCodeAt(0));
    sourceBytes=bytes;
    sanitizedBytes=null;
    $("download-sanitized").hidden=true;$("verify").hidden=true;
    const doc=await inspectWordFile(bytes);
    $("inventory").textContent=`${doc.tables} tables - ${doc.images} images - ${doc.equations} equations`;
    $("capture-status").textContent="Saved copy read.";
    lastDoc = doc;
    providedFindings = null;
    const map = SafeShareTextMap.flatten(doc);
    providedFindings = await SafeShareWordDetect.detect({
      doc, map, heuristics: scanner,
      Solver: typeof AdversaryOracleSolver !== "undefined" ? AdversaryOracleSolver : null,
      ner: null, useModel: false, TextMap: SafeShareTextMap
    });
    renderFindings(doc);
    if (typeof SafeShareNer !== "undefined") {
      $("review-summary").textContent += " Checking names locally...";
      SafeShareWordDetect.nerCandidates(map, SafeShareNer).then(extra => {
        if (generation !== reviewGeneration || lastDoc !== doc) return;
        if (!extra.length) { $("review-summary").textContent = $("review-summary").textContent.replace(" Checking names locally...", " Local name model found nothing; add names manually if needed."); return; }
        const known = new Set(providedFindings.map(f => f.value.toLowerCase()));
        for (const item of extra) if (!known.has(item.value.toLowerCase())) providedFindings.push({ ...item, categoryLabel: "Contact & profile" });
        renderFindings(lastDoc);
        $("review-summary").textContent = $("review-summary").textContent.replace(" Checking names locally...", "");
      }).catch(() => { if (generation === reviewGeneration && lastDoc === doc) $("review-summary").textContent = $("review-summary").textContent.replace(" Checking names locally...", " Name model unavailable."); });
    }
  }catch(e){$("error").textContent=e.message;$("error").hidden=false;$("capture-status").textContent="Inspection stopped. Nothing was shared.";}
  finally{$("capture").disabled=false;$("capture").textContent="Read again";}
}
$("capture").addEventListener("click", runCapture);
window.__ssReadAgain = runCapture;

// The launcher already expressed intent: read once automatically for that tab.
const autoTab = Number(query.get("tab"));
if (sharepointOrigin && Number.isInteger(autoTab) && autoTab > 0) {
  $("capture-status").textContent = "Reading saved copy...";
  runCapture();
}

async function legacyLinks() {
  try {
    const stored = await api.storage.local.get(null);
    const expired = Object.entries(stored).filter(([k,v]) => k.startsWith("chat_share_revoke_") && v?.expiresAt <= Date.now()).map(([k]) => k);
    if (expired.length) await api.storage.local.remove(expired);
    const shares = [...Object.entries(stored).filter(([k])=>(k.startsWith("document_share_revoke_") || k.startsWith("chat_share_revoke_")) && !expired.includes(k)).map(([k,v])=>({kind:k.startsWith("chat_")?"chat":"document",...v})),...(stored.document_share_revocations || [])]
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    $("legacy").replaceChildren();
    if (!shares.length) { $("legacy").textContent = "No earlier chat or document links stored on this device."; return; }
    for (const share of shares) {
      // Title and dates make links tell-apart; links saved before this have only their id
      const day = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      const row = document.createElement("div");row.className = "legacy-row";
      const label = document.createElement("span");
      label.textContent = [share.title || (share.kind === "document" ? "Document link" : "Chat link"),
        share.createdAt ? `created ${day(share.createdAt)}` : `id ${String(share.shareId).slice(0, 8)}`,
        share.expiresAt ? `expires ${day(share.expiresAt)}` : ""].filter(Boolean).join(" · ");
      const button = document.createElement("button");button.textContent = "Revoke";
      button.setAttribute("aria-label", `Revoke ${label.textContent}`);
      button.addEventListener("click",async()=>{
        button.disabled = true;
        try {
          const result = await api.runtime.sendMessage({action:"REVOKE_SHARE",...share});
          if (!result?.success) throw new Error();
          await api.storage.local.remove("document_share_revoke_"+share.shareId);
          await api.storage.local.remove("chat_share_revoke_"+share.shareId);
          await api.storage.local.remove("safeshare_own_"+share.shareId);
          const current = await api.storage.local.get("document_share_revocations");
          if(current.document_share_revocations)await api.storage.local.set({document_share_revocations:current.document_share_revocations.filter(s=>s.shareId!==share.shareId)});
          await legacyLinks();$("status").textContent = "Earlier link revoked. Saved copies cannot be recalled.";
        } catch (_) { button.disabled=false;$("error").textContent="Revocation failed. Retry; the link may still exist until expiry.";$("error").hidden=false; }
      });row.append(label, button);$("legacy").append(row);
    }
  } catch (_) { $("legacy").textContent="Saved revocation controls could not be loaded. Retry after reloading the extension."; }
}
legacyLinks();
