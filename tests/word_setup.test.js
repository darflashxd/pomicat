const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "../extension");
const {downloadUrl}=require("../extension/word/source.js");
const sample="https://fictional.sharepoint.com/:w:/r/personal/test/_layouts/15/Doc.aspx?file=Example.docx&sourcedoc=%7B11111111-2222-3333-4444-555555555555%7D";
const download=new URL(downloadUrl(sample));
assert.equal(download.pathname,"/personal/test/_layouts/15/download.aspx");
assert.deepEqual([...download.searchParams.keys()],["UniqueId"]);
assert.throws(()=>downloadUrl(sample.replace("fictional.sharepoint.com","sharepoint.com.attacker.invalid")),/Unsupported/);
assert.throws(()=>downloadUrl(sample.replace("Example.docx","Example.xlsx")),/Unsupported/);
for (const name of ["manifest.json", "manifest.firefox.json"]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, name)));
  assert.ok(manifest.host_permissions.includes("https://*.sharepoint.com/*"), "Word hosts must be static");
  assert.ok(manifest.host_permissions.includes("https://word.cloud.microsoft/*"), "Word home must be static");
  assert.ok(!manifest.optional_host_permissions, "no per-site prompt for Word");
  const launcher = manifest.content_scripts.find(s => (s.js || []).includes("word/launcher.js"));
  assert.ok(launcher, "launcher must be a static content script");
  assert.ok(launcher.matches.includes("https://*.sharepoint.com/*"));
}
const html = fs.readFileSync(path.join(root, "word/index.html"), "utf8");
assert.ok(!/type=["']file/.test(html));
assert.ok(html.includes("Experimental integration"));
assert.ok(html.includes('id="sanitized-preview"'), "review must show what the recipient will see");
assert.ok(html.includes('id="show-original"'), "original pane must be collapsible");
assert.ok(html.includes('id="share-panel"'), "share controls must be gated behind apply");
assert.ok(html.includes('id="publish-hint"'), "disabled link control needs a reason");
assert.ok(!fs.existsSync(path.join(root, "documents/index.html")));
const viewer = fs.readFileSync(path.join(root,"viewer/app.js"),"utf8");
assert.ok(/kind === "document"/.test(viewer));
assert.ok(viewer.includes("doc.version === 4"), "viewer must validate v4 document payloads");
assert.ok(viewer.includes("Download sanitized DOCX"), "viewer must expose the sanitized download");
assert.ok(!viewer.includes("SafeShareDocuments"));
function launch(url) {
  let host;
  const document = {getElementById:()=>null,createElement:()=>({attachShadow:()=>({append(){}}),setAttribute(){},addEventListener(){}}),documentElement:{append(el){host=el;}}};
  const context = vm.createContext({document,location:new URL(url),URLSearchParams,setInterval(){},clearInterval(){},chrome:{runtime:{id:"fixture"}}});
  vm.runInContext(fs.readFileSync(path.join(root,"word/launcher.js"),"utf8"),context);
  return host;
}
assert.equal(launch("https://fictional.sharepoint.com/_layouts/15/doc2.aspx?file=Example.docx").hidden,false);
assert.equal(launch("https://fictional.sharepoint.com/_layouts/15/Doc.aspx?file=Example.docx").hidden,false);
assert.equal(launch("https://word.cloud.microsoft/").hidden,true);
assert.equal(launch("https://fictional.sharepoint.com/_layouts/15/doc2.aspx?file=Example.xlsx").hidden,true);
assert.equal(launch("https://fictional.sharepoint.com/sites/home").hidden,true);
console.log("Word launcher checks passed: opt-in hosts, Word routes, no offline import, legacy refusal.");
