# Can an LLM recover a hidden salary from a redacted chat?

**Three LLM attackers from two vendors, in English and Indonesian: naive redaction leaked 100% every
time, Presidio 100%, and PomiCat 0%.**

40 fictional chats per run: each states a monthly salary, and the assistant replies with 1–3
figures derived from it ("save 20% → $1,000 a month"). Each redactor hides what it hides; the LLM
attacker then reads the redacted chat and tries to recover the salary.

| Salary leaked to the LLM | Naive (hides only the salary) | Presidio (generic PII tool) | PomiCat |
|---|---|---|---|
| DeepSeek V4 Pro · English | **100%** | **100%** (left visible) | **0%** |
| Claude Sonnet 5.5 · English | **100%** | **100%** (left visible) | **0%** |
| Claude Haiku 5.5 · English | **100%** | **100%** (left visible) | **0%** |
| Claude Sonnet 5.5 · Indonesian (Rupiah) | **100%** | **100%** (13% visible + 88% recovered) | **0%** |

**What this means**

- **Naive redaction is broken.** Hiding only the salary leaves the derived figures visible, and every
  model worked the salary back out, every time, in both languages. Even a single figure ("Saving 25%
  gives $600") is enough for an LLM; the rule-based attacker needs two and recovers 53%.
- **A generic PII tool doesn't help.** Presidio's default recognizers leave English amounts as they
  are. On Rupiah it did hide 87% of the stated salaries, but the LLM recovered 88% of those from the
  savings figures Presidio left in the reply: still 100% leaked.
- **PomiCat held.** It hides the derived amounts too, so the attacker sees one percentage and
  placeholders. Every model answered "not enough information" (0 recovered out of 160 PomiCat chats).

### How it was measured
- 40 fictional chats per run, fixed seed (`tools/attack_bench/run.js`), templated replies.
- "Recovered" = the attacker's answer is within 1% of the true salary; "leaked" = left visible or
  recovered. Chats where the salary is still visible are not sent to the model.
- One chat per call in a fresh session, empty folder, no tools, no ground truth in the prompt; every
  call returned a parseable answer (no invalid replies in any run).
- DeepSeek V4 Pro (`9router/ds/deepseek-v4-pro`) through the OpenCode CLI (`opencode v2.1.4`).
- Claude Sonnet 5.5 and Haiku 5.5 through the Claude Code CLI (`2.1.310`, `claude -p` on a Claude
  account, no API key; tools, MCP servers and session saving off), 25 Oct 2026.
- Fictional data only; inference on the model provider's service.

### Limits
- Templated replies, not real model output; only salaries and simple arithmetic.
- Three models, two vendors; no OpenAI or Google model yet.
- Shows that the attack works and that PomiCat's defence holds on these cases, not how often real
  chats leak. Not a proof of safety in general.

### Reproduce
    node tools/attack_bench/run.js --cases 40 --lang en --llm-cli --llm-model 9router/ds/deepseek-v4-pro
    node tools/attack_bench/run.js --cases 40 --lang en --llm-claude --llm-model claude-sonnet-5-5
    node tools/attack_bench/run.js --cases 40 --lang en --llm-claude --llm-model claude-haiku-5-5
    node tools/attack_bench/run.js --cases 40 --lang id --llm-claude --llm-model claude-sonnet-5-5
Add `--out <file>` to keep each run's report. Raw transcripts stay local (`--llm-log`).

### Full results
| Language | Redactor | Attacker | Salary left visible | Recovered from the rest | Total leaked |
|---|---|---|---|---|---|
| English | naive | arithmetic | 0% | 53% | **53%** |
| English | naive | DeepSeek V4 Pro | 0% | 100% | **100%** |
| English | naive | Claude Sonnet 5.5 | 0% | 100% | **100%** |
| English | naive | Claude Haiku 5.5 | 0% | 100% | **100%** |
| English | presidio | any | 100% | 0% | **100%** |
| English | pomicat | arithmetic | 0% | 0% | **0%** |
| English | pomicat | DeepSeek V4 Pro | 0% | 0% | **0%** |
| English | pomicat | Claude Sonnet 5.5 | 0% | 0% | **0%** |
| English | pomicat | Claude Haiku 5.5 | 0% | 0% | **0%** |
| Indonesian | naive | arithmetic | 0% | 53% | **53%** |
| Indonesian | naive | Claude Sonnet 5.5 | 0% | 100% | **100%** |
| Indonesian | presidio | arithmetic | 13% | 8% | **20%** |
| Indonesian | presidio | Claude Sonnet 5.5 | 13% | 88% | **100%** |
| Indonesian | pomicat | arithmetic | 0% | 0% | **0%** |
| Indonesian | pomicat | Claude Sonnet 5.5 | 0% | 0% | **0%** |
