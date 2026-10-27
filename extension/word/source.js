/* Session-download prototype: only the observed SharePoint editor/download route. */
(function (root) {
  function downloadUrl(source) {
    const url = new URL(source);
    if (url.protocol !== "https:" || !/(^|\.)sharepoint\.com$/.test(url.hostname) || !/\/doc2?\.aspx$/i.test(url.pathname) || !/\.docx$/i.test(url.searchParams.get("file") || "")) throw new Error("Unsupported Word source.");
    const id = (url.searchParams.get("sourcedoc") || "").replace(/^\{|\}$/g, "");
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new Error("Invalid document identifier.");
    const prefix = url.pathname.replace(/^\/:w:\/r/, "").replace(/\/_layouts\/15\/doc2?\.aspx$/i, "");
    const target = new URL(prefix + "/_layouts/15/download.aspx", url.origin);
    target.searchParams.set("UniqueId", id);
    return target.href;
  }
  if (typeof module === "object" && module.exports) module.exports = { downloadUrl };
  else root.SafeShareWordSource = { downloadUrl };
})(typeof globalThis !== "undefined" ? globalThis : this);
