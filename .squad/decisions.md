# Squad Decisions

## Active Decisions

## Sort Fix: Template-Literal Raw-Newline Bug + UX Improvements (2026-06-13)

**Status:** IMPLEMENTED

**Author:** switch (Frontend/Dashboard Dev)  
**Date:** 2026-06-13

### Root Cause

The entire client-side script is emitted as one `<script>${JS}</script>` block. The `JS` constant is a TypeScript template literal (backtick string). Inside that template literal, escape sequences are resolved at build time:

- `'\n'` → raw LF (0x0A)
- `'\r'` → raw CR (0x0D)
- `'\r\n'` → raw CRLF

When these characters appear inside single-quoted JS string literals in the emitted HTML, ECMAScript rejects them — a string literal cannot contain a raw line terminator — producing a **SyntaxError**.

Because all IIFEs share one `<script>` block, a single SyntaxError at any point silences **all** client-side behaviour: sort, CSV export, theme toggle, and chart tooltips.

### Fixes Applied

#### 1. `csvCell` indexOf check (primary bug)
```
// Before (raw LF/CR in emitted JS → SyntaxError)
s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1

// After (proper escape sequences in emitted JS)
s.indexOf('\\n') !== -1 || s.indexOf('\\r') !== -1
```

#### 2. `buildCsv` line join (same class)
```
// Before
return lines.join('\r\n') + '\r\n';

// After
return lines.join('\\r\\n') + '\\r\\n';
```

#### 3. Regression guard
Added `new Function(scriptBody)` test in `html-renderer.test.ts` that extracts the executable `<script>` block and asserts it parses without throwing. This test would have failed against the original bugs.

### UX Improvements (same PR)

#### Option text: "AI credits consumed" → "AI credits"
Shorter, cleaner label. Value attribute `credits` unchanged.

#### Visible "Sort:" label
Added `<label class="sort-label" for="sort-sessions">Sort:</label>` to the left of the select. Previously the control had only an `aria-label`.

#### Asc/Desc direction toggle button
Added `<button id="sort-direction">` (▼ desc default) immediately to the right of the select. Clicking toggles `sortDir` state between `'desc'` and `'asc'` and re-runs `applySort`. Sessions with blank/null sort keys (no start date, no credits) always sort to the bottom regardless of direction. JS: `updateDirBtn()` syncs the glyph (▼/▲) and `aria-label`.

#### Apply sort on page load
`applySort(sortSelect.value)` is called immediately on script execution so cards reflect the dropdown state without requiring a user interaction.

### Files Changed

- `src/render/HtmlRenderer.ts` — csvCell fix, buildCsv fix, sort JS replacement, HTML toolbar, CSS
- `src/__tests__/html-renderer.test.ts` — updated sort-presence test, new script-parse regression test, new sort-dir test

### Validation

✅ npm run build clean
✅ npm run lint clean
✅ full jest suite 528/528 pass; html-renderer suite 85/85
✅ Global dist rebuilt + verified fixes in global distribution

---

## Sort Dropdown for Session Cards (2026-06-13)

**Status:** IMPLEMENTED

**Author:** switch (Frontend/Dashboard Dev)  
**Date:** 2026-06-13

### What was added

A `<select id="sort-sessions" class="sort-select">` dropdown with three options:
- **Session date** (default)
- **Token count**
- **AI credits consumed**

Positioned to the left of the CSV button inside `#dashboard-controls`.

Client-side sort wiring (in the existing CSV export IIFE) reads `data-sort-*` attributes stamped on each `<article class="session-card">` at server-render time and reorders existing DOM nodes via `appendChild` — no card HTML is rebuilt in JS.

### Data attributes added to session cards

- `data-sort-start` — ISO start timestamp (empty string if unknown)
- `data-sort-tokens` — integer total token count
- `data-sort-cost` — float credits value (empty string if unavailable)

In-progress cards get `data-sort-tokens="0"` and `data-sort-cost=""`.

### Default sort directions

| Option | Direction | Rationale |
|--------|-----------|-----------|
| Session date | Newest first | Most recent work is most relevant |
| Token count | Highest first | Heaviest sessions are most interesting |
| AI credits consumed | Highest first | Biggest cost sessions first; null/empty floats to bottom |

### In-progress card grouping

In-progress cards sort alongside completed cards using the same key. In practice:
- **Date**: sorted by actual start time — natural chronological placement
- **Tokens**: always float to the bottom (0 tokens)
- **Credits**: always float to the bottom (empty cost)

This is cleaner than pinning them to top/bottom unconditionally, since date order remains coherent.

### Style

`.sort-select` matches `.export-btn` visually: `border-radius: 100px`, `height: 32px`, same border/color/transition tokens.

### Files changed

- `src/render/HtmlRenderer.ts` — toolbar HTML, CSS, JS IIFE, session card data attributes
- `src/__tests__/html-renderer.test.ts` — new test "renders a sort dropdown to the left of the CSV button"

### Validation

✅ Build passes
✅ Lint clean
✅ 83 tests pass
✅ Global dist rebuilt and verified

---

## OTel-Primary Pivot — Tank Feasibility (2026-06-10)

**Status:** RATIFIED — Implementation Complete

**Author:** Tank (Backend / Data Engineer)  
**Date:** 2026-06-10

### Verdict

**OTel as primary source for per-session, per-model token + cost analysis is FEASIBLE.**

Token counts from OTel span attributes match `events.jsonl` session.shutdown aggregates **exactly** across all 4 live sessions tested (6 distinct model+session combinations, zero discrepancy). All required fields are present with stable OTel GenAI semantic convention names.

**Top 3 caveats:**

1. **Metrics records have no session scope.** The 40 `metric` records in the file are histograms aggregated over an export window and carry no `gen_ai.conversation.id`. Per-session analysis must be built exclusively from the 13 `span` records. Metrics are useful only for aggregate/fleet-level analytics.

2. **Single append-only file for all sessions.** Unlike `events.jsonl` (one file per session directory), `otel.jsonl` intermingles all sessions. The parser must group by `gen_ai.conversation.id` and cannot assume one session per file. No file rotation was found; unbounded growth is a risk in long-term use.

3. **OTel only captures forward from enablement.** Sessions before `tscope otel enable --apply` have no OTel data. The `events.jsonl` path is required as historical/fallback. Dual-source architecture is necessary.

### Field Availability

| Required Field | Status | OTel Source | Verified |
|---|---|---|---|
| Input tokens | **AVAILABLE** | `gen_ai.usage.input_tokens` | ✅ exact match |
| Output tokens | **AVAILABLE** | `gen_ai.usage.output_tokens` | ✅ exact match |
| Cache-read tokens | **AVAILABLE** | `gen_ai.usage.cache_read_input_tokens` | ✅ exact match |
| Cache-write tokens | **AVAILABLE** | `gen_ai.usage.cache_creation_input_tokens` | ✅ exact match (name differs) |
| Reasoning tokens | **AVAILABLE** | `gen_ai.usage.reasoning_output_tokens` | ✅ exact match |
| Model identity | **AVAILABLE** | `gen_ai.response.model` | ✅ same model strings |
| Session identifier | **AVAILABLE** | `gen_ai.conversation.id` | ✅ same UUID |
| Estimated credits | **BONUS** | `github.copilot.nano_aiu` (÷1e9) | ✅ server-side; no rate table needed |

