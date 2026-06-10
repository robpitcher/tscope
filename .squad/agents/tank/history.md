# Tank — History

**Seed:** tscope (token tracker for GitHub Copilot billing) | Backend/Data Eng | 2026-06-03

**OTel-Primary Pivot (2026-06-10):** Dual-source (OTel primary, logs fallback). `DataSource` interface, `OtelDataSource`, `LogsDataSource`. `--source auto|otel|logs`. Schema v5. 395 tests pass. Trinity APPROVED. Reconciliation CLEAN. Commit `b5cbc36`.

**Decisions:** OTel primary, one source/run, cost from `nano_aiu`, v1 signals (reasoning+context), rotation deferred.

**Invariants:** `Session=ParsedSession|InProgressSession`, `NormalizedSession` superset, `costAvailable⟺source==="otel"`, one source/run, OTel=`chat` spans, Logs=no cost/extended.

**Impl:** OTel reads `~/.copilot/tscope/otel.jsonl`, groups by `gen_ai.conversation.id`. Logs single-pass. Selection: `auto`/`otel`/`logs`.

See `history-archive.md` for full notes.

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

### 2026-06-10 — OTel Wrap-up (cleanups + docs + changeset)

**Branch:** `otel`

**Code cleanups (Part 1):**
- `src/index.ts`: Added empty-result OTel hint — when OTel source (auto or explicit) finds no sessions for the date range, prints advisory to stderr with mention of forward-only OTel coverage. Suggests `--source logs` for historical data; suggests `--all` when non-all filter is active. Hint is advisory (exit 0), not an error.
- `src/sources/logsSource.ts`: Removed stale re-export of `hasTokenData` (was imported from `tokens.ts` then re-exported; no caller used it from here — Trinity non-blocking follow-up).
- `src/__tests__/source-selection.test.ts`: 6 new tests covering hint behavior (fires for otel/auto, suppressed for logs, correct suggestion text for `--all` path, exits 0).

**Documentation (Part 2):**
- `README.md`: Added `Data Sources` section (OTel vs log parser table, auto-fallback notice, local-only note); added `--source` row to parameters table; updated JSON schema version mention to v5.
- `docs/usage.md`: New `Data Source` section documenting `--source`, three modes, auto-fallback notice, empty-range hint, cost-per-source table, date-filter interaction.
- `docs/json-output.md`: Full v5 schema with OTel + logs examples, top-level and per-session field reference tables, extended metrics table, v4 → v5 migration note.
- `docs/how-it-works.md`: Full rewrite to cover two-source architecture, no-merge / one-source-per-run rule, OTel span filtering (chat-only, not invoke_agent/metrics), field mapping table, log-parser section preserved.
- `docs/html-dashboard.md`: Documented source badge, per-session credit chips, Credits by Model chart, Total Credits card, and context-window utilization bar (amber ≥80%).

**Changeset (Part 3):**
- `.changeset/otel-primary-pivot.md`: minor bump; concise summary of OTel pivot features.

**Final state:** 395 tests pass (389 pre-existing + 6 new hint tests). Build clean, lint clean.

**Commit:** `b5cbc36` on `otel` branch.



**Branch:** `otel`

**New module layout:**
```
src/
  types.ts           +DataSourceKind, +ExtendedMetrics, +NormalizedSession,
                     +SessionDatePredicate, +DataSource, +Report.source/costAvailable
  sources/
    logsSource.ts    LogsDataSource — wraps discovery + parseEventsFile
    otelSource.ts    OtelDataSource — parses otel.jsonl + isOtelAvailable()
  index.ts           --source auto|otel|logs, DataSource wiring, auto-select logic
  render/
    JsonRenderer.ts  Schema bumped v4→v5, adds source/costAvailable/totalCost/modelCosts
  __tests__/
    otel-source.test.ts  Focused OTel parser unit tests (14 tests)
```

**Key type shapes:**
- `DataSourceKind = "otel" | "logs"`
- `NormalizedSession extends ParsedSession` — adds `source: DataSourceKind`, optional `modelCosts: Record<string, number>`, `totalCost: number`, `extended: ExtendedMetrics`
- `ExtendedMetrics` — optional `reasoningTokens: number`, `contextWindow: { usedTokens, limitTokens, utilizationRatio }`
- `DataSource` interface — `loadSessions(predicate?)`, optional `loadInProgressSessions?(predicate?)`
- `SessionDatePredicate = (localDateString, sessionId) => boolean` (sync; async IO done by DataSource)
- `Report` — adds `source: DataSourceKind`, `costAvailable: boolean`; `sessions` changed from `ParsedSession[]` to `NormalizedSession[]`
- `Session = ParsedSession | InProgressSession` — preserved for parser.ts backward compat

**Source selection `--source` logic:**
- `auto` (default): `isOtelAvailable()` checks file exists + non-empty → OTel; else → logs + stderr notice
- `otel`: force OTel; exits 1 with helpful message if unavailable
- `logs`: force log parser (current behavior unchanged)
- OTel sessions: `source:"otel"`, has `totalCost`/`modelCosts`/`extended`, `costAvailable: true`
- Logs sessions: `source:"logs"`, no cost fields, `costAvailable: false`
- Mutual exclusion enforced: single source per run, no merging

**OTel parsing approach (confirmed correct from feasibility):**
- Only `span` records where `name.startsWith("chat ")` — ignores `invoke_agent` (duplicates), `execute_tool`, `metric` records
- Group by `gen_ai.conversation.id`
- Per-span: accumulate tokens via `addTokenCounts()`, credits via `nano_aiu ÷ 1e9`, track earliest startTime
- Malformed lines: silently skip on JSON.parse failure
- Date predicate: convert earliest span time to ISO → local date string → predicate
- `eventsPath` for OTel sessions points to the shared `otel.jsonl` file

**LogsDataSource internal design:**
- `loadAll()` single-pass method — reads each file once and splits completed/in-progress
- `index.ts` calls `logsSource.loadAll()` for efficiency (avoids double file reads)
- Concurrent date filtering: 16-way concurrency via async workers (same as old `filterRefsWithConcurrency`)

**JSON schema v5 changes:**
- Added: `source`, `costAvailable` at top level
- Added: `source`, `totalCost?`, `modelCosts?` per session
- All v4 fields preserved; changes are additive

**Test count:** 236 → 262 (11 suites, all passing). Build: `npm run build` clean. Lint: `npm run lint` clean.

**Gotchas:**
- `Session = ParsedSession | InProgressSession` must stay for `parseEventsFile` return type compat. Do NOT change it to `NormalizedSession | InProgressSession` — that's only the DataSource level.
- `isOtelAvailable()` exported from `otelSource.ts`, used in `index.ts` for auto-select.
- `LogsDataSource.loadAll()` is the preferred entry point from `index.ts` (single pass); `loadSessions()` and `loadInProgressSessions()` are separate slower methods kept for interface compliance.
- `NormalizedSession[]` is assignable to `ParsedSession[]` contexts in TypeScript (structural subtyping) — all existing renderers work unchanged.

