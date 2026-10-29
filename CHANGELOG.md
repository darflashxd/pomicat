# Changelog

## Unreleased — audit hardening

- Keep CLI leak exit status consistent in text/JSON output; add bounded explicit ratio recovery.
- Public-looking labels no longer exempt direct percentage relations to known private amounts.
- Isolate new draft mappings by origin and page identity; retain identified legacy chat reads.
- Persist local burn before delivering ciphertext; refuse corrupt storage and bound revoke bodies.
- Use the shared nominal parser for Word decimal/grouping formats.
- Save chat revocation controls across page closure; validate viewer chat schema and share ID.
- Bound relay/viewer/proxy network waits; clarify expiry, size padding and watermark limits.


## 2.5.5 - Unreleased

- New links default to `blackline-relay.bleedguard.workers.dev`. The old relay
  remains supported; both Workers share D1. No schema or storage migration.
- Apply security headers to all routes on the new Worker with Worker-first
  static asset routing; disable preview URLs and keep cleanup on the old Worker.

- Rename the extension and active product UI to Blackline. Existing extension IDs,
  storage keys, relay endpoints and older links stay unchanged.
- Add the `blackline` CLI alias; keep `safeshare` and the `safeshare-ai` package.
- Build Blackline-named Chrome/Firefox ZIPs. Earlier releases and audit evidence
  keep their original names.

- Fix a DOCX math offset bug that left the first character behind. Verify XML
  text and attributes across package parts, including relationship destinations;
  selected external links are disabled and unsupported leftovers stop export.
- Keep proxy requests on the configured upstream and refuse redirects. Bound
  relay JSON streams before parsing, including revoke requests.
- Clear old Word review state when reading again fails. Trusted mode keeps rule
  identifiers protected. Word now runs the shared health/HR contextual checks.
- Keep different-currency overlap decisions consistent in preview and export,
  reject technical PIP false positives, and run Word/HR browser regressions in CI.
- Replace guaranteed RAM-erasure wording with best-effort cleanup wording.

- Fix HR badges that needed three clicks to reveal `performance improvement plan
  (PIP)`. Known contextual variants now toggle together in both directions.
- Keep record IDs and different currencies out of Word amount groups. Invalid
  number parses no longer join unrelated findings.
- Keep model labels, categories and replacements consistent across chunks, with
  document-relative occurrence offsets. Cancel oversized capture responses.
- Checked with 20 live MCP Playwright clicks, delayed model responses, and
  Chromium/Firefox regressions. See `docs/TOGGLE_PATCH_AUDIT.md` for timings and
  remaining capture limitations.

## 2.5.4 - 2026-10-28

- One click now changes every finding that points to the same value. Before, a
  salary written as `4,800` and `USD 4,800` produced two findings, so turning off
  `[REDACTED_FINANCIAL_1]` only revealed `[REDACTED_FINANCIAL]`; a second click was
  needed. Financial findings are grouped by parsed amount, and other findings by
  exact text, the same way chat review works.
- The finding checkbox and the Redacted/Visible button use the same grouped toggle
  as clicks in both preview panes.
- Live Word Online check: one click on `[REDACTED_FINANCIAL_1]` for `$7,850`
  revealed `$7,850` in both panes and cleared `7,850` and `$7,850` together. A
  second click restored both. Apply then produced 19 replacements and a
  34,983-byte DOCX.

## 2.5.3 - 2026-10-28

- Raise the Word capture limit to 10 MiB and distinguish oversize failures from
  access/permission errors.
- Deduplicate model candidates by normalized value across document chunks. A long
  document previously repeated the same phrase as dozens of separate cards.
- Live test: 8.94 MiB DOCX with four placed images captured in Word Online,
  1,890 replacements, 9,374,102-byte output with four media files. The 512 KiB link
  limit rejected the link with a clear download fallback.
- Link cap remains 512 KiB; larger links need a different storage design.

## 2.5.2 - 2026-10-28

- Word model candidates now strip role words (`doctor`, `manager`, `patient`) before
  scoring, so names like `Rebecca Louise Turner` are treated as person suggestions
  instead of low-confidence role phrases.
- Live Word Online test with the extracted Chrome package: 27/30 candidates masked,
  19 replacements, sender download 34,983 bytes. Local relay link opened without an
  extension, preview contained redactions and no tested names, recipient DOCX SHA256
  matched the sender file, and revocation worked.
- Added the detailed DOCX structure, formula, race, and package browser reports.

## 2.5.1 - 2026-10-28

