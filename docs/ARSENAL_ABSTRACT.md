# SafeShare: recovering redacted secrets from AI chats, and stopping it

**Track:** pick the closest from the CFP form (AI/ML security or privacy)
**License:** Apache 2.0, https://github.com/darflashxd/safeshare

## Abstract (short)

In 2025, shared ChatGPT and Grok conversations were indexed by search engines, exposing
salaries, health details and credentials. The usual fix is redaction: find the sensitive entity,
mask it. SafeShare shows why that is not enough for AI chats. The assistant's answer is full of
figures derived from what the user said (savings, yearly totals, ages, dates), and these give the
hidden value back. `safeshare invert` takes a chat redacted by any tool and recovers hidden
amounts by finding the one number several visible figures agree on, and hidden birth years from
stated ages. SafeShare's redactor removes the secret together with the figures derivable from it (ratios,
per-period amounts, projections, sums and differences),
can show amounts as ranges so the chat stays useful, and shares the result as an end-to-end
encrypted link that expires or burns after one read. It runs as a browser extension for ChatGPT,
Claude and DeepSeek (with protection before sending, too), a CLI and an OpenAI-compatible proxy,
and handles Indonesian and English formats.

## What we will show

1. A naively redacted chat, and the salary recovered from it in one command; the same for a
   hidden birth date.
2. The same chats redacted by SafeShare: nothing recovered. Sharing a salary chat as
   "Rp 2–5 juta" keeps it useful.
3. An encrypted, burn-after-read share link served from a local relay, and before-sending
   protection that keeps the salary from the model itself.
4. Honest measurements:
   - On held-out ai4privacy data, SafeShare + Presidio matches Presidio (token F1 0.78 vs 0.79),
     but only SafeShare blocks `invert`: Presidio leaves the salary and every derived figure in
     place.
   - The benchmark misleads: redacting every name, as it rewards, rewrites 71% of 500 real
     WildChat conversations; redacting only names tied to the user touches 9%.
   - We looked for the inversion attack in 20,000 real WildChat conversations and found that
     people there almost never share their own finances (0.05%), and nothing leaked in those
     chats. We'll show what that means for the threat and the controlled benchmark that measures
     it properly.

## Limits we will state

Detection is rule-based in the CLI plus a local MiniLM Q4 NER model in the extension
(see RELATED_WORK.md for prior art: PDF deredaction, LLM attribute inference, log
redaction). Anyone holding the full link can read the share. The viewer's anti-copy features are deterrence
only. Deciding whether a name or number belongs to the user is the open problem.

Full evaluation: tools/eval/RESULTS.md.

<!-- Fill in before submitting: presenter names and bios. -->

## Presenters

- Name, affiliation, one-line bio
