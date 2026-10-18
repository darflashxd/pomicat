# Attack bench and tool comparison: what's left

Tracks ROADMAP §3 (measure the attack: "#2, LLM as attacker") and §4 (test other redaction tools,
disclose responsibly: "#4"). Harness: [`tools/attack_bench/run.js`](../tools/attack_bench/run.js),
results: [`tools/attack_bench/RESULTS.md`](../tools/attack_bench/RESULTS.md).

**Owners:** `me` = done in this repo · `you` = project owner · `friend` = co-developer

## Done (2026-10-18)

- Harness with 40 fictional chats (half Indonesian, half English, fixed seed): the user states a
  salary, the assistant replies with 1–3 figures derived from it.
- Redactors: none, naive (hides only the stated salary), Presidio (default recognizers), SafeShare.
- Attackers: arithmetic (`invert`, no key); LLM attacker wired in, switched on with `--llm`.
- Baseline, arithmetic attacker only:

  | Redactor | Total salary leaked |
  |---|---|
  | naive | 53% |
  | Presidio | 60% (salary left visible in 55%) |
  | SafeShare | 0% |

## #2: LLM as attacker

| # | Step | Needs | Owner |
|---|---|---|---|
| 2.1 | Set an API key and model in the environment, never in a file or in chat: `setx OPENAI_API_KEY "…"` / `setx ANTHROPIC_API_KEY "…"` and `setx LLM_MODEL "…"`, then a new terminal | key, budget cap (estimate under US$5 for everything below) | `you` |
| 2.2 | OK to send the **fictional** test chats to the chosen providers | your yes | `you` |
| 2.3 | Run `node tools/attack_bench/run.js --llm` for each model (2–3 models) | 2.1, 2.2 | `me` |
| 2.4 | Replace templated assistant replies with **real replies** from the same models (ask each model the user's question, keep its answer), then redact and attack those | 2.1, 2.2 | `me` |
| 2.5 | Widen the cases: loans, rent splits, ages/birth years, travel dates, combinations of details (ROADMAP §3: ~300 prompts) | – | `me` |
| 2.6 | Report per redactor × attacker × inference type, with how many chats and the exact model versions | 2.3–2.5 | `me` |
| 2.7 | One headline number for the abstract ("an LLM recovers X% of hidden salaries from naive redaction, Y% from Presidio, Z% after SafeShare") | 2.6 | `me` + `you` |

Honesty rules: fictional data only; say the replies were real model output (2.4) or templated;
publish the script and seed so anyone can rerun it; don't extrapolate to "all chats".

## #4: Other redaction tools

| # | Step | Needs | Owner |
|---|---|---|---|
| 4.1 | Choose the tools. Open source, run locally: scrubadub, Philter, a plain-regex baseline (Presidio is in already). Extensions/SaaS that "anonymise before ChatGPT": you pick 2–4 | your list; OK to download each open-source package | `you` |
| 4.2 | Add each open-source tool as a redactor in the harness | 4.1 | `me` |
| 4.3 | Extensions/SaaS: you install them in your browser (your account); I run the fictional chats through them with you, through Claude in Chrome | 4.1, their terms allow it | `you` + `me` |
| 4.4 | Cloud PII services (Google DLP, AWS Comprehend, Azure PII) on free tiers | accounts | `you` |
| 4.5 | Results table per tool; frame as "a limit of this class of tools", not a CVE | 4.2–4.4 | `me` |
| 4.6 | Disclosure: I draft a short note per tool that leaks (what, how to reproduce with fictional data, suggested fix); **you send it**, I don't send messages for you. GitHub issue for open source, security contact for the rest | 4.5 | `me` drafts, `you` send |
| 4.7 | Disclosure window: 90 days is standard; for a March 2027 talk send **by early December 2026**. Keep a log (date sent, reply) | 4.6 | `you` |
| 4.8 | Decide whether the talk names the tools or anonymises them (depends on vendor replies) | 4.7 | `you` |

## Timeline

| By | What |
|---|---|
| this week | 2.1–2.3 (needs the key), 4.1 decided |
| before 2 Nov (CFP) | 2.4, 2.7 headline number; 4.2 open-source tools in the table |
| early Dec | 4.6–4.7 disclosures sent |
| before March | 2.5–2.6 full report; 4.3–4.4 if accounts allow |
