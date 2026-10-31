# Word Online test corpus

Generate English, fictional test documents without adding offline import to the product:

```powershell
python tools/build_word_corpus.py --self-check
python tools/build_word_corpus.py --output "$env:LOCALAPPDATA\Temp\opencode\word-corpus"
```

Test tooling needs `python-docx` and Pillow. No network requests. The output includes eight DOCX
files, an authored screenshot and a manifest recording expected redactions, preserved sentinels,
structural counts and source hashes. Output refuses existing DOCX files. Use a fresh directory.

Cases: onboarding, consulting, financial derivations, incident screenshot, fictional referral,
cropped image, native OMML fraction, deleted revision and private metadata. Images deliberately
contain original sensitive-looking pixels; these are **source test files**, not sanitized output.
All identities/credentials are fictional, emails use `.invalid`. No authentic signatures or IDs.

These fixtures are authored functional/demo tests, **not an independent detection benchmark**.
They do not yet cover charts, comments, OLE, all date/locale formats or OCR accuracy. The manifest
contains intended policy decisions, not model predictions. No PomiCat redaction engine result
is implied by successfully generating the files.

External English holdout candidates (not downloaded or incorporated):

- [Gretel English synthetic PII](https://huggingface.co/datasets/gretelai/gretel-pii-masking-en-v1), Apache-2.0.
- [Gretel financial synthetic PII](https://huggingface.co/datasets/gretelai/synthetic_pii_finance_multilingual),
  Apache-2.0; filter English and manually verify labels. Check training overlap before claiming holdout.
- [WIPO structural DOCX samples](https://pct.wipo.int/DocConverter/pages/sampleFiles.xhtml): useful
  for equations/tables; redistribution rights not established. Do not bundle as PomiCat fixtures.

## Live testing gate

Open an authored sample in Word Online using an authorized test account. Confirm the final
`END_OF_DOCUMENT_*` sentinel is saved. Exercise the floating PomiCat launcher, the automatic
first read, the two-pane review, apply, local-relay encrypted share and a recipient browser
without the extension. Compare tables, equations and image placements; independently inspect all
sanitized OOXML/media parts. A link is only a correct test if the recipient preview and the
downloaded DOCX contain no selected original value.

Do not upload real user documents, expose account/token/key information in captures, or claim
that OCR confidence or successful rendering proves privacy. Public relay uploads are not needed.

## Priority document

`python tools/build_priority_docx.py --output .playwright-mcp/priority` builds one realistic
fictional memo, `Confidential - Employee Compensation Review.docx`: memo header, five numbered
sections, a five-column compensation table, a payroll-portal screenshot with a non-functional
credential, and the sentinel `End of review - DOC-CR-2026-0417`.

Every visible run is forced to `#000000`, body text is Times New Roman 11, headings are bold
black, and no Word theme colour is used, so the file does not read as default or AI-templated
output. The builder verifies the sentinel, both tables, one media part and the explicit black
colour on every text run in `document.xml` and `footer1.xml`.

Verified in Word Online: upload succeeds through Playwright's file chooser, the editor shows the
document in two pages, and the extension's **Read saved copy** action returned 2 tables, 1 image
asset and the full text including the final sentinel.

End-to-end review on 2026-10-28: opening setup from the launcher read the memo automatically and
reported 16 of 18 items masked. Applying produced 20 text replacements across 2 parts; the
sanitized DOCX was downloaded and linked through the local relay. The recipient preview rendered
2 tables and `[REDACTED]` values and did not contain `4,800`; revoking the link produced
"Link Expired or Revoked". The image lightbox recorded a 307x95 px area at bitmap coordinates and
the thumbnail showed it burned black. This covers one authored fixture, not every tenant or
document shape.
