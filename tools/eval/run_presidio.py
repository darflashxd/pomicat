"""Usage: python tools/eval/run_presidio.py gold.jsonl [--lang en] > out_presidio.jsonl

Needs: pip install presidio-analyzer presidio-anonymizer && python -m spacy download en_core_web_lg
Runs Presidio with its default recognizers and default anonymizer (replace with <ENTITY>).
"""
import json
import sys

from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

path = sys.argv[1]
sys.stdout.reconfigure(encoding="utf-8")
lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "en"
analyzer, anonymizer = AnalyzerEngine(), AnonymizerEngine()

with open(path, encoding="utf-8") as f:
    for n, line in enumerate(l for l in f if l.strip()):
        row = json.loads(line)
        text = row["source_text"]
        results = analyzer.analyze(text=text, language=lang)
        out = anonymizer.anonymize(text=text, analyzer_results=results).text
        print(json.dumps({"id": row.get("id", n), "output": out}, ensure_ascii=False))
