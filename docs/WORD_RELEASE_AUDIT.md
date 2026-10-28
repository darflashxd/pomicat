# Word release audit — 2026-10-28

Base: `aec63bb` (2.5.0). Working tree was clean before adding the audit harness.
Reviewed Word commits from `37f14bf` through `aec63bb`; authorship is not evidence
that a change was made by a particular model. This is a focused Word release
audit, not a completed penetration test of every chat integration.

## Reproduce

```powershell
node tests/run_all.js
python tools/audit_word_release.py
```

Python needs python-docx, Pillow, Playwright and its Chromium installation.
Artifacts go to `%LOCALAPPDATA%\Temp\opencode\word-release-audit`.
No Microsoft session or public relay is used. No production files were changed.
The harness intentionally records known vulnerabilities rather than claiming
that a passing baseline assertion means the product is safe.

## Results

The existing Node suite passed 54/54. The browser harness executes production
`docx.js` and `redact.js`, then independently opens the output with Python's
zipfile. Expected private and public sentinels are chosen before execution.

| Case | Input bytes | Browser processing | Independent result |
|---|---:|---:|---|
| Long text document | 41,986 | 0.11 s | Selected canary removed; 45 tables and public sentinel retained |
| Image-heavy archive | 10,863,336 | 3.86 s | Parser and sanitizer accepted; 4 images decoded; output 10,861,478 bytes |
| Custom properties | 42,321 | 0.19 s | Private canary survives; verifier incorrectly says clean |
| Custom XML | 42,145 | 0.20 s | Private canary survives; verifier incorrectly says clean |
| 9 MiB inflated entry | 51,297 | 0.02 s | Rejected: Unsupported or oversized DOCX part. |
| Company metadata | 42,020 | 0.22 s | Private canary survives; verifier correctly rejects output |

Timing includes browser transfer, parsing, sanitization and base64 return; it is
not an isolated CPU benchmark. Random image bytes vary slightly on subsequent
runs. The large fixture contains valid PNG media parts but no drawing relationships:
it tests archive handling and decoding, not Word rendering of placed images.

The long fixture has 45 sections with page breaks, 540 body paragraphs, 45 tables,
headers and footers. Page count was not measured in Word. Its repeated secret is a
synthetic canary. This run supplies an explicit redaction rule; it does **not**
measure NER recall or automatic detection accuracy on the narrative.

## Confirmed findings

### High: hidden package parts survive a successful verification

`extension/word/redact.js:243-268` only rewrites its selected text parts and
core/app properties. `docProps/custom.xml` and `customXml/*.xml` are retained.
`VERIFY_PART` at lines 276-291 excludes both locations.

Reproduction: run the custom-properties and custom-xml cases. Open their
`*-sanitized.docx` ZIPs and inspect the reported leftover part. The exact selected
canary remains, despite `verificationClean: true`. A recipient can extract it.

Remediation: define supported package content explicitly. Remove unsupported
private-bearing parts with their relationships/content-type entries, or reject
the document. Verification must inspect supported semantic content independently,
including split text, rather than relying on the current narrow XML filename list.

### Medium: metadata removal leaves Company content

`cleanCore` at `redact.js:220-233` is also applied to `docProps/app.xml`, but does
not clear `Company`, `Manager` or arbitrary extended properties. The Company
fixture proves the omission. Here verification catches the selected canary, so
this specific case stops export in the UI. Unselected metadata can still remain.

### Product limit: 10 MiB is not supported by Word capture

`extension/word/setup.js:41-43` rejects a Content-Length or streamed body over
5 MiB. The direct parser accepts this 10.36 MiB fixture because each media part is
below 8 MiB and total inflated content is below 24 MiB. A successful parser run
therefore does not prove the user can open the same file through the launcher.
The capture error groups size rejection with access/download errors.

The 512 KiB ciphertext link cap also prevents sharing this fixture. Download-only
support for larger documents requires deliberate capture limits and memory tests.

## Code-review concerns requiring runtime reproduction

- `review.js` captures rules before awaited sanitization, but assigns
  `appliedSignature = currentSignature()` afterwards. Only Apply is disabled.
  Changing choices while sanitization runs may label old bytes as current.
- `publish.js` awaits relay configuration before constructing the payload and
  reads live preview/state. A snapshot or revision guard is needed to establish
  preview/DOCX consistency during concurrent edits.
- `setup.js` starts NER without a document generation check. A previous read's
  response can arrive after Read again and append candidates to the new document.