- Security: DOCX custom properties and Company/Manager/HyperlinkBase metadata are
  cleaned; empty bibliography custom XML is removed with package relationships;
  nonempty custom XML, data bindings, embedded objects and unsupported media stop
  export. Verification covers all docProps/custom XML and reopens cleanly.
- Word: OMML equation text is detected and redacted without flattening equations;
  field instructions containing selected text fail closed with an explicit message.
- Review: Apply/link use a saved snapshot, stale generations are discarded, and
  download/link are disabled when choices change. Error reasons are visible outside
  the hidden capture section.
- Tests: shared chat/Word attack policy, model candidates, bounded ZIP rejection,
  formula ranges, publication races, DOCX structures, and real browser downloads.
  Local Node suite 59/59. Word Online live capture remains environment-dependent.

## 2.5.0 - 2026-10-28

- Word Online: a floating SafeShare button opens a separate saved copy of the document, so the
  original is untouched. The review page reads the copy once, then offers Read again.
- Word redaction edits the OOXML package in place. Tables, styles, headers, footers and equations
  stay in place; tracked deletions, hidden text, comments, metadata and thumbnails are removed.
- Detection uses the chat rules, money-column bases, the derived-amount solver and the local name
  model. The Maybe important section lists only model candidates as Possible person or Possible
  location with their score. Rule detections stay automatic and do not fill the list.
- Any highlight can be clicked in Original or What others will see to redact or restore it. Selecting
  other text adds a manual redaction. Scrolling one preview pane follows the other.
- Images open in a full-size lightbox. Marked areas are written into the pixels, then checked before
  export. Cropped areas that stay in the file are covered by Redact whole.
- A reviewed copy can be downloaded as DOCX or shared as an encrypted link with 24h, 3d or 7d
  expiry and revoke. The Cloudflare viewer now renders v4 document payloads and works without the
  extension.
- Limits: 512 KiB ciphertext cap, no burn-after-one-view for documents, image text needs manual
  marking, and SharePoint download depends on the tenant.

## 2.4.1 - 2026-10-26

- Viewer: headings, lists, blockquotes, links and horizontal rules now render instead of showing
  raw Markdown markers. Text is escaped before any tag is added, and only absolute http(s) links
  become anchors.
- Viewer: the dead-link message now says "Link Expired or Revoked" and names the three possible
  causes (expired, revoked, or already opened once) instead of "Shredded".
- Review: a percentage after a spending verb ("spend 15% on hobbies") is a ratio, not a short
  expense amount, and stays visible; the short-expense detector no longer masks the number.
- ChatGPT: the temporary `local-chatgpt:<uuid>` route is promoted to the server chat UUID, so the
  vault mapping and the protected-value note survive the URL swap instead of reloading an empty
  session.
- ChatGPT hydration: `.DilResponseRoot` responses and `\text{S1}` / `\texttt{<S1>}` formula
  variants are accepted before the review opens.

## Unreleased — experimental share review

- Found on the live sites (18 Oct): clicking DeepSeek's send arrow sent messages **without
  protection** (it matched no send-button pattern); on Claude the re-send clicked the "+" menu and
  any click on it ran the guard. Send buttons are now exact, per site, in priority order.
- DeepSeek's new layout: your messages weren't read (shares would have lost them); the health
  check caught it. New DeepSeek reader on stable ds-* class names.
- Settings (protection mode, debug details, reader, amounts, categories) moved from the chat site's
  localStorage to extension storage: a page script could switch protection off or set the next
  share to "Someone I trust". Old values are not imported; safe defaults.

- Security: the local relay served files next to the viewer folder whose names start with
  "viewer" (`/../viewer_redirect.js`) because of a string-prefix path check; now a real
  folder-containment check, with a regression test.

- Attack check in the share dialog: SafeShare's own attacks (amount inversion, birth year, dates,
  combinations of details) run on exactly the text about to be shared; a successful attack is
  shown in red and creating the link asks first.
- Site health check: every 10 s on an open chat SafeShare checks it can still find the chat box,
  your messages and the AI's answers; if not (site layout changed) the chip warns and the status
  is saved per site. The SafeShare button warns before sharing a chat where only one side was found.

- Only the hidden parts of a message change. Rules still match on a normalised copy (look-alike
  letters, full-width digits, invisible characters), but each match is mapped back to the text as
  typed: Russian/Greek words no longer get Latin look-alike letters, and emoji (👨‍👩‍👧), ligatures
  and flags survive, before sending, in shares, the CLI and the proxy. Manual selections match
  look-alike/full-width text the same way.
