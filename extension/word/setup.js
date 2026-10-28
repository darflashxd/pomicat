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
  if (parsed.protocol === "https:" && /(^|\.)(sharepoint\.com|officeapps\.live\.com|word\.cloud\.microsoft)$/.test(parsed.hostname)) origin = parsed.origin;
} catch (_) {}
// The launcher is declared statically, so this page only needs to know which
// Word tab to read. No permission request happens here.
const sharepointOrigin = (() => {
  try {
    const parsed = new URL(origin);
    return /(^|\.)sharepoint\.com$/.test(parsed.hostname) ? parsed.origin : null;
  } catch (_) { return null; }
})();
if (sharepointOrigin) {
  $("capture-section").hidden = false;
  $("capture-intro").textContent = `Connected to ${new URL(sharepointOrigin).hostname}. Reads the saved copy only; the original document is not changed.`;
}

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
    if(new URL(tab.url).origin!==origin)throw new Error("The source tab changed. Reopen SafeShare from Word.");
    const url=SafeShareWordSource.downloadUrl(tab.url);
    // Execute in isolated content-script world: session cookies stay with the browser.
    const result=await api.scripting.executeScript({target:{tabId},func:async (target,maxBytes)=>{
      if(new URL(target).origin!==location.origin)return {error:true};
      try{
        const response=await fetch(target,{credentials:"same-origin",redirect:"error",signal:AbortSignal.timeout(20000)});
        if(!response.ok || /text\/html/i.test(response.headers.get("content-type")||""))return {error:"access"};
        if(Number(response.headers.get("content-length")||0)>maxBytes){await response.body?.cancel();return {error:"size"};}
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes)return {error:"size"};chunks.push(part.value);}}finally{await reader.cancel();}
        const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
        if(bytes[0]!==80||bytes[1]!==75)return {error:true};
        let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return {data:btoa(binary)};
      }catch(_){return {error:true};}
    },args:[url,10*1024*1024]});
    const data=result[0]?.result;
    if(data?.error==="size")throw new Error("The saved DOCX is larger than 10 MiB. Download it from Word and use a smaller copy.");
    if(!data?.data||data.error)throw new Error("Could not read the saved DOCX. Check Word access and download permissions, then retry.");
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
    const shares = [...Object.entries(stored).filter(([k])=>k.startsWith("document_share_revoke_")).map(([,v])=>v),...(stored.document_share_revocations || [])];
    $("legacy").replaceChildren();
    if (!shares.length) { $("legacy").textContent = "No earlier document links stored on this device."; return; }
    for (const share of shares) {
      const button = document.createElement("button");button.textContent = `Revoke ${share.shareId}`;
      button.addEventListener("click",async()=>{
        button.disabled = true;
        try {
          const result = await api.runtime.sendMessage({action:"REVOKE_SHARE",...share});
          if (!result?.success) throw new Error();
          await api.storage.local.remove("document_share_revoke_"+share.shareId);
          const current = await api.storage.local.get("document_share_revocations");
          if(current.document_share_revocations)await api.storage.local.set({document_share_revocations:current.document_share_revocations.filter(s=>s.shareId!==share.shareId)});
          await legacyLinks();$("status").textContent = "Earlier link revoked. Saved copies cannot be recalled.";
        } catch (_) { button.disabled=false;$("error").textContent="Revocation failed. Retry; the link may still exist until expiry.";$("error").hidden=false; }
      });$("legacy").append(button);
    }
  } catch (_) { $("legacy").textContent="Saved revocation controls could not be loaded. Retry after reloading the extension."; }
}
legacyLinks();
