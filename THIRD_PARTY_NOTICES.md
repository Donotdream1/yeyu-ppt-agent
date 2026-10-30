# Third-party notices

Xuzhen's original code is MIT licensed. Third-party code retains its own license.
User-supplied templates, material libraries, documents, logos, fonts, photos and
generated private presentations are **not** part of this repository or its license grant.

## Included code

| Component | Included files | Source / license |
| --- | --- | --- |
| Harness Anything Office quality checks and reference skill | `agents/vendor/harness-anything-office/` and `agents/skills/harness-review/references/upstream-skill.md` | [yb2460/harness-anything](https://github.com/yb2460/harness-anything), commit `e1924f8499ad6aaa11c579d5492205cfaa89c5d6`; MIT, copyright 2026 cli-anything-wps contributors. Full license remains in the vendor directory. |
| shadcn/ui component patterns | `src/components/ui/` | [shadcn-ui/ui](https://github.com/shadcn-ui/ui), MIT, copyright 2023 shadcn. Components are adapted to this React application. |

shadcn/ui MIT notice:

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## External runtime and package dependencies

Six pinned office skill snapshots are included under `agents/vendor/office-skills/`:

- Email Drafter, Task Planner and Summarizer: xcrrr/claude-skills, commit `145342ceff6318d2f5ffe8f95473fecc8b27d1e9`, MIT, copyright 2026 Adam Parszewski.
- PM Meeting Notes: shangbianai/pm-meeting-notes, commit `198052ce157fff377c5fd7423e700103a7a84a4b`, MIT, copyright 2026 DPXJ.
- MiniMax XLSX: MiniMax-AI/skills, commit `60aaae52bb2af8162732751a4332f62a5fef518b`, MIT, copyright 2026 MiniMax.
- Architecture Review: Microsoft Corporation / microsoft/hve-core, commit `f2bc028c2a0c4ba8a693c35387c7afbfb20c1620`, **CC BY 4.0 for this specific skill**, https://creativecommons.org/licenses/by/4.0/ . The root repository MIT license does not override its per-file license. The original skill snapshot is unmodified; the local Chinese adaptation changes scope to evidence-based feasibility/requirements review, uses the application's scoring rubric, and does not execute upstream ADR/RPI workflows. Attribution and changes remain in `agents/skills/project-review/references/github.md`.

These skill texts and adaptations retain their applicable licenses and are not
relicensed by this application's MIT code license. Full source paths, adaptation
details and runtime boundaries are listed in [office assistant documentation](docs/office-assistant.md).

The office module additionally uses ExcelJS, PostalMime, ImapFlow and Nodemailer
as declared and locked Node dependencies; their licenses remain in the installed
packages. No Plane application code or Whisper model weights are bundled.

[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) is an
external MIT-licensed runtime, copyright 2025 Nous Research. It is downloaded
separately by the setup script; its source and license remain in that checkout.
The setup script pins a revision instead of copying Hermes into this repository.

Node dependencies are declared in `package.json` and locked in `package-lock.json`.
Python dependencies are listed in `agents/requirements-hermes.txt`. Their original
licenses continue to apply. Microsoft Office, Windows and font files are not
redistributed; obtain them separately under their respective terms.

## Design-method references

[PPT Master](https://github.com/hugohe3/ppt-master),
[PPTAgent](https://github.com/icip-cas/PPTAgent),
[Anthropic PPTX](https://github.com/anthropics/skills/tree/main/skills/pptx), and
[Presentation Agent Skills](https://github.com/hiamberhuang/presentation-agent-skills)
were consulted for workflow and quality-review ideas. They are not bundled or
automatically installed. Project rules are independently adapted; see
`agents/skills/ppt-writing/references/upstream-design-notes.md`.

No ChatGPT or Lovart proprietary frontend source is included. This application's
React components implement its own workspace using public UI libraries.
