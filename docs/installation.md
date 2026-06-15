# Installation

## Global Install (Recommended)

```bash
npm install -g tscope
```

Then run:

```bash
tscope
```

## From Source

```bash
git clone https://github.com/robpitcher/tscope.git
cd tscope
npm install
npm run build
npm install -g .
# or `npm link` for local development
```

## Requirements

- **Node.js 18.0.0 or later** (see the `engines` field in `package.json`).
- No network access required at runtime — `tscope` only reads local session files.

## Verifying the Install

```bash
tscope --version
tscope --help
```

If `tscope` is not on your `PATH` after a global install, confirm that your npm global `bin` directory is on `PATH`:

```bash
npm bin -g
```

## Enabling OTel (Recommended)

Out of the box, `tscope` reads session data from the Copilot CLI log files. To also get **server-side AI credit data**, enable the OpenTelemetry file exporter:

```bash
tscope otel enable
```

This adds a single environment variable (`COPILOT_OTEL_FILE_EXPORTER_PATH`) to your shell profile and creates the export directory. Open a new terminal after running it, then start a Copilot session — telemetry will be written automatically.

For full details on enabling, disabling, and checking OTel status, see [OTel Setup](otel.md).
