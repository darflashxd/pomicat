# Manual test checklist (Chrome)

## Current audit hardening checks (2026-10-29)

Run `npm test` for CLI exit-status parity, keyword-context inference bypasses, explicit ratio
relations, relay persistence fault injection, per-draft vault isolation, Word decimal parsing,
viewer schemas and saved chat revocation controls. Package installation uses the selected npm CLI
without a shell and removes the inherited npm 12 `allow-scripts` lifecycle setting.

`python tools/test_mapping_browser.py` uses a real Chromium extension and local fictional pages:
two simultaneous drafts, two origins, same chat ID across origins, SPA migration and reload.
Full navigation of an unassigned draft deliberately does not adopt an unproven mapping.
`python tools/eval/credential_browser.py --browser firefox` exercises review and send lifecycle;
`python tools/eval/relay_browser.py` exercises the hosted local viewer, burn and revoke.
`python tools/test_word_structures.py` checks DOCX structures in Chromium and Firefox.

The dated entries below are historical evidence, not a consolidated current feature specification.

Compatibility note: new drafts use per-document nonces. Full navigation before a chat receives its
identity does not restore that draft automatically. Identified legacy mappings are read through the
old chat-ID keys for compatibility; those old keys did not record provider provenance. Browser
session exit clears both old and new session mappings.

Execution evidence for this working-tree hardening pass: Node 24.18.0, `npm test` 68/68;
credential fixtures Chromium/Firefox; hosted local relay Chromium/Firefox including mismatched
encrypted share ID rejection; Word review/structures/privacy Chromium/Firefox; real Chromium
extension draft isolation and persisted revoke metadata after browser restart. No production relay
deployment or live-provider session was used. English development challenge rerun retained 0/100
supported-family recovery and the known 20/20 Base64 limitation; this is not held-out accuracy.

Current source uses Blackline. Dated SafeShare results below describe historical
builds; internal identifiers and relay names remain unchanged for compatibility.
Run `node tests/rebrand.test.js` for identity, storage and naming checks.

## Retired offline document prototype

Launcher recovery check: reload unpacked extension with existing SharePoint permission and no
registered scripts. Worker restored `safeshare-word-restored`, injected exactly one visible
44px-high button into the open Word wrapper; a real Playwright mouse click opened setup with
source tab reference. Repeating restoration kept exactly one launcher. Context invalidation
is caught and displays refresh guidance rather than an uncaught runtime error.

Session-capture prototype: download URL builder restricted to HTTPS SharePoint DOCX editor routes,
with UUID source id and no forwarded editor query parameters. Browser parser test of downloaded
fictional DOCX found one table, one image, two supplementary parts and final sentinel. Fixture
injection used only the test harness, not a product file picker. Real extension fetch remains
unverified: optional site permission prompt stayed unresolved (`granted: false`) in Playwright.
Parser bounds actual inflated bytes; it is inspection-only, not an audited OOXML sanitization engine.

English Word corpus preparation: `python tools/build_word_corpus.py --self-check` creates and
verifies eight fictional DOCX fixtures in a temporary directory. Covers merged table, split runs,
OMML fraction, authored screenshot/crop, tracked deletion, metadata and final-content sentinels.
Generation/package structure checks passed; no live Word capture, OCR or sanitization is implied.
See `docs/WORD_ONLINE_TESTING.md`. External dataset records are not incorporated.

The experimental XLSX/CSV/local-file workspace was removed in favor of Word Online integration.
Earlier document-link payloads are rejected explicitly; chat payloads retain their existing path.
Word setup is a launcher/permission surface, not a verified capture/redaction integration.

Live Word acquisition check (2026-10-27): uploaded the authored fictional `04-incident.docx`
through Playwright's file chooser into the authorized Microsoft account. Word editor ran inside
`word-edit.officeapps.live.com`; SharePoint wrapper used `Doc.aspx` (now recognized alongside
`doc2.aspx`). File → Create a Copy → Download a copy required a second confirmation button.
Downloaded DOCX (47,744 bytes) reopened as ZIP/XML: one table, one media image, header part and
`END_OF_DOCUMENT_04_INCIDENT` present. This verifies manual browser-automated acquisition only,
not extension acquisition, privacy redaction or source-byte equivalence. No tokens extracted,
no public relay upload, and the uploaded test copy was not deleted.

Chromium extension-origin Playwright: Word setup loaded at desktop and 390px widths; no root
horizontal overflow measured and no file picker. Supported fictional SharePoint origin enables
setup control; `sharepoint.com.attacker.invalid` stays disabled. Permission grant, launcher on a
real tenant, Microsoft OAuth and document retrieval were not tested. Node word_setup.test.js
covers Word vs XLSX routes, opt-in manifest permissions, and retired-document refusal.

Priority Word document check (2026-10-27): `python tools/build_priority_docx.py --self-check`
built and verified the fictional compensation memo (75 KB, 2 tables, 1 image, sentinel present,
every visible run `w:color=000000`). Uploaded through Playwright to Word Online; editor rendered
two pages with footer page fields intact. Triggering the floating SafeShare button opened setup
directly in the enabled state (no repeated Enable step), and **Read saved copy** returned
`2 tables - 1 image assets - 0 equations` plus the complete text ending in the sentinel.
Redaction, image pixel redaction and recipient sharing remain unimplemented.

