/* Bounded local DOCX inspection. Not a sanitization or full-fidelity renderer. */
async function inspectWordFile(bytes) {
  const decoder = new TextDecoder("utf-8", {fatal:true});
  const parts = await SafeShareWordRedact.unzip(bytes);
  const parse = name => {
    const text=decoder.decode(parts.get(name));
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error("Unsupported XML declaration.");
    const xml=new DOMParser().parseFromString(text,"application/xml");
    if(xml.querySelector("parsererror"))throw new Error("Malformed Word XML.");return xml;
  };
  const ns="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = [];
  for (const name of parts.keys()) {
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) continue;
    const root = parse(name);
    [...root.getElementsByTagNameNS(ns, 'p')].forEach((paragraph, paragraphIndex) => {
      let offset = 0;
      const runs = [...paragraph.getElementsByTagNameNS(ns, 't')].map((node, textNodeIndex) => {
        const run = {textNodeIndex, start:offset, end:offset + node.textContent.length};
        offset = run.end;
        return run;
      });
      paragraphs.push({id:`${name}#p${paragraphIndex}`,part:name,paragraphIndex,
        text:[...paragraph.getElementsByTagNameNS(ns, 't')].map(node=>node.textContent).join(''),runs});
    });
  }
  const MATH = "http://schemas.openxmlformats.org/officeDocument/2006/math";
  const textOf = node => {
    const nodes = [...node.getElementsByTagNameNS("*","t")].filter(t=>t.namespaceURI===ns||t.namespaceURI===MATH);
    return nodes.map((t,index) => (index && (t.namespaceURI===MATH || nodes[index-1].namespaceURI===MATH) ? "\u200b" : "") + t.textContent).join("");
  };
  const main=parse("word/document.xml"), body=main.getElementsByTagNameNS(ns,"body")[0];
  if(!body)throw new Error("Missing Word body.");
  const blocks=[];
  const styles = parts.has('word/styles.xml') ? parse('word/styles.xml') : null;
  const child = (node, name) => [...(node?.children || [])].find(n => n.namespaceURI === ns && n.localName === name);
  const tableLayout = table => {
    const props = child(table, 'tblPr');
    const styleId = child(props, 'tblStyle')?.getAttributeNS(ns, 'val');
    const visited = new Set();
    const borders = {};
    const collect = style => {
      if (!style || visited.has(style)) return;
      visited.add(style);
      const parent = child(style, 'basedOn')?.getAttributeNS(ns, 'val');
      if (parent) collect([...styles.getElementsByTagNameNS(ns, 'style')].find(s => s.getAttributeNS(ns, 'styleId') === parent));
      readBorders(child(style, 'tblPr'));
    };
    const readBorders = p => {
      for (const edge of child(p, 'tblBorders')?.children || []) {
        if (!['top','bottom','left','right','insideH','insideV'].includes(edge.localName)) continue;
        const value = edge.getAttributeNS(ns, 'val');
        const size = Number(edge.getAttributeNS(ns, 'sz'));
        const color = edge.getAttributeNS(ns, 'color');
        borders[edge.localName] = ['nil','none'].includes(value) ? 'none' :
          `${Number.isFinite(size) && size > 0 ? Math.min(size / 8, 12) : 0.5}pt ${value === 'double' ? 'double' : 'solid'} ${/^[0-9a-f]{6}$/i.test(color) ? '#' + color : '#555'}`;
      }
    };
    if (styles && styleId) collect([...styles.getElementsByTagNameNS(ns, 'style')].find(s => s.getAttributeNS(ns, 'styleId') === styleId));
    readBorders(props);
    const widths = [...(child(table, 'tblGrid')?.children || [])].map(n => Number(n.getAttributeNS(ns, 'w')));
    // ponytail: basic table borders/grid only; conditional styles and merged cells need a fuller renderer.
    return {borders, widths: widths.every(w => Number.isFinite(w) && w > 0) ? widths : []};
  };
  const readBlocks = parent => {
    for (const node of parent.children) {
      if (node.namespaceURI !== ns) continue;
      if (node.localName === "p") blocks.push({text:textOf(node)});
      else if (node.localName === "tbl") blocks.push({layout:tableLayout(node),rows:[...node.children].filter(n=>n.localName==="tr").map(row=>[...row.children].filter(n=>n.localName==="tc").map(textOf))});
      else if (["sdt", "sdtContent", "customXml", "ins", "moveTo"].includes(node.localName)) readBlocks(node);
    }
  };
  readBlocks(body);
  const supplementary=[];
  for(const name of parts.keys())if(/^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(name))supplementary.push({name:name.replace(/^word\//,""),text:textOf(parse(name))});
  const names=[...parts.keys()].filter(n=>/^word\/media\//.test(n) && /\.(png|jpe?g|gif|bmp)$/i.test(n));
  const media=[];
  for(const name of names){
    const type=/\.jpe?g$/i.test(name)?"image/jpeg":/\.gif$/i.test(name)?"image/gif":/\.bmp$/i.test(name)?"image/bmp":"image/png";
    try{
      const bitmap = await createImageBitmap(new Blob([parts.get(name)],{type}));
      if (bitmap.width * bitmap.height > 16000000) { bitmap.close(); throw new Error("Image pixel limit exceeded."); }
      media.push({name,bitmap});
    }catch(error){throw new Error("Cannot safely decode image " + name + ": " + error.message);}
  }
  return {blocks,supplementary,paragraphs,images:names.length,media,tables:main.getElementsByTagNameNS(ns,"tbl").length,equations:main.getElementsByTagNameNS("http://schemas.openxmlformats.org/officeDocument/2006/math","oMath").length};
}