- Fail closed before sending: if protection itself throws, the message is held (chip says why)
  instead of being sent unprotected.

- Security: invisible characters (Unicode tag characters, bidi controls) no longer hide a key or ID
  from the rules, and are removed from outgoing messages (when protection is on), the Continue
  prompt and the share viewer, so pasted or shared text can't smuggle hidden instructions to an AI.
  Flag emoji that use tag characters (England, Scotland, Wales) are kept.

- Sharer-only originals: creating a link saves which original sits behind each tag, encrypted with
  that link's key, in extension storage (expires with the link, deleted on revoke). Opening your
  own link inside the extension shows "Show my original values (only on this device)". Link
  readers and the relay's page never can: they don't have the stored copy.

- Maybe suggestions get a context score (source + entropy + credential word before it + shape,
  minus "example" wording), sorted, top 5 shown with "Show N more"; score >= 0.75 starts checked.
  Numbered placeholders from before sending are never suggested. "Keep All Unmasked" asks before
  revealing likely credentials; a second link from the same chat offers to revoke the first.
- "@" in prose is no longer redacted as user@host ("meet me@5pm", "me@home"); user@host needs a
  login command, a host:path or a machine-like host. "john@gmail" without ".com" counts as an
  email; git@github.com does not.
- Before-sending protection is off by default (opt-in from the chip).
- "Keep debug details" in the chip menu: IPs, hostnames, user@host and paths are sent as typed so
  the AI can debug; passwords, keys and tokens are still replaced. Public IPs are now hidden
  otherwise (they weren't caught after "@" or before a full stop); private IPs stay.
- Restore on your screen: one map per chat (switching chats no longer loses it, and [NAME_1] of
  chat A is never shown in chat B); a console note explains any placeholder left as is.
- The chip menu sits on the page body, so chat boxes that clip their content (DeepSeek) can't hide it.

- Proxy redacts structured tool outputs: OpenAI Responses string/block tool calls and
  Anthropic `tool_result` blocks; JSON arguments decoded and verified. Unsupported tool/multimodal
  structures refused (400) instead of leaking raw text.
- International decimal currencies: shared parser retains decimal places alongside grouping and
  currency symbols ($5,000.50, EUR 3.200,50). Range mode applies the correct magnitude.
- Share review fixes: distinct range click targets when amounts share a bucket, stable candidate
  identities when local model results arrive, and manual amount redactions trigger derived-leak
  suppression in the assistant turn.

- Local MiniLM inference now runs in Firefox's background page as well as Chrome's offscreen
  document; shared request client validates text and reports failure/timeout. Absolute WASM asset
  paths fix Firefox module resolution. Real Firefox/Chromium extension smoke harnesses added.
- Optional local-model review adds unchecked PII suggestions (including plausible alternatives
  to O); scores are experimental, not calibrated. No new weights, training or remote inference.
- Hard identifiers get stable per-entity review labels across rules/turns. Account IDs no longer
  share ambiguous buttons; identifiers are not merged with money by numeric value. Card ending
  digits, month-name expiration aliases and bracketed address instructions have regression checks.

- Fixed Indonesian grouped amounts being re-redacted after an explicit reveal (case-insensitive,
  numeric-equivalent exceptions). Derived amounts now have stable per-value review tags, ranges
  remain clickable, and placeholders without an original value no longer pretend to be buttons.
- Share preview preserves basic headings, tables and code; arithmetic LaTeX is converted to
  readable text. Chat extraction chooses one KaTeX annotation instead of both visual/accessibility
  representations. No remote renderer or raw chat HTML is used.

- Share dialog: local, unverified credential suggestions using assignments and entropy; exact
  repeated values share one checkbox. Credential-context suggestions start hidden for both profiles.
  Names, amounts, the send-time shield, CLI and proxy are unchanged.
- Preview includes the final safety scan; publication snapshots only `role` and `content`, excluding
  private solver metadata. Choices lock during upload; visible risky suggestions require confirmation.
- Added offline regression checks and a fictional screening harness (`tools/eval/maybe.js`).
  Real-chat burden and independent held-out accuracy still require evaluation before release claims.
- Review audit fixes: selected overlapping spans hide their full union; numeric credential values
  are considered, punctuation/path echoes are swept and variable placeholders stay unchanged.
  Protect/Unprotect All and Reset include suggestions. Amount badge metadata remains private to
  the review rather than entering the encrypted payload. Real DOM self-check added in
  `tests/fixtures/maybe_review.html` (fake relay, no uploads).

## 2.4.0 (2026-10-16)

### Fixed (P0)
- Shared chats keep the user's own messages (they were dropped, so the inversion defence didn't
  know what to hide).
