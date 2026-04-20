# Security Policy

## Supported versions

Only the latest release on `main` is supported. `timelines` has no runtime third-party Python dependencies — the attack surface is the Python standard library, your CSV input, and (for the web companion) the Pyodide runtime loaded from jsDelivr.

## Reporting a vulnerability

Please report security issues through GitHub:

- Preferred: [open a private security advisory](https://github.com/laveez/timelines/security/advisories/new)
- Alternatively: open a regular [issue](https://github.com/laveez/timelines/issues) if the concern is non-sensitive

I'll respond within a few days and credit reporters in the release notes unless anonymity is requested.

## Out of scope

- Third-party hosting (GitHub Pages, jsDelivr) — report those to their respective providers.
- Issues that require untrusted local write access to the machine already running the tool.
