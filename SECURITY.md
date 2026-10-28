# Security policy

This is a self-hosted, Windows-first application for a trusted local or LAN
environment. It has not received an independent security audit and is not
presented as a hardened, public multi-tenant SaaS service.

- The first registered account becomes administrator. Complete initial setup
  before exposing a fresh installation to other devices.
- The default LAN listener is `0.0.0.0:3210`. Use `BIND_ADDRESS=127.0.0.1` for
  local-only access. For remote access, use an authenticated HTTPS reverse proxy
  and appropriate host/network restrictions.
- Per-user model keys are AES-256-GCM encrypted at rest. The local encryption key
  is stored separately on the same host; this does not protect a compromised host.
  Restrict access to `data/`, backups and project directories.
- Documents, prompts and selected preview images are sent to the configured
  model provider when those features run. Office preview processing is local.
- Model endpoints may point to local gateways. Only give accounts to users you
  trust to use this server's network and file-processing resources.
- Deleting a presentation from the recycle bin can also remove its generated
  output files. Source materials are maintained separately.

Report vulnerabilities privately using
[GitHub private vulnerability reporting](https://github.com/Donotdream1/yeyu-ppt-agent/security/advisories/new).
Do not post API keys, authentication cookies, account stores, private PPTX files
or real user documents in public issues. If private reporting is unavailable,
open an issue requesting a private contact channel without exploit details.

Security fixes target the latest `main` branch and current release. Do not
assume historical prototype builds receive maintenance.