- Substring-based model suppression in `setup.js` and `detect.js` removes a short
  name globally when any longer value contains it. Standalone occurrences of the
  shorter name need occurrence-level testing before suppression is justified.
- `docx.js:56-59` only visits direct paragraph/table children. Content controls and
  other wrappers may contain text absent from detection and preview.
- `review.js` attack check uses a fixed set of numeric ratios and DOM preview text.
  Its negative wording is stronger than the coverage of that computation.

These are not reported as exploit-validated vulnerabilities in this audit.

## Evidence limits and release decision

Strix is installed but Docker Desktop's Linux daemon is unavailable, so no Strix
scan was run. The existing Node suite covers other project components, but this
audit did not re-run logged-in ChatGPT/Claude/DeepSeek workflows, Firefox runtime,
Cloudflare lifecycle, NER quality, cross-device delivery, or ZIP-installed extension
startup. No memory profiling or independent Word layout comparison was performed.

Do not describe 2.5.0 as safe for arbitrary confidential DOCX packages on this
evidence. Fix the confirmed hidden-part leaks first, reproduce the async concerns,
then run the full launcher/export/recipient flow against a standards-valid corpus
with placed images, revisions, comments, equations, OLE and content controls.

No release, push or deployment was made as part of this audit.

## Local remediation follow-up

Working-tree changes after the audit:

- Custom properties are emptied when metadata removal is enabled; the part stays
  present so existing relationships/content types remain valid.
- Company, Manager and HyperlinkBase are cleared along with the existing metadata.
- Any `customXml/` part stops export explicitly. This also rejects unused
  bibliography custom XML from some standard templates. No claim of full custom
  XML/data-binding support is made.
- Verification includes all docProps XML and custom XML and, in the browser,
  checks decoded aggregate XML text as well as raw XML.
- Apply compares the original source reference and pre-operation signature before
  accepting generated bytes. Publish snapshots bytes and preview before awaiting
  encryption and rejects a changed review before starting upload.
- Late initial NER results are ignored when the source document has changed.

`python tools/audit_word_release.py` now asserts both metadata cases have no
independent leftovers and that custom XML is rejected. The fixture baseline removes
python-docx's unused bibliography custom XML with its relationships/content type
before generating supported-content cases. Latest 10 MiB processing was 4.11 s;
this still does not increase the 5 MiB Word capture limit.

These changes are local, not yet a replacement release. Shared chat/Word pipeline
extraction, occurrence-level alias handling, unsupported object inventory, in-flight
upload lifecycle tests and full async browser reproduction remain unfinished.

### Shared-engine implementation started

- Apply now saves a snapshot containing bytes, recipient preview, signature and
  review generation. Publication rejects a stale snapshot even before a debounced
  preview update runs. It no longer reads live preview DOM after starting upload.
- Read again increments generation immediately. Initial NER, re-scan and Apply
  discard results belonging to an earlier generation.
- If review changes during an in-flight upload, the resulting link is identified
  as belonging to an earlier reviewed copy, with revoke retained. Further link
  creation is disabled until the snapshot is current again.
- Chat's attack-check implementation was extracted into `SafeSharePolicy.attackCheck`.
  Both modal and Word call it. Word supplies role `document`, not a fabricated user
  role. Amount/date checks are shared; chat-only user quasi-identifier reporting
  retains its existing role semantics.
- `tests/word_publish_snapshot.test.js` exercises stale input, changed generation
  during encryption, and successful publication with the saved preview.
- `tests/shared_attack_check.test.js` checks chat/document numeric and date result
  parity and verifies both consumers call the shared function.

This is an incremental migration, not completion of the plan. Candidate/model and
range policy migration, shared bounded ZIP reader, independent occurrence mapping,
valid placed-image capacity tests and package-level browser validation remain.

### Bounded reader and placed-image fixture follow-up

- Inspection now calls the same bounded `SafeShareWordRedact.unzip` as sanitization
  and verification. The reader validates actual inflated lengths, central/local
  method and flags, duplicate/path constraints, archive limits and CRC32.
- Image decoding failures now stop inspection rather than creating an unusable
  review card. A decoded bitmap over 16 million pixels is rejected; this is a
  post-decode guard, not a guarantee against peak decoder memory allocation.
- `tests/word_archive_bounds.test.js` checks valid round-trip plus corrupt CRC,
  oversized entry and traversal rejection, without requiring a local fixture.
- The large fixture now uses python-docx `add_picture` so media has actual drawing
  relationships and placement. Playwright parsed and sanitized 10,863,280 bytes
  in 4.00 seconds with four images, 45 tables and no selected canary leftovers.
  This is still a browser engine test, not a Word Online capture/layout test.
