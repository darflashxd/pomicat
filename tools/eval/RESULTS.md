# Evaluation results (2026-10-10 and 2026-10-11, PomiCat 2.2.0 and 2.3.0)

All runs are reproducible with the commands in [README.md](README.md). Raw data and outputs
stay in `tools/eval/data/` (gitignored).

## 1. General PII: ai4privacy, held-out English

2,000 rows sampled (seed 1337) from the validation split of
`ai4privacy/open-pii-masking-500k-ai4privacy`.

| tool | value recall | token precision | token recall | token F1 |
|---|---|---|---|---|
| PomiCat 2.2.0 | 0.094 | 0.970 | 0.118 | **0.211** |
| Presidio (default recognizers, `en_core_web_lg`) | 0.684 | 0.926 | 0.691 | **0.792** |
| gitleaks 8.30.1 | 0.000 | – | 0.000 | 0.000 |

Per label, PomiCat is close to Presidio only on emails (0.99 vs 1.00), SSNs (0.86 vs 1.00) and
card numbers (0.70 vs 0.85). It finds almost no names, cities, streets or dates (≤ 0.04), because
it has no general named-entity recognition: it only catches names a user introduces
("my name is …", "nama saya …"). gitleaks only looks for secrets, and this dataset has none.

**Takeaway:** PomiCat is not a general PII detector. For names and addresses, Presidio is far better.

## 2. Indonesian entities: IndoNLU NERGrit (validation)

209 sentences, 662 PERSON / PLACE / ORGANISATION spans. PomiCat value recall **0.003**.
NERGrit is encyclopedic text about public people and places, which PomiCat deliberately
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
$ sed 's/\$5,000/<REDACTED>/' presidio_output.txt | pomicat invert
Most likely hidden value: $5,000 (agreed by 3 visible numbers)
```

After PomiCat redaction, `invert` recovers nothing on the same chats (Indonesian and English).

## 5. PomiCat + Presidio (2.3.0)

`--presidio` adds Presidio's recognizers (names, places, phones, IDs). Same 2,000 ai4privacy rows
and 500 WildChat conversations:

| setting | ai4privacy token F1 | token P | WildChat conversations touched |
|---|---|---|---|
| PomiCat alone | 0.213 | 0.969 | 7.8% |
| + Presidio, `names: personal` (default) | 0.310 | 0.980 | 8.8% |
| + Presidio, `names: all` | 0.667 | 0.957 | 71% |
| + Presidio, `names: all`, dates on | 0.780 | 0.926 | – |
| Presidio alone | 0.792 | 0.926 | – |

With every name and date on, PomiCat + Presidio matches Presidio on the benchmark (per label:
passports 1.00, SSNs 1.00, tax numbers 0.98, phones 0.70, streets 0.75) and adds the inversion
defense. But on real chats that setting rewrites 71% of conversations, mostly celebrity names,
story characters, authors in citations and places in essays.

`names: personal` only accepts a name or place that directly follows words tying it to the user
("my wife", "my name is", "I'm", "teman saya", "I live in", "tinggal di"). Hand check of the 6
conversations it adds over PomiCat alone: a self-introduction, a business location, a passport
number, two users' LAN IP addresses (reasonable) and a DOI read as a phone number (since fixed).

Presidio exposed four engine bugs, fixed with tests: short entities replaced inside words
("spatial" → "s[LOCATION_1]tial"), name labels running past `[User_Z]` into symbols, Presidio's
person tags on code tokens ("mov", "val"), and its ID recognizers firing on "O3", "x86", "RAID-Z1".

**The gap between the two rows is the training problem.** The benchmark counts every name as
PII; real users mostly mention names that aren't theirs. Rules can only approximate "is this
about the user?". That is what a trained contextual model should learn, measured on both sets.

## 6. Does the inversion attack happen in real chats? (2026-10-11)

`tools/eval/inversion_wild.js` on 20,000 English WildChat-1M conversations (one parquet shard,
`tools/eval/wildchat_to_cache.py`). For each chat where PomiCat's rules find an amount the user
stated: mask exactly those amounts everywhere (what an entity-by-entity redactor does), then
attack. "Recovered" = a top-3 `invert` guess within 1.5% of a masked amount; a decoy value
(amount × 1.37) measures chance hits.

| | all chats with a stated amount | personal money only* |
|---|---|---|
| conversations | 235 of 20,000 | **10 of 20,000 (0.05%)** |
| masked amount still visible in another format | 37 (15.7%) | 0 |
| recovered by `invert` (top 3) | 3 (1.3%), all coincidences on reading | 0 |
| chance hits on the decoy | 0 | 0 |
| after PomiCat: visible / recovered | 30 (12.8%) / 0 | 0 / 0 |

\* the amount is in a sentence like "my salary / our rent / I pay / gaji saya …", under 100 million.

**Reading the results honestly:**
- In WildChat (2023, general-purpose chats), people very rarely share their own finances, and in
  those few chats nothing leaked through derived numbers. **We could not measure a real-world rate
  for the inversion attack from this data.** The attack is demonstrated on controlled examples
  (`examples/`), not yet observed in the wild.
- The "all chats" column is noisy: most detected "amounts" are company figures, data tables, IDs
  and years, where a 1.5% match happens by chance. The 12.8% left visible after PomiCat are of
  that kind; none are personal money.
- Running this found and fixed a bug: `invert` counted a number repeated three times as three
  pieces of evidence. Support now counts distinct values.

**What would measure it properly:** realistic personal-finance prompts (salary, rent, debt,
budgets, in Indonesian and English) sent to current models, so the replies and their derived
numbers are real; then entity redaction and `invert` as above. That needs model API access and is
the next experiment.

## 7. A second inference: birth year from stated ages

A redacted birth date is undone by "I am 28" (plus the current year) or "I graduated in 2020 at
22". `invert` now reports this when a text hides a birth date (`examples/chat_birthdate_naive.txt`
→ 1998 or 1997), and PomiCat hides stated ages whenever it hides a birth date
(`tests/birthyear.test.js`). Ages alone are left as they are.

## 8. A third inference: a hidden date from weekday and day clues (2026-10-24)

"My birthday is [REDACTED_DATE]. It was a Tuesday, the day after my sister's on the 14th" leaves
few dates: `inferDates` (in `invert`) lists every day within a year either side that fits the
weekday, the offset and the visible day number. PomiCat hides those clues whenever it hides a
date (`[REDACTED_WEEKDAY]`, `[REDACTED_OFFSET]`, `[REDACTED_DAY]`).

40 fictional birth dates (half English, half Indonesian), each with a weekday and a "day after the
Nth" clue, measured through the extension's share dialog:

| Redaction | Hidden date narrowed to ≤ 4 days |
|---|---|
| Naive (only the date replaced) | 40 / 40 (2 to 4 candidates, always including the true date) |
| PomiCat share dialog | 0 / 40 |

Reproduced by `npm test` (`tests/maybe.test.js`, "dates benchmark"). Only birth dates count as
personal: an appointment date is not hidden, so its clues are left as they are. The attack finds the
day and month within a two-year window; the year has to come from elsewhere (see §7).

## What this means for the project

PomiCat's value is the inversion defense, not entity detection. The natural setup is to run a
strong entity detector (Presidio, or a trained model) for names and addresses, and PomiCat's
inversion layer on top for numbers that can be derived from redacted ones.