- Look-alike characters (`аlice@example.com` with a Cyrillic `а`) no longer slip through when the
  share is built; every turn is scanned once more right before encryption.
- npm package ships `policy.js` and `crypto.js`; `tests/package.test.js` installs the tarball.
- Proxy redacts OpenAI Responses and Anthropic Messages too, and refuses (403) any other request
  with a body instead of forwarding it unredacted.
- Before sending, only the writer's own names and places are replaced (`[NAME_1]`, `[PLACE_1]`);
  IDs use numbered placeholders and show the real values on your screen only.
- Password rule no longer takes prose ("regularly", "bukan"); new OTP rule.
- Extension runs only on the chat sites, the official relay and localhost; `models/` no longer
  visible to websites; the Continue bridge only accepts the share page.
- Burn-after-reading links open only after a click, so link scanners can't use up the view.
- Local relay returns 500 (not 201) when it can't save a share.

### Security
- Share links open inside the extension when it's installed: the relay's page is stopped before
  it runs and the extension's own copy decrypts the chat. The viewer moved to `extension/viewer/`.
- Hosted share page sends a Content-Security-Policy; `dist/SHA256SUMS` lists the zips and the page
  files.
- Values restored on screen sit in a closed shadow root; the amounts vault moved from the page's
  `sessionStorage` to the extension's `storage.session`.

### New
- `invert` recovers hidden dates from weekday / "the day after the 14th" clues; SafeShare hides
  those clues next to a hidden date, and landmarks/distances next to a hidden address.