### Bonus Signals in OTel

Server-side billing (`github.copilot.nano_aiu`), per-request latency, streaming metrics, tool call counts, agentic turn depth, stop reasons, context window utilization, MCP server health, tool definitions, anonymized user ID.

## Decision: OTel-Primary Architecture — tscope Pivot (2026-06-10)

**Status:** RATIFIED — Implementation Complete

**Author:** Trinity (Lead/Architect)  
**Date:** 2026-06-10

### Summary

tscope introduces a DataSource abstraction: both an OTel reader and the existing events.jsonl parser produce a common `NormalizedSession` model. OTel is the default source when data exists; logs are the automatic fallback for historical/pre-enablement data. The CLI surface gains `--source` for explicit control.

### Key Decisions

**D-OTel-1: DataSource Interface & Normalized Model**

A `DataSource` interface produces `NormalizedSession[]` from either OTel or events.jsonl. The normalized model extends the current `ParsedSession` with: source provenance tag, optional extended metrics (latency, request count, tool calls, errors), and coverage metadata. Both sources produce the same shape; renderers never know which source was used.

**D-OTel-2: Source Selection Default (USER OVERRIDE)**

User decision (2026-06-10T20:35:00Z): ONE source per run, never merged. Default is `auto`: use OTel data when `~/.copilot/tscope/otel.jsonl` exists; fall back to events.jsonl otherwise. No per-session merging — all sessions come from the same source. De-duplication removed.

**D-OTel-3: CLI Argument Redesign**

New flag: `--source otel|logs|auto` (default: auto). Existing date filters unchanged. The `otel` subcommand retained. No flags removed (alpha, but no gratuitous breaks).

**D-OTel-4: Schema Bump to v5**

JSON schema bumps to `tscope/report/v5`. Adds: `source` and `costAvailable` at report level, `source` + optional `modelCosts`/`totalCost`/`extended` per session. v4 consumers break on schema string but field additions are additive.

**D-OTel-5: Extended Metrics — Optional Block**

OTel-sourced sessions include an `extended` object with reasoning tokens + context-window utilization (v1). Deferred for later: server latency, finish reasons, and global stats. These appear in HTML dashboard and JSON but not in the default text renderer. Core view remains token+cost.

### User Decisions Resolved

1. **Cost re-introduction:** YES — use `github.copilot.nano_aiu` (÷ 1e9) from OTel. Logs-only sessions show "cost unavailable".
2. **File rotation:** Deferred — tracking issue #7.
3. **Bonus signals in v1:** Reasoning tokens + context-window utilization only. Latency/tool-calls deferred.
4. **JSON v5 bump:** YES — ship v5 immediately (additive, no breaking changes beyond schema string).
5. **CLI surface changes:** YES — `--source` flag accepted. `--verbose` deferred.

**Implementation status:** COMPLETE (5 phases, 395 tests passing, 0 bugs).

---

## RATIFIED Decision: OTel-Primary Pivot User Approval (2026-06-10T20:35:00Z)

**Status:** RATIFIED — Implementation COMPLETE

**By:** robpitcher (via Copilot / Squad coordinator)

### User Approval

1. **Direction APPROVED:** OTel becomes the primary data source; existing `events.jsonl` parser is retained as the historical/fallback source.

2. **NO MERGING (architecture improvement):** OTel and log-parser data are mutually exclusive per run — never combined in a single report.
   - `--source auto` (default): use OTel if available; otherwise fall back to log parser with stderr notice.
   - HTML and JSON output must indicate which source generated it.
   
   **⚠️ SUPERSEDED (2026-06-10T22:40:00Z)** — This decision has been reversed. See "REVERSAL — merge sources in the report (OTel authoritative on overlap)" for new direction.

3. **Cost:** Show authoritative OTel cost (`github.copilot.nano_aiu` ÷ 1e9). Logs-only sessions marked **"cost unavailable"**.

4. **v1 bonus signals:** reasoning tokens + context-window utilization (headroom). Deferred: server latency, finish reasons, and global stats.

5. **File rotation:** Deferred. Tracking issue filed: **#7**.

6. **JSON schema:** Bump `tscope/report/v4` → `tscope/report/v5` (adds `source`/`costAvailable` + optional `extended` metrics).

---

## IMPLEMENTATION COMPLETE: DataSource Layer (2026-06-10)

**Status:** RATIFIED — Approved by Trinity, Implemented by Tank

**Branch:** `otel`

### What Was Built

#### New Types (`src/types.ts`)
- `DataSourceKind` = `"otel" | "logs"`
- `NormalizedSession extends ParsedSession` — adds `source`, optional `modelCosts`, `totalCost`, `extended`
- `ExtendedMetrics` — `{ reasoningTokens?: number; contextWindow?: { usedTokens, limitTokens, utilizationRatio } }`
- `DataSource` interface — `loadSessions(predicate?): Promise<NormalizedSession[]>`
- `Report` — adds `source: DataSourceKind`, `costAvailable: boolean`

#### New Modules
- **`src/sources/otelSource.ts` — OtelDataSource**
  - Reads `~/.copilot/tscope/otel.jsonl` line by line
  - Processes only `span` records where `name.startsWith("chat ")`
  - Groups by `gen_ai.conversation.id`; accumulates tokens, cost, reasoning, context window
  - All sessions have `source: "otel"` with `modelCosts`/`totalCost` populated

- **`src/sources/logsSource.ts` — LogsDataSource**
  - Wraps `discoverSessions()` + `parseEventsFile()` from existing parser
  - `loadAll(predicate?)` method; supports date filtering
  - All sessions have `source: "logs"`, no `modelCosts`/`totalCost`/`extended`

#### Source Selection (`src/index.ts`)
- Flag: `--source auto|otel|logs` (default: `auto`)
- Auto mode: `isOtelAvailable()` → use OTel; else → logs + stderr notice
- Mutual exclusion: One source per run, no merging

#### JSON Schema v5 (`src/render/JsonRenderer.ts`)
- Top-level: `source`, `costAvailable`
- Per-session: `source`, `totalCost?`, `modelCosts?`
- All v4 fields preserved — changes additive

### Key Invariants

- No source merging: one source selected per run
- `report.costAvailable === true` iff `report.source === "otel"`
- Logs sessions: `modelCosts === totalCost === extended === undefined`
- OTel parsing: `chat ` prefix filter, `nano_aiu ÷ 1e9`, corrupt-line tolerance

### Validation

✅ `npm run build` clean  
✅ `npm run lint` clean  
✅ 262 pre-Phase 4 tests pass  
✅ Trinity review gate APPROVED

---

## IMPLEMENTATION COMPLETE: Renderer Provenance + Extended Metrics (2026-06-10)

**Status:** COMPLETE — Approved by Trinity, Implemented by Switch

**Branch:** `otel`

### What Was Rendered

