# SafeShare: inference-aware private sharing for AI conversations

**Submission draft — presenter details and the exact form track still need confirmation.**
**License:** Apache-2.0 · https://github.com/darflashxd/safeshare

## Abstract

Sharing an AI conversation can expose more than the values a user types. An assistant may repeat
those values, convert them to yearly totals, or calculate savings and remainders. Masking the
original salary while retaining those figures can leave enough information to reconstruct it.

SafeShare is a review-and-sharing tool for AI conversations. Its main workflow, Share Privately,
extracts user and assistant turns, combines deterministic rules with local English-focused NER
suggestions, and lets the author inspect or manually redact the result before creating an encrypted,
expiring or burn-after-read link. A supported-transform arithmetic defense targets numerical clues
across turns, while `safeshare invert` demonstrates the attack by ranking candidate hidden values.
The attack does not require an LLM or an external inference service.

The demonstration follows one fictional English conversation from entity-only masking, through
arithmetic recovery and defense, to a recipient opening the reviewed ciphertext. We also show
why a tool reporting no recovery is not proof of anonymity: unrelated figures can generate false
hypotheses, and encoded or semantic clues may lie outside the supported numerical grammar.

SafeShare provides a browser extension for ChatGPT, Claude and DeepSeek, a rule-based CLI/library,
and a text-redacting API proxy. Browser integrations require ongoing layout checks; the optional
before-send shield is off by default and is not a barrier to site scripts reading the composer.

## Live demonstration

1. Review both conversation roles and a manual redaction in Share Privately.
2. Recover the correct top-ranked salary candidate from a constructed masked example, showing alternatives.
3. Remove supported derived clues and rerun the attack; explain the scope of the negative result.
4. Open a local encrypted link after an explicit click, demonstrate burn-after-read and revocation.
5. Show a negative control and an encoded-data limitation rather than promising universal detection.

## Evaluation scope

Separate evidence is provided for detector models, workflow regressions and attack experiments.
The English challenge uses fictional templated data and a separate explicit-relation attacker;
it is not an independent holdout or a measurement of real-chat incident prevalence. Earlier
CLI/Presidio/WildChat results and the external synthetic BERT comparison describe different
configurations and are not a single product accuracy score.

- English attack protocol/results: `tools/attack_bench/ENGLISH_RESULTS.md`
- Model provenance and measurements: `MODELS_SETUP.md`, `tools/eval/MODEL_COMPARISON.md`
- Runtime/workflow reproduction: `TESTING.md`, `DEMO.md`

## Boundaries

The defense covers selected arithmetic transformations, not arbitrary encodings, semantic inference
or every sensitive-data type. Anyone holding a full usable link can decrypt and retain its content.
The extension viewer avoids executing a relay-served decryptor; the hosted fallback still requires
trust in its operator. Copy deterrence does not prevent screenshots. Local model suggestions are
unverified, English-focused and can be wrong.

## Presenters — complete before submitting

- Name, affiliation, short bio: **pending project owner**.
- Track, demo format, current event requirements: **confirm in the official submission form**.
