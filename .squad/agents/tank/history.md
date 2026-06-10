# Tank — History

**Seed:** tscope (token tracker for GitHub Copilot billing) | Backend/Data Eng | 2026-06-03

**OTel-Primary Pivot (2026-06-10):** Dual-source (OTel primary, logs fallback). `DataSource` interface, `OtelDataSource`, `LogsDataSource`. `--source auto|otel|logs`. Schema v5. 395 tests pass. Trinity APPROVED. Reconciliation CLEAN. Commit `b5cbc36`.

**Decisions:** OTel primary, one source/run, cost from `nano_aiu`, v1 signals (reasoning+context), rotation deferred.

~~**Invariants:** `costAvailable⟺source==="otel"`, one source/run~~  
**SUPERSEDED** by merge pivot below.

**Impl:** OTel reads `~/.copilot/tscope/otel.jsonl`, groups by `gen_ai.conversation.id`. Logs single-pass. Selection: `auto`/`otel`/`logs`.

See `history-archive.md` for full notes.

## Learnings — 2026-06-10 Merge Pivot

**Decision reversal (coordinator-merge-reversal.md):** `--source auto` now MERGES OTel + logs into a unified `NormalizedSession[]`. OTel wins on overlap (same `sessionId`). `--source otel` and `--source logs` remain single-source.

**New types in `src/types.ts`:**
- `ReportSourceKind = "otel" | "logs" | "mixed"` — report-level source (per-session still uses `DataSourceKind = "otel" | "logs"`)
- `SourceCoverage { otelCount, logsCount, costCoverage: "all"|"partial"|"none" }` — coverage summary
- `Report.source` → `ReportSourceKind` (was `DataSourceKind`)
- `Report.coverage: SourceCoverage` — NEW required field
- `Report.costAvailable: boolean` — kept; semantics: `coverage.otelCount > 0`

**New module `src/sources/merge.ts`:**
- `mergeSessions(otel, logs)` — dedup, OTel wins
- `computeSourceCoverage(sessions)` — counts per source + costCoverage
- `computeReportSource(coverage)` — "otel"|"logs"|"mixed"

**`src/index.ts` auto mode:**
- Loads BOTH OTel and logs under the same predicate
- Calls `mergeSessions` + `computeSourceCoverage` + `computeReportSource`
- Hint: only fires for `--source otel` (explicit) or `auto`+OTel+0-total; hint text differs per case
- `costAvailable = coverage.otelCount > 0`

**`src/render/JsonRenderer.ts`:** `coverage` field added to top-level output (after `costAvailable`).

**`src/render/TextRenderer.ts`:** handles `source === "mixed"` → "mixed (OTel + logs)" label (minimal; full UI is Switch's phase).

**HTML (switch-merge-provenance.md, Switch delivered):**
- Per-session source badge on EVERY card (first chip in `.session-summary-chips`)
- Coverage summary in header for mixed reports: "N OTel · M logs" with explanation
- Cost unavailable chip on logs cards (transparent, dashed border)
- Total Credits stat: "OTel sessions only" subtitle for mixed reports

**Schema:** v5 in-place, no v6 bump. New top-level fields: `source` (can be `"mixed"`), `coverage` object.

**Test count:** 395 → 437+ (all passing). New suites: `merge.test.ts` (42 tests). Coverage tests in `json-renderer.test.ts` and `source-selection.test.ts`.

**Docs updated (this turn):**
- `README.md` — Data Sources table: `auto` now merges; OTel authoritative on overlap
- `docs/usage.md` — Merge flow, per-session cost badges, source interaction with date filters
- `docs/json-output.md` — Coverage object spec; mixed report example; v5 migration notes (new `source`, `coverage`)
- `docs/how-it-works.md` — Merge rule: dedup by sessionId, OTel wins, logs provide history
- `docs/html-dashboard.md` — Per-session badges, coverage summary, cost unavailable chip
- `.changeset/otel-primary-pivot.md` — Changeset now describes merge model (was: old no-merge behavior)

## Learnings — 2026-06-03 Merge Pivot (ARCHIVE)