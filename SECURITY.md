# Security Policy

## Supported versions

Faultline is pre-1.0. Security fixes are made on the latest `main` branch and included in the next release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue for an exploitable vulnerability or include secrets, private user data, or working credentials in a report.

Include the affected version or commit, reproduction conditions, likely impact, and a minimal proof of concept when one is safe to share. Maintainers will acknowledge a report as soon as practical and coordinate disclosure after a fix is available.

The browser app still makes no model or analytics API calls and requires no API keys. The optional local Go service stores only redacted public replay envelopes; delete tokens are hashed at rest and never returned by GET. Future remote AI providers must keep credentials behind the server boundary.
