# Xuzhen — Editable PPTX Agent Workspace

[中文](README.md) · [Installation](docs/installation.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

[User manual in Chinese](docs/manual/software-manual.md) · [Software documentation and source deposit](docs/software-copyright.md)

Xuzhen turns documents into editable presentations using your own PPTX templates
and native material library. Hermes coordinates planning, material selection,
per-page writing and validation. Continue improving each slide through a page
conversation, selected-object edits and photo placement.

## Features

- Document-derived chapters, concise page headlines and an editable outline.
- Native shape/group/table/chart reuse, preserving source colors and editability.
- Five AI-ranked existing material alternatives per page, refresh and manual recovery.
- Bounded parallel page agents, persisted checkpoints and targeted repairs.
- Custom reference layouts and reusable Skills / prompt rules.
- Private encrypted model connections for each user: DeepSeek, OpenAI and compatible APIs.
- Accounts, administrator-only catalog, configurable generation quotas, projects and recycle bin.

Private templates, logos, documents, model keys, accounts and generated user
decks are intentionally excluded. Supply your own materials and confirm your
rights to use them.

## Quick start

The complete workflow is currently verified on **Windows with desktop Microsoft
PowerPoint**. Install Node.js ≥22.12, Git and [uv](https://docs.astral.sh/uv/getting-started/installation/).
The Hermes installer defaults to Python 3.14 and downloads a pinned external
Hermes checkout into the ignored `data/` directory.

```powershell
git clone https://github.com/Donotdream1/yeyu-ppt-agent.git
cd yeyu-ppt-agent
npm ci
Copy-Item .env.example .env
npm run setup:hermes
npm run build
npm run doctor
npm start
```

Open `http://127.0.0.1:3210`. The first registered account is the administrator.
Configure a connection in Settings → Models, import a template/material library,
then create a project and provide a document. The model endpoint must support
OpenAI-compatible Chat Completions, streaming and tool calling. Image-based
selection also needs image input support.

Default member quota is five successful new decks. Administrators can adjust it;
edits and failed generation attempts do not consume another completed-deck unit.
User model keys do not bypass the application's quota.

## Validation

```powershell
npm test
npm run build
npm run check:publication
npm run test:http
```

See [development](docs/development.md) for browser, actual Hermes-worker and
Office checks. A mock provider test does not claim paid-provider or visual QA.
Screenshots and PNG previews do not replace native PowerPoint objects.

## Limits and security

Office automation currently uses `PowerPoint.Application`; WPS, macOS and Linux
are not claimed to have equivalent preview support. Encrypted/legacy PPT files,
scanned-PDF OCR, arbitrary animations and fully automatic semantic adaptation
are not guaranteed. Review facts, fit and object editability before delivery.

The app is intended for trusted local/LAN use, not an independently audited
public multi-tenant service. Read [SECURITY.md](SECURITY.md) before exposing it
or backing up credentials. Uploaded documents and selected previews may be sent
to the configured model provider.

## License and acknowledgments

Original code: [MIT](LICENSE). Third-party components retain their own terms;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Runtime:
[Hermes](https://github.com/NousResearch/hermes-agent). Workflow-method references
include [PPT Master](https://github.com/hugohe3/ppt-master) and
[PPTAgent](https://github.com/icip-cas/PPTAgent). These are not bundled as
automatically installed generation engines.