OOXML redaction, P0 (2026-10-27): `extension/word/redact.js` rewrites `w:t` nodes inside the
original package instead of rebuilding a document, so tables, styles, sections and equation markup
survive. It removes `w:del`/`w:moveFrom`, unwraps `w:ins`/`w:moveTo`, drops hidden runs and comment
anchors, and clears core/app metadata. Runs are mapped character-by-character, so a value split
across bold/italic runs is still replaced.

Live Chromium check on the priority memo: capture returned 2 tables and 1 image; six manual terms
(names and amounts) produced `8 replacements across 2 parts` and a clean verification pass. The
downloaded sanitized DOCX reopened in Word Online with the compensation table intact, names and
amounts replaced by `[REDACTED]`, 307 words, 2 pages. Independent Python inspection of the package
found no selected value in any XML/relations part, 2 tables and 1 media part preserved.
`node tests/word_redact_zip.test.js` round-trips all 19 package parts byte-identically in Node.

**Still unsafe to share:** the embedded screenshot is not yet redacted, so the image still contains
the fictional credential. Image pixel redaction is P1. No encrypted link or recipient viewer exists
for Word documents yet.

Image redaction and review parity (2026-10-27): `redact.js` now overwrites pixels through
`OffscreenCanvas` and re-encodes the media part, verifying the redacted rectangle is solid black
before export. Review UI gained category chips, select all/clear, currency-amount option,
placeholder choice, keep-revisions/metadata toggles, an image card with "Redact whole" and
drag-to-mark areas, and an original-vs-sanitized comparison.

Live check on the priority memo: text rules plus whole-image redaction produced
`8 text replacements across 2 parts, 1 image redacted`; the downloaded package had a 100% black
media image, no selected value in any XML part, and both tables intact. Uploading the result to
Word Online rendered the table with `[REDACTED]` cells; 8 redaction markers, 307 words.
Limitations: no OCR suggestions yet (image review is manual), no category auto-detection for
bare table numbers, no encrypted link or recipient viewer for Word.

Document detection parity (2026-10-27): chat parity required the Tier 3 arithmetic solver, not a
money regex. Added `word/textmap.js` (paragraph/table flattening, money-column typing, currency
lexer) and `word/detect.js` (Tier 1 heuristics, money bases, `AdversaryOracleSolver` derived values,
NER hook, conservative "initial + surname" fallback).

Live check on the priority memo: 18 findings (13 financial, 5 profile). Money cells `4,800`, `960`,
`5,760`, `3,600`, `540`, `4,140`, `2,900`, `290`, `3,190`, `11,300`, `1,790`, `13,090` were
pre-checked; `11,520` was recovered as a derived value. `14 March 2026`, `20%` and `DOC-CR-2026-0417`
were correctly excluded after adding a bare-number guard and a two-numeric-cell rule for columns
("Compensation Committee" is not a money header). Applying produced 20 replacements; verification
was narrowed to text-bearing parts because `960` occurs inside theme colour values
(`dir="5400000"`). Word Online reopened the result with 20 markers, 2 tables and 307 words.

Known gaps: no Tier 2 public/private contextual suppression yet, so a published average could be
flagged; the solver only inverts single-step relations; broad name detection still depends on the
local model, and the initials rule is intentionally narrow.

