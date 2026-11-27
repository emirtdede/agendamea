# Security Policy

## Supported Versions

| Version   | Supported |
| :-------- | :-------- |
| `1.1.x`   | Yes       |
| `< 1.1.0` | No        |

## Reporting a Vulnerability

Please report security vulnerabilities privately to **security@vellium.dev** (see [Security Disclosure Policy](https://vellium.dev/en/legal/security-disclosure)) with:

1. Component and file path affected (Electron main/preload, Express loopback API, MCP server, Webhooks, CLI, or WPF Setup SFX).
2. Clear reproduction steps or proof-of-concept payload.
3. Expected security impact.

Do not open public GitHub issues for undisclosed vulnerabilities. We acknowledge reports within 48 hours and target remediations within 7 days for high/critical issues.

## Security Architecture Baseline

- **Local-First Loopback:** Express binds exclusively to `127.0.0.1` with DNS rebinding (`Host`) and CSRF (`Origin` / `Sec-Fetch-Site`) enforcement.
- **Sandboxed Renderer:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, allowlisted IPC sender origin validation.
- **Webhooks & SSRF:** Standard Webhooks v1 HMAC-SHA256 signatures, DNS resolution SSRF checks, redirect blocking.
- **SFX Installer Safety:** Strict Zip-Slip path traversal validation before file extraction.
- **Automated Supply-Chain Gates:** Dependabot weekly updates, CodeQL SAST (JS/TS and C#), `npm audit`, and runtime license verification.
