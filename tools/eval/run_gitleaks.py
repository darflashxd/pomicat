"""Usage: python tools/eval/run_gitleaks.py gold.jsonl > out_gitleaks.jsonl

Needs gitleaks v8+ on PATH, or its path in the GITLEAKS environment variable. gitleaks only detects secrets; each finding's
secret is masked with [GITLEAKS] so the output can be scored like the other tools.
"""
import json
import os
import subprocess
import sys

path = sys.argv[1]
sys.stdout.reconfigure(encoding="utf-8")
with open(path, encoding="utf-8") as f:
    for n, line in enumerate(l for l in f if l.strip()):
        row = json.loads(line)
        text = row["source_text"]
        proc = subprocess.run(
            [os.environ.get("GITLEAKS", "gitleaks"), "stdin", "--report-format", "json", "--report-path", "-", "--no-banner", "--exit-code", "0"],
            input=text, capture_output=True, text=True, encoding="utf-8",
        )
        out = text
        for finding in json.loads(proc.stdout or "[]"):
            if finding.get("Secret"):
                out = out.replace(finding["Secret"], "[GITLEAKS]")
        print(json.dumps({"id": row.get("id", n), "output": out}, ensure_ascii=False))
