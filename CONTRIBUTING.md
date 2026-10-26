# Contributing

Use small pull requests with a clear reproduction and a regression check for behavior changes. Discuss large changes in an issue first.

## Local checks

Use Node.js 24 for parity with CI and Python 3.12 for browser tooling.

```sh
npm test
python tools/eval/test_score.py
python tools/eval/test_model_comparison.py
python -m pip install playwright==1.56.0
python -m playwright install chromium firefox
python tools/eval/credential_browser.py
python tools/eval/credential_browser.py --browser firefox
python tools/eval/relay_browser.py
python tools/eval/relay_browser.py --browser firefox
python tools/eval/chrome_ner.py
python tools/build_extension.py
```

Linux browser installation may require `python -m playwright install --with-deps chromium firefox`. See [TESTING.md](TESTING.md) for package testing, model diagnostics and test boundaries.

Use fictional inputs and a local relay. Do not commit account data, credentials, share keys, browser profiles, or raw private transcripts. Report vulnerabilities using [SECURITY.md](SECURITY.md).

Describe which checks ran and which did not. Fixture success is not proof of live vendor compatibility; regression counts are not detector accuracy. Keep README, tests and release notes consistent with behavior changes.

Contributions are made under the repository's existing license. Preserve third-party licenses and notices.
