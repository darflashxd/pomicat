# Evaluation results (2026-10-10 and 2026-10-11, SafeShare 2.2.0 and 2.3.0)

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

## 5. SafeShare + Presidio (2.3.0)

`--presidio` adds Presidio's recognizers (names, places, phones, IDs). Same 2,000 ai4privacy rows
and 500 WildChat conversations:

| setting | ai4privacy token F1 | token P | WildChat conversations touched |
|---|---|---|---|
| SafeShare alone | 0.211 | 0.970 | 7.8% |
| + Presidio, `names: personal` (default) | 0.310 | 0.980 | 8.8% |
| + Presidio, `names: all` | 0.667 | 0.957 | 71% |
| + Presidio, `names: all`, dates on | 0.780 | 0.926 | – |
| Presidio alone | 0.792 | 0.926 | – |

With every name and date on, SafeShare + Presidio matches Presidio on the benchmark (per label:
passports 1.00, SSNs 1.00, tax numbers 0.98, phones 0.70, streets 0.75) and adds the inversion
defense. But on real chats that setting rewrites 71% of conversations, mostly celebrity names,
story characters, authors in citations and places in essays.

`names: personal` only accepts a name or place that directly follows words tying it to the user
("my wife", "my name is", "I'm", "teman saya", "I live in", "tinggal di"). Hand check of the 6
conversations it adds over SafeShare alone: a self-introduction, a business location, a passport
number, two users' LAN IP addresses (reasonable) and a DOI read as a phone number (since fixed).

Presidio exposed four engine bugs, fixed with tests: short entities replaced inside words
("spatial" → "s[LOCATION_1]tial"), name labels running past `[User_Z]` into symbols, Presidio's
person tags on code tokens ("mov", "val"), and its ID recognizers firing on "O3", "x86", "RAID-Z1".

**The gap between the two rows is the training problem.** The benchmark counts every name as
PII; real users mostly mention names that aren't theirs. Rules can only approximate "is this
about the user?". That is what a trained contextual model should learn, measured on both sets.

## What this means for the project

SafeShare's value is the inversion defense, not entity detection. The natural setup is to run a
strong entity detector (Presidio, or a trained model) for names and addresses, and SafeShare's
inversion layer on top for numbers that can be derived from redacted ones.
