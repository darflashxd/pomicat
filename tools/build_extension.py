"""Usage: python tools/build_extension.py

Builds dist/PomiCat-<version>-chrome.zip and dist/PomiCat-<version>-firefox.zip from
extension/. Chrome uses manifest.json (so "Load unpacked" on extension/ works directly);
Firefox gets manifest.firefox.json as its manifest.json.
Also writes dist/SHA256SUMS (zips + the share page files the relay serves), so people can check a
zip before installing it and compare the relay's page with the release.
"""
import hashlib
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "extension")
DIST = os.path.join(ROOT, "dist")
MANIFESTS = {"chrome": "manifest.json", "firefox": "manifest.firefox.json"}


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
    out = os.path.join(DIST, f"PomiCat-{version}-{target}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(ROOT, "LICENSE"), "LICENSE")
        z.write(os.path.join(EXT, manifest), "manifest.json")
        for path, rel in files():
            z.write(path, rel)
    with zipfile.ZipFile(out) as z:
        for source, member in [(os.path.join(ROOT, "LICENSE"), "LICENSE"),
                               (os.path.join(EXT, "THIRD_PARTY_NOTICES.md"), "THIRD_PARTY_NOTICES.md")]:
            with open(source, "rb") as f:
                if z.read(member) != f.read():
                    raise ValueError(f"License packaging mismatch: {member}")
        for name in ["Apache-2.0.txt", "ONNX-Runtime-MIT.txt", "ONNX-Runtime-ThirdPartyNotices.txt"]:
            with open(os.path.join(EXT, "licenses", name), "rb") as f:
                if z.read("licenses/" + name) != f.read():
                    raise ValueError(f"License packaging mismatch: {name}")
    print(f"{out} ({os.path.getsize(out) // 1024} KB)")


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


sums = [(sha256(os.path.join(DIST, f"PomiCat-{version}-{t}.zip")), f"PomiCat-{version}-{t}.zip") for t in MANIFESTS]
viewer = os.path.join(EXT, "viewer")
for base, _, names in os.walk(viewer):
    for name in sorted(names):
        path = os.path.join(base, name)
        sums.append((sha256(path), "viewer/" + os.path.relpath(path, viewer).replace(os.sep, "/")))
with open(os.path.join(DIST, "SHA256SUMS"), "w", encoding="utf-8", newline="\n") as f:
    f.writelines(f"{h}  {name}\n" for h, name in sums)
print(os.path.join(DIST, "SHA256SUMS"))
