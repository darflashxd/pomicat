/* Bounded local DOCX inspection. Not a sanitization or full-fidelity renderer. */
async function inspectWordFile(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", {fatal:true});
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4,true) || view.getUint16(end + 6,true)) throw new Error("Unsupported DOCX archive.");
  const count = view.getUint16(end + 10,true);
  let offset = view.getUint32(end + 16,true), total = 0;
  if (count > 1000 || offset + view.getUint32(end + 12,true) !== end) throw new Error("DOCX archive limit exceeded.");
  const parts = new Map();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset,true) !== 0x02014b50) throw new Error("Invalid DOCX directory.");
    const flags = view.getUint16(offset + 8,true), method = view.getUint16(offset + 10,true);
    const packed = view.getUint32(offset + 20,true), size = view.getUint32(offset + 24,true);
    const nameSize = view.getUint16(offset + 28,true), local = view.getUint32(offset + 42,true);
    const next = offset + 46 + nameSize + view.getUint16(offset+30,true) + view.getUint16(offset+32,true);
    if (next > end) throw new Error("Invalid DOCX entry.");
    const name = decoder.decode(bytes.subarray(offset+46,offset+46+nameSize));
    if (parts.has(name) || /(^\/|\.\.|\\)/.test(name) || flags & 1 || ![0,8].includes(method) || size > 8*1024*1024 || total+size > 24*1024*1024) throw new Error("Unsupported or oversized DOCX part.");
    if (local+30 > end || view.getUint32(local,true) !== 0x04034b50 || view.getUint16(local+8,true)!==method) throw new Error("Invalid DOCX local header.");
    const start = local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if (start+packed > view.getUint32(end+16,true)) throw new Error("Invalid DOCX part bounds.");
    const localName = decoder.decode(bytes.subarray(local+30,local+30+view.getUint16(local+26,true)));
    if (localName!==name) throw new Error("Mismatched DOCX entry.");
    const compressed = bytes.slice(start,start+packed);
    const stream = method===8 ? new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw")) : new Blob([compressed]).stream();
    const reader = stream.getReader(), chunks = []; let length=0;
    try {
      while (true) {
        const chunk=await reader.read(); if(chunk.done)break;
        length+=chunk.value.length;
        if(length>size || length>8*1024*1024 || total+length>24*1024*1024)throw new Error("DOCX decompression limit exceeded.");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    if(length!==size)throw new Error("DOCX part size mismatch.");
    total+=length;
    const data=new Uint8Array(length);let cursor=0;for(const chunk of chunks){data.set(chunk,cursor);cursor+=chunk.length;}
    parts.set(name,data);offset=next;
  }
  if(offset!==end || !parts.has("word/document.xml"))throw new Error("Missing DOCX document.");
  const parse = name => {
    const text=decoder.decode(parts.get(name));
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error("Unsupported XML declaration.");
    const xml=new DOMParser().parseFromString(text,"application/xml");
    if(xml.querySelector("parsererror"))throw new Error("Malformed Word XML.");return xml;
  };
  const ns="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const textOf = node => [...node.getElementsByTagNameNS(ns,"t")].map(t=>t.textContent).join("");
  const main=parse("word/document.xml"), body=main.getElementsByTagNameNS(ns,"body")[0];
  if(!body)throw new Error("Missing Word body.");
  const blocks=[];
  for(const node of body.children){
    if(node.localName==="p")blocks.push({text:textOf(node)});
    else if(node.localName==="tbl")blocks.push({rows:[...node.children].filter(n=>n.localName==="tr").map(row=>[...row.children].filter(n=>n.localName==="tc").map(textOf))});
  }
  const supplementary=[];
  for(const name of parts.keys())if(/^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(name))supplementary.push({name:name.replace(/^word\//,""),text:textOf(parse(name))});
  const names=[...parts.keys()].filter(n=>/^word\/media\//.test(n) && /\.(png|jpe?g|gif|bmp)$/i.test(n));
  const media=[];
  for(const name of names){
    const type=/\.jpe?g$/i.test(name)?"image/jpeg":/\.gif$/i.test(name)?"image/gif":/\.bmp$/i.test(name)?"image/bmp":"image/png";
    try{media.push({name,bitmap:await createImageBitmap(new Blob([parts.get(name)],{type}))});}catch(_){media.push({name,bitmap:null});}
  }
  return {blocks,supplementary,images:names.length,media,tables:main.getElementsByTagNameNS(ns,"tbl").length,equations:main.getElementsByTagNameNS("http://schemas.openxmlformats.org/officeDocument/2006/math","oMath").length};
}