#### Source Provenance
- **TextRenderer:** `Source: OpenTelemetry` or `Source: event logs (historical) — cost data unavailable`
- **HtmlRenderer:** Blue `.source-badge--otel` or muted `.source-badge--logs`
- **JsonRenderer:** Top-level `source` + `costAvailable` (Tank); per-session `extended` serialized (Switch)

#### Cost Display
- **TextRenderer:** Per-session `Cost: X.XX credits` when `session.totalCost !== undefined`
- **HtmlRenderer:** Green `.chip-credits` per session card (OTel only); "Total Credits" stat card; "Credits by Model" chart
- **JsonRenderer:** `totalCost`/`modelCosts` and new `extended` fields

#### Extended Metrics
- **TextRenderer:** `Reasoning: X` row in model block when `tokens.reasoningTokens > 0`; `Context: X,XXX / X,XXX tokens (X% used)` in TOTALS
- **HtmlRenderer:** CSS fill bar per session when `extended.contextWindow` present; ≥80% utilization adds `.ctx-window-high` (amber)
- **JsonRenderer:** `session.extended` fully serialized (v5 schema)

### Validation

✅ All v5 schema fields present and correct  
✅ Logs sessions: no phantom `extended` or cost fields  
✅ Context-window fill clamped at [0, 1]

---

## IMPLEMENTATION COMPLETE: Edge-Case & Reconciliation Tests (2026-06-10)

**Status:** COMPLETE — CLEAN, Zero Bugs Found  
**Branch:** `otel`  
**Author:** Apoc (Tester / Quality Engineer)

### Test Coverage

| Suite | Tests Added | Total |
|---|---|---|
| `otel-source-edge.test.ts` | 36 | 36 |
| `logs-source.test.ts` | 29 | 29 |
| `source-selection.test.ts` | 17 | 17 |
| `renderer-edge-cases.test.ts` | 17 | 17 |
| **Subtotal new** | **87** | |
| Existing (pre-Phase 4) | — | 302 |
| **Grand total** | | **389** |

All tests pass. `npm run build` and `npm run lint` clean.

### Reconciliation Verdicts

| Invariant | Result |
|---|---|
| `OtelDataSource.totalCost === sum(modelCosts)` | ✅ Exact |
| Per-model tokens = sum of per-span values | ✅ Exact |
| `report.costAvailable === (report.source === "otel")` | ✅ End-to-end |
| Logs sessions: `modelCosts === totalCost === extended === undefined` | ✅ Confirmed |
| Context window fill: `width ∈ [0, 100%]` | ✅ Clamped |
| Credits chip: always 2 decimal places | ✅ Confirmed |
| Auto fallback stderr notice: exactly 1 occurrence | ✅ Confirmed |

**BUGS FOUND: NONE** — Implementation is solid.

---

## IMPLEMENTATION COMPLETE: Documentation & Wrap-up (2026-06-10)

**Status:** COMPLETE  
**Branch:** `otel`  
**Author:** Tank (Backend / Data Engineer)

### Code Cleanups

1. **Empty-result OTel hint (`src/index.ts`):** When OTel source is active but finds no sessions for date range, prints advisory hint to stderr (exits 0 — advisory, not error).
2. **`logsSource.ts` re-export cleanup:** Removed `hasTokenData` pass-through; all callers use direct import from `tokens.ts`.

### Documentation Updates

| File | Changes |
|---|---|
| `README.md` | Added `Data Sources` section; added `--source` row to parameters table; updated JSON schema to v5 |
| `docs/usage.md` | New `Data Source` section: three modes, auto-fallback notice, empty-range hint, cost-per-source table |
| `docs/json-output.md` | Full v5 schema with OTel + logs examples; top-level and per-session field tables; v4 → v5 migration note |
| `docs/how-it-works.md` | Full rewrite: two-source architecture, one-source-per-run rule, OTel span filtering, field mapping |
| `docs/html-dashboard.md` | Source badge, per-session credit chips, Credits by Model chart, Total Credits card, context-window bar |

### Changeset

File: `.changeset/otel-primary-pivot.md`  
**Bump:** minor (pre-1.0 feature + additive schema)

**Summary:** OTel-primary pivot — new `--source` flag, OTel default with log-parser fallback, per-session/per-model cost via `nano_aiu`, reasoning + context-window metrics, HTML provenance, JSON schema v5.

### Validation

✅ `npm run build` clean  
✅ `npm run lint` clean  
✅ **395 tests pass** (389 pre-wrap-up + 6 new hint tests)

### New Tests Added (6)

- Empty-result hint: fires when `--source otel` finds no sessions
- Hint mentions `--all` when a non-all filter active
- No hint when `--all` already in use
- Exit 0 even when OTel finds no sessions (advisory)
- No hint when `--source logs` finds no sessions
- Auto mode prints hint when OTel active but no sessions in range

### Implementation Complete

**Merged into decisions by:** Scribe (2026-06-10)

All five phases complete and ratified:
- Phase 1+2: DataSource layer (Tank) — APPROVED by Trinity
- Phase 3: Renderer provenance + extended display (Switch) — COMPLETE
- Phase 4: Edge-case + reconciliation tests (Apoc) — CLEAN, no bugs
- Phase 5: Wrap-up documentation + changeset (Tank) — COMPLETE

---

## MERGE-REWORK PHASE (2026-06-10)

The earlier "NO MERGING" decision (above) has been **SUPERSEDED** by the following merge-reversal increment, which reverts to a unified report with OTel as the authoritative source on overlaps.

### 2026-06-10T22:40:00Z: REVERSAL — merge sources in the report (OTel authoritative on overlap)

**By:** robpitcher (via Copilot / Squad coordinator)
**Status:** SUPERSEDES the earlier "no merge / mutually exclusive sources per run" decision.

**What changed:**
- `--source auto` (default) now **MERGES** OTel + log-parser sessions into a single unified report (log data fills history; OTel covers the recent window).
- **Overlap rule:** when a session exists in BOTH sources (same session id), use the **authoritative OTel** record and discard the logs duplicate — do NOT combine/sum them (no double-counting).
- `--source otel` and `--source logs` remain single-source overrides (unchanged).
- When no OTel data exists, `auto` is effectively logs-only (keep a tasteful notice).

**Provenance (now per-session, since reports are mixed):**
- **HTML: each session bubble/card MUST display its own source badge — "OTel" vs the old log method. (Hard user requirement.)**
- Text + JSON carry per-session source too; plus a coverage summary (e.g. "12 OTel / 3 logs").
- Cost shows for OTel sessions; log-only sessions show "cost unavailable".

