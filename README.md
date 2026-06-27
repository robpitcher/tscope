# tscope

**GitHub Copilot session token usage analyzer.**

> [!WARNING]
> **Alpha software** — tscope is early-stage and may have bugs. Behavior, output format, and JSON schema are subject to change. Use at your own discretion, and please [report any issues](https://github.com/robpitcher/tscope/issues) you find! 🙏

`tscope` is a command-line tool that reads your local Copilot CLI session files, measures tokens used per model (input, output, cache read, cache write), and displays a clear report — in the terminal, as JSON, or as an interactive HTML dashboard.

## HTML Dashboard Preview

The `--html` dashboard follows your system's light/dark theme:

<!-- The two images below use GitHub's theme-aware suffixes so only the one matching your theme renders. -->
<a href="docs/images/dashboard-dark.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/dashboard-dark.png">
    <img alt="tscope HTML dashboard" src="docs/images/dashboard-light.png">
  </picture>
</a>

<sub>Click the image to view it full size.</sub>

> _Generated from synthetic sample data._

## Features

- 📊 **Local-only analysis** — no network calls, no credentials needed; OTel data is read from `~/.copilot/tscope/otel.jsonl`
- 🔍 **Per-session breakdown** — view token usage by session and model
- 💰 **Per-session cost** — when [OTel is enabled](#data-sources), shows server-side credits per session and per model; log-parser sessions show estimated AI credits when the `totalNanoAiu` event-log field is present, and "unavailable" only when it is absent
- 📅 **Recent-by-default** — shows the 20 most recent sessions by default
- 🏷️ **Session client badges** — each HTML session card shows the agentic surface that produced the session ("Copilot CLI", "Copilot App", or "SDK"), read from the session folder's `workspace.yaml`; also exported in the CSV download
- 📈 **HTML dashboard** — sleek dashboard with token charts, sort controls (by date / tokens / credits, ascending/descending), an Export CSV button, and system light/dark theme
- 💡 **Chronicle Insights** — if a session ran `/chronicle tips` or `/chronicle cost-tips`, the recommendations are surfaced in the HTML dashboard
- 📤 **JSON output** — machine-readable schema (`tscope/report/v5`) for scripting

## Data Sources

tscope reads from local sources with intelligent merging in default mode:

| Mode | Behavior | Cost |
|---|---|---|
| **`--source auto`** (default) | Reads OTel (`~/.copilot/tscope/otel.jsonl`) and log-parser sessions (`~/.copilot/session-state/`) into a **merged report**. Sessions present in both are deduplicated — OTel records are authoritative (no double-counting). OTel sessions show server-side credits (per-session and per-model); log-only sessions show estimated AI credits when the `totalNanoAiu` event-log field is present, and "unavailable" only when it is absent. | ✅ OTel: server-side credits / ✅ Logs: estimated credits (Copilot CLI 1.0+) |
| **`--source otel`** | Reads only OTel data; exits with a helpful error if the file is absent or empty. | ✅ Server-side credits per session/model |
| **`--source logs`** | Reads only the log-parser sessions (pre-OTel behavior). Shows estimated AI credits when the `totalNanoAiu` event-log field is present; shows "unavailable" when it is absent. | ✅ Estimated credits (Copilot CLI 1.0+) |

When OTel is not configured, `auto` falls back gracefully and prints a notice:

```
No OpenTelemetry data found — falling back to log-file parsing.
Run 'tscope otel enable' to use OTel.
```

OTel data is read entirely from disk — **no network calls** are made.

## Quick Start

```bash
npm install -g tscope
tscope --html # generate and open an HTML dashboard
```

Requires **Node.js 18+**.

## Command-Line Parameters

| Parameter | Values | Description | Required |
| --- | --- | --- | --- |
| `--all` | _(none)_ | Include all sessions (disables the default 20-session cap). | No |
| `--date` | `YYYY-MM-DD` | Show sessions that started on the given local date. | No |
| `--help`, `-h` | _(none)_ | Show usage and options, then exit. | No |
| `--html` | `[FILE]` (optional path) | Write a self-contained HTML dashboard to `FILE` (or a default filename) and open it. | No |
| `--json` | _(none)_ | Emit the report as JSON (`tscope/report/v5`) to stdout instead of formatted text. | No |
| `--lastdays` | `N` (positive integer) | Show sessions from the last `N` days (today plus the previous `N − 1`). | No |
| `--max` | `N` (positive integer) | After date filtering, keep only the `N` most recent sessions (ordered by start time, newest first). | No |
| `--range` | `START END` (two `YYYY-MM-DD` values) | Show sessions in the given local-date range, inclusive. | No |
| `--source` | `auto` \| `otel` \| `logs` | Data source. `auto` (default): merges OTel and log-parser sessions into one report (OTel authoritative on overlap); shows cost for OTel sessions, "unavailable" for logs-only. `otel`: OTel only; exits with error if unavailable. `logs`: log parser only. | No |
| `--version`, `-v` | _(none)_ | Print the installed version and exit. | No |

With no flags, `tscope` reports the 20 most recent sessions in formatted text. Date filters (`--date`, `--range`, `--lastdays`, `--all`) are mutually exclusive, and explicit `--max` overrides the default cap. See [Usage](docs/usage.md) for full details.

## Documentation

Full documentation lives in the [`docs/`](docs/) folder:

- [Installation](docs/installation.md)
- [Usage](docs/usage.md) — CLI flags, date filtering, output formats, sample output
- [How It Works](docs/how-it-works.md) — session discovery, token accounting, resumed sessions
- [JSON Output](docs/json-output.md) — `tscope/report/v5` schema reference
- [HTML Dashboard](docs/html-dashboard.md) — dashboard features, Chronicle Insights, sort controls, CSV export
- [OTel Setup](docs/otel.md) — enable, disable, and inspect the OpenTelemetry file exporter
- [Development](docs/development.md) — build, test, lint, project structure
- [Contributing](docs/contributing.md) — roadmap, license

## License

MIT.

---

Built with ❤️ for developers optimizing their Copilot CLI usage.
