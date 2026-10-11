# Changelog

## Unreleased

### Fixed
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
