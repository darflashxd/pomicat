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
  assert.ok(manifest.optional_host_permissions.includes("https://*.sharepoint.com/*"));
  assert.ok(!manifest.host_permissions.some(p => p.includes("sharepoint")), "Word site access must be opt-in");
}
const html = fs.readFileSync(path.join(root, "word/index.html"), "utf8");
assert.ok(!/type=["']file/.test(html));
assert.ok(html.includes("Not ready to share yet"));
assert.ok(!fs.existsSync(path.join(root, "documents/index.html")));
const viewer = fs.readFileSync(path.join(root,"viewer/app.js"),"utf8");
assert.ok(viewer.includes("Experimental document link retired"));
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
