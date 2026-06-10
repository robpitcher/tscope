# Tank — History Archive

This archive contains detailed phase-by-phase notes from phases 1–4 (2026-06-03 to 2026-06-10). See current `history.md` for summarized learnings.

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Backend / Data Engineer
- **Created:** 2026-06-03

---

## Detailed Phase Notes (Archived)

### Phase 1 Foundation — 2026-06-03

Project layout established: TypeScript strict mode, jest/ts-jest testing, ESLint.

**Key architecture:**
- Session data: `~/.copilot/session-state/<session-id>/events.jsonl`
- Token source: `session.shutdown` event with per-model `modelMetrics`
- Token fields: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`
- Parsing strategy: Fast path reads last line; fallback streams file; in-progress sessions handled gracefully
- TypeScript gotcha: Use container objects to avoid control flow narrowing in async closures

**Project structure:**
```
src/
  index.ts            CLI entry
  types.ts            Core interfaces
  discovery.ts        Session enumeration
  filter.ts           Date filtering
  parser.ts           JSONL parsing
  rates.ts            Model rate table
  credits.ts          Credit calculation
  render/
    Renderer.ts       Interface
    TextRenderer.ts   Text output
```

### Phase 2 CI Validation — 2026-06-03

GitHub Actions CI workflow (`.github/workflows/ci.yml`) with lint+build+test gates. Node matrix 18/20/22.

**Rate table:** `src/rates.ts` versioned object  
**Build commands:** `npm run build`, `npm test`, `npm i -g .`

### Phase 2+3 JSON Output & Date Range — 2026-06-03

JSON schema v1 implemented with `--json` flag. Date range filtering with `--date`, `--range`, `--all` flags.

**Schema:** `tscope/report/v1` with per-model credit estimates, unknown rate tracking, in-progress handling.

**Tests:** 87 → 134 total

### Issue #24 — Remove Pricing / Pivot to Pure Token Analytics — 2026-06-02

Pricing removed entirely. Rate table, credit calculation, and related tests deleted.

**Changes:**
- Deleted: `src/rates.ts`, `src/credits.ts`
- JSON schema bumped: v1 → v2
- Tests: 134 → 123
- Reframed as pure token analytics

### Repository URL Migration — 2026-06-03 (Trinity Lead)

Canonical URL migrated: `devjoy-pub/tscope` → `robpitcher/tscope`  
All in-repo references updated including `REPO_URL` constant.

### OTel Feasibility Investigation — 2026-06-10

**File:** `~/.copilot/tscope/otel.jsonl` (84KB on 2026-06-10, actively written)

**Record types:**
- `span` — LLM and tool calls; carries token data
- `metric` — histograms; no session scope

**Token field mapping (VERIFIED):**
- `gen_ai.usage.input_tokens` = `inputTokens` (EXACT)
- `gen_ai.usage.output_tokens` = `outputTokens` (EXACT)
- `gen_ai.usage.cache_read_input_tokens` = `cacheReadTokens` (EXACT)
- `gen_ai.usage.cache_creation_input_tokens` = `cacheWriteTokens` (EXACT, different name)
- `gen_ai.usage.reasoning_output_tokens` = `reasoningTokens` (EXACT)

**Session identifier:** `gen_ai.conversation.id` on spans = session-state directory UUID

**Bonus signals:**
- `github.copilot.nano_aiu` — server-side credit count (÷1e9)
- Server latency, finish reasons, tool call counts, context window utilization
- MCP lifecycle events, anonymized user ID

**Architecture risks:**
- Single append-only file for ALL sessions
- No built-in file rotation
- Metrics have no session scope
- OTel only captures from enablement forward; events.jsonl required as historical fallback

**Reconciliation:** ZERO risk on token counts — OTel span tokens match events.jsonl exactly across 6 model+session combinations.

### Distribution Analysis — 2026-06-04 (Trinity Lead)

D2 confirmed: npm primary. Copilot plugins rejected (wrong fit). gh CLI extension viable post-v1.0 as secondary.

### OTel Architecture & User Approval — 2026-06-10

User (robpitcher) approved OTel-primary pivot with critical change: **NO per-session merging**. One source per run.

**User decisions:**
1. OTel primary; events.jsonl fallback
2. One source per run (not merged)
3. Cost from `nano_aiu` (OTel only)
4. v1 bonus signals: reasoning + context window
5. File rotation deferred
6. JSON schema v5

### DataSource Implementation — Phase 1+2 (2026-06-10)

**New types:**
- `DataSourceKind = "otel" | "logs"`
- `NormalizedSession extends ParsedSession`
- `DataSource` interface
- `ExtendedMetrics` — reasoning tokens, context window

**New modules:**
- `OtelDataSource` — parses `otel.jsonl`, groups by `gen_ai.conversation.id`, accumulates tokens/cost
- `LogsDataSource` — wraps parser, single-pass `loadAll()` with date filtering

**CLI:** `--source auto|otel|logs` (default: auto)

**JSON schema:** v4 → v5

**Tests:** 236 → 262, Trinity review gate APPROVED

### Trinity Review Gate — Phase 2 (2026-06-10)

VERDICT: APPROVED. All 7 review criteria satisfied. No-merge invariant, auto-fallback correct, interface sound, OTel parsing correct, cost invariant, v5 additive, no scope creep.

### Renderer Implementation — Phase 3 (2026-06-10)

Switch implemented source provenance and extended metrics display in all three renderers.

### Test Suite — Phase 4 (2026-06-10)

Apoc wrote 87 new tests: 36 OTel edge cases, 29 LogsDataSource, 17 source selection, 17 renderer edge cases.

**Reconciliation:** CLEAN — no bugs found. All 7 invariants verified end-to-end. Total: 395 tests passing.

### OTel Wrap-up — Phase 5 (2026-06-10)

**Code cleanups:**
- Added empty-result hint in `src/index.ts`
- Removed `hasTokenData` re-export from `logsSource.ts`
- Added 6 new hint tests

**Documentation:**
- `README.md`: Data Sources section
- `docs/usage.md`: Data source modes
- `docs/json-output.md`: v5 schema
- `docs/how-it-works.md`: Two-source architecture
- `docs/html-dashboard.md`: Source badge, credit chips, context window bar

**Changeset:** `.changeset/otel-primary-pivot.md` (minor bump)

**Final:** 395 tests pass. Build + lint clean. Commit `b5cbc36` on `otel`.

---

## Key Learnings Across All Phases

1. **JSONL parsing in TypeScript:** Use mutable container objects (not bare `let`) to avoid strict control flow narrowing in async closures.

2. **Central `Report` type:** Changes require coordinated updates across all renderers + tests. One branch per change = atomic clarity.

3. **Schema versioning:** String identifier (`tscope/report/vX`) guards downstream consumers. Bump on breaking changes.

4. **Date bucketing:** Use local date strings (YYYY-MM-DD) in UTC context; lexicographic sort = date sort for zero-padded strings.

5. **Concurrent filtering:** 16-way async parallelism for date filtering across many sessions is fast and not a bottleneck.

6. **PowerShell limitations:** Here-strings corrupt TypeScript template literals. Use Python scripts via `create` tool for TS files with backticks.

7. **OTel file format:** JSONL, append-only, one record per LLM call. Spans have token data; metrics are aggregates (not per-session). Must group by `gen_ai.conversation.id`. No built-in rotation.

8. **Token reconciliation:** OTel and events.jsonl produce identical token counts — zero drift risk when properly parsed.

9. **Dual-source architecture:** OTel is forward-looking (from enablement), events.jsonl is historical fallback. Never merge — select one per run for clarity.

10. **Extended metrics optional:** Only OTel provides reasoning tokens + context window. TextRenderer doesn't show them by default; HTML + JSON do when present.

---

## Gotchas to Remember

- `Session = ParsedSession | InProgressSession` — Do NOT change to `NormalizedSession | InProgressSession`
- `isOtelAvailable()` checks file exists + non-empty
- `LogsDataSource.loadAll()` is preferred (single pass); separate `loadSessions()` kept for interface compliance
- Context window fill clamped [0, 1] in renderers (handles anomalous OTel data)
- Empty OTel report still shows source footer (not an error)
- `NormalizedSession[]` is assignable to `ParsedSession[]` (structural subtyping works in TypeScript)
