# Development

## Project Structure

```
tscope/
├── src/
│   ├── index.ts              # CLI entry point, argument parsing
│   ├── discovery.ts          # Session discovery logic
│   ├── parser.ts             # events.jsonl parsing
│   ├── jsonlReader.ts        # Shared JSONL stream reader (used by parser and OTel source)
│   ├── filter.ts             # Date filtering and recency limiting
│   ├── tokens.ts             # Token math / aggregation helpers
│   ├── types.ts              # TypeScript types
│   ├── otel.ts               # `tscope otel` subcommand (enable/disable/status)
│   ├── render/
│   │   ├── Renderer.ts       # Renderer interface
│   │   ├── index.ts          # Renderer registry and factory
│   │   ├── style.ts          # ANSI text styling (bold/dim; respects NO_COLOR and TTY)
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
├── scripts/
│   └── screenshot-dashboard.mjs  # Generates synthetic HTML preview for CI screenshots
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

## Shared Utilities

### `jsonlReader.ts` — JSONL stream reader

`jsonlReader.ts` provides the shared `readJsonlFile` function used by both `parser.ts`
and `otelSource.ts` to stream JSONL files line by line. Both sources import it directly:

```typescript
import { readJsonlFile, JsonlReadControl } from "./jsonlReader";
// or, from a subdirectory:
import { readJsonlFile } from "../jsonlReader";
```

#### `readJsonlFile(filePath, onLine): Promise<void>`

Streams non-empty lines from `filePath`. For each non-empty, trimmed line, calls
`onLine(trimmedLine, control)` synchronously.

- **Resolves** after all lines have been delivered (triggered by `readline.close`).
- **Rejects** if the file cannot be opened or if a stream/readline error occurs.
- Errors thrown from inside `onLine` are caught and forwarded as rejections.
- Always destroys the underlying `ReadStream` and closes the `readline.Interface` on
  both normal completion and error — no handles are left open.

#### `JsonlReadControl`

The `control` object passed as the second argument to every `onLine` call exposes one
method for early termination:

| Method | Description |
|---|---|
| `control.stop()` | Closes the readline interface and destroys the stream immediately. The promise resolves normally (not as an error). Subsequent `onLine` calls are not made. |

**Example — read the first non-empty record and stop:**

```typescript
let firstRecord: unknown = null;
await readJsonlFile(filePath, (line, control) => {
  firstRecord = JSON.parse(line);
  control.stop();
});
```

`control.stop()` is used in `parser.ts` to terminate the scan early once the
`session.start` timestamp has been found.

### `tokens.ts` — token math helpers

`tokens.ts` is the single source of truth for all token arithmetic across the renderers
and the test suite. Import the functions you need:

```typescript
import {
  tokenPartition,
  totalTokens,
  freshInputTokens,
  emptyTokenCounts,
  addTokenCounts,
  hasTokenData,
} from "./tokens";
```

**Key invariant** — Copilot's `inputTokens` is the grand total of all input and already
**includes** `cacheReadTokens` and `cacheWriteTokens` as subsets (not separate additive
buckets). The only non-overlapping session total is therefore `inputTokens + outputTokens`.

#### `TokenPartition`

The interface returned by `tokenPartition`:

| Field | Type | Description |
|---|---|---|
| `freshInput` | `number` | `inputTokens − cacheRead − cacheWrite`, clamped at 0 — genuinely new (uncached) input. |
| `cacheRead` | `number` | Cache-read tokens (subset of input). |
| `cacheWrite` | `number` | Cache-write tokens (subset of input). |
| `output` | `number` | Output tokens. |
| `total` | `number` | `inputTokens + outputTokens` — the only non-double-counted grand total. |
| `anomalous` | `boolean` | `true` when `cacheRead + cacheWrite` exceeds `inputTokens` beyond a 16-token rounding tolerance. |

#### Functions

| Function | Returns | Description |
|---|---|---|
| `totalTokens(t)` | `number` | `t.inputTokens + t.outputTokens` — the correct grand total. |
| `freshInputTokens(t)` | `number` | `inputTokens − cacheRead − cacheWrite`, clamped at 0. |
| `tokenPartition(t)` | `TokenPartition` | Splits usage into the disjoint `[freshInput, cacheRead, cacheWrite, output]` segments used by all renderers for stacked bars and totals. |
| `emptyTokenCounts()` | `TokenCounts` | Returns a zeroed `TokenCounts` object — use as an accumulator seed. |
| `addTokenCounts(a, b)` | `TokenCounts` | Field-by-field sum of two `TokenCounts`. |
| `hasTokenData(models)` | `boolean` | Returns `true` when at least one model has non-zero `inputTokens` or `outputTokens`. Used by all three renderers to silently exclude zero-activity sessions. |

**Example — accumulate totals across models:**

```typescript
import { emptyTokenCounts, addTokenCounts, tokenPartition } from "./tokens";

const zero = emptyTokenCounts();
const total = Object.values(session.models).reduce(addTokenCounts, zero);
const { freshInput, cacheRead, cacheWrite, output, total: grand } = tokenPartition(total);
```

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
