"""Download pinned research assets outside extension/models; never execute repository code."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

CANDIDATES = {
    "bert-small-int8": ("gravitee-io/bert-small-pii-detection", "f8c27a85c51c0168f07b9dcf00265bf0a4097939",
        ["model.quant.onnx", "config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt", "README.md"]),
    "gliner-edge-int8": ("knowledgator/gliner-pii-edge-v1.0", "9b7f39b0a2da971a5beea78d35f1539d4009c891",
        ["onnx/model_quint8.onnx", "gliner_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "README.md"]),
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    def download(item):
        name, repo, revision, filename = item
        dest = args.directory / name / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write, no incomplete weights mistaken for a successful download.
        temp = dest.with_suffix(dest.suffix + ".partial")
        with urlopen(f"https://huggingface.co/{repo}/resolve/{revision}/{filename}", timeout=120) as response, temp.open("wb") as out:
            while chunk := response.read(1024 * 1024):
                out.write(chunk)
        temp.replace(dest)
        return {"candidate": name, "repository": repo, "revision": revision, "file": filename,
                "bytes": dest.stat().st_size, "sha256": hashlib.sha256(dest.read_bytes()).hexdigest()}
    items = [(name, repo, revision, f) for name, (repo, revision, files) in CANDIDATES.items() for f in files]
    with ThreadPoolExecutor(max_workers=4) as pool:
        manifest = list(pool.map(download, items))
    (args.directory / "manifest.json").write_text(json.dumps({"license_as_reported": "apache-2.0", "assets":manifest}, indent=2), encoding="utf-8")
    print(json.dumps({name:sum(f["bytes"] for f in manifest if f["candidate"] == name) for name in CANDIDATES}, indent=2))

if __name__ == "__main__":
    main()
