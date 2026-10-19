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
  const normal=await create();
  const html=await fetch(normal.fullShareUrl);assert.equal(html.status,200);
  assert(html.headers.get('content-security-policy').includes("script-src 'self'"));
  const js=await (await fetch(base+'/app.js')).text();assert(js.includes('e.isTrusted'),'viewer lacks trusted click gate');
  let res=await fetch(base+'/api/share/'+normal.shareId);assert.equal(res.status,200);
  const decoded=await crypto.decrypt((await res.json()).ciphertext,normal.key);assert.deepEqual(decoded.turns,normal.turns);
  assert.equal((await fetch(base+'/api/share/'+normal.shareId)).status,200,'normal share consumed');
  const burn=await create(true);
  await fetch(burn.fullShareUrl); // HTML retrieval must not consume ciphertext.
  const statuses=await Promise.all(Array.from({length:6},()=>fetch(base+'/api/share/'+burn.shareId).then(r=>r.status)));
  assert.equal(statuses.filter(s=>s===200).length,1,'burn yielded multiple successful readers');
  assert(statuses.filter(s=>s!==200).every(s=>s===404));
  const revoke=token=>fetch(base+'/api/revoke/'+normal.shareId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  assert.equal((await fetch(base+'/api/revoke/'+normal.shareId)).status,405);
  assert.equal((await revoke('wrong-fictional-token')).status,404);
  assert.equal((await fetch(base+'/api/share/'+normal.shareId)).status,200,'wrong token revoked share');
  assert.equal((await revoke(normal.meta.revoke_token)).status,200);
  assert.equal((await fetch(base+'/api/share/'+normal.shareId)).status,404);
  // Local-only short TTL. Do not use this to claim remote TTL validation parity.
  const expired=await create(false,1);await new Promise(r=>setTimeout(r,1100));
  assert.equal((await fetch(base+'/api/share/'+expired.shareId)).status,404);
  assert.equal((await fetch(base+'/api/share/'+randomUUID())).status,404);
  console.log('PASS: local encrypted roundtrip, HTML click gate, one-success burn race, revoke tokens, expiry');
 }finally{relay.kill();await new Promise(r=>relay.once('exit',r));rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
