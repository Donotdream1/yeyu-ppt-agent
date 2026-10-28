# Configuration

Copy `.env.example` to `.env`; never commit the resulting file.

| Variable | Default / meaning |
| --- | --- |
| `PORT` | `3210` |
| `BIND_ADDRESS` | `0.0.0.0` outside tests; use `127.0.0.1` for local only |
| `DEEPSEEK_API_KEY` | Optional shared fallback credential; private user connections override it |
| `DEEPSEEK_MODEL` | Shared fallback model name; use one supported by your provider |
| `LIBRARY_PATH` | Optional directory for CLI imports; no personal path is preconfigured |
| `HERMES_SOURCE_PATH` | `data/hermes-agent` under the repository |
| `HERMES_PYTHON` | `data/hermes-runtime/Scripts/python.exe` |
| `HERMES_CONCURRENCY` | `4`; page workers bounded by the scheduler, Office stays serial |
| `PROJECTS_ROOT` | Optional parent location for account-owned project folders |

Per-user service URL, model and API Key are managed in Settings → Models. The
endpoint must use the OpenAI-compatible Chat Completions protocol; this is not
a claim of native support for every provider's proprietary API. Completed
connection tests verify streaming and tool calling, not image understanding or
presentation quality.

Testing-only `AUTH_TEST_MODE` and `AUTH_DATA_DIR` must not be enabled in a
production process. `AUTH_TEST_MODE=1` bypasses login only with `NODE_ENV=test`.
Use isolated data/project directories for browser tests.

The administrator material-library permission, 5-deck member default and quota
adjustment live in the application's account settings. Changing model providers
does not bypass account quotas.
