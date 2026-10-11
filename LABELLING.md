# Labelling guide: "Is this about the person writing?"

Thanks for helping. SafeShare has to decide whether a name, amount or health detail in a chat
belongs to the person who wrote it (hide it before sharing) or to someone else, like a celebrity,
a story character or a company (keep it). Rules get this wrong often. Your labels let us measure
how wrong, and later train a small model to do better.

**Time:** about one hour for the whole sheet. Take breaks; quality matters more than speed.

## What you get

A spreadsheet (`label_sheet.csv`, opens in Excel or Google Sheets) with these columns:

| Column | Meaning |
|---|---|
| `id` | row number |
| `type` | `name` (person or place), `amount` (money or a number), or `health` |
| `item` | the thing to judge |
| `context` | the sentence around it, with the item marked «like this» |
| `about_writer` | **your answer: `yes`, `no` or `unsure`** |
| `notes` | optional: anything odd |

All text comes from WildChat, a public research dataset of real ChatGPT conversations. Every row
is a message the **user** wrote.

## The one question

> **Does «the item» reveal something about the person who wrote the message, or someone close to
> them (family, friends, coworkers)?**

- **yes**: the writer's own name, their family member's name, where they live or work, their own
  salary, rent, debt or budget, their own diagnosis or medication.
- **no**: famous people, fictional or story characters, places in a story or essay, companies'
  figures, numbers in code, logs, maths problems or examples, generic topics ("PTSD in veterans").
- **unsure**: you really can't tell from the context. Use it sparingly.

## Examples

| context | answer | why |
|---|---|---|
| "My wife «Sarah» keeps asking about…" | yes | a family member |
| "Write a story where «Geralt» rides into Novigrad" | no | fictional character |
| "I moved to «Bandung» last year for work" | yes | where the writer lives |
| "Explain the history of «Bandung»" | no | a topic, not the writer |
| "my salary is «$4,500» a month, how should I budget?" | yes | the writer's own money |
| "the company reported revenue of «$270 million»" | no | a company's figure |
| "GET /favicon.ico HTTP/1.1 404 «3017»" | no | a number in a log |
| "I was diagnosed with «PTSD» last spring" | yes | the writer's own health |
| "a T-shirt that says I Have «PTSD»" | no | a slogan |
| "«Taylor Swift» is my favourite singer" | no | public figure, even though "my" is in the sentence |

## How to fill it

1. Make your own copy of the sheet. Don't look at anyone else's answers until you're done; we
   compare two independent copies.
2. Type `yes`, `no` or `unsure` in `about_writer` for every row.
3. Save as CSV (UTF-8) with your name, for example `label_sheet_rina.csv`, and send it back.

## Privacy

The conversations are public, but they're real people's words. Keep the sheet to yourself:
don't post it, paste it into chatbots, or share it further, and delete it once you've sent your
answers back.

## For the person collecting the sheets

```bash
node tools/eval/make_label_sheet.js 300 --presidio http://127.0.0.1:5002   # builds tools/eval/data/label_sheet.csv
python tools/eval/label_agreement.py label_sheet_a.csv label_sheet_b.csv
```

The sheet needs the WildChat cache (`python tools/eval/wildchat_to_cache.py`) and, for name rows,
Presidio (`tools/presidio_server.py`). Agreement (Cohen's kappa) above 0.6 means the question is
clear enough to train on.
