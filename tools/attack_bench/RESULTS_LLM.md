# Can an LLM recover a hidden salary from a redacted chat?

**Against the LLM attacker (deepseek-v4-pro): naive redaction leaked 100%, Presidio left 100% of salaries visible, and SafeShare held at 0%.**

40 fictional English chats: each states a monthly salary, and the assistant replies with figures derived from it.
Each redactor hides what it hides; the LLM attacker then reads the redacted chat and tries to recover the salary.

| Redaction | Salary leaked to the LLM |
|---|---|
| naive — hides only the stated salary | **100%** |
| Presidio — generic PII tool | **100%** |
| SafeShare — hides the amounts too | **0%** |

**What this means**

- **Naive redaction is broken.** Hiding only the salary leaves the derived figures visible ("save 20% → $1,000/month"), so the LLM works the salary back out every time.
- **Presidio does not cover amounts.** A widely-used PII tool leaves the salary fully visible because its default recognizers target names, emails, phones and cards — not financial figures.
- **SafeShare held.** Hiding the amounts too left the LLM nothing to invert, so it recovered nothing.

For reference, a rule-based arithmetic attacker already recovers 53% from naive redaction — the LLM is the stronger attacker.

### How it was measured
- 40 fictional English chats, fixed seed, templated replies.
- "Recovered" = the attacker's answer is within 1% of the true salary; "leaked" = left visible or recovered.
- Attacker model: `9router/ds/deepseek-v4-pro`, one chat per call in a fresh session, empty folder, no tools, no ground truth in the prompt.
- Run through the OpenCode CLI (version `opencode v2.1.4`).
- Fictional data only; inference on the model provider's service.

### Limits
- One attacker model only (the roadmap targets 2–3 models).
- Templated replies, not real model output.
- Only salary/amounts; simple arithmetic cases.
- Not a proof of safety in general.

### Reproduce
    node tools/attack_bench/run.js --cases 40 --lang en --llm-cli --llm-model 9router/ds/deepseek-v4-pro --out tools/attack_bench/RESULTS_LLM.md
Raw transcript: `C:/Users/tanto/AppData/Local/Temp/ss-llm-en.jsonl` (local only).

### Full results
| Redactor | Attacker | Salary left visible | Recovered from the rest | Total leaked |
|---|---|---|---|---|
| none | arithmetic | 100% | 0% | **100%** |
| none | llm:9router/ds/deepseek-v4-pro | 100% | 0% | **100%** |
| naive | arithmetic | 0% | 53% | **53%** |
| naive | llm:9router/ds/deepseek-v4-pro | 0% | 100% | **100%** |
| presidio | arithmetic | 100% | 0% | **100%** |
| presidio | llm:9router/ds/deepseek-v4-pro | 100% | 0% | **100%** |
| safeshare | arithmetic | 0% | 0% | **0%** |
| safeshare | llm:9router/ds/deepseek-v4-pro | 0% | 0% | **0%** |
