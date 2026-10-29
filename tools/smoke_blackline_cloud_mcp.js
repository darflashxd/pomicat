// Run via MCP Playwright. Creates/revokes only small fictional test shares.
async (page) => {
  const current = 'https://blackline-relay.bleedguard.workers.dev';
  const legacy = 'https://safeshare-relay.bleedguard.workers.dev';
  await page.goto(current);
  const headers = await page.evaluate(async () => {
    const output = [];
    for (const path of ['/', '/app.js', '/style.css', '/v/00000000-0000-4000-8000-000000000000', '/v/app.js']) {
      const response = await fetch(path, { cache: 'no-store' });
      const h = response.headers;
      if (!response.ok || !h.get('content-security-policy') || h.get('referrer-policy') !== 'no-referrer' || h.get('x-content-type-options') !== 'nosniff' || !h.get('cache-control').includes('no-store')) throw Error('Unsafe asset route: ' + path);
      output.push({ path, status: response.status, protected: true });
    }
    return output;
  });
  const create = async (burn) => page.evaluate(async burn => {
    const cryptoEngine = new SafeShareCrypto();
    const encrypted = await cryptoEngine.encrypt({turns:[{role:'user',content:'Fictional Blackline migration check.'}],ttl:300});
    const response = await fetch('/api/share', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:encrypted.shareId,ciphertext:encrypted.ciphertext,ttl:300,burn_on_read:burn})});
    if (response.status !== 201) throw Error('Create failed: ' + response.status);
    return {id:encrypted.shareId,key:encrypted.key,token:(await response.json()).revoke_token};
  }, burn);
  const chat = await create(false);
  try {
    await page.goto(`${current}/v/${chat.id}#${chat.key}`);
    await page.getByRole('button', {name:'Open conversation',exact:true}).click();
    await page.locator('#chat-content-view').waitFor({state:'visible'});
    const rendered = await page.locator('#messages-container').innerText();
    if (!rendered.replace(/[\u200B-\u200D\uFEFF]/g,'').includes('Fictional Blackline migration check.')) throw Error('Wrong decrypted content');
    if (await page.locator('.brand-title').innerText() !== 'Blackline') throw Error('Wrong brand');
    await page.goto(legacy);
    const shared = await page.evaluate(async share => {
      const response = await fetch('/api/share/' + share.id);
      const body = await response.json();
      const data = await new SafeShareCrypto().decrypt(body.ciphertext, share.key);
      const revoke = await fetch('/api/revoke/' + share.id, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:share.token})});
      return {read:response.status,content:data.turns[0].content,revoke:revoke.status};
    }, chat);
    if (shared.read !== 200 || shared.revoke !== 200 || shared.content !== 'Fictional Blackline migration check.') throw Error('Cross-host state mismatch');
    await page.goto(current);
    if (await page.evaluate(async id => (await fetch('/api/share/' + id)).status, chat.id) !== 404) throw Error('Revoke not shared');
  } finally {
    // Idempotent cleanup if a later assertion failed.
    await page.goto(current);
    await page.evaluate(async share => { await fetch('/api/revoke/' + share.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:share.token})}); }, chat);
  }
  const burn = await create(true);
  const second = await page.context().newPage();
  try {
    await second.goto(legacy);
    const statuses = await Promise.all([
      page.evaluate(async id => (await fetch('/api/share/'+id)).status,burn.id),
      second.evaluate(async id => (await fetch('/api/share/'+id)).status,burn.id)
    ]);
    if (statuses.filter(x=>x===200).length !== 1 || statuses.filter(x=>x===404).length !== 1) throw Error('Burn not atomic: '+statuses);
    return {headers,chatViewer:true,crossHostReadRevoke:true,burnStatuses:statuses,brand:'Blackline',note:'Synthetic chat only; keys and revoke tokens omitted.'};
  } finally {
    await second.close();
    await page.evaluate(async share => { await fetch('/api/revoke/'+share.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:share.token})}); },burn);
  }
}
