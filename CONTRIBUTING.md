# Contributing

Thank you for helping improve Yeyu. Chinese and English issues and pull requests
are welcome.

1. Read [installation](docs/installation.md) and [architecture](docs/architecture.md).
2. Fork the repository and create a branch for one focused change.
3. Run `npm ci`, `npm test`, `npm run build`, and `npm run check:publication`.
4. For layout or UI changes, include synthetic screenshots and describe how the
   affected pages were checked. Do not upload customer decks or private documents.
5. Open a pull request explaining the problem, resulting behavior and validation.

Prefer deterministic geometry, honest progress states and small bounded repair
loops. Preserve native PPTX editability, source colors and user-confirmed page
choices. Do not silently shrink text or turn diagrams into screenshots.

Tests must work without a personal material library or paid model key. Put
provider/Office integration checks behind an explicit command. Keep runtime and
fixture data in ignored directories. Never include credentials, user-account
databases or generated customer outputs in commits or logs.

New source contributions are provided under the repository's MIT license. Retain
third-party notices when adding or adapting external code; do not assume that a
publicly visible prompt or template permits redistribution.
