# tscope

**GitHub Copilot session token usage analyzer.**

> [!WARNING]
> **Alpha software** — tscope is early-stage and may have bugs. Behavior, output format, and JSON schema are subject to change. Use at your own discretion, and please [report any issues](https://github.com/robpitcher/tscope/issues) you find! 🙏

`tscope` is a command-line tool that reads your local Copilot CLI session files, measures tokens used per model (input, output, cache read, cache write), and displays a clear report — in the terminal, as JSON, or as an interactive HTML dashboard.

## Features

- 📊 **Local-only analysis** — no network calls, no credentials needed
- 🔍 **Per-session breakdown** — view token usage by session and model
- 📅 **Today's default** — shows current day's sessions by default
- 📈 **HTML dashboard** — sleek dashboard with token charts, an interactive date-range filter, and system light/dark theme
- 📤 **JSON output** — machine-readable schema (`tscope/report/v4`) for scripting

## Quick Start

```bash
npm install -g tscope
tscope --html # generate and open an HTML dashboard
```

Requires **Node.js 18+**.

## Documentation

Full documentation lives in the [`docs/`](docs/) folder:

- [Installation](docs/installation.md)
- [Usage](docs/usage.md) — CLI flags, date filtering, output formats, sample output
- [How It Works](docs/how-it-works.md) — session discovery, token accounting, resumed sessions
- [JSON Output](docs/json-output.md) — `tscope/report/v4` schema reference
- [HTML Dashboard](docs/html-dashboard.md) — dashboard features, Chronicle Insights, interactive date filter
- [Development](docs/development.md) — build, test, lint, project structure
- [Contributing](docs/contributing.md) — roadmap, license

## License

MIT.

---

Built with ❤️ for developers optimizing their Copilot CLI usage.