- Word range bucket boundaries now call the shared engine policy. Currency parsing
  and presentation migration remain unfinished.
- Node regression suite: 57/57 passed. No upload, deployment or release was made.

### Shared model suggestion follow-up

Word NER now passes model spans through `SafeShareMaybe.scan`, the same suggestion
policy used by the chat review. It inherits label validation, model scores and
default risky/optional decisions instead of a name-only threshold. PERSON,
LOCATION and standalone SURNAME parity are exercised in
`tests/word_model_parity.test.js`; unsuccessful inference throws an incomplete-scan
error. Re-scan reports that error and prevents concurrent re-scan clicks.

Global substring suppression of shorter model values was removed from initial
capture and detection. This preserves standalone shorter names but is not a full
occurrence-based OOXML migration; the existing longest-span renderer still needs
explicit overlap/alias UX tests. Occurrences returned by the shared model scan
are chunk-local and must not yet be treated as document-global coordinates.

Sanitization now rejects chart/embedding/ActiveX parts and altChunk/dataBinding
elements. This is an explicit conservative gate, not a complete unsupported-object
inventory. Latest Playwright engine audit processed the placed-image 10 MiB
fixture in 3.81 seconds. Node suite reached 58/58 before the final re-scan error
handling change; rerun the suite before release.

### Additional convergence and regression checks

- Word numeric parsing now calls `ConsistentPseudonymizer.parseFinancialValue`;
  currency detection, bucket calculation and range formatting delegate to shared
  policy. Word retains only its SGD display adapter and hyphen presentation.
- Preview and OOXML writer now use the same `spansFor` matcher. Partially
  overlapping selected phrases merge into one `[REDACTED]` span instead of leaving
  a suffix visible in preview while export masks it. Unchecked candidates do not
  override selected overlaps. This improves matching parity but is not yet a full
  document-global occurrence map.
- The Playwright audit now asserts embedded objects are rejected. Unsupported
  non-bitmap media is rejected before export as well.
- Latest Node run: 58/58. Latest placed-image fixture: 10,863,796 bytes, 4.16 s;
  independent selected-value check clean. No live Word Online layout or capture
  test was run in this iteration. No release was published.

Remaining acceptance work: document-global occurrence identities and run mapping,
browser-level delayed-response UI tests beyond the VM publication regressions,
real Word capture/layout with the installed ZIP, Firefox runtime, and receiver
download/hash verification. The 5 MiB capture ceiling remains intentional until
those measurements are complete. Do not call the entire migration complete yet.

## Browser and package acceptance follow-up

`python tools/test_word_review_browser.py` runs the actual production Word page
and scripts under a local intercepted HTTPS test origin, with synthetic extension
storage/messaging and a deliberately delayed sanitizer. Chromium and Playwright
Firefox both passed inline money redact/restore, changing manual input during
Apply, and publishing before the manual-input debounce fires. Neither reported a
page error. Repeated runs against extracted Chrome and Firefox ZIP contents passed.
These are production-script browser tests, not proof of Microsoft login/capture,
installed extension permissions, ONNX execution, or Firefox extension installation.

Inspection now records paragraph identities (part + paragraph index) and text-node
run ranges. Active rules carry matching occurrences through those ranges. The
export still uses all-occurrences literal matching; per-occurrence selection and
persisting identities across removal of hidden/revision paragraphs are not complete.
No claim of a completed position-aware export migration is made.

Independent `python-docx` reopening exposed dangling thumbnail relationships after
thumbnail removal. Sanitization now removes corresponding relationship and content
type entries. The long and 10 MiB outputs reopen with 45 tables; the large output
retains four placed images and no selected canary. Latest large run: 10,862,311
input bytes, 4.23 seconds. Word rendering/page layout was not measured.

Current Node suite: 59/59. Package build produced ignored 2.5.1 ZIP artifacts;
the published 2.5.0 release was not replaced during this local test. Live Microsoft capture/layout and
receiver download/hash verification remain unverified in this session, whose
available Playwright tool catalog no longer exposes the previous logged-in
browser-code execution tool. Local Playwright browsers remain available and were
used as described above. No production relay upload, push or deployment occurred.

## Apply failure and delivery UX fix

The error node was inside the hidden capture section. It now lives outside that
section, and Apply's status includes the actual exception. Failure clears the
snapshot and delivery controls. Download independently rejects a stale snapshot.

