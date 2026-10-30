// Local relay only. Fictional ciphertext, atomic burn race, revoke, expiry, headers.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os'),path=require('node:path');
const Crypto=require('../extension/engine/crypto');
(async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'safeshare-relay-lifecycle-'));
 const port=22000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
 const relay=spawn(process.platform==='win32'?'python':'python3',[path.join(__dirname,'../relay/server_local.py')],{
  env:{...process.env,SAFESHARE_PORT:String(port),SAFESHARE_STORAGE:path.join(dir,'storage.json')},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<50&&!ready;i++){await new Promise(r=>setTimeout(r,100));ready=await fetch(base).then(r=>r.ok).catch(()=>false);}
  assert(ready,'local relay unavailable');
  const crypto=new Crypto(base,base);
  async function create(burn=false,ttl=3600){
   const turns=[{role:'user',content:'Reviewed fictional [REDACTED_PASSWORD_1].'}];
   const enc=await crypto.encrypt({turns,ttl});
   const res=await fetch(base+'/api/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:enc.shareId,ciphertext:enc.ciphertext,ttl,burn_on_read:burn})});
   assert.equal(res.status,201);return {...enc,turns,meta:await res.json()};
  }
   const normal=await create(false,86400);
   assert.equal(normal.meta.burn_on_read,false,'24-hour option must not enable burn');
  const html=await fetch(normal.fullShareUrl);assert.equal(html.status,200);
  assert(html.headers.get('content-security-policy').includes("script-src 'self'"));
   const js=await (await fetch(base+'/app.js')).text();assert(js.includes('e.isTrusted'),'viewer lacks trusted click gate');
   const {readFileSync}=require('node:fs');
   const vm=require('node:vm');
   const viewer=readFileSync(path.join(__dirname,'../extension/viewer/app.js'),'utf8');
   const options=viewer.match(/new ZeroizerEngine\((\{[\s\S]*?\})\)/)[1];
   const Zeroizer=require('../extension/viewer/engine/memory_zeroizer');
   let replaced=false;
   const previousWindow=global.window;
   global.window={location:{hash:'#fictional-key'},history:{replaceState(){replaced=true;}},addEventListener(){}};
   try{
    new Zeroizer(vm.runInNewContext('('+options+')',{shareId:normal.shareId,window:{SAFESHARE_RELAY_URL:base,location:{origin:base}}})).start();
    assert.equal(replaced,false,'viewer must retain fragment for refresh without storing key');
   }finally{global.window=previousWindow;}
  let res=await fetch(base+'/api/share/'+normal.shareId);assert.equal(res.status,200);
  const decoded=await crypto.decrypt((await res.json()).ciphertext,normal.key);assert.deepEqual(decoded.turns,normal.turns);
  assert.equal((await fetch(base+'/api/share/'+normal.shareId)).status,200,'normal share consumed');
  // Crawlers (the 2025 problem: shared ChatGPT chats indexed by Google). A crawler that finds a
  // share link gets the URL without its #fragment, so neither the page, the API nor the relay's
  // storage ever holds the plaintext or the key, and both responses say noindex. Same for chat
  // and Word document links (same crypto, same relay).
  const canary='Rina from Bekasi earns Rp 15.000.000 (crawler canary)';
  for(const payload of [{turns:[{role:'user',content:canary}],ttl:3600},
   {version:4,kind:'document',format:'docx',docx:Buffer.from(canary).toString('base64'),preview:canary,ttl:3600}]){
   const enc=await crypto.encrypt(payload);
   assert.equal((await fetch(base+'/api/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:enc.shareId,ciphertext:enc.ciphertext,ttl:3600})})).status,201);
   const [beforeHash,afterHash]=enc.fullShareUrl.split('#');
   assert(afterHash&&afterHash.includes(enc.key)&&!beforeHash.includes(enc.key),'key must live only after #');
   const bot={headers:{'User-Agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'}};
   const page=await fetch(enc.fullShareUrl,bot);const pageText=await page.text();
   assert(!pageText.includes('Rina')&&!pageText.includes(enc.key),'viewer page exposed plaintext or key to a crawler');
   assert(/<meta name="robots" content="noindex/.test(pageText),'viewer page lacks noindex');
   const api=await fetch(base+'/api/share/'+enc.shareId,bot);const apiText=await api.text();
   assert(/noindex/.test(api.headers.get('x-robots-tag')||''),'API lacks X-Robots-Tag noindex');
   assert(!apiText.includes('Rina')&&!apiText.includes(enc.key)&&JSON.parse(apiText).ciphertext,'API exposed plaintext or key');
   const stored=readFileSync(path.join(dir,'storage.json'),'utf8');
   assert(!stored.includes('Rina')&&!stored.includes(enc.key),'relay storage holds plaintext or key');
   await assert.rejects(()=>crypto.decrypt(JSON.parse(apiText).ciphertext,normal.key),'ciphertext opened without its key');
   // Positive control: the content is really there, only for whoever holds the #key
   const opened=await crypto.decrypt(JSON.parse(apiText).ciphertext,enc.key);
   assert.equal(opened.turns?opened.turns[0].content:opened.preview,canary);
  }
   const burn=await create(true);
   assert.equal((await fetch(base+'/api/share/'+burn.shareId,{method:'HEAD'})).status,200);
  await fetch(burn.fullShareUrl); // HTML retrieval must not consume ciphertext.
  const statuses=await Promise.all(Array.from({length:6},()=>fetch(base+'/api/share/'+burn.shareId).then(r=>r.status)));
  assert.equal(statuses.filter(s=>s===200).length,1,'burn yielded multiple successful readers');
  assert(statuses.filter(s=>s!==200).every(s=>s===404));
  const revoke=token=>fetch(base+'/api/revoke/'+normal.shareId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  assert.equal((await fetch(base+'/api/revoke/'+normal.shareId)).status,405);
  assert.equal((await revoke('wrong-fictional-token')).status,404);
  assert.equal((await fetch(base+'/api/share/'+normal.shareId)).status,200,'wrong token revoked share');
   assert.equal((await revoke(normal.meta.revoke_token)).status,200);
   assert.equal((await fetch(base+'/api/share/'+normal.shareId,{method:'HEAD'})).status,404);
  assert.equal((await fetch(base+'/api/share/'+normal.shareId)).status,404);
   // Match the hosted minimum TTL; expiry itself is tested with an injected clock in relay_persistence.
    const bounded=await create(false,1);await new Promise(r=>setTimeout(r,1100));
    assert.equal((await fetch(base+'/api/share/'+bounded.shareId,{method:'HEAD'})).status,200);
   for(const body of ['{', JSON.stringify({id:randomUUID(),ciphertext:'fictional',ttl:'invalid'})]){
    const invalid=await fetch(base+'/api/share',{method:'POST',body});
    assert.equal(invalid.status,400);
     assert.equal(typeof (await invalid.json()).error,'string');
   }
   assert.equal((await fetch(base+'/api/share/'+bounded.shareId)).status,200);
  assert.equal((await fetch(base+'/api/share/'+randomUUID())).status,404);
  console.log('PASS: local encrypted roundtrip, crawler sees no plaintext/key + noindex (chat and document), HTML click gate, one-success burn race, revoke tokens, expiry');
 }finally{relay.kill();await new Promise(r=>relay.once('exit',r));rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
