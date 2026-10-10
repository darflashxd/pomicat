# Evaluation results (2026-10-10, SafeShare 2.2.0)

All runs are reproducible with the commands in [README.md](README.md). Raw data and outputs
stay in `tools/eval/data/` (gitignored).

## 1. General PII: ai4privacy, held-out English

2,000 rows sampled (seed 1337) from the validation split of
`ai4privacy/open-pii-masking-500k-ai4privacy`.

| tool | value recall | token precision | token recall | token F1 |
|---|---|---|---|---|
| SafeShare 2.2.0 | 0.094 | 0.970 | 0.118 | **0.211** |
| Presidio (default recognizers, `en_core_web_lg`) | 0.684 | 0.926 | 0.691 | **0.792** |
| gitleaks 8.30.1 | 0.000 | – | 0.000 | 0.000 |

Per label, SafeShare is close to Presidio only on emails (0.99 vs 1.00), SSNs (0.86 vs 1.00) and
card numbers (0.70 vs 0.85). It finds almost no names, cities, streets or dates (≤ 0.04), because
it has no general named-entity recognition: it only catches names a user introduces
("my name is …", "nama saya …"). gitleaks only looks for secrets, and this dataset has none.

**Takeaway:** SafeShare is not a general PII detector. For names and addresses, Presidio is far better.

## 2. Indonesian entities: IndoNLU NERGrit (validation)

209 sentences, 662 PERSON / PLACE / ORGANISATION spans. SafeShare value recall **0.003**.
NERGrit is encyclopedic text about public people and places, which SafeShare deliberately
leaves alone, so this mostly confirms the missing-NER gap above for Indonesian too.

## 3. False positives on real chats: WildChat-1M

500 English conversations from `allenai/WildChat-1M` (real user↔ChatGPT chats, no labels).

- 32 conversations (6.4%) had at least one redaction.
- In a hand-labelled pass, about **10 of those were correct**: hardcoded passwords in code,
  usernames in traceback file paths, a user's own salary and card fee, a spouse's name, a
  user's description of their own anxiety.
- The rest were false positives: fictional character names in fan fiction, health terms in a
  research paper, numbers in loan or probability maths cascading from one flagged figure,
  sample data in code, and "Company Act 2063".

This evaluation found and fixed ten over-redaction bugs (regression cases in
`tests/cli.test.js`). Flagged conversations went from 46 to 32 on the same sample (same counting method):

- a learned "name" (for example "one that would carry") turning every "that" into `[User_A]`
- `name: String` in code learned as a user name
- citation years such as "(2021)" read as money
- "25m high" read as 25 million
- "Plate count method" read as a license plate, "case-by-case" as a record ID
- "swift movement" and "sodium bicarbonate" read as SWIFT codes
- `$user` in PHP read as the shell's `$USER`
- digits inside DOIs and URLs read as card or ID numbers
- CSS `@import` and code decorators read as social-media handles

## 4. The inversion attack on other tools

On `examples/chat_original_en.txt`, Presidio leaves the salary (`$5,000`) and every derived
figure in place; it only masks "a year" as a date. Masking the salary alone is not enough:

```
$ sed 's/\$5,000/<REDACTED>/' presidio_output.txt | safeshare invert
Most likely hidden value: $5,000 (agreed by 3 visible numbers)
```

After SafeShare redaction, `invert` recovers nothing on the same chats (Indonesian and English).

## What this means for the project

SafeShare's value is the inversion defense, not entity detection. The natural setup is to run a
strong entity detector (Presidio, or a trained model) for names and addresses, and SafeShare's
inversion layer on top for numbers that can be derived from redacted ones.
