# Development and validation

```powershell
npm ci
npm run dev
```

The development server uses Vite through Express on the same port. Build and
start production with `npm run build` and `npm start`.

## Validation levels

- `npm test`: Node tests using synthetic fixtures, no paid model requests.
- `npm run build`: production frontend build.
- `npm run check:publication`: inspect tracked paths and common secret patterns.
- `npm run test:http`: isolated temporary accounts plus a local mock model endpoint.
- `node scripts/verify-model-quota-http.mjs --hermes`: additionally execute the
  actual Hermes Python worker against that local endpoint; requires the runtime.
- Browser tests in `test/ui/` require a test server and any fixtures referenced by
  the selected test. They are not represented as all passing without those fixtures.
- Office/real-provider checks are separate integration work, not proof supplied by
  a unit-test badge. Use synthetic, redistributable materials for public evidence.

## Browser tests

Start an isolated server from another PowerShell window:

```powershell
$env:NODE_ENV='test'
$env:AUTH_TEST_MODE='1'
$env:AUTH_DATA_DIR="$PWD/test-output/auth-ui"
$env:PROJECTS_ROOT="$PWD/test-output/projects-ui"
$env:PORT='3211'
$env:BIND_ADDRESS='127.0.0.1'
node server/index.mjs --production
```

Then run `npx playwright install chromium` once and select a test, for example
`npx playwright test test/ui/model-connections.spec.mjs`. Tests that need an
existing output/material must be supplied with a synthetic fixture; private
development decks are intentionally absent from public source.

## Releases

After a production frontend build, `node scripts/verify-collaboration-http.mjs`
creates isolated synthetic accounts, starts a temporary server and uses two
Playwright browser sessions to check membership, viewer source privacy,
editor access without deletion rights, SSE slide following, comments and
revocation. No external cloud service, paid model or personal deck is called.

Keep source, installation instructions and `.env.example` consistent. Run tests
from a clean checkout without a personal `data/` directory. Preserve the vendor
license and review new dependencies. Never archive `data/`, runtime downloads,
account stores, model keys, source material libraries or generated customer decks.
Use annotated version tags and GitHub release notes for externally visible changes.
