# Archive

Earlier research notes, plans and internal benchmark reports. They are kept for history and
are **not** an accurate description of the current tool. Several of them overstate it:

- They describe Tier 2 as a DistilBERT model running in the extension. It does not run there.
  Tier 2 is rule-based, and the trained model scored F1 0.64 on held-out data.
- They report 100% / 0% scores from test sets written alongside the rules. Those are
  regression tests, not accuracy measurements.
- They use "zero-knowledge" to mean end-to-end encryption.

For current behaviour see the main [README](../../README.md). For measured accuracy see
[tools/eval](../../tools/eval/README.md).
