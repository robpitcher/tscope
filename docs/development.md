# Development

## Project Structure

```
tscope/
├── src/
│   ├── index.ts              # CLI entry point, argument parsing
│   ├── discovery.ts          # Session discovery logic
│   ├── parser.ts             # events.jsonl parsing
│   ├── filter.ts             # Date filtering and recency limiting
│   ├── tokens.ts             # Token math / aggregation helpers
│   ├── types.ts              # TypeScript types
│   ├── render/
│   │   ├── Renderer.ts       # Renderer interface
│   │   ├── index.ts          # Renderer registry and factory
│   │   ├── TextRenderer.ts   # Text output implementation
│   │   ├── JsonRenderer.ts   # JSON output (schema v5)
│   │   └── HtmlRenderer.ts   # HTML dashboard
│   ├── sources/
│   │   ├── logsSource.ts     # Log-file data source (events.jsonl)
│   │   ├── otelSource.ts     # OTel data source (otel.jsonl)
│   │   └── merge.ts          # OTel + logs merge helpers
│   └── __tests__/            # Unit and integration tests
│       └── helpers/          # Shared test infrastructure
│           ├── fixtures.ts   # Canonical Report/Session constants
│           ├── fs.ts         # Filesystem helpers (tmp dirs, event files)
│           └── render.ts     # Renderer capture helpers
├── docs/                     # Documentation (you are here)
├── package.json              # Dependencies, scripts, metadata
├── tsconfig.json             # TypeScript config
└── README.md                 # Project overview
```

## Build

```bash
npm run build
```

Compiles TypeScript to the `dist/` directory.

## Test

```bash
npm test
```

Runs tests via Jest.

## Lint

```bash
npm run lint
```

Runs ESLint on TypeScript source.

## Writing Tests

### Shared Test Helpers

The `src/__tests__/helpers/` directory provides shared infrastructure to keep test files DRY and prevent fixture drift.

#### `helpers/fixtures.ts` — Canonical fixture constants

Import shared `Report` and `NormalizedSession` constants from here instead of defining them inline:

```typescript
import {
  EMPTY_REPORT,        // logs source, no sessions, costAvailable=false
  OTEL_EMPTY_REPORT,   // otel source, no sessions, costAvailable=true
  SAMPLE_SESSION,      // two models (claude-sonnet-4-5, claude-haiku-4-5), source="logs"
  OTEL_SESSION,        // single model with totalCost, modelCosts, and extended metrics
  SAMPLE_IN_PROGRESS,  // in-progress session (no cost/token data)
} from "./helpers/fixtures";
```

**Authoritative token values for `SAMPLE_SESSION`:**

| model | inputTokens | outputTokens | cacheReadTokens | cacheWriteTokens | reasoningTokens |
|---|---|---|---|---|---|
| `claude-sonnet-4-5` | 1000 | 500 | **700** | 100 | 50 |
| `claude-haiku-4-5` | 300 | 100 | 0 | 0 | 0 |

> **Rule:** If a new test needs `cacheReadTokens` for `claude-sonnet-4-5`, the value must be `700`. Do not copy-paste the constant and change this field — that caused silent test drift before the helpers module existed.

#### `helpers/fs.ts` — Filesystem utilities

```typescript
import { makeTmpDir, writeTempEvents, writeLine, writeEventsWithStart, writeLogsSession } from "./helpers/fs";
```

- `makeTmpDir(prefix?)` — creates a `mkdtempSync` temp dir (default prefix `"tscope-test-"`)
- `writeTempEvents(dir, lines)` — writes a JSONL events file to `dir/events.jsonl`
- `writeLine(filePath, obj)` — appends one JSON line to a file
- `writeEventsWithStart(dir, startTime)` — minimal events file with a single `session.start` event
- `writeLogsSession(dir, sessionId, startTime, inputTokens?, outputTokens?)` — full logs session with `session.start` + `session.shutdown`

#### `helpers/render.ts` — Renderer capture utilities

```typescript
import { captureText, renderHtml, captureJson } from "./helpers/render";
```

- `captureText(report)` — captures `TextRenderer` stdout output as a string
- `renderHtml(report, filename)` — renders HTML to a temp file and returns its content
- `captureJson(report)` — captures `JsonRenderer` stdout and parses as JSON

### Conventions

- **Prefer importing shared helpers** over defining inline duplicates. If you need a variant, extend the helpers module rather than copy-pasting.
- **Prefer using `makeTmpDir`** over calling `fs.mkdtempSync` + `path.join(os.tmpdir(), ...)` directly. Always pair it with `afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))`.
- **Integration tests** (those that spawn the CLI as a subprocess) require `dist/index.js` — run `npm run build` before executing them.

## Development Mode

```bash
npm run dev
```

Runs directly via `ts-node` (no build step).