Empty bibliography Sources parts from standard python-docx/Word templates are
recognized structurally and removed with their package references. Nonempty or
unrecognized custom XML remains rejected, as do data bindings. This is not blanket
custom XML support. The default-template fixture now sanitizes, verifies and
reopens successfully, while the private custom XML fixture still fails closed.

Production UI regression in Chromium and Firefox now also confirms the failure
reason is visible and an actual browser download has the expected SHA256 for the
synthetic snapshot. That download uses controlled sanitizer output to isolate the
UI delivery path; the separate audit exercises the actual DOCX sanitizer.
Latest audit: 10,862,645 input bytes, four placed images, 45 tables retained on
reopen, 4.02 seconds, no selected canary leftovers. Public relay and installed Word
capture remain outside this local test. No public release was updated.

## Structural DOCX and formula tests (2026-10-28)

`python tools/test_word_structures.py` exercises production `docx.js` and
`redact.js` in Playwright Chromium and Firefox with fictional documents. Each case
checks preview detection where applicable, independent ZIP/XML inspection,
package reopening, structure counts, and SHA256 of a real browser download.

Passed in both browsers:
- canary split across bold/italic/underline runs;
- merged cells and nested tables (2 tables, 3 merge markers retained);
- content control (wrapper count retained);
- sensitive value inside an OMML fraction, with equation count retained;
- public equation;
- tracked deletion removed;
- hidden run removed.

The preview now exposes equation text to detection. OOXML redaction includes
`w:t` and `m:t` nodes and inserts a matching separator between math/text nodes so
numbers on either side of a fraction cannot hide a boundary. Separators are not
mapped as document characters, so run replacement remains aligned.

Field instructions remain unsupported. If selected text appears in
`w:fldSimple/@w:instr` or `w:instrText`, the sanitizer stops with an explicit
field-instruction error rather than exporting. This is a deliberate fail-closed
case, not silent redaction.

`tests/word_formula_policy.test.js` checks a supported reconstruction: with the
monthly amount hidden, visible annual 57,600 and bonus 960 expose 4,800. It also
checks shared range output (`$2k-$5k`, `Rp 2-5 ribu`). This is a targeted policy
test, not proof that every formula shape can be inverted or prevented.

Latest results: Node 59/59; structural cases passed in both browsers; audit DOCX
large fixture 10 MiB with four placed images, 45 tables, independent selected
canary absent, reopening succeeded. Word Online capture and a real Microsoft
session were not tested because the available browser reached a Microsoft sign-in
page and no credentials were available. The 5 MiB capture ceiling remains.

## Live Word Online acceptance (2026-10-28)

A headed Playwright Chromium was loaded with the extracted 2.5.1 Chrome package
and a persistent profile. After Microsoft login, the saved HR severance letter
opened in Word Online. The launcher was visible.

A synthetic Playwright coordinate click on the closed shadow host did not open
setup, but dispatching the same mouse press/release through CDP did. The button's
click handler opened the setup page; this is recorded as an automation limitation,
not as a proven manual-click failure.

Capture returned 30 candidates (27 masked, 3 unmasked model suggestions; 13 model
suggestions, six shown initially). Apply completed with 19 text replacements and
no error. The downloaded DOCX was 34,983 bytes. The sanitized text did not contain
the tested names, password, connection string, salary or derived amounts; three
unchecked city suggestions remained visible by design.

A local relay on port 8788 produced a 104-character link. Opened in a separate
headless Chromium context with no extension, the viewer showed the click gate,
the document preview with redaction markers, no tested name, and downloaded a DOCX
whose SHA256 matched the sender file. Revoking the link made a reload show
`Link Expired or Revoked`. This is a local relay test; public relay lifecycle was
tested earlier with a synthetic payload, not this document.

## Large Word capture test (2026-10-28)
 
A fictional 8.94 MiB DOCX with four placed random PNG images was uploaded to Word
Online and opened in the logged-in Playwright browser. Capture succeeded with a
10 MiB fetch limit:
 
- 32 findings after model deduplication, 27 of them model suggestions shown six at
  a time; 5 automatic findings protected by default.
- Apply completed with 1,890 replacements across three package parts.
- The downloaded DOCX was 9,374,102 bytes with 19 ZIP parts and four media files.
- Creating a link was rejected with `This copy is too large for the current relay
  limit. Download the file instead.`; the download remained available.
 
The earlier 8.15 MiB run without deduplication produced 243 model cards because the
same phrase appeared in every model chunk. Candidate deduplication by normalized
value now keeps one card across chunks. This is a large-file capability test, not
a layout/page-count or memory benchmark. The limit is still 10 MiB capture and
512 KiB link ciphertext; larger links require a different storage design.
