"""Capture fictional Word review/viewer screenshots with production scripts; no login or upload."""
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from build_confidential_fixture import build, SECRETS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
        context.add_init_script("""window.chrome={storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{}}},runtime:{}};""")
        def local_assets(route):
            relative = route.request.url.split('https://screenshots.invalid/', 1)[-1].split('?', 1)[0]
            file = (ROOT / 'extension' / relative).resolve()
            if file.is_relative_to((ROOT / 'extension').resolve()) and file.is_file():
                route.fulfill(path=str(file))
            else:
                route.abort()
        context.route('**/*', local_assets)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('https://screenshots.invalid/word/index.html')
        payload = page.evaluate("""async ({b64,names}) => {
          sourceBytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
          lastDoc=await inspectWordFile(sourceBytes.buffer);
          const map=SafeShareTextMap.flatten(lastDoc);
          providedFindings=await SafeShareWordDetect.detect({doc:lastDoc,map,heuristics:new HeuristicsRedactor(),
            Solver:ConsistentPseudonymizer.AdversaryOracleSolver,TextMap:SafeShareTextMap});
          for(const value of names)providedFindings.push({value,category:'PROFILE',source:'manual',
            ruleName:'Manual review',reason:'Fictional example',replacement:'[REDACTED_NAME]',preChecked:true});
          renderFindings(lastDoc);
          document.getElementById('capture-status').textContent='Local fictional fixture — no Word login or upload';
          document.getElementById('review-summary').textContent='Names selected manually; model inference is not shown in this fixture.';
          document.getElementById('review-section').hidden=false;
          const rules=activeRules();
          const result=await SafeShareWordRedact.sanitizeDocx(sourceBytes.buffer,{rules});
          const verified=await SafeShareWordRedact.verifyDocx(result.bytes,rules);
          if(!verified.clean)throw Error('Screenshot output verification failed');
          const docx=bytesToBase64(result.bytes);
          return {version:4,kind:'document',format:'docx',docx,preview:sanitizedPreviewHtml(),ttl:3600};
        }""", {'b64': base64.b64encode(build()).decode(), 'names': SECRETS['names']})
        page.screenshot(path=str(OUT / 'word-review-current.png'))
        page.goto('https://screenshots.invalid/viewer/index.html')
        url = page.evaluate("""async payload => (await new SafeShareCrypto('https://screenshots.invalid',
          'https://screenshots.invalid/viewer').encrypt(payload)).standaloneShareUrl""", payload)
        # Explicit index asset: this local harness has no production directory router.
        page.goto(url.replace('/viewer/#', '/viewer/index.html#'))
        page.reload()
        page.get_by_role('button', name='Download sanitized DOCX', exact=True).wait_for()
        page.screenshot(path=str(OUT / 'word-viewer-current.png'))
        assert not errors, errors
        print(json.dumps({'review': 'word-review-current.png', 'viewer': 'word-viewer-current.png',
                          'fictional': True, 'uploaded': False, 'pageErrors': errors}))
        browser.close()

if __name__ == '__main__':
    main()
