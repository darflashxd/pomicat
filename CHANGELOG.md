# Changelog

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