**Schema:** v5 is still UNRELEASED (in draft PR #8), so evolve `tscope/report/v5` in place (per-session `source` already exists; add/adjust coverage + mixed cost representation). Do NOT bump to v6.

**Why:** A single report that spans full history (logs) while trusting authoritative OTel data wherever available is more useful than forcing the user to pick one source. The user explicitly wants merged output with OTel winning overlaps, and clear per-session provenance in the HTML dashboard.

---

### 2026-06-10: tank-merge-impl.md — Merge Rule, Report Coverage Model, Handoff

**Date:** 2026-06-10  
**Author:** Tank  
**Status:** IMPLEMENTED — otel branch, ready for Trinity review gate

#### What changed

`--source auto` now **merges** OTel + log-parser sessions into a single unified report (was: mutually exclusive, one source per run).

#### Merge rule

```
auto = mergeSessions(otelSessions, logsSessions)
```

1. Load OTel with the same date predicate.
2. Load logs with the same date predicate (`loadAll` for completed + in-progress).
3. `mergeSessions(otel, logs)` → union; any logs session whose `sessionId` matches an OTel session is **dropped** (OTel is authoritative; no combining/summing).
4. `inProgressSessions` always come from logs only (OTel has no in-progress concept).

If OTel is not available (`isOtelAvailable()` returns false), `auto` falls back to logs-only and prints:
```
No OpenTelemetry data found — falling back to log-file parsing.
```

`--source otel` and `--source logs` are unchanged (single-source overrides).

#### Report coverage model — exact field names

**New type: `ReportSourceKind` (`src/types.ts`)**
```typescript
type ReportSourceKind = "otel" | "logs" | "mixed";
```
- `"otel"` — all sessions from OTel
- `"logs"` — all sessions from the log parser
- `"mixed"` — merged (OTel + logs, default `--source auto` when OTel is available)

**New interface: `SourceCoverage` (`src/types.ts`)**
```typescript
interface SourceCoverage {
  otelCount: number;          // sessions with source: "otel" in this report
  logsCount: number;          // sessions with source: "logs" in this report
  costCoverage: "all" | "partial" | "none";
    // "all"     = all sessions have cost (pure OTel)
    // "partial" = some have cost (OTel+logs mixed)
    // "none"    = no sessions have cost (pure logs or empty)
}
```

**Updated `Report` fields (`src/types.ts`)**
| Field | Type | Semantics |
|---|---|---|
| `source` | `ReportSourceKind` | `"otel"` / `"logs"` / `"mixed"` |
| `costAvailable` | `boolean` | `coverage.otelCount > 0` |
| `coverage` | `SourceCoverage` | per-source counts + costCoverage |

`costAvailable` is kept for backward compat. For mixed reports it is `true` (cost present for the OTel subset).

**Per-session `NormalizedSession.source` (`src/types.ts`, unchanged)**
```typescript
source: "otel" | "logs"   // DataSourceKind, per row
```
Every session carries its own source. Renderers **must** use `session.source` for per-session badges/chips, not `report.source`.

#### JSON schema v5 — new top-level fields (in-place, no v6 bump)

```json
{
  "schema": "tscope/report/v5",
  "source": "mixed",
  "costAvailable": true,
  "coverage": {
    "otelCount": 12,
    "logsCount": 3,
    "costCoverage": "partial"
  },
  ...
}
```

Per-session `source` already serialized (`sessions[].source`).

#### Handoff for Switch (renderers — next phase)

**Per-session source badge (HARD REQUIREMENT):**
- Read `session.source` (not `report.source`) to choose the badge.
- `"otel"` → use existing `source-badge--otel` CSS class + label "OTel"
- `"logs"` → use existing `source-badge--logs` CSS class + label "log parser"
- Add a `source-badge--logs` per-session badge inside each session bubble/card.

**Coverage summary:**
- Read `report.coverage.otelCount` and `report.coverage.logsCount` for "N OTel / M logs" line.
- Read `report.coverage.costCoverage` for the indicator:
  - `"all"` → all sessions have cost data
  - `"partial"` → show partial-cost notice (e.g. "Cost available for OTel sessions only")
  - `"none"` → show "cost unavailable"
- `report.costAvailable` is `true` when `otelCount > 0` — safe to use as "at least some cost data".

**Per-session cost chip:**
- Show `session.totalCost.toFixed(2) + " credits"` when `session.totalCost !== undefined`
- Show "cost unavailable" when `session.source === "logs"` (no `totalCost`)
- OTel sessions: `session.modelCosts` has per-model breakdown; `session.totalCost` is the sum

**TextRenderer (mixed label already added):**
- `source === "mixed"` → "mixed (OTel + logs)". Switch can improve later.

#### Handoff for Apoc (tests — next phase)

The following are already covered in the new suites but Apoc should extend:

| Area | What to test |
|---|---|
| `merge.test.ts` ✅ | All covered: dedup, OTel-only, logs-only, coverage, round-trips |
| `source-selection.test.ts` ✅ | Mixed mode, overlap, coverage counts in JSON |
| `json-renderer.test.ts` ✅ | Coverage field shape, costCoverage values, mixed source |
| **Not yet covered** | `--max` + mixed: coverage counts reflect the sliced set, not raw |
| **Not yet covered** | `--source auto` when OTel has sessions but logs dir is missing (OTel-only path) |
| **Not yet covered** | HTML/text output for `source === "mixed"` (Switch's phase; add after Switch ships) |

#### Files changed this turn

| File | Change |
|---|---|
| `src/types.ts` | Added `ReportSourceKind`, `SourceCoverage`; updated `Report.source`, added `Report.coverage` |
| `src/sources/merge.ts` | **NEW** — `mergeSessions`, `computeSourceCoverage`, `computeReportSource` |
| `src/index.ts` | Auto mode now merges; `coverage` in Report; updated hint logic + HELP_TEXT |
| `src/render/JsonRenderer.ts` | `coverage` field in JSON output; updated docstring |
| `src/render/TextRenderer.ts` | Handles `source === "mixed"` in `sourceLabel` |
| `src/__tests__/merge.test.ts` | **NEW** — 42 unit tests |
| `src/__tests__/source-selection.test.ts` | Added `writeLogsSession` helper + mixed/coverage integration tests |
| `src/__tests__/json-renderer.test.ts` | Added coverage describe block (6 tests) |
| `src/__tests__/html-renderer.test.ts` | Added `coverage` to EMPTY_REPORT fixture |
| `src/__tests__/text-renderer.test.ts` | Added `coverage` to EMPTY_REPORT fixture |
| `src/__tests__/renderer-edge-cases.test.ts` | Added `coverage` to fixtures |
| `.squad/agents/tank/history.md` | Appended Learnings section |

---

### 2026-06-10: Trinity Merge Review — Data Layer Gate

**Date:** 2026-06-10
**Reviewer:** Trinity (Lead / Architect)
**Commit:** adce689 (Tank)
**Branch:** otel

#### VERDICT: APPROVED

The merge implementation is correct, well-tested (437 tests pass), and precisely scoped to the reversal decision.

#### Criteria Assessment

**1. Dedup correctness ✅**

`mergeSessions()` builds a `Set` of OTel session IDs and drops any logs session whose ID matches. The join key is the same Copilot CLI session UUID on both sides:
- OTel: `gen_ai.conversation.id` attribute (otelSource.ts:145)
- Logs: directory name under `~/.copilot/session-state/` (discovery.ts:58)

OTel wins completely — the logs duplicate is discarded with no summing or combining. No double-counting possible.

**2. Merge integrity ✅**

- Date predicate built once and passed to both sources identically (index.ts:396, 400).
- `--max` applied post-merge via `selectMostRecentSessions` — source-agnostic recency sort.
- Coverage (`computeSourceCoverage`) computed on the FINAL sliced set (post-max), not raw.
- No cost leakage: logs sessions never carry `modelCosts`/`totalCost` — only `source: "logs"` is spread onto the ParsedSession.

**3. Provenance model ✅**

- `Report.source`: "mixed" iff both otelCount > 0 AND logsCount > 0; "otel" for pure OTel; "logs" otherwise.
- `coverage.costCoverage`: "all" for pure OTel, "partial" for mixed, "none" for pure logs/empty.
- `costAvailable = coverage.otelCount > 0` — correct, backward-compat.
- Per-session `NormalizedSession.source` set at parse time by each data source — reliable for renderers.

**4. Single-source modes intact ✅**

`--source otel` and `--source logs` code paths do not call `mergeSessions` — they load from a single source and flow directly to the coverage/report computation. Unchanged from pre-reversal behavior.

**5. Schema v5 — additive, no v6 ✅**

`SCHEMA_VERSION = "tscope/report/v5"` unchanged. New fields (`source`, `costAvailable`, `coverage`) are additive at top level. Per-session `source`, `totalCost`, `modelCosts` conditionally included. All existing v4 fields preserved.

**6. Scope ✅**

No creep. Changes are strictly: merge helper + coverage model + index.ts auto-merge wiring + JSON/text renderer adjustments + test fixtures. Nothing beyond the reversal decision.

#### Non-blocking observations

| Area | Note | Priority |
|------|------|----------|
| `--max` + mixed | Coverage counts reflect the sliced set (correct), but no dedicated test exists yet. Tank flagged in handoff. | Low — trivially correct by code path |
| Empty-result hint | Checks pre-max merged set for emptiness — correct behavior but subtle. | Informational |

#### Summary

Ship it. The merge logic is sound, the dedup join key is identity-verified, and the provenance model is clean. Switch can safely depend on `session.source` for per-session badges and `report.coverage` for summary displays.

---

### 2026-06-10: switch-merge-provenance.md — Per-session badges + coverage summary

**Date:** 2026-06-10  
**Author:** Switch  
**Status:** IMPLEMENTED — otel branch, commit f298a9c

#### What was rendered

**HTML**

**Per-session source badge (HARD REQUIREMENT — done)**

Every session card now has a source badge as the first chip in the `.session-summary-chips` row, reading `session.source`:

- `"otel"` → `<span class="source-badge source-badge--otel">OTel</span>` (accent-blue pill)
- `"logs"` → `<span class="source-badge source-badge--logs">log parser</span>` (muted pill, dashed border conveying "historical")

The badge is placed *before* the duration/tokens chips so left-to-right reading order is: provenance → speed → volume → cost.

**Coverage summary in header (mixed reports)**

For `report.source === "mixed"`, the old single badge is replaced by:
```html
<span class="coverage-summary" title="Sources: 1 OTel + 3 logs sessions — cost available for OTel sessions only">
  <span class="cov-otel">1 OTel</span>
  <span class="cov-sep"> · </span>
  <span class="cov-logs">3 logs</span>
</span>
```
Pure `"otel"` / `"logs"` headers keep their existing single `source-badge` (no change — existing tests preserved).

**Cost unavailable chip on logs cards**

Logs session cards show `<span class="chip chip-cost-unavail">no cost data</span>` (transparent background, dashed border, muted text) instead of a credits chip. OTel cards keep their green `.chip-credits`. "Total Credits" stat subtitle is "OTel sessions only" for mixed reports.

**Text Renderer**

Each session block now has a `Source:  OTel` or `Source:  log parser` line between the `Path:` line and the light `────` divider.

Footer for mixed reports changed from the old "Source: mixed (OTel + logs)" to:
```
Sources: 2 OTel, 3 logs — cost available for OTel sessions only
```
(reads `report.coverage.otelCount` and `report.coverage.logsCount`)

Pure otel/logs footers are unchanged.

**JSON Renderer**

No changes needed. Tank's implementation already serializes:
- `sessions[].source` per session ✅
- Top-level `coverage` object ✅
- `extended` object per OTel session ✅

#### What Apoc should test in the renderers

**New coverage needed (not in Switch's test files)**

| Area | What to test |
|---|---|
| HTML per-session badge | OTel card has `source-badge--otel`, logs card has `source-badge--logs` — covered in Switch's `html-renderer.test.ts` ✅ |
| HTML coverage summary | Mixed report: coverage-summary element present, correct counts — covered ✅ |
| HTML cost chip | Logs card: `chip-cost-unavail` present; OTel card: no chip-cost-unavail — covered ✅ |
| HTML mixed credits subtitle | "OTel sessions only" for mixed, "AI billing credits" for pure OTel — covered ✅ |
| Text per-session tag | "Source:  OTel" / "Source:  log parser" inside each session block — covered ✅ |
| Text mixed footer | "Sources: N OTel, M logs" — covered ✅ |
| **Not yet covered** | `--max` flag + mixed report: coverage counts in HTML reflect the *sliced* session set (currently the HTML receives the pre-sliced `report.sessions`, so this should work, but integration test worth having) |
| **Not yet covered** | Edge: `coverage.otelCount === 0` but `source === "mixed"` — e.g. "0 OTel · 5 logs" in coverage summary. Should render gracefully (no crash, shows "0 OTel"). |
| **Not yet covered** | Text renderer: mixed report where `logsCount === 0` — "Sources: 3 OTel, 0 logs". Cosmetically odd but shouldn't crash. |
| **Not yet covered** | HTML: per-session badge tooltip for a logs card says "cost data unavailable" — currently not asserted (the card-level `chip-cost-unavail` carries that text in its title, and the per-session badge's title also mentions "cost data unavailable"). Worth a dedicated tooltip test. |
| **Not yet covered** | HTML: client-side CSV export for a mixed report — `source` column not in the CSV schema yet; confirm no regressions in the download path. |

**Regression risk areas from this change**

1. **`renderer-edge-cases.test.ts` badge-position tests** — verified passing (461 total pass). Those tests look for `class="source-badge` from the header region, which still works because pure otel/logs header badges are unchanged.

2. **Text `source footer appears after SUMMARY` test** — was updated to use `lastIndexOf("Source:")` since per-session lines now precede the footer. Apoc should be aware if adding new "Source:" prefixed content to session blocks.

3. **`chip-cost-unavail` on every logs session** — even in a pure logs report every card shows "no cost data". This is intentional (always-honest) but the volume of chips in a logs-only report could feel noisy. Worth a UX review if user feedback surfaces it; easy to scope to `source === "mixed"` only if needed.

---

### 2026-06-10: apoc-merge-tests.md — Phase 4 Merge Edition: Test Coverage Report

**Date:** 2026-06-10  
**Author:** Apoc  
**Status:** COMPLETE — otel branch, commit 6ff20a7

#### Total test count

| Baseline (before this turn) | New this turn | Final total |
|---|---|---|
| 461 | 69 | **530** |

All 530 tests pass. `npm run build` and `npm run lint` clean.

#### What's covered

**merge-integrity.test.ts (28 tests) — pure reconciliation**

| Area | Tests |
|---|---|
| Dedup: exactly one entry per overlap pattern | 4 |
| Token counts: OTel values preserved, not doubled | 3 |
| Cost integrity: credits from OTel only, none from logs | 5 |
| Coverage accuracy: otelCount + logsCount == merged.length | 4 |
| costAvailable === (otelCount > 0) invariant | 5 |
| Report source label derivation (otel/logs/mixed) | 4 |
| Large-cardinality reconciliation (50+50, 30+30+20, 5-cost sum) | 3 |

**Key invariants verified (pure functions):**
- `merged.length == uniqueOtelIds.length + uniqueLogsIds.length` for any overlap pattern
- `sum(merged.totalCost) == sum(otelSessions.totalCost)` to float precision
- `merged[overlap].models["gpt-4"].inputTokens == otelSession.inputTokens` (NOT otel+logs sum)
- `computeSourceCoverage(merged).otelCount + .logsCount == merged.length`
- `coverage.otelCount > 0` iff at least one OTel session survived

**merge-integration.test.ts (18 tests) — subprocess end-to-end**

| Area | Tests |
|---|---|
| `--max` after merge: coverage sums to slice size | 3 |
| Auto mode + OTel present + no session-state dir | 3 |
| Both sources empty after date filter: graceful | 3 |
| `--source otel`/`--source logs` never produce `mixed` | 4 |
| JSON provenance: per-session source, overlap dedup visible | 5 |

**Gap coverage (from Tank's handoff):**
- `--max N` on mixed set: `coverage.otelCount + coverage.logsCount == N` ✅
- `--source auto` + OTel present + missing session-state dir: `source='otel'`, `logsCount=0` ✅

**merge-renderer-gaps.test.ts (23 tests) — renderer edge cases**

| Area | Tests |
|---|---|
| HTML: `otelCount=0` + `source='mixed'` → "0 OTel", no crash | 4 |
| Text: `logsCount=0` + `source='mixed'` → "Sources: N OTel, 0 logs" | 3 |
| HTML: per-session logs badge has `title` mentioning "cost data unavailable" | 2 |
| JSON: `coverage.otelCount/logsCount` match actual session sources | 7 |
| HTML: `--max` simulation — slice coverage matches rendered HTML | 2 |
| Text: per-session source tags in mixed report | 4 |
| (Subtotal note: 4+3+2+7+2+4 = 22; one describe block has an extra test) | +1 |

**Gap coverage (from Switch's handoff):**
- HTML `otelCount=0` + `source='mixed'` edge case ✅
- Text `logsCount=0` + `source='mixed'` edge case ✅
- HTML per-session logs badge `title` attribute (cost unavailability) ✅
- JSON per-session `source` vs `coverage` consistency ✅
- HTML `--max` simulation with coverage-summary ✅

#### Reconciliation verdict

**CLEAN.** All arithmetic invariants hold end-to-end:

1. **No double-counting:** `merged[overlap].tokens == otelSession.tokens` (not OTel+logs sum or half).
2. **Cost accuracy:** `sum(merged.totalCost) == sum(OTel costs only)` verified to `toBeCloseTo(…, 8)` precision.
3. **Coverage math:** `otelCount + logsCount == sessions.length` for all test cases.
4. **costAvailable gate:** `true` exactly when `otelCount > 0` — invariant holds in subprocess JSON output across pure-otel, pure-logs, mixed, and empty scenarios.
5. **Single-source isolation:** `--source otel` and `--source logs` never produce `source='mixed'`; logs sessions are absent from OTel output and vice-versa.
6. **Merge dedup end-to-end:** Subprocess test confirms that when `SHARED_ID` appears in both sources, exactly one session with that ID appears in JSON output with `source='otel'`.

#### Bugs found

**None.** The implementation reconciles correctly across all invariant tests. The merge helper (`src/sources/merge.ts`), OTel data source, logs source, and all three renderers are consistent.

#### Not covered by this turn (out of scope / cosmetic)

- HTML: CSV export `source` column — Switch's note flagged this as a potential regression. Light check confirms the CSV schema test in `html-renderer.test.ts` still passes (no `source` column in current CSV schema, no regression). Adding a `source` column to the CSV is a product decision, not a bug.
- HTML: tooltip title text on OTel per-session badges — already covered in Switch's suite.
- Text formatter carry-over edge cases — already covered in `text-renderer.test.ts`.

---

### 2026-06-10: tank-merge-docs.md — Docs Update for Merge Behavior

**Date:** 2026-06-10  
**Author:** Tank  
**Status:** COMPLETED — docs + changeset committed, otel branch

#### Summary

Updated all user-facing documentation to reflect the new **merge-based** `--source auto` behavior, replacing the old "one source per run" model.

#### Files Updated

| File | Change |
|---|---|
| `README.md` | Data Sources table: `auto` now merges OTel + logs; OTel authoritative on overlap; cost shown for OTel, unavailable for logs |
| `docs/usage.md` | Data Source section: expanded to explain merge flow, per-session cost availability, single-source overrides |
| `docs/json-output.md` | Added mixed report example; documented `coverage` object (`otelCount`, `logsCount`, `costCoverage`); updated v5 migration notes (new `source`, `coverage` fields) |
| `docs/how-it-works.md` | Rewrote "Source Selection" → "Source Selection — Smart Merging"; described dedup rule (OTel wins, no double-count); logs-only fallback path |
| `docs/html-dashboard.md` | Added per-session source badge description; coverage summary for mixed reports; cost unavailable chip on logs cards |
| `.changeset/otel-primary-pivot.md` | Updated to describe merge model instead of old single-source behavior |
| `.squad/agents/tank/history.md` | Appended detailed Learnings section: types, modules, schema, HTML changes, docs updates |

#### Key Messaging

**Old model (REMOVED):** "tscope reads from one of two local sources per run (no merging)."

**New model (NOW DOCUMENTED):**
- `--source auto` (default) merges OTel + logs into a unified report
- Sessions present in both are deduplicated — OTel record is authoritative, logs duplicate dropped
- Logs provide historical context; OTel provides recent, authoritative data with cost metrics
- Per-session `source` badges on every HTML card show which sessions have cost data
- Coverage summary on mixed reports: "N OTel · M logs"

#### Validation

- ✅ `npm run lint` — no errors
- ✅ `npm run build` — no errors
- ✅ Commit: `docs: update for merge-based source mode` (0e6059a)

#### Handoff Notes

All documentation now aligns with Tank's merge implementation (merging-pivot turn) and Switch's HTML rendering (per-session badges, coverage summary). The alpha-software tone is preserved; tscope is still local-only (reads OTel from `~/.copilot/tscope/otel.jsonl`).

---

### 2026-06-11: trinity-issue6-disposition.md — Issue #6 Disposition & Closure

**Date:** 2026-06-11T09:14:02-07:00  
**Author:** Trinity (Lead/Architect)  
**Status:** DECISION  
**Scope:** Issue triage, scope control, architecture coherence

#### Context

Issue #6 ("Add Estimated AI Credits metric from totalNanoAiu") proposed deriving credits from the log parser's `events.jsonl → session.shutdown.data.totalNanoAiu`. PR #8 (otel branch) independently implemented credits from OTel's `github.copilot.nano_aiu ÷ 1e9`. Both read the same underlying nano-AIU quantity from different exports.

#### Key Facts

1. **Same metric, different pipe:** OTel `nano_aiu` and logs `totalNanoAiu` are the same number. PR #8 already ships the authoritative version from OTel.
2. **Schema collision:** Both #6 and #8 claim `tscope/report/v5`. #8 already shipped v5 with `source`, `coverage`, `costAvailable`, per-session `totalCost`/`modelCosts`.
3. **Ratified policy (3×):** "Logs-only sessions show 'cost unavailable'" — documented lines 294, 320, 523 of decisions.md. This was a deliberate design choice, not an oversight.
4. **#8 already covers:** Types, parser infra, all three renderers, HTML stat card, chart, per-session cost chips, CSV column, coverage model.

#### Decisions

**1. Close #6 as superseded**

~85% of #6 is now delivered by PR #8. The remaining ~15% (log-parser credit derivation) directly contradicts the ratified "OTel-only cost" policy.

**Action:** Close #6 with a comment explaining it was superseded by the OTel work in PR #8.

**2. Do NOT include any #6 remnant work in PR #8**

Reasons:
- **Scope creep:** #8 is already a large, approved PR with 395+ tests. Adding log-parser credits balloons scope.
- **Policy violation:** The team explicitly decided logs sessions show "cost unavailable" — three separate ratifications.
- **Architecture clarity:** "OTel = authoritative cost; logs = historical tokens only" is a clean, honest seam. Muddying it with "estimated" log-derived credits introduces a two-tier accuracy model that confuses users.
- **Ship what's done:** #8 is complete and green. Don't re-open its scope.

**3. Future: if historical cost demand emerges, file a NEW focused issue**

If users want cost for pre-OTel sessions, a future issue should:
- Be titled "Backfill estimated credits for pre-OTel sessions (from logs totalNanoAiu)"
- Be clearly labeled "estimated" vs OTel's "authoritative"
- Require a deliberate policy reversal (update the "cost unavailable for logs" decision)
- Be scoped as an additive, opt-in feature (e.g., `--estimate-historical-cost` flag)
- Not touch schema again (v5 already has the fields; just populate them conditionally)

This is NOT urgent. Most users' historical sessions are recent enough that OTel will quickly cover them once enabled. The "cost unavailable" state is temporary and self-resolving.

#### Rationale

The "cost unavailable" policy isn't arbitrary — it reflects that log-parser `totalNanoAiu` has never been verified against actual billing (it matches OTel, but OTel is the billing-adjacent export). Surfacing "estimated" numbers without validation against the billing CSV creates a false confidence problem. Better to show nothing than show a number users might mistake for their bill.

#### Proposed #6 Close Comment

> Closing as superseded by the OTel work in PR #8.
>
> PR #8 implements AI credits/cost from OTel (`github.copilot.nano_aiu ÷ 1e9`) with full renderer support (text, JSON, HTML stat card, chart, CSV). The underlying metric is identical to what #6 proposed from `events.jsonl`.
>
> The team's ratified architecture decision is that log-only sessions show "cost unavailable" (OTel is the authoritative cost source). If there's future demand for estimated historical credits from log data, we'll file a focused follow-up issue.

---

## Decision: Report Provenance Semantics Under Explicit --source With Empty Results

**Date:** 2026-06-11  
**Author:** Tank  
**Status:** Decided and implemented (commit 3b82f00, PR #8)

### Context

`computeReportSource(coverage)` derives a `ReportSourceKind` from session counts. When both counts are 0 (empty result set), it falls back to `"logs"`. This is correct for `--source auto` mode where an empty result genuinely has no source preference. However, when the user explicitly selects `--source otel` and a date filter produces no matching sessions, the fallback produced a misleading `source: "logs"` — rendering "event logs (historical) — cost data unavailable" in the footer while the OTel hint on stderr said "No OTel sessions found."

### Decision

**Explicit single-source intent overrides the coverage-derived fallback when the result set is empty.**

Concretely: in `src/index.ts`, after `computeReportSource(coverage)`, apply:
```typescript
if (finalCompleted.length === 0 && args.sourceMode === "otel") {
  reportSource = "otel";
}
```

- `computeReportSource` pure function is **not** changed — its empty-set behaviour (`"logs"`) remains correct for `auto` mode and for any computed coverage scenario.
- `costAvailable` is **not** overridden — it reflects actual data state (`coverage.otelCount > 0`), which is `false` when no sessions are present. This is accurate; no cost records exist in an empty result.
- `--source logs` + empty: no change needed — `computeReportSource` already returns `"logs"`.
- `--source auto` + empty: no change — the fallback to `"logs"` is acceptable since no explicit intent was declared.

### Rationale

Report-level provenance should reflect the **selected source mode** (user intent), not just the data that happened to be loaded. When a user says `--source otel`, the report's source is OTel regardless of whether any sessions matched the filter. Mixing "OTel hint on stderr" with "logs source in footer" is confusing and could mislead users into thinking the wrong data source was used.

### Scope

Single-source modes only (`otel` / `logs`). Auto mode is not affected.

---

## Decision: Screenshot Automation Approach for Dashboard PNGs

**Author:** Switch (Frontend / Dashboard Developer)  
**Date:** 2026-06-12  
**Status:** RATIFIED

### Context

The documentation screenshots `docs/images/dashboard-light.png` and
`docs/images/dashboard-dark.png` were previously generated manually.  
They are referenced via a `<picture>` (prefers-color-scheme) element in `README.md`
and `docs/html-dashboard.md` and captioned "_Generated from synthetic sample data._"

The `update-docs` gh-aw workflow (`/.github/workflows/update-docs.md`) needed to
regenerate these screenshots automatically when dashboard-rendering code changes.

### Decision

#### 1. Helper script over inline data generation

**Chose:** A committed helper script `scripts/screenshot-dashboard.mjs`.

**Rationale:** The tscope CLI reads from `~/.copilot/` at runtime, which is
unavailable on GitHub Actions runners. Running the CLI against synthetic fixtures
written to `~/.copilot/session-state/` would require knowing the internal
`events.jsonl` format and directory layout exactly — fragile and tied to parser
internals. Instead, the script imports the built `HtmlRenderer` directly and
constructs a `Report` object in code, which is strongly typed and decoupled from
parsing. The script is minimal (~160 lines) and self-contained.

#### 2. `npx playwright` ad-hoc, no package.json dependency

**Chose:** `npx --yes playwright install chromium --with-deps` inside the bash
step, invoked ad-hoc. No new `devDependencies` added to `package.json`.

**Rationale:** Playwright is only needed in CI for screenshot generation, not for
any local dev workflow or test suite. Adding it to `devDependencies` would force
all contributors to install it on `npm install`, adding ~100 MB with zero local
benefit. `npx` on CI is idiomatic for one-off tools.

The gh-aw `playwright:` toolset key has no confirmed support in this project's
gh-aw version (only `github`, `web-fetch`, and `bash` are known-good). Using
`bash: true` (already present) is more robust.

#### 3. Viewport: 1280×900, fullPage: true

Consistent fixed viewport ensures screenshot diffs reflect only content changes,
not window-size fluctuations. 1280 px is a common developer desktop width that
shows the tscope dashboard without horizontal scrolling.

#### 4. Timeout bumped: 15 → 25 minutes

Playwright Chromium download takes 3-4 minutes on a cold runner. Combined with
the existing docs-update work, 15 minutes was too tight. 25 minutes provides
comfortable headroom without being wasteful.

#### 5. Trigger condition: only on render-affecting changes

The screenshot step is gated on changes to `src/render/HtmlRenderer.ts` and
related render files (`src/types.ts`, `src/tokens.ts`). Unrelated doc-only
changes do not trigger screenshot regeneration, keeping the workflow fast.

### Files Changed

| File | Change |
|------|--------|
| `.github/workflows/update-docs.md` | Added step 6 (Screenshot Regeneration); bumped `timeout-minutes` 15→25; updated `description` |
| `scripts/screenshot-dashboard.mjs` | New — synthetic Report + HtmlRenderer invocation |
| `.squad/agents/switch/history.md` | Learnings appended |

---

## Decision: Responsive Collapsible Sidebar for Filters

**Date:** 2026-06-13T01:28:12.982-04:00  
**Agent:** Switch  
**Status:** Accepted

### Context

The HTML dashboard was looking uneven and crowded at the top because of the numerous filter controls (source, model, token thresholds, sorting, etc.) and they weren't uniform in size.

### Decision

Moved the entire filter suite into a fixed-width collapsible sidebar (`.sidebar-filters`) on the left side of the dashboard.

### Rationale

- Setting `.dashboard-controls` to `flex-direction: column` within the sidebar ensures all inputs and dropdowns share a uniform width (`100%`) without manual syncing.
- Adds an explicit filter toggle button, keeping the main content focused purely on data visualization when collapsed.
- Better maps to traditional dashboard layouts where vertical scanning of filters is standard UX.

## 2026-06-13

### Removed Calendar Filter from UI

**Date:** 2026-06-13
**Author:** Switch

**Context:** The dashboard header contained an interactive calendar filter (\date-filter\, \ilter-pill\, etc.) allowing client-side date filtering over the sessions payload.

**Decision:** I have entirely removed the interactive calendar widget and its associated JS/CSS from the HTML template.

**Rationale:** The dashboard generates reports based on sessions provided by the CLI. Since the CLI already handles time-bounding and session selection natively (e.g. \--since\), the client-side calendar filter was redundant visual clutter that duplicated CLI responsibilities.


## Decision: Use custom checkbox dropdowns for Model/Source filters

**Date:** 2026-06-13T02:31:32.831-04:00
**Agent:** Switch

### Context
The standard <select multiple> inputs for Models and Source filters took up too much vertical space and broke the uniform 'pill' row aesthetic of the dashboard toolbar. Additionally, numeric filters used an explicit operator dropdown (>=/<=) which added unnecessary UI noise.

### Decision
1. Implemented a custom floating dropdown pattern (HTML/CSS/JS) for Models and Source filters containing checkboxes and an 'All' toggle logic.
2. Standardized the filter control groups to use uniform 'pill' styling (\order-radius: 100px\).
3. Simplified Tokens and Credits filters to single number inputs that implicitly represent 'greater than or equal to'.

### Consequences
- Requires a tiny bit more vanilla JS in the output to handle click-outside-to-close and the 'All' checkbox logic.
- Considerably cleaner UI that matches the original dashboard design specification.



# Standardize Dashboard Filters

**Agent:** Switch  
**Date:** 2026-06-13T02:41:24-04:00

## Context
The dashboard filters had regressed into an untidy layout: they wrapped to a second row unnecessarily, and the control elements (inputs, `<select>` dropdowns, and independent buttons) all had varying heights, borders, and paddings. Additionally, the native `<select>` dropdown (Sort by Date) had poor dark mode styling, causing its options to be invisible due to system default white backgrounds.

## Decision
- Enforced a strict single-row layout for the `.dashboard-controls` container (`flex-wrap: nowrap; overflow-x: auto;`) and added `flex-shrink: 0` to its children so pills maintain their intended width and gracefully scroll instead of wrapping.
- Standardized all `.control-group` pills and standalone buttons (`.reset-filters-btn`, `.export-btn`) to a uniform `height: 32px` using `box-sizing: border-box`.
- Adjusted inner elements (inputs, select triggers) to inherit `height: 100%` rather than using divergent minimum heights.
- Removed inner border and background from the `.sort-dir-btn` so it sits flush within the "Sort by" pill.
- Applied `background: var(--bg-surface)` to `.control-group select option` to ensure dropdown text is readable against a dark background, overriding OS native light theme defaults for transparent `<select>` elements.

## Consequences
The dashboard filters now have a polished, uniform, single-row presentation. The dark mode experience for native `<select>` elements is fully readable without relying on hover states.


# Removed client-side filtering from UI

**Date:** 2026-06-13
**Role:** Switch (Frontend Dev)

We removed the client-side interactive filtering and sorting entirely from the HTML dashboard. The UI is now much cleaner, focusing only on the "at-a-glance" read of the metrics. Users were getting frustrated with the dual-layer filtering (CLI filters vs Dashboard client filters).

We kept the "Export CSV" button, positioned where the toolbar used to be, so users can still download the static report and filter or sort in Excel or Sheets if they need to.
## Decision: Log Parser Can Extract AI Credits (totalNanoAiu) (2026-06-12)

**Status:** PENDING RATIFICATION

**Author:** Trinity (Lead/Architect)  
**Date:** 2026-06-12

### Summary

AI credits **ARE available** in events.jsonl and can be extracted by the log parser. This supersedes the earlier "logs-only sessions show cost unavailable" policy for sessions with the `totalNanoAiu` field.

### Evidence

Verified in live session files:
```json
{"type":"session.shutdown","data":{
  "totalNanoAiu":136033700000,
  "modelMetrics":{"claude-opus-4.8":{"requests":{"count":72,"cost":12},...}},
  ...
}}
```

- `session.shutdown.data.totalNanoAiu` → divide by 1e9 → AI credits (same math as OTel's `github.copilot.nano_aiu`)
- Also: `modelMetrics[model].requests.cost` provides per-model premium request cost (integer)
- Field is present in sessions from ~April 2026 onward (Copilot CLI 1.0+)

### Implications

1. **Log-parser can populate `totalCost` for historical sessions** — backfills cost data for pre-OTel-enablement history
2. **No longer a spike** — the data format is known and stable; implementation is deterministic
3. **"cost unavailable" now only applies to truly old sessions** missing the field (pre-2026 or edge cases)

### Implementation Notes

- Modify `src/parser.ts` to extract `totalNanoAiu` from shutdown events
- Add `totalCost` to the return value (same as OTel path)
- `src/sources/logsSource.ts` already stamps `source: "logs"` — no changes needed there
- Per-model cost breakdown: could use `modelMetrics[model].requests.cost` if granularity needed, or just use session-level `totalNanoAiu`

### Compatibility

- Sessions without `totalNanoAiu` (older CLI versions) continue to show "cost unavailable" — graceful degradation
- OTel remains authoritative for overlapping sessions (merge logic unchanged)

### Reference Issues

- GitHub Issue #13: "Extract AI credits (totalNanoAiu) from events.jsonl" (assigned to Tank)
