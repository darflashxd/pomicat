# Project review fixes

This patch addresses the reproduced findings from the project review. It does not
claim a complete security assessment or perfect automatic detection.

## DOCX export

- Math separators now occupy an entry in the character map. Redacting `7850`
  between `Salary ` and ` per month` yields `Salary [REDACTED] per month`, not
  `Salary 7[REDACTED]per month`.
- Verification reads XML text nodes separately as well as combined text, and
  checks semantic attributes in XML and relationship files. Encoded destinations
  are decoded for checking. Colors, namespaces and revision IDs are excluded to
  avoid treating formatting identifiers as private content.
- External destinations containing selected text become `about:blank`. Internal
  destinations containing it stop export rather than damage package structure.
  Other selected attribute leftovers also stop export at verification.
- A visible longer money occurrence can exclude its contained short amount from
  otherwise-active rules. The same exclusions apply to preview, export and
  verification; this does not join currencies globally or open record IDs.

## Capture and policy

- Read again clears source, findings, review and download state before fetching.
- Trusted mode only opens amounts and supported model name/location suggestions
  by default, not every PROFILE/FINANCIAL rule finding.
- Word uses the same contextual classifier for health and HR records. These stay
  automatic, not model cards. PIP needs HR evidence; package-manager and
  picture-in-picture contexts no longer trigger the standalone HR rule.

## Network and operations

- Proxy accepts origin-relative paths only, checks the resolved origin and stops
  redirects. Authorization is not forwarded to a caller-selected host.
- Worker reads at most 512 KiB + 4096 bytes for upload JSON and 4096 bytes for
  revoke JSON, irrespective of Content-Length. Oversize streams are cancelled.
- Viewer wording describes reference/DOM cleanup, not guaranteed RAM erasure.
- CI includes HR toggle, Word review, DOCX privacy and structural browser checks.

## Evidence

New focused checks: `node tests/review_fixes.test.js` and
`python tools/test_docx_privacy_browser.py`. These exercise the real capture,
sanitizer/verifier, proxy and Worker implementations with fictional local data.
Existing browser checks cover structural DOCX cases, download hashes, review
races and delayed model decisions in Chromium and Firefox.

Validation result: 62/62 Node test files pass. DOCX privacy, 16 structural cases,
Word review and HR delayed-model checks pass in Chromium and Firefox.

Public relay deployment is unchanged. Worker fixes only take effect after a
separate deployment. No public test-document upload, new ZIP release, or claim of
10 MiB live Word/memory benchmarking is made by this patch.
