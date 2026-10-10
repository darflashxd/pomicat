"""Usage: python tools/build_extension.py

Builds dist/SafeShare-<version>-chrome.zip and dist/SafeShare-<version>-firefox.zip from
extension/. Chrome gets manifest.chrome.json as its manifest.json; Firefox uses manifest.json.
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "extension")
DIST = os.path.join(ROOT, "dist")
MANIFESTS = {"chrome": "manifest.chrome.json", "firefox": "manifest.json"}


def files():
    for base, _, names in os.walk(EXT):
        for name in names:
            path = os.path.join(base, name)
            rel = os.path.relpath(path, EXT).replace(os.sep, "/")
            if not rel.startswith("manifest"):
                yield path, rel


version = json.load(open(os.path.join(EXT, "manifest.json"), encoding="utf-8"))["version"]
os.makedirs(DIST, exist_ok=True)
for target, manifest in MANIFESTS.items():
    out = os.path.join(DIST, f"SafeShare-{version}-{target}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(EXT, manifest), "manifest.json")
        for path, rel in files():
            z.write(path, rel)
    print(f"{out} ({os.path.getsize(out) // 1024} KB)")
