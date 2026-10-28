# Third-party notices

Yeyu's original code is MIT licensed. Third-party code retains its own license.
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
