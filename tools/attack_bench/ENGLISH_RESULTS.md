# English attack–defense challenge (2026-10-20)

160 fictional templated development conversations, fixed seed 20261020. No vendor inference,
external API calls, paid services, or private transcripts. Not an independent holdout or estimate
of real-world incident prevalence. Model NER is not used in this CLI benchmark.

## Method

- 100 numeric-family cases: savings, annual salary, remainder, across-turn figures, approximate
  rounding (20 each). Ground truth comes from construction, not from the attacker.
- 40 negative controls: no user salary is disclosed; unrelated public figures can resemble clues.
- 20 out-of-scope cases: annual salary encoded in base64. These test a known limit, not supported
  numerical transformation coverage.
- Baselines: none; **oracle entity-only masking** of the stated salary (not a third-party product);
  production synchronous PomiCat CLI, public/remove defaults.
- Attackers: PomiCat `invert`; a separate parser for explicit EN monthly-savings/annual/remainder
  relations (does not import the solver); and a separate base64 annual decoder.
- Correct recovery: within 1% of source salary. Top-5 means first five candidates. Directly visible
  salaries are counted separately, not counted twice as recovered.

## Supported-family results (100 cases)

| Redactor | Direct salary visible | invert top-1 / top-5 after masking | Separate relation parser top-1 / top-5 after masking |
|---|---:|---:|---:|
| None | 100 | 0 / 0 (direct exposure counted above) | 0 / 0 (direct exposure counted above) |
| Oracle entity-only | 0 | 8 / 15 | 82 / 82 |
| PomiCat | 0 | 0 / 0 | 0 / 0 |

Rounded cases may not permit recovery within 1%; not recovering the original is not proof the
remaining estimate or interval is harmless. Both tools share the general numeric-attack domain;
the separate parser is a different implementation, not an independent external security audit.

## Negative controls and out-of-scope results

- Both arithmetic attackers emit at least one hypothesis on **20/40** controls, before and after
  PomiCat. This measures unsupported attribution to a user's salary, not an arithmetic error.
  `invert` output must be interpreted as ranked candidates, not confirmed secrets.
- Base64 annual decoder recovers **20/20** out-of-scope salaries after both entity-only masking
  and PomiCat. The numeric attackers report none. The limitation is deliberately reported rather
  than removed from the denominator or patched only to improve this score.
- All explicit safe-note sentinels survive for every redactor (160/160). Technical port `5432`
  survives in all applicable conversations (140/140). These two narrow retention measures are
  **not** a semantic utility score or a complete over-redaction measurement.
- Partial masks are checked separately by exact-span regression/evaluator tests. String absence in
  this output-only bench cannot certify full-span protection.

## Reproduce

```bash
node tests/attack_bench_en.test.js
node tools/attack_bench/english.js --out /path/to/local-report.json
```

Choose a writable report path appropriate to your OS. Without `--out`, nothing is written. The
JSON report includes per-case IDs and first five guesses so aggregate counts can be inspected.
Existing `tools/attack_bench/RESULTS.md` is a separate historical EN/ID experiment and is not
overwritten. Next work: independently annotated responses from diverse sources, external
redactor baselines, larger negatives, and attacks outside the numeric grammar.
