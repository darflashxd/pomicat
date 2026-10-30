# Security policy

Blackline (previously SafeShare) is not a guarantee of anonymity. Read the threat model and limitations in [README.md](README.md#security-model).

## Reporting vulnerabilities

Use GitHub's **Security → Report a vulnerability** if private reporting is available:
https://github.com/darflashxd/safeshare/security/advisories/new

If private reporting is unavailable, open an issue asking maintainers to establish a private reporting channel. Do not include vulnerability details in that public issue.

Include the affected commit/version, browser and OS, expected and actual behavior, and minimal reproduction using fictional data. Never include live credentials, session cookies, original private conversations, complete share links, fragment keys, or revoke tokens.

Fixes target the current development branch; older releases do not have a separate maintenance guarantee. Response times depend on maintainer availability. Reported issues must be reproduced before a fix or security claim is confirmed.

If a real credential was exposed, revoke or rotate it at its issuer. Later redaction or link revocation cannot recall data already received or copied.
