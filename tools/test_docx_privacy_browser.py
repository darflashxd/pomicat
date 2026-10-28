"""Run: python tools/test_docx_privacy_browser.py. No uploads."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    for engine in [p.chromium, p.firefox]:
        browser = engine.launch()
        page = browser.new_page()
        for name in ['engine/heuristics.js', 'engine/contextual.js', 'engine/maybe.js', 'word/detect.js', 'word/textmap.js']:
            page.add_script_tag(path=str(ROOT / 'extension' / name))
        contextual = page.evaluate('''async () => {
          const doc={blocks:[{text:'My doctor diagnosed me with diabetes. My manager put me on a performance improvement plan.'}],supplementary:[]};
          return SafeShareWordDetect.detect({doc,map:SafeShareTextMap.flatten(doc),heuristics:new HeuristicsRedactor(),TextMap:SafeShareTextMap});
        }''')
        assert any(item['category'] == 'HEALTH' for item in contextual), contextual
        assert any(item['ruleName'] == 'Contextual LEGAL_HR' for item in contextual), contextual
        page.add_script_tag(path=str(ROOT / 'extension/word/redact.js'))
        result = page.evaluate('''async () => {
          const E = new TextEncoder(), D = new TextDecoder();
          const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><w:r><w:t>Salary </w:t></w:r><m:oMath><m:r><m:t>7850</m:t></m:r></m:oMath><w:r><w:t> per month; alice@example.invalid</w:t></w:r></w:p></w:body></w:document>';
          const rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="mailto:alice%40example.invalid" TargetMode="External"/></Relationships>';
          const rules = [{value:'7850',replacement:'[REDACTED]'}, {value:'alice@example.invalid',replacement:'[REDACTED]'}];
          const input = await SafeShareWordRedact.zip(new Map([['word/document.xml', E.encode(xml)], ['word/_rels/document.xml.rels', E.encode(rels)]]));
          const originalCheck = await SafeShareWordRedact.verifyDocx(input, rules);
          const out = await SafeShareWordRedact.sanitizeDocx(input.buffer, {rules});
          const parts = await SafeShareWordRedact.unzip(out.bytes);
          const text = new DOMParser().parseFromString(D.decode(parts.get('word/document.xml')), 'application/xml').documentElement.textContent;
          return {originalClean:originalCheck.clean,check:await SafeShareWordRedact.verifyDocx(out.bytes,rules),text,rels:D.decode(parts.get('word/_rels/document.xml.rels'))};
        }''')
        assert not result['originalClean'], result
        assert result['check']['clean'], result
        assert result['text'] == 'Salary [REDACTED] per month; [REDACTED]', result
        assert 'alice' not in result['rels'] and 'about:blank' in result['rels'], result
        overlap = page.evaluate('''async () => {
          const E=new TextEncoder(), D=new TextDecoder();
          const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>USD 4,800; EUR 4,800; 4,800</w:t></w:r></w:p></w:body></w:document>';
          const rules=[{value:'4,800',replacement:'[REDACTED]',excludeValues:['USD 4,800']},{value:'EUR 4,800',replacement:'[REDACTED]'}];
          const input=await SafeShareWordRedact.zip(new Map([['word/document.xml',E.encode(xml)]]));
          const out=await SafeShareWordRedact.sanitizeDocx(input.buffer,{rules});
          const parts=await SafeShareWordRedact.unzip(out.bytes);
          return {text:new DOMParser().parseFromString(D.decode(parts.get('word/document.xml')),'application/xml').documentElement.textContent,check:await SafeShareWordRedact.verifyDocx(out.bytes,rules)};
        }''')
        assert overlap['text'] == 'USD 4,800; [REDACTED]; [REDACTED]' and overlap['check']['clean'], overlap
        attribute_check = page.evaluate('''async () => {
          const E=new TextEncoder();
          const input=await SafeShareWordRedact.zip(new Map([['word/document.xml',E.encode('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Public</w:t></w:r><w:bookmarkStart w:name="alice@example.invalid"/></w:p></w:body></w:document>')]]));
          return SafeShareWordRedact.verifyDocx(input,[{value:'alice@example.invalid',replacement:'[REDACTED]'}]);
        }''')
        assert not attribute_check['clean'], attribute_check
        print(engine.name, 'PASS: no leaked OMML digit, public text intact, encoded hyperlink destination cleared')
        browser.close()