Review parity UI (2026-10-27): added state-driven header ("Create sanitized copy" -> "Sanitized
copy ready"), counters (`17 of 19 items masked`, protected/unmasked chips), `Hide all`/`Keep all`,
per-item `Redacted` toggle, `Show in preview` (selects the value in the text preview),
`Show N more`, `Compare with original` toggle (single pane when off), and select-to-redact in the
preview with a sticky action.

Detection additions: public-figure context downgrades amounts to suggestions
(`average salary ... 62,000` stays unchecked), connection strings become
`[REDACTED_CONNECTION_STRING]`, and the tabs.onUpdated listener re-injects the launcher after an
extension reload without a manual page refresh.

Live check: capture produced 18 findings; counters reported 16 of 18 masked before manual
selection, 0 of 18 after `Keep all`, 18 visible after `Show N more`. `Show in preview` selected
`4,800` in the document text; selecting `Northbridge` added a manual finding (17 of 19). Applying
produced a sanitized copy with the header switching to "Sanitized copy ready".

Still missing for true chat parity: working broad name detection (local model path unverified in
this profile), contextual suppression beyond the public-figure list, alias grouping
(Melissa / Melissa Jane Foster), range mode, expiry and the encrypted link.

Policy parity P2 (2026-10-27): added reader profile (Anyone with the link / Someone I trust),
amounts mode (Remove / Approximate ranges), persisted preferences in `word_preferences`,
`Reset to defaults`, `Cancel`, and an attack-check panel driven by `SafeSharePolicy.invert` +
visible-number filtering. Preferences survive reload; changing reader re-derives the checked set.

Live verification: reader `trusted` unchecked names/amounts (0 of 18 on a memo made only of names
and amounts); `public` restored 16 of 18. Amounts mode `range` exported `?2k-5k`, `?500-1k`,
`?5k-10k` (17 ranges), kept 3 derived markers removed, and `4,800` was absent. Attack check reported
no recoverable amount because derived figures stayed hidden.

Known limits: range mode leaves surrounding words like "dollars" in place (approximation, not a
grammar rewrite); reader `trusted` widens what leaves the browser and needs an explicit warning in
the publish step; the model-driven name path is still unverified, so broad names rely on the narrow
initials rule plus manual selection.

Delivery P4 (2026-10-27): `word/publish.js` encrypts a v4 document payload (sanitized DOCX plus a
text/table preview), rejects payloads that would exceed the relay limit, uploads through the
existing background handler, and shows copy/revoke controls. `viewer/app.js` renders the v4
preview in a sandboxed iframe with a download button.

Live check on the local relay: created link `http://127.0.0.1:8787/v/<id>#<43-char key>`, opened it
in a new tab, clicked through, and the recipient page decrypted and displayed the sanitized text
with a DOCX download. The downloaded file had 2 tables, 20 `[REDACTED]` markers and no
`Whitfield`/`4,800`/`11,520`. Revoking from the sender produced "Link revoked"; reloading the
recipient link then showed "Link Expired or Revoked".

Limits: the viewer shows a text/table preview, not Word layout; the DOCX download keeps tables,
styles and images. Payload cap is the relay's 512 KiB ciphertext, so documents with large images
must be downloaded instead. No burn-after-one-view. Recipient test used the same browser profile,
so a clean no-extension context is still untested.

Static launcher (2026-10-27): Word origins moved from `optional_host_permissions` to
`host_permissions` and `word/launcher.js` became a declared content script, so the button appears
on load without an Enable step. Removed the runtime permission request and dynamic registration;
background only re-injects into tabs that finish loading. Verified in the extension build:
button visible on the document route, hidden on the Word home route, and the setup page shows the
connected state with no `#enable` control. Trade-off: Chrome now warns about SharePoint/Word
access at install and the extension has DOM access to those origins, not only the open document.

Layout and auto-start (2026-10-27): the review is a two-pane workspace - document preview on
the left (sticky, own scroll) and findings/settings/actions on the right - replacing the single
760px column. The hero is hidden once a review starts, `Inventory` moved into the pane header, and
the standalone inspection section was merged into the preview pane.

Opening the setup page from the launcher with a Word tab reference now reads the saved copy
automatically; the button becomes `Read again` and a compact `Read again` control sits in the
review header. Opening the page manually still requires an explicit read.

Verified at 1500x1000: preview and findings render side by side, 12 finding rows visible, apply
and publish controls reachable, `Read again` present, and no page errors. At <=980px the grid
collapses to one column with a capped preview height.

Review workspace and share gate (2026-10-28): the preview is now a live before/after pair. The
left pane keeps the original with checked findings marked solid and unchecked ones dashed; the
right pane renders “what others will see” with replacement tags, manual phrases and range mode
applied as you toggle. `Show original` collapses the left side. Model-sourced rows show their
score (for example `Local model: PERSON - Model score 40%`); rule and money rows say
`Rule-based`.

Actions were compacted so findings keep most of the right pane. Applying now hides the apply
button and reveals Download and Create link with the relay target in plain text. Changing a
finding, category, amount mode, manual phrase or image after applying invalidates the copy,
hides the share panel and asks for a new apply; this prevents linking a stale sanitized file.

Images: thumbnails are 480x300 with an `Open large` lightbox (up to 90vw). Dragging draws the
rectangle live and reports `Area W x H px`; marked areas are burned black in the thumbnail.
Area coordinates stay in bitmap space so the same rectangle is burned on export.

Verified at 1500x1000: model score badge present; removing the `profile` category reduced preview
marks from 20 to 17; applying produced `20 text replacements across 2 parts` and revealed the
share row; toggling a finding afterwards hid the share panel, restored the apply button, disabled
link creation and showed the stale-copy message. Re-applying and creating a link produced a
recipient preview with 2 tables and `[REDACTED]` values, without `4,800`; revoking made the link
report "Link Expired or Revoked". At 900x1000 the page had no horizontal overflow and the review
stacked into one column. `node tests/run_all.js` passed 54/54.

Still open: image text needs manual marking (no OCR), charts/OLE are counted but not rewritten,
and the recipient path was exercised in the same Playwright profile.

Document-first layout (2026-10-28): the review now keeps the document large. The grid is 1.5:1,
so at 1500x1000 the preview is 764x750 and findings are 509 wide with a 677px scroll area (about
seven rows). Images and share controls moved out of the findings column into a full-width row below
the workspace: an image card about 696px wide on the left and `Share & export` on the right. Its
summary reports `Images: 1 not marked - Share & export`, then `all marked`, `Sanitized copy ready`
or `Link live` as state changes.

Before/after stacks vertically when the preview is narrow (<=1350px); below 1100px the whole review
stacks with normal page scrolling. The lower row stays in document flow, and the review grid keeps
its height. Verified at 1500x1000 and 1000x1000: no horizontal overflow, the image text is readable
without the lightbox, apply/link/revoke update the lower label, and `node tests/run_all.js` passes
54/54.

Findings below and select-to-redact (2026-10-28): the preview is now full width at the top,
followed by findings in a card grid (three columns at desktop width; 18 cards at about 342px),
then images, then sharing. A sticky section nav reports `Findings 18`, `Images 1 · 1 unmarked`
and jumps between sections; `Show in preview` scrolls the page back to the preview and highlights
the value.

Selecting text in **Original** or **What others will see** shows a floating `Redact "…"` button
next to the selection, with a permanent `Tip: Select text in either pane to redact it.` line.
Verified: selecting `Northbridge Advisory` raised findings 18→19; selecting `People Operations`
in the sanitized pane raised it to 20; selecting `[REDACTED_FINANCIAL]` reported
`That part is already redacted.` and added nothing. The sanitized pane strips placeholder tokens
before adding visible text. At 788 CSS px the grid collapses to one column with no horizontal
overflow. `node tests/run_all.js` passes 54/54.

Maybe important, preview toggles and synced scroll (2026-10-28): the section is now titled
`Maybe important` and renders only model candidates. Cards read `Possible person - Model score 78%`
from the NER label; rule and manual detections are not listed. Model suggestions fully covered by a
longer finding (for example `Okafor` inside `M. Okafor`) are dropped so they cannot show a toggle
that has no effect. The first page holds six suggestions with `Show 6 more suggestions` /
`Show fewer suggestions`; the nav reports the model count. On the HR fixture this showed
`Maybe important 7`, `6 of 7 shown`, and the seventh after Show more.

Automatic detections remain active. Clicking a highlighted value in Original, or a redaction tag in
What others will see, toggles it for the whole copy and the status line reports that it is now
visible or redacted. Verified: unredacting `4,800` in Original changed `16/16` to `15/16`;
clicking the token in the sanitized pane redacted it again; clicking the `960` token made `960`
visible. `Keep all` / `Hide all` change only model suggestions, leaving automatic money redaction
untouched. On the HR fixture, Keep all changed `24/24` to `17/24` (seven names visible) while
money stayed hidden; Hide all restored `24/24`. Applying produced
`18 text replacements across 2 parts` and a verified result. The floating button still measured
38px high.

Preview scroll sync maps the top block plus its fraction between panes; verified at scroll 400 and
250 that both panes reported the same block and fraction. `node tests/run_all.js` passes 54/54.

Public relay and release package (2026-10-28): deployed `safeshare-relay` with the current viewer
assets (4 files changed). The public `/v/app.js` now contains the `kind === "document"` branch and
the `Download sanitized DOCX` control. A synthetic v4 document payload, not a user file, was
uploaded with a one-hour TTL and opened in a fresh browser context without the extension: the
click gate, `SafeShare - Reviewed document`, the preview text and table, and the download button
all rendered. Revoking the share and reloading showed `Link Expired or Revoked`.

Extension packages were bumped to 2.5.0. Both ZIPs contain `word/`, `viewer/` and `models/`; SHA256
checksums are written to `dist/SHA256SUMS`. The local `safeshare_relay` override was removed from
the test profile, so it uses the public relay by default. This does not publish the extension in a
store; GitHub release ZIPs still need to be installed manually or deployed by policy.

## v2.4.1 local check (2026-10-26)

- Node: **52/52** regression tests passed locally (`npm test`), including new viewer-Markdown,
  chat-id, vault-promotion, and percentage-false-positive cases.
- Live ChatGPT (Chromium 155, unpacked v2.4.1): a `\texttt{<S1>}` reply hydrated to
  `$2,400 / $1,440 / $960 / $4,800`; the `🔒 1 value protected` note survived a reload; the
  `local-chatgpt:<uuid>` → server-UUID route swap kept the same vault entry.
- Hosted viewer (local relay, extension disabled): headings, table, lists, and the fixed
  **Continue** bar rendered; `spend 15% on hobbies` stayed visible after the short-expense fix.
- README capture `06-before-send-symbols.png` re-shot on 2026-10-26 in ChatGPT dark theme
  (Chromium 155, v2.4.1, local relay). The user bubble, which carries the injected
  privacy-protocol suffix, was made transparent in-frame; the sent-note, reply table, computed
  values, `Protecting amounts` chip, and composer are unedited. The free-tier ad slot and the
  account avatar were hidden; no product UI was altered.
- README capture `07-fragment-boundary.png` taken on 2026-10-26 with v2.4.1 against the local relay.
  A fresh `--ttl 3600` share was opened through the viewer's click-to-open gate; the page then
  requested `/api/share/<id>` with no fragment. The two commands and their output in the crop are
  the page's own DevTools console, unedited except that the 43-character key is replaced by
  `#<key>`. The share was revoked after the capture.
- Not re-verified here: live Claude and DeepSeek after login, and Firefox runtime after the
  2.4.1 package build. Treat those as open until run.

## GitHub readiness checks (2026-10-25)

Local remediation on base `1af71c1`: the model-runtime review harness now checks
the current preselected-suggestion policy and button `aria-pressed` state instead
of the old unchecked-checkbox UI. The publication failure fixture also targets
the current review button. Stale model results now display the text-changed warning.

Windows local checks passed: Node 48/48 (after remediation), evaluator self-checks,
Chromium and Firefox credential/lifecycle fixtures, both hosted local relay browser
checks, and real Chromium extension ONNX inference plus share-dialog checks.
These results do not establish Linux CI success, live vendor compatibility, or
held-out detection accuracy. Verify the pushed commit in GitHub Actions separately.

Release package check on 2026-10-26: extracted 2.4.0 Chrome and Firefox ZIPs passed
actual ONNX inference and share-dialog checks (Chromium 149 and Firefox 158).
Apache-2.0 section 4(d)'s omitted notice text was restored against the official
license; the existing copyright is retained.

## Release regression additions (2026-10-21)

`manual_redact.test.js` covers URI-password echoes, prose-punctuation echoes, embedded
punctuation selections, adjacent salary corrections (including a financial assistant reply),
English earnings/slang, EIN/Medicare label variants, dot-grouped cards and public/MAC controls.
`local_compute_stress.test.js` checks unary negative multiplication. `submit_lifecycle.html`
also verifies a multiline English earnings prompt is protected and replayed once.
These are development regressions, not evidence of arbitrary paraphrase or formula coverage.

Local release check on 2026-10-21 (base `ce6f4b4` plus uncommitted remediation):
Node 46/46, evaluator self-checks, Chromium/Firefox fixture suites and local relay browser
lifecycles passed (Playwright Firefox 142). Fresh 2.4.0 ZIPs were built; extracted Chrome and Firefox packages passed actual
ONNX/WASM inference and share-dialog smoke checks (Chromium 141, installed Firefox 158).
Firefox harness now requests graceful shutdown before cleaning its temporary profile.
These results do not verify logged-in vendor layouts, remote CI or remote relay deployment.

## English demonstration and local link release gate

`node tools/attack_bench/english.js` prints the 160-case fictional English challenge without
writing results. Add `--out <local-report.json>` for a detailed report. See
`tools/attack_bench/ENGLISH_RESULTS.md` for denominators, false hypotheses and the deliberately
reported base64 limitation. This is a CLI experiment, not a browser-model benchmark or holdout.

`node tests/relay_lifecycle.test.js` starts an isolated local relay and checks actual encrypted
roundtrip, concurrent burn reads (exactly one success), wrong/correct revoke tokens, POST-only
revocation and expiry. It never contacts the public relay. Temporary storage is removed afterward.

`python tools/eval/relay_browser.py` and `--browser firefox` exercise the hosted viewer with actual
local ciphertext: no payload read before opening, ignored synthetic click, trusted click decryption,
burn and revoke. Browser traffic stays local and uncaught page errors fail the test. This is not
the extension-hosted viewer or a logged-in chat-site test. CLI and hosted viewer use production code;
fixture checks of preview/encryption are separate. See `DEMO.md` for the English rehearsal.

## Share workflow lifecycle regressions

`python tools/eval/credential_browser.py` (or `--browser firefox`) runs the production scripts
against local fixtures. All fixture traffic is restricted to the local origin; uncaught page
JavaScript errors fail the run. Additional fixtures:

- `submit_lifecycle.html`: pending NER plus rapid clicks, edited draft, navigation, replay-delay
  double click, immediate next draft, and native form submission. A changed composer/chat/mode cancels the pending send;
  users must review and send again. The draft is not overwritten by the old result.
- `extraction_integrity.html`: mixed legacy/modern role layouts, ordered turns, multi-block
  answers, headings/tables/code and composer exclusion. This does not prove all historical or
  virtualized turns are present in a vendor site's DOM.
- `model_lifecycle.html`: old scans cannot continue after close/reopen, late responses cannot
  populate new review state, changed scan text is marked stale, manual choices survive, and model
  failures unlock controls without claiming a clean result. Closing during encryption cancels
  the subsequent upload. An already in-flight network upload cannot be recalled by closing UI.
- `maybe_review.html`: publication locks/snapshots before awaiting earlier-link revocation;
  repeat clicks during that wait cannot publish twice. DOM preview equals decrypted turns.

Live vendor checks attempted on 2026-10-20: Claude/DeepSeek required login; ChatGPT was logged
out and SafeShare was not installed in the interactive browser. No vendor prompts were sent and
these sites are NOT considered end-to-end verified by the fixture results.

To test a built/extracted package instead of the source extension, set
`SAFESHARE_EXTENSION_DIR` to that package's directory before running `chrome_ner.py` or
`firefox_ner.py`. The Firefox harness rejects a Chromium manifest. Clear the variable afterward
to return to source testing. These harnesses use temporary profiles and never upload shares.

## Model-upgrade correction checks

`node tests/ner_decoder.test.js` exercises the actual decoder with controlled logits: English
names containing `Di Yang`, repeated Indonesian marker words and mixed messages must never
disable the full scan. Native PERSON/LOCATION labels remain intact. `ner_client.test.js` checks
malformed/partial responses, transport failure and checked-empty results. The real Chrome/Firefox
model harness runs mixed-message name coverage and checked-empty tests too.

Model quality is English-focused. Removing the old language-word bypass can expose noisy
non-English suggestions; this is not fixed by pretending those messages were checked with no hits.
Historical baseline benchmark tools read MiniLM from git commit `fb35c63` into an external
experiment folder and verify identity instead of relabelling the current BERT file as MiniLM.
Run those tools from a repository with that commit available (full history, not a shallow clone).

Chrome users loading the repository folder must reload the extension and refresh chat tabs after
pulling. Firefox uses a built Firefox ZIP (its manifest is installed as manifest.json); `dist/` is
ignored and is NOT downloaded by git pull. Build with Python or obtain a separately published
release asset. Extension inference itself needs neither Python nor a separate model download.

## Credential boundary regression

`node tests/credential_boundaries.test.js` checks exact original value spans, preserved surrounding
text, and the production CLI on credential, grouped identifier, address and coordinate cases.
`python tools/eval/credential_browser.py` runs the production content script and share preview
three times in Playwright Chromium. It checks all/off/amounts modes, raw-text sharing, and DOM
preview equality with the decrypted payload via fake relay messaging; no real shares are uploaded.
It also runs the existing maybe/range/hydration-sanitizer browser fixtures.
Requires Playwright and its Chromium browser. For interactive inspection, serve the repository
and open `/tests/fixtures/credential_review.html`; the result must begin with `PASS:`.

GitHub Actions is configured to run the Node suite and this browser regression separately;
remote execution must be checked after push. These checks do not measure multilingual NER
accuracy or verify logged-in vendor layouts. Bounded support now covers EN/ID digit-word OTP,
anchored letter-spaced email, integer Indonesian amounts, and six grouped IBAN countries
(DE/GB/FR/NL/ES/IT). This is not universal language or international identifier support.
Contextual detection excludes hard-identifier spans in the original text before numeric analysis.
Remaining work: comprehensive model holdout, full shared span arbitration/NER integration,
broader address/ID/command grammars, and real-site lifecycle verification.

Financial replacement tests include hyphen/slash/dot/Unicode identifiers containing a known
salary. Every financial base/derived regex replacement is checked at its actual match boundary,
not only at regex construction; solver numeric lexing uses the same boundary check. Heuristic
overlap tests verify that losing candidates cannot silently expose their sensitive remainder.
Browser fixture traffic is restricted to the temporary local server origin; external attempts fail.

The Chrome/Firefox model harness also prints nine development diagnostics (not held-out accuracy),
with additional EN names and benign security/technical sentences. Current runtime covers the two
ID name components as one span and suggests an entity on one benign EN technical sentence. Do not
interpret smoke success as a clean false-positive rate; model/thresholds remain unchanged pending
a real holdout.

## English-first positional evaluation

`python tools/eval/test_score.py` checks the evaluator and runs the production heuristic scanner
on `tests/fixtures/english_credentials.jsonl`, also loaded by the browser fixture. This is a
development regression corpus, NOT a held-out benchmark. `run_safeshare.js --heuristics-trace`
exports value-only edits, converting JavaScript UTF-16 positions to Python code-point offsets.
Unsupported trace/context transformations fail instead of inventing positions.

`score.py` rejects missing/duplicate/extra IDs and malformed or inconsistent edits. With edit
traces it reports full-span recall, character coverage, partial spans, exact-span P/R and changed
non-sensitive characters. The old value-absence/token-count scores remain labelled diagnostics
for cross-tool compatibility: they can pass a partial mask and must not support security claims.
Trace coverage does not prove resistance to arbitrary encoded re-emission or inference. Full
CLI/model/solver edit provenance and an independently annotated holdout remain unfinished.

## Cross-browser local model and banking review

Build fresh packages with `python tools/build_extension.py`. Chrome loads `extension/manifest.json`;
Firefox loads `manifest.json` from an extracted Firefox ZIP, not the Chrome source manifest.

- In both browsers, use fictional checking/savings/loan IDs and click each badge. Only the chosen
  ID should appear, across all its occurrences; card last-four digits must never become money ranges.
- Expiration `08/27` and the same month-name echo near card context should be hidden together.
  Unrelated conference dates and `[have address ready]` must stay unchanged.
- Click **Check names and other PII with local model** in the share dialog. It should report
  loading/checking, then checked, and add unchecked model suggestions. Check one to hide it.
- Model errors/timeouts must display unavailable status, not "no candidates" as if a scan succeeded.
  Re-run after changing the reviewed text. Do not interpret model scores as calibrated probabilities.

Automated real-browser checks (isolated temporary profiles, fictional data, no relay upload):
`python tools/eval/firefox_ner.py` uses installed Firefox and stdlib Marionette transport;
`python tools/eval/chrome_ner.py` uses an existing Playwright Chromium installation. These test
actual packaged ONNX/WASM inference and share-dialog ID clicks/model suggestions. They do not
prove held-out accuracy or verify the DOM of logged-in vendor sites.

## Experimental “Maybe sensitive” share review

Test in Chrome and Firefox, with both reader profiles. Use fictional data only.

- Open the share dialog on `access_token: OddSecret42` followed by an assistant echo of
  `OddSecret42`. Both should be hidden by one checked suggestion.
- Untick it: both reappear. Creating the link asks about visible possible credentials;
  cancelling must not upload anything. Recheck and publish: viewer text matches the preview.
- Try `Z8kL2mN7pQ4rS9tU6vW3xY`: suggestion starts unchecked. Docker `-p 8080:80`, Git hashes
  in Git commands and existing placeholders should not become suggestions.
- Use Tab/Space to operate checkboxes, including after the preview rebuild. Candidate labels
  announce the reason and count; focus stays on the checkbox. Long lists remain scrollable.
- Close and reopen: decisions reset. Disable the network: scanning still works; a failed
  publication unlocks controls without losing the review.

Automated checks: `node tests/maybe.test.js` (offline encrypt/decrypt with fake relay messaging)
and `node tools/eval/maybe.js` (fictional development screen, not held-out accuracy).

Real DOM self-check: serve the repository with `python -m http.server 8791 --bind 127.0.0.1`,
then open `http://127.0.0.1:8791/tests/fixtures/maybe_review.html`. It must end with `PASS`.
This fixture uses fake relay messaging and never uploads a share. It checks distinct amount
badges, reset, overlapping selections, numeric credentials, variable exclusions, checkbox focus,
control locking, failed-publication recovery and decrypted content against the actual DOM preview.
Run in Chrome and Firefox; this does not replace testing the installed extensions on chat sites.

On-screen sums: open `/tests/fixtures/hydration_sanitize.html` on that same server. It must end
with `PASS`: the site's own answer markup is kept, while `javascript:` / `data:` links, script,
svg, form and iframe tags, `on*` handlers and markup in formula text never reach the page.

For IDR range/toggle and formatting checks, open `/tests/fixtures/range_review.html` on that
same local server. It must report `PASS`: one KaTeX representation, readable headings/tables,
clickable ranges, revealed IDR amounts staying visible, and no buttons with unavailable originals.
Arithmetic LaTeX is simplified to readable text; full TeX layout is not supported. Revealing an
exact amount intentionally can make another hidden amount inferable.

Everything runs on your laptop with fake data. Tick each box; if something fails, note the site,
the test number and what you saw (a screenshot helps).

Automated tests cover the engine, relay, CLI and proxy: the current working-tree run ends with `47/47 passed` (the count includes the local license test).
This list covers what needs a real browser and your logged-in chat accounts.

## 0. Setup (once, ~5 min)

1. Start the local relay and leave the window open:
   ```bash
   python relay/server_local.py
   ```
2. Chrome → `chrome://extensions` → turn on **Developer mode** (top right) → **Load unpacked** →
   pick the `extension` folder of this repo (not a zip, not the repo root).
3. Point the extension at the local relay: on the SafeShare card click **service worker**, and in
   the console that opens run:
   ```js
   chrome.storage.local.set({ safeshare_relay: "http://127.0.0.1:8787" })
   ```
   (Back to Cloudflare later: `chrome.storage.local.remove("safeshare_relay")`.)
4. Open ChatGPT (also Claude, DeepSeek later) and **refresh the tab**.

After any code change: click the reload ↻ on the SafeShare card, then **close and reopen** the
chat tabs (an old copy keeps running in a tab that was open during the reload). Check the page
console (F12): it should say `[SafeShare-AI] Extension content script active (v2.4.1).` If you see
`[REDACTED_NIK]` instead of `[NIK_1]` in a sent message, the tab is still running old code.

Quick check without ChatGPT: `python -m http.server 8790 --bind 127.0.0.1` in the repo, open
`http://127.0.0.1:8790/tests/fixtures/fake_chat.html` in an Incognito window (the page loads the
current scripts itself; no name model there), type into the box and click Send.

Where to look when something is off: the chat page's console (F12) shows `[SafeShare-AI]` lines;
the name model's console is under the SafeShare card → **Inspect views: offscreen.html**.

## 1. Protection before sending (ChatGPT, then Claude and DeepSeek)

Use a **new chat** for each prompt. The chip above the input box shows what will happen; click it
to pick a mode. Keep **Protect IDs + amounts** unless the test says otherwise.

**1a. Personal details**

> Hi, I am Rina Kusuma and I live in Bandung. My wife Sarah and I want to plan our savings. My
> salary is $5,000 a month and my NIK is 3201012304950001. If we save 20%, how much per month
> and per year?

- [ ] While typing, the chip says "🛡️ 2 items will be protected" (salary + NIK)
- [ ] Your sent message reads roughly: "Hi, I am [NAME_1] and I live in [PLACE_1]. My wife
      [NAME_2] … salary is <S1> a month and my NIK is [NIK_1] …", followed by a
      "[PRIVACY PROTOCOL: Treat <S1> as an exact fixed parameter…]" note (that's what the AI received)
- [ ] If the names are still there and the chip briefly says "Sent without the name/place check
      (local model not ready)": the model was loading. Send another prompt and check again; note
      it if it keeps happening
- [ ] In the answer, `[NIK_1]` / `[NAME_1]` show the real values in blue with a dashed underline;
      hovering says "Only on your screen. The AI received [NIK_1]."
- [ ] Amounts in the answer show real computed numbers on your screen (e.g. $1,000 / $12,000)
- [ ] Under your own message: "🔒 N values protected · show". Clicking lists `[NIK_1] = …` and
      `<S1> = …`; your message itself keeps the placeholders, and the share dialog never shows the note

**1b. Fiction is left alone**

> Write a short story about Geralt travelling to Novigrad.

- [ ] Sent exactly as typed (no [NAME_…] / [PLACE_…])

**1c. Passwords and OTP**

> Password m-banking aku Sup3rRahasia9 kesimpen di notes. Tadi dapet OTP 482913 dari bank.

- [ ] Sent as "Password m-banking aku [PASSWORD_1] kesimpen di notes. Tadi dapet OTP [OTP_1] dari bank."

> I change my password regularly. Is that enough?

- [ ] Sent exactly as typed (prose is not a password)

**1d. Look-alike characters** (copy this exactly: the first `а` in the email is Cyrillic)

> Mail me at аlice@example.com or call +62 812 3456 7890.

- [ ] Sent as "Mail me at [EMAIL_1] or call [PHONE_1]."

**1e. A name late in a long message** (the model used to stop reading after ~100 words)

> Paste any ~200-word paragraph first (e.g. a news article), then add: "Also, my friend Sarah
> Connor needs advice."

- [ ] "Sarah Connor" is sent as [NAME_…]

**1f. Modes**

- [ ] Chip → **Protect amounts only**, send 1a again: NIK and names go through, the salary is <S1>
- [ ] Chip → **Off**: sent exactly as typed
- [ ] Open the SafeShare share dialog: its before-sending toggle matches the chip (off/on), and
      switching it changes the chip too

## 2. Sharing a chat

Sharing is tested on a chat that still has real values in it, so set the chip to **Off**, open a
new chat, send prompt 1a, wait for the answer, then click the **SafeShare** button.

- [ ] The dialog's "Original" side shows **both** your message and the answer, in order
- [ ] The redacted side hides Rina, Sarah, Bandung, the salary, the NIK, and the answer's derived
      amounts ($1,000 / $4,000 / $12,000 or whatever it computed)
- [ ] "20%" is still visible (ratios are kept on purpose)
- [ ] **Amounts → Show as range**: the salary becomes a band like "$5k–$10k"; derived amounts stay hidden
- [ ] **Reader → Someone I trust**: names and amounts come back; the NIK stays hidden
- [ ] **Customize Items** → untick one item: it reappears in the preview

Look-alike email in a share: chip **Off**, new chat, send 1d, click SafeShare:

- [ ] The email is hidden on the redacted side

A chat that was protected before sending (any chat from section 1 with the chip on):

- [ ] The dialog title says "Nothing new to hide · placeholders are kept as they are" (or hides
      only new things); the placeholders stay placeholders

## 3. The link

Back in the 1a share dialog (chip-Off chat), choose **Expires after: 24 hours** → **Create Private Link**.

- [ ] The link starts with `http://127.0.0.1:8787/v/`, and the relay window prints `Stored encrypted payload`
- [ ] Open it in a **normal** tab: the address changes to `chrome-extension://…/viewer/index.html?relay=…`
      and the card says "Opened inside the SafeShare extension…"
- [ ] Click **Open conversation**: the chat shows exactly the redacted version
- [ ] Open the same link in an **Incognito** window (extension off there): it stays on
      `127.0.0.1:8787`, says "Decrypted by this page, served by the relay…", and works after the click
- [ ] Before clicking **Open conversation**, nothing was fetched (relay window prints no `Retrieved`)
- [ ] In the dialog click **Revoke**, reload the link: gone

Burn-after-reading: make a new link with **Burn after 1 view**.

- [ ] First open + click: the chat shows. Reload: "Link Expired or Revoked"

## 4. Continue in a new chat

Make a fresh 24-hour link and open it in a normal tab (inside the extension), click **Open conversation**.

- [ ] Click **ChatGPT**: a new ChatGPT tab opens and, within a few seconds, the input box is filled
- [ ] The pasted text starts with "Continue an earlier conversation…" and contains placeholders, not real values
- [ ] Repeat with **Claude** and **DeepSeek**

## 5. Attacks from the command line (optional, no browser)

```bash
echo "[REDACTED_DATE] is a Tuesday, the day after my birthday on the 14th." | node bin/safeshare.js invert
```
- [ ] Lists 3 possible dates (the hidden date is recovered to a handful of days)

```bash
echo "I am the only female cardiologist at a 50-bed hospital in Blitar." | node bin/safeshare.js invert
```
- [ ] Prints a warning that the details together may point at one person

```bash
node bin/safeshare.js redact examples/chat_original.txt | node bin/safeshare.js invert
```
- [ ] "No hidden values recovered."

## 6. Firefox (optional)

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json` inside the
unzipped `dist/SafeShare-<version>-firefox.zip` (build it with `python tools/build_extension.py`).
Repeat 1a and section 3. Firefox supports the local name model; real-extension review showed
"Local AI model checked". Do not expect names to be skipped solely because this is Firefox.

### Verified follow-up checks

- `[UNIT]` Originals regression excludes existing placeholders while preserving real originals.
- `[UNIT]` Local relay HEAD reports share status without consuming burn shares; malformed JSON/TTL returns a stable error.
- `[REAL-EXT]` Isolated Firefox: publish, extension-viewer decrypt, originals, revoke and ZIP install passed.
- `[REAL-EXT]` Security modal has dialog semantics, focuses its close button, and returns focus to Security on close.
- Firefox viewer inspection used a temporary profile with `-remote-allow-system-access` and
  `extensions.webextensions.remote=false`. Privileged-script clicks are not evidence for the synthetic-click gate.
- `[BLOCKED]` Firefox before-send On remains unverified because the harness could not locate its menu option.
- `[FIXED 2.4.1]` ChatGPT first-message note disappearance: the temporary `local-chatgpt:<uuid>`
  mapping is promoted to the server UUID (live-verified across a reload). Re-run after future DOM
  changes.
- Escape/Tab focus handling and revised decrypt errors still need dedicated browser verification.

## Report back

For anything unticked: which site, which test, what happened. The chat sites change their page
structure often, so sections 1 and 2 are the most likely to need a fix.
