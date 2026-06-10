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

### Phase 2 CI Validation — 2026-06-03

Tank delivered GitHub Actions CI workflow (`.github/workflows/ci.yml`) with lint+build+test gates on every PR and manual dispatch. Node matrix 18/20/22. All team members' work now flows through this pipeline for validation.

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

### CI Workflow — 2026-06-03

**Workflow file:** `.github/workflows/ci.yml`

**Triggers:** `pull_request` (any branch) + `workflow_dispatch` (manual from Actions tab)

**Job shape:** Single job `test` on `ubuntu-latest`, timeout 10 min, matrix across Node [18.x, 20.x, 22.x].

**Steps per matrix node:** checkout → setup-node (w/ npm cache) → `npm ci --no-fund --no-audit` → lint → build → test.

**Concurrency:** `group: ci-${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` — newer pushes to the same PR branch cancel stale runs.

**Conventions to carry forward:**
- Pin actions to major-version tags (`@v4`), not `@main` or full SHAs — matches squad-* workflow convention in this repo
- `actions/setup-node@v4` with `cache: 'npm'` handles npm caching automatically via `package-lock.json`; no manual cache step needed
- `npm ci --no-fund --no-audit` for clean, deterministic install logs in CI
- 10-minute job timeout is generous for the current suite; tighten if suite grows significantly
- Matrix strategy on Node versions catches version-specific regressions at low cost (parallel runners)

### 2026-06-03 — Repository URL Migration (Trinity Lead)

Trinity completed migration of canonical repository URL from `devjoy-pub/tscope` to `robpitcher/tscope`. All in-repo references updated including critical `src/render/HtmlRenderer.ts` REPO_URL constant that drives HTML report links. Build clean, 236 tests passing. See `.squad/decisions/decisions.md` for full scope.

### 2026-06-10 — OTel Feasibility Investigation

**Task:** Empirical investigation of whether the Copilot CLI OTel file exporter (`~/.copilot/tscope/otel.jsonl`) can replace `events.jsonl` as the primary source for per-session, per-model token + cost analysis.

**File location:** `%USERPROFILE%\.copilot\tscope\otel.jsonl` (Windows) / `~/.copilot/tscope/otel.jsonl` (Unix)  
**Status:** File exists and is actively written by the current session (84KB, 53 lines on 2026-06-10)

**OTel record types:**
- `span` — one record per LLM call or tool call. Token data lives here. Per-operation, emitted in real-time.
- `metric` — histogram aggregates over an export window. No session scoping in dataPoint attributes. NOT suitable for per-session aggregation.

**Span names observed (VERIFIED):**
- `chat <model-name>` — individual LLM invocations; carries all token fields
- `invoke_agent` — one per user turn; wraps chat spans; carries cumulative token totals for the turn and `gen_ai.conversation.id`
- `execute_tool <tool-name>` — tool call spans
- `elicitation` — user input prompts (ask_user)

**Metric names observed:**
- `gen_ai.client.token.usage` — token histogram by type (input/output); no conversation_id
- `gen_ai.client.operation.duration` — end-to-end operation latency histogram
- `gen_ai.client.operation.time_to_first_chunk` — TTFT distribution
- `gen_ai.client.operation.time_per_output_chunk` — streaming chunk timing
- `github.copilot.tool.call.count` — tool invocations by name + success outcome
- `github.copilot.tool.call.duration` — tool execution latency histogram
- `github.copilot.agent.turn.count` — LLM round-trips per agent invocation
- `github.copilot.mcp.server.connection.count` — MCP connection attempts by transport + outcome

**Session identifier:** `gen_ai.conversation.id` on `chat` and `invoke_agent` spans. VERIFIED to be the same UUID as the `session-state/` directory name for 4/4 tested sessions.

**Token field mapping (VERIFIED — exact match across 4 sessions):**
| OTel attribute (on `chat` span) | events.jsonl field | Match |
|---|---|---|
| `gen_ai.usage.input_tokens` | `modelMetrics.<model>.usage.inputTokens` | EXACT |
| `gen_ai.usage.output_tokens` | `outputTokens` | EXACT |
| `gen_ai.usage.cache_read_input_tokens` | `cacheReadTokens` | EXACT |
| `gen_ai.usage.cache_creation_input_tokens` | `cacheWriteTokens` | EXACT (different name) |
| `gen_ai.usage.reasoning_output_tokens` | `reasoningTokens` | EXACT |

**Token semantics:** Same as events.jsonl — `inputTokens` INCLUDES `cache_read` and `cache_write` as subsets. `freshInput = inputTokens - cacheRead - cacheWrite`. The `tokenPartition()` function in `tokens.ts` applies unchanged.

**Bonus signals in OTel (not in events.jsonl):**
- `github.copilot.nano_aiu` — server-side credit count in nano-AIU (÷1e9 = credits); eliminates need for client-side rate table
- `github.copilot.server_duration` — per-request server latency in ms
- `gen_ai.response.finish_reasons` — stop reason per call
- `gen_ai.client.operation.time_to_first_chunk` metric — TTFT distribution
- `gen_ai.client.operation.time_per_output_chunk` metric — streaming chunk velocity
- `github.copilot.tool.call.count` / `.duration` — tool usage analytics
- `github.copilot.agent.turn.count` — multi-turn agentic depth
- `event.github.copilot.current_tokens` / `token_limit` — context window utilization
- `github.copilot.mcp.server.*` — MCP lifecycle events
- `enduser.pseudo.id` — anonymized user ID (multi-user future)

**Timestamp format:** `startTime: [unixSeconds, nanoseconds]` array. Conversion: `new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000)).toISOString()`. The OTel span startTime is slightly later (~10s) than events.jsonl `session.start` (OTel = first LLM call, events.jsonl = session creation). Same local date for bucketing — no impact on date filtering.

**Architecture risks:**
- Single shared append-only file for ALL sessions — must group by `gen_ai.conversation.id`
- No built-in file rotation; will grow unbounded without a rotation/pruning strategy
- Metric records have no session scope — spans are the only per-session source of truth
- `github.copilot.*` attributes are proprietary; `gen_ai.*` follow OTel GenAI semantic conventions (more stable)
- OTel only captures sessions from enablement onward; events.jsonl required as historical fallback

**Reconciliation status:** ZERO risk on token counts. OTel span attributes and events.jsonl `session.shutdown.modelMetrics` produce identical token counts across all 4 sessions tested (6 distinct model+session combinations).

### 2026-06-04 — Distribution Model Analysis Complete (Trinity Lead)

Trinity validated D2 (npm as primary distribution channel) against comprehensive analysis of Copilot CLI plugin model and gh CLI extensions. **Outcome: D2 confirmed, no amendment.** Copilot plugins are wrong architectural fit for standalone binary. gh-tscope extension viable as secondary channel post-v1.0 if reach expansion justifies cross-platform binary pipeline. Decision merged to decisions.md. Future horizon noted: add gh-tscope extension + precompiled binaries (win/mac/linux, amd64/arm64) post-v1.0, conditional on market demand.

