# Tank — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Backend / Data Engineer
- **Created:** 2026-06-03

## Learnings

### Phase 1 Foundation — 2026-06-03

**Project layout:**
```
tscope/
  package.json          bin: { tscope: "dist/index.js" }, jest, ts-jest, eslint
  tsconfig.json         strict mode, commonjs, outDir: dist/, rootDir: src/
  src/
    index.ts            CLI entry: arg parsing, full pipeline orchestration
    types.ts            Core interfaces: TokenCounts, ParsedSession, InProgressSession, Session, Report
    discovery.ts        discoverSessions(): enumerates ~/.copilot/session-state, returns SessionRef[]
    filter.ts           makeDateFilter(), todayLocalDateString(), utcToLocalDateString()
    parser.ts           parseEventsFile() async, readSessionStartTime() lightweight helper
    rates.ts            RATE_TABLE, lookupRate(), RATE_TABLE_VERSION
    credits.ts          calcModelCredits(), calcSessionCredits()
    render/
      Renderer.ts       Interface: render(report: Report): void
      TextRenderer.ts   Box-drawing text format
    __tests__/
      rates.test.ts     13 tests
      credits.test.ts   5 tests
      parser.test.ts    7 tests (uses fs.mkdtempSync for JSONL fixtures)
  dist/                 tsc output (gitignored)
  node_modules/         gitignored
```