- `invert` warns when one message combines several identifying details ("the only female
  cardiologist at a 50-bed hospital in Blitar").
- Extension icon; the chip says when the local name model wasn't ready in time.
- Groq (`gsk_`), xAI (`xai-`) and Replicate (`r8_`) keys, and `Bearer` tokens in pasted headers.
- Command-line passwords (`mysql -pX`, `--password=X`, `sshpass -p X`), any `*TOKEN=` variable, and
  `https://user:token@host` URLs (the token was mistaken for an email). Before sending, only the
  secret itself becomes a placeholder: `curl -u [CLI_BASIC_AUTH_1]` keeps `curl -u`.

### Changed
- NER scores are softmax probabilities, so the arbiter's thresholds apply.
- NER tokenizer (`engine/wordpiece.js`) matches the model's original uncased BERT tokenizer
  (accents, `_`, CJK, zero-width characters), and long messages are checked in overlapping
  windows instead of stopping after ~126 pieces.
- One before-sending setting (`safeshare_shield_mode`) for the chip and the share dialog.
- Claims narrowed: "derivable through the supported arithmetic", what 0% FP and F1 0.85 measure;
  `RESULTS_SOTA.md` in English.

## 2.3.1 (2026-10-16)

### Fixed
- Tier-0 veto for CLI ports, SQL numerics and private IPs: NER no longer flags
  `--port 5432`, `id = 123` or `192.168.x.x` (CLI FP-rate 38% → 0% on 5,000 code lines).
- Git-hash veto now requires a letter, so card/ID digit runs reach the NER
  (hybrid ai4privacy F1 0.816 → 0.834).
- Bare birth dates hide when a personal marker is nearby ("My birthday is May 5
  1998"); plain meeting dates pass through.
- Relay: D1 required (KV fallback removed), undocumented `/api/chat` gateway
  removed, CLI `--ttl` validated (300..604800).

### Changed
- Docs describe the shipped MiniLM Q4 honestly; added `docs/RELATED_WORK.md`
  and `tools/eval/RESULTS_SOTA.md`.

## Unreleased

### New
- `invert` also recovers a hidden birth year from stated ages ("I am 28", "in 2020 at 22"); when
  SafeShare hides a birth date it now hides stated ages too.
- Relay hardening: max 512 KB per share, 10 uploads and 60 reads per minute per IP (Cloudflare
  rate-limit bindings; the local relay does the same), and a daily cron that deletes expired
  shares. Run `npx wrangler@4 deploy` to apply; see `DEPLOY.md`.
- `DEPLOY.md` (Cloudflare step by step), `LABELLING.md` and `tools/eval/make_label_sheet.js` /
  `label_agreement.py` (labelling kit for the "is this about the writer?" model),
  `tools/eval/inversion_wild.js` (looks for the inversion attack in real WildChat chats).
- README: threat model and the "didn't the vendors fix this?" answer.
- Before-sending protection menu: click the chip above the chat input to choose "Protect IDs +
  amounts" (new default: NIK, cards, keys, emails and phones are replaced, amounts become `<S1>`),
  "Protect amounts only", or "Off". The chip shows how many items will be protected as you type.

### Fixed
- `invert` counted a number repeated several times as several pieces of evidence.
- "Continue in ChatGPT / Claude / DeepSeek" did nothing when the extension was installed: it now
  opens the chat site in a new tab and pastes the prompt once the input box appears.
- Shared chats included the send-time shield's "[PRIVACY PROTOCOL: …]" instruction, and could
  repeat the same message (nested page elements); both are now removed when the chat is read and
  when the continuation prompt is built. The prompt also explains `<S1>`-style placeholders.

- ChatGPT's 2026 page layout (hashed class names, no `data-message-author-role`): the extension
  found no assistant replies, and the on-screen number display stopped working. It now reads
  `data-user-message-bubble` / `data-markdown-text-style="assistant-message"` first.

- The send-time shield could lose the race on ChatGPT: the site handles Enter above the input
  box, so the message went out with the real salary. The shield now listens first (window,
  capture phase), holds the send, rewrites, lets the editor sync, then sends once.
- The Indonesian shield instruction ("[PROTOKOL PRIVASI: …]") is stripped from shared chats too.

### Changed
- The continuation prompt explains the placeholders and asks the model not to reconstruct them,
  keeps the newest turns whole, shortens long older answers, drops the oldest turns past a size
  budget (with a note), and strips the viewer's zero-width watermark.
- The extension can use a local relay for testing (`safeshare_relay` in extension storage), and
  is allowed to reach `localhost` / `127.0.0.1`.
- `TESTING.md`: step-by-step manual checklist for the browser parts.


## 2.3.0 (2026-10-11)

### New
- Reader profiles: `public` (default) removes your own amounts and names too; `trusted` keeps
  them and removes only keys, IDs, cards and contacts. In the CLI (`--profile`) and the
  extension's share dialog ("Reader").
- Range mode: your own amounts shown as a band ("Rp 2–5 juta") instead of a placeholder; derived
  figures stay removed and the range is dropped if `invert` could recover the original.
  `--numbers range`, or "Amounts" in the share dialog.
- `--presidio <url>`: Presidio for names, places, phones and IDs, with `names: personal` (only
  names tied to the user) or `all`. `tools/presidio_server.py` runs a compatible analyzer.
- `extension/engine/policy.js`: the inversion attack and range logic, shared by CLI and extension.

### Fixed
- Short entities were replaced inside other words ("spatial" → "s[LOCATION_1]tial").
- Name labels ran past `[User_Z]` into symbols; now `[User_AA]`, `[User_AB]`, ...
- `invert` treated range endpoints as real values.
- "I'm Rina Kusuma and I live…" was not caught (the name now ends at "and").
- A first name on its own ("Hi Rina!") now reuses the full name's label.
- Presidio's person tag on acronyms ("NIK", "API") is ignored.


## 2.2.0 (2026-10-10)

### New
- `safeshare invert`: recovers hidden numbers from chats redacted by any tool.
- CLI and library: `redact`, `invert`, `share` (encrypt and upload to a relay), `proxy`
  (OpenAI-compatible, redacts messages before they leave the machine).
- Policy file: custom rules, allowlist, disabled categories, `pci` / `hipaa` / `gdpr` presets.
- Revoke: the relay returns a revoke token on upload; the extension has a Revoke button.
- Evaluation harness (`tools/eval`) and results against Presidio and gitleaks.

### Fixed
- Amounts like `Rp 10.800.000` slipped past the inversion defense (the README's own example leaked).
- Relay: share IDs must be UUIDs, uploads can't overwrite an existing share, revoke needs the
  creator's token and is POST-only, CORS limited to the supported chat sites.
- Over-redaction found on real chats: learned "names" from prose or code wiping common words,
  citation years, "25m" as money, "Plate count", "case-by-case", "swift movement",
  `$user` in PHP, digits in DOIs/URLs, CSS `@import` as a handle.

### Changed
- Tier 2 is described as what it is: contextual rules. The unused ONNX model stub was removed.
- Viewer anti-copy features are labelled as deterrence, not protection.
- Docs rewritten in plain English; older notes moved to `docs/archive/`.

### Upgrading the Cloudflare relay
Run once before deploying: `ALTER TABLE shares ADD COLUMN revoke_hash TEXT;`
