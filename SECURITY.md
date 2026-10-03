# Security Policy

## Supported versions

- The current `main` branch of this repository.
- Once published, the latest GitHub Release (starting with `v1.1.0`) is the supported release line. Earlier states are not separately supported.

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues.**

Use GitHub's private vulnerability reporting for this repository: open the **Security** tab → **Report a vulnerability**. That advisory thread is private between you and the maintainer.

Security issues here are distinct from ordinary correctness or UX bugs. A correctness bug (wrong layout, wrong computed label) should go through normal issue templates.

## What counts as a security concern in this project

- **Script execution / command handling**: anything that lets crafted input or a crafted invocation execute unintended commands.
- **File handling**: path traversal or unintended file read/write through input bundles, base directories, or the skill install path.
- **Dependencies**: introduction or upgrade of dependencies (this package currently ships with **no runtime dependencies**) — any proposed addition is a review surface.
- **CI / release pipeline**: workflow injection, privileged checkout, artifact tampering, release/tag manipulation.
- **Generated HTML/SVG handling**: delivered HTML/SVG is produced from source-grounded text; if an input path can smuggle executable markup into `innerHTML`-style contexts or event attributes, treat it as a security report rather than a rendering bug.
- **Supply chain**: skill packaging artifacts (`npx skills add`, uploaded skill ZIPs) being modified or substituted in transit.

## Response expectations

This is a single-maintainer project. The maintainer aims to acknowledge private reports, but no fixed response-time SLA is promised.