**Key file paths:**
- Session data: `%USERPROFILE%\.copilot\session-state\<session-id>\events.jsonl` (Windows)
- Session data: `~/.copilot/session-state/<session-id>/events.jsonl` (Unix)
- Token source event: `session.shutdown` → `data.modelMetrics.<modelName>.usage`
- Token fields: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`
- Start time: `session.start` → `data.startTime` (ISO 8601 UTC)

**events.jsonl parsing approach:**
1. Fast path: read last line with `fs.readFileSync` + split on `\n` — if `type === "session.shutdown"`, use it
2. Fallback: stream the file with `readline.createInterface` scanning for both `session.start` and `session.shutdown`
3. Use a `scanResult` container object (not bare `let` variables) to avoid TypeScript control flow narrowing `never` inside async closures
4. In-progress sessions (no shutdown): return `InProgressSession { inProgress: true }` — never crash

**Rate table location:** `src/rates.ts` — hardcoded TypeScript object, versioned with `RATE_TABLE_VERSION`. Add new models here when GitHub releases them.

**Credit formula:** `credits = (input*iRate + cacheRead*crRate + cacheWrite*cwRate + output*oRate) / 1e6 * 100`

**How to build and run:**
```bash
npm install
npm run build      # tsc → dist/
npm test           # jest → 20 tests
node dist/index.js --help
node dist/index.js --version
node dist/index.js   # today's sessions
npm i -g .         # global install → tscope command
```

**TypeScript gotcha:** Assigning to `let` variables inside async readline callbacks causes TypeScript strict control flow to narrow them to `never` after the `await`. Fix: use a mutable container object (`scanResult: { ... }`) so TypeScript can track the property type correctly.

**Architecture seams implemented:**
- `SessionPredicate` type in `discovery.ts` — pass filter predicates for date-range (#12)
- `Renderer` interface in `src/render/Renderer.ts` — swap in HtmlRenderer/JsonRenderer (#13, #14)
- `makeDateFilter(localDate)` factory — phase 1 passes `todayLocalDateString()`; phase 2 passes `--date` arg

### Phase 2 — Issues #12 and #13 — 2026-06-03

**JSON Output Renderer (#13):**
- `src/render/JsonRenderer.ts` — implements `Renderer` interface; outputs `JSON.stringify(output, null, 2) + "\n"` to stdout
- Schema identifier: `"tscope/report/v1"` — bump string when shape changes breaking
- Warnings (unknown model rates) written by `calcSessionCredits()` to stderr; stdout is never polluted
- Registered in `src/render/index.ts` under key `'json'`
- CLI flag: `--json` passed to `createRenderer('json')` in `src/index.ts`
- JSON top-level shape:
  ```
  { schema, generatedAt(ISO UTC), filter{description,reportDate},
    summary{sessionCount,completedCount,inProgressCount,totalEstimatedCredits,hasUnknownRates},
    sessions[{sessionId,path,startTime(ISO|null),localDateTime(YYYY-MM-DD HH:MM|null),
              inProgress,models[{modelName,usage{input,output,cacheRead,cacheWrite,reasoning},
              estimatedCredits(number|null),unknownRate}],
              totals{input,output,cacheRead,cacheWrite,reasoning,estimatedCredits,hasUnknownRates}}] }
  ```
- `estimatedCredits` is `null` (not `undefined`) in JSON for unknown-rate models

**Date Range Filtering (#12):**
- `isValidDateString(s)` in `src/filter.ts` — regex format check + `new Date(y,m-1,d)` round-trip validation
- `makeRangeDateFilter(start, end)` in `src/filter.ts` — async predicate, string comparison of `YYYY-MM-DD` (lexicographic sort = date sort for zero-padded ISO dates)
- Extracted `resolveSessionLocalDate(ref)` private helper to DRY up `makeDateFilter` and `makeRangeDateFilter`
- CLI flags: `--date YYYY-MM-DD`, `--range START END`, `--all` in `src/index.ts`
- Validation: malformed dates and start > end exit 1 with clear message to stderr
- `filterDescription` added to `Report` type; TextRenderer uses it for "No sessions found for {X}."
- Flags compose: `--all --json`, `--range START END --json`

**New files:**
- `src/render/JsonRenderer.ts`
- `src/__tests__/filter-range.test.ts` (17 tests: isValidDateString + makeRangeDateFilter + boundary conditions)
- `src/__tests__/json-renderer.test.ts` (30 tests: schema fields, model shape, unknown rates, in-progress, ordering)

**Test count:** 87 → 134 (all passing). Build: `npm run build` clean, strict mode.

**PR #22:** `squad/phase2-json-daterange` → main

### Issue #24 — Remove Pricing / Pivot to Pure Token Analytics — 2026-06-02

**What changed:**
- **Deleted:** `src/rates.ts`, `src/credits.ts`, `src/__tests__/rates.test.ts`, `src/__tests__/credits.test.ts`
- **Updated types.ts:** Removed `ModelCredits`, `SessionCredits` interfaces; simplified `Report.sessions` to `ParsedSession[]`; removed `totalCredits` and `hasUnknownRates` from `Report`
- **Updated src/index.ts:** Removed `calcSessionCredits` import and pipeline; bumped VERSION to `0.3.0`
- **Updated TextRenderer.ts:** Removed credits line and per-model credit lines; added `Premium: N requests` when `> 0`; simplified footer to session count only
- **Updated JsonRenderer.ts:** Bumped schema to `tscope/report/v2`; removed `estimatedCredits`, `unknownRate`, `hasUnknownRates`, `totalEstimatedCredits`; added `premiumRequests` per session; `summary.totalTokens` replaces credit total
- **Updated HtmlRenderer.ts:** Replaced `buildCreditsBars()` with `buildTokensByModelBars()`, replaced `buildCreditsTimelineChart()` with `buildTokensTimelineChart()`; updated stat cards; removed credit chips
- **Updated tests:** 134 → 123 tests (credits.test.ts + rates.test.ts removed = -29 tests; new token-focused assertions added); all 123 passing
- **Updated README.md:** Removed AI credit estimation sections; reframed as pure token analyzer; documented JSON schema v2

**Learnings:**
- PowerShell here-strings (`@"..."@`) corrupt TypeScript template literals with backticks. Use Python scripts (via `create` + `powershell python script.py`) to write TS files with template literals.
- `Report` type is the central hub — changing it requires coordinated updates to all three renderers and all tests simultaneously. One branch = clean atomic change.
- `totalPremiumRequests` is a raw Copilot value (not computed pricing) — retained in all renderers as-is.
- JSON schema v2 is a clean break from v1; the `schema` field guards downstream consumers.

**PR:** `squad/24-remove-pricing` → main (Closes #24)
