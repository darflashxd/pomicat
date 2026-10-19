"""Run: python tools/eval/test_score.py. Fictional, dependency-free evaluator checks."""
from score import score
import json
from pathlib import Path
import subprocess

gold = [{"id": "one", "source_text": "Key ABCDEFGH safe", "privacy_mask": [
    {"start": 4, "value": "ABCDEFGH", "label": "SECRET"}]}]
partial = [{"id": "one", "output": "Key [MASK]EFGH safe", "edits": [
    {"start": 4, "end": 8, "replacement": "[MASK]"}]}]
result = score(gold, partial)
assert result["value_recall"] == 1  # Legacy metric is deliberately shown to be insufficient.
assert result["positional"]["full_span_recall"] == 0
assert result["positional"]["partial_spans"] == 1
assert result["positional"]["sensitive_character_coverage"] == 0.5
full = [{"id": "one", "output": "Key [MASK] safe", "edits": [
    {"start": 4, "end": 12, "replacement": "[MASK]"}]}]
assert score(gold, full)["positional"]["full_span_recall"] == 1
assert score(gold, full)["positional"]["non_sensitive_characters_changed"] == 0
for invalid in [[], full + full, [{**full[0], "id": "other"}],
                [{**full[0], "output": "wrong"}],
                [{**full[0], "edits": [{"start": -1, "end": 12, "replacement": "X"}]}]]:
    try:
        score(gold, invalid)
    except ValueError:
        pass
    else:
        raise AssertionError("Malformed evaluation accepted")
unchanged = [{"id": "one", "output": gold[0]["source_text"], "edits": [
    {"start": 4, "end": 12, "replacement": "ABCDEFGH"}]}]
assert score(gold, unchanged)["positional"]["full_span_recall"] == 0
wrapped = [{"id":"one","output":"Key [ABCDEFGH] safe","edits":[{"start":4,"end":12,"replacement":"[ABCDEFGH]"}]}]
assert score(gold, wrapped)['positional']['full_span_recall'] == 0
print("PASS: missing/duplicate IDs, reconstruction, exact coverage, partial masks, unchanged edits")
root = Path(__file__).resolve().parents[2]
corpus = root / 'tests/fixtures/english_credentials.jsonl'
completed = subprocess.run(['node', str(root / 'tools/eval/run_safeshare.js'), str(corpus), '--heuristics-trace'],
                           capture_output=True, text=True, encoding='utf-8', check=True, timeout=30)
rows = [json.loads(line) for line in corpus.read_text(encoding='utf-8').splitlines()]
outputs = [json.loads(line) for line in completed.stdout.splitlines()]
result = score(rows, outputs)
assert result['positional']['full_span_recall'] == 1, result
assert result['positional']['partial_spans'] == 0, result
assert result['positional']['non_sensitive_characters_changed'] == 0, result
assert result['positional']['exact_span_recall'] == 1, result
assert result['positional']['exact_span_precision'] == 1, result
for row, output in zip(rows, outputs):
    if not row['privacy_mask']:
        assert output['output'] == row['source_text'] and not output['edits']
print('PASS: English production scanner traces, Unicode offset conversion, exact reconstruction (development corpus, not holdout)')
