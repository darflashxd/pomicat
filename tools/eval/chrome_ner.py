"""Real Chromium extension/offscreen/WASM smoke using installed Playwright. Fictional input."""
import json
import os
from pathlib import Path
import shutil
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
base = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "Temp" / "opencode"
base.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="safeshare-chrome-", dir=base) as tmp:
    ext = Path(tmp) / "extension"
    shutil.copytree(ROOT / "extension", ext)
    if os.environ.get('SAFESHARE_CANDIDATE_DIR'):
        from candidate_extension import prepare_candidate
        print('Experimental adapter:', prepare_candidate(ext, os.environ['SAFESHARE_CANDIDATE_DIR']))
    scripts = ["engine/heuristics.js", "engine/contextual.js", "engine/pseudonymizer.js", "engine/policy.js", "engine/crypto.js",
               "engine/maybe.js", "engine/transcript.js", "engine/span_arbiter.js", "engine/ner_client.js", "ui/modal.js", "browser_review.js"]
    shutil.copyfile(ROOT / "tools/eval/browser_review.js", ext / "browser_review.js")
    (ext / "smoke.html").write_text('<!doctype html><body>' + ''.join(f'<script src="{s}"></script>' for s in scripts), encoding="utf-8")
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(Path(tmp) / "profile"), channel="chromium", headless=True,
            args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
            extension_id = worker.url.split("/")[2]
            page = context.new_page()
            page.goto(f"chrome-extension://{extension_id}/smoke.html")
            result = page.evaluate("""async () => {
              const t=performance.now();
              const result=await SafeShareNer.analyze('My name is Amelia Hartwell. I live at 742 Evergreen Terrace, Springfield.',60000,true);
              return {ok:result.success && result.spans?.length>0,count:result.spans?.length,
                labels:[...new Set((result.spans||[]).map(s=>s.label))],elapsedMs:Math.round(performance.now()-t),error:result.error,browser:navigator.userAgent};
            }""")
            print(json.dumps(result, indent=2))
            if not result.get("ok"):
                print("Extension views:", worker.evaluate("chrome.runtime.getContexts({})"))
                print("Direct inference:", worker.evaluate("""async () => await chrome.runtime.sendMessage({action:'RUN_NER_INFERENCE',target:'NER_RUNTIME',text:'My name is Amelia Hartwell.',review:true})"""))
            assert result.get("ok"), "Chromium extension model inference failed"
            print("Share dialog:", page.evaluate("checkBrowserReview()"))
        finally:
            context.close()
