# Toggle patch checks

## Fixed

- Chat HR review no longer exposes shorter active masks after clicking the full
  `performance improvement plan (PIP)` badge. The exact contextual variants
  `performance improvement plan`, `performance improvement plan (PIP)`, and `PIP`
  share a toggle. Other HR records and arbitrary substrings do not join it.
- Mixed technical PIP conversations keep independent decisions. This conservative
  exception avoids treating package-manager or picture-in-picture text as the
  same HR record; occurrence-scoped aliasing is not implemented.
- Word amount groups exclude rule/model identifiers and nonpositive or invalid
  parsed values. Explicit different currencies stay separate. Currencyless values
  only join if no competing explicit currency exists for that amount.
- Word model deduplication keeps the winning candidate's metadata together,
  preserves protective decisions, and maps chunk occurrences to flattened-document
  offsets, including paragraph separators.
- Saved-copy responses rejected by Content-Length now cancel the response body.

## Checked on 28 October 2026

- Node suite: 61/61 files pass, including real multi-chunk model calls, both score
  orders, amount/ID separation, invalid values, and HR alias decisions.
- Capture function tested at 10 MiB minus one byte, exactly 10 MiB, and one byte
  above, with absent, misleading, and oversized Content-Length headers.
- Local Chromium and Firefox: pointer unredact, keyboard re-redact, unrelated HR
  record remains protected; Word inline grouping, mixed currencies and IDs,
  Apply races, download hash, and error handling.
- DOCX structure checks in both engines: split runs, merged/nested tables,
  content controls, equations, hidden/revision text, and fail-closed fields.
- MCP Playwright with the unpacked extension loaded from this repository:
  one real click on the shared HR conversation's long badge reveals the full
  original phrase and synchronizes seven alias badges. One more click masks all
  seven again. Before the patch, three clicks were needed.
- Two live MCP benchmark runs, ten alternating real clicks each: median 141 ms
  and 129 ms, overall range 74–230 ms, all seven aliases synchronized after every
  click, original phrase intact when visible, no page errors during either run.
  These are click-to-checked-state wall times including Playwright actionability
  and scrolling, not isolated rendering CPU time. A separate MutationObserver
  measurement from launcher click to first review badge was 2,397 ms, including
  capture/completeness handling; this is one warm observation, not a cold-start
  model benchmark. Replay: tools/benchmark_toggle_mcp.js through MCP Playwright.
- Delayed local-model responses in both browser fixtures preserve the user's HR
  unredact choice and the sanitized text after rebuilding the preview.

## Not claimed

The shared-page capture still warns that completeness is unverified. No chat was
sent or published, and no test document was uploaded to the public relay. A fresh
live 10 MiB Word capture/memory benchmark, full
export after each alias decision, and email-widget capture cleanup remain open.
Repeated email subjects and blank bullets need a separate source-DOM comparison;
this patch does not silently drop potentially meaningful source text.

No release or tag is replaced by this patch. Existing GitHub ZIPs remain v2.5.4;
these changes require reloading the unpacked extension from updated source.
