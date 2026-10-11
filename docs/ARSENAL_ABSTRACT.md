# SafeShare: recovering redacted secrets from AI chats, and stopping it

**Track:** pick the closest from the CFP form (AI/ML security or privacy)
**License:** Apache 2.0, https://github.com/darflashxd/safeshare

## Abstract (short)

In 2025, shared ChatGPT and Grok conversations were indexed by search engines, exposing
salaries, health details and credentials. The usual fix is redaction: find the sensitive entity,
mask it. SafeShare shows why that fails for AI chats. The assistant's answer is full of numbers
derived from the secret (savings rates, yearly totals, remainders), and these give it back.
`safeshare invert` takes a chat redacted by any tool and recovers the hidden values by finding
the one number that several visible figures agree on. SafeShare's redactor then removes the
secret together with everything derivable from it, keeps harmless ratios so the chat stays
useful, and shares the result as an end-to-end encrypted link that expires or burns after one
read. It runs as a browser extension for ChatGPT, Claude and DeepSeek, a CLI, and an
OpenAI-compatible proxy, and handles Indonesian and English number formats.

## What we will show

1. A naively redacted chat, and the salary recovered from it in one command.
2. The same chat redacted by SafeShare: nothing recovered.
3. An encrypted, burn-after-read share link served from a local relay.
4. Honest numbers. On held-out ai4privacy data, SafeShare + Presidio matches Presidio
   (token F1 0.78 vs 0.79), but only SafeShare blocks `invert`: Presidio leaves the salary and
   every derived figure in place. And the benchmark misleads: redacting every name, as it
   rewards, rewrites 71% of 500 real WildChat conversations. Deciding whether a name or number
   belongs to the user is the open problem.
5. Sharing a salary chat as "Rp 2–5 juta": useful, and the attack recovers nothing.

## Limits we will state

Detection is rule-based. Anyone holding the full link can read the share. The viewer's
anti-copy features are deterrence only.

Full evaluation: tools/eval/RESULTS.md.

<!-- Fill in before submitting: presenter names and bios. -->

## Presenters

- Name, affiliation, one-line bio

