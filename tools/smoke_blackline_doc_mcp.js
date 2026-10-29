// Run via MCP Playwright. Uploads only a generated, fictional, tiny DOCX.
async (page) => {
  const host = 'https://blackline-relay.bleedguard.workers.dev';
  await page.goto(host);
  // Tiny OOXML ZIP made in the test runner, never a user document.
  const files = {
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fictional [REDACTED] migration fixture.</w:t></w:r></w:p></w:body></w:document>'
  };
  const chunks=[], directory=[]; let offset=0;
  const crc = data => { let value=0xffffffff;for(const byte of data){value^=byte;for(let i=0;i<8;i++)value=value&1?(value>>>1)^0xedb88320:value>>>1;}return (value^0xffffffff)>>>0; };
  for (const [name,text] of Object.entries(files)) {
    const n=Buffer.from(name),d=Buffer.from(text),sum=crc(d),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(sum,14);local.writeUInt32LE(d.length,18);local.writeUInt32LE(d.length,22);local.writeUInt16LE(n.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(sum,16);central.writeUInt32LE(d.length,20);central.writeUInt32LE(d.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
    chunks.push(local,n,d);directory.push(central,n);offset+=local.length+n.length+d.length;
  }
  const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(3,8);end.writeUInt16LE(3,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  const bytes=Buffer.concat([...chunks,dir,end]);
  const share=await page.evaluate(async docx=>{
    const enc=await new SafeShareCrypto().encrypt({version:4,kind:'document',format:'docx',docx,preview:'<p>Fictional [REDACTED] migration fixture.</p>',ttl:300});
    const r=await fetch('/api/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:enc.shareId,ciphertext:enc.ciphertext,ttl:300})});
    if(r.status!==201)throw Error('Document create: '+r.status);
    return {id:enc.shareId,key:enc.key,token:(await r.json()).revoke_token};
  },bytes.toString('base64'));
  try {
    await page.goto(`${host}/v/${share.id}#${share.key}`);
    await page.getByRole('button',{name:'Open conversation',exact:true}).click();
    await page.getByRole('button',{name:'Download sanitized DOCX',exact:true}).waitFor();
    if(!await page.frameLocator('iframe').getByText('Fictional [REDACTED] migration fixture.',{exact:true}).isVisible())throw Error('Preview mismatch');
    const downloading=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download sanitized DOCX',exact:true}).click();
    const download=await downloading;const stream=await download.createReadStream();const received=[];for await(const piece of stream)received.push(piece);
    if(!Buffer.concat(received).equals(bytes))throw Error('Download bytes differ');
    return {documentV4:true,preview:true,downloadBytesMatch:true,bytes:bytes.length,brand:await page.title()};
  } finally {
    await page.goto(host);
    await page.evaluate(async s=>{const r=await fetch('/api/revoke/'+s.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:s.token})});if(!r.ok)throw Error('Test document revoke failed');},share);
  }
}
