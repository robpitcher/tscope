# Apoc — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Tester / Quality
- **Created:** 2026-06-03

## Learnings

### 2026-06-03 — CI Workflow Established

CI workflow now runs on every PR: lint + build + test across Node 18/20/22. All contributions validated automatically before merge.

### 2026-06-03 — Repository URL Migration (Trinity Lead)

Trinity completed migration of canonical repository URL from `devjoy-pub/tscope` to `robpitcher/tscope`. All in-repo references updated including critical HTML report links. Build clean, 236 tests passing. See `.squad/decisions/decisions.md` for details.

### 2026-06-03 — GitHub Repository Housekeeping & Publishing Strategy (Trinity Lead)

Trinity created full GitHub collaboration infrastructure: CONTRIBUTING.md (contributor guide), .github/pull_request_template.md (PR checklist), .github/ISSUE_TEMPLATE/{bug_report,feature_request}.md (issue templates), and decision note on GitHub Packages publishing. **Decision: stick with npmjs.org as sole registry.** Rationale: GitHub Packages requires scoped package names + consumer .npmrc auth, adding friction to `npm i -g tscope` with zero user benefit. npmjs.org is zero-friction default. Package `tscope` already claimed on npmjs.org (v0.3.0, same project). D2 distribution model requires npmjs.org. All files staged for user review/commit.

### 2026-06-04 — Distribution Model Analysis Complete (Trinity Lead)

Trinity validated D2 (npm as primary distribution channel) against comprehensive analysis of Copilot CLI plugin model and gh CLI extensions. **Outcome: D2 confirmed, no amendment.** Copilot plugins are wrong architectural fit for standalone binary. gh-tscope extension viable as secondary channel post-v1.0 if reach expansion justifies cross-platform binary pipeline. Decision merged to decisions.md. Future horizon noted: add gh-tscope extension + precompiled binaries (win/mac/linux, amd64/arm64) post-v1.0, conditional on market demand.

### 2026-06-10 — Phase 4 Test Suite: OTel Edge Cases + Source Selection + Reconciliation (Apoc)

Added 87 new tests across 4 new test files; total suite grew from 302 → 389, all passing.

**Files created:**
- `src/__tests__/otel-source-edge.test.ts` — OTel parser edge cases: 3+ session interleaving, multiple models per session, reasoning tokens → extended, context window utilization, predicate=undefined, comprehensive reconciliation invariants, mixed-content resilience.
- `src/__tests__/logs-source.test.ts` — LogsDataSource: date-predicate filtering, in-progress/completed separation in loadAll(), predicate=undefined, source:"logs" provenance, no-cost invariants (modelCosts/totalCost/extended all undefined).
- `src/__tests__/source-selection.test.ts` — Subprocess integration: `--source otel` exits 1 when absent/empty; `--source logs` forces logs even with otel.jsonl present; `auto` uses OTel/falls back + prints exact stderr notice; `--source invalid` exits 1 with clear error. JSON output `source`/`costAvailable` verified.
- `src/__tests__/renderer-edge-cases.test.ts` — Renderer gaps from Switch's handoff: empty OTel report still shows "Source: OpenTelemetry"; HTML source badge is in header-meta before session cards; credits chip is always 2 decimal places (1.5→"1.50"); context window fill clamped to [0,100%] including anomalous ratio>1.0; "Total Credits" stat value reconciles to sum of session.totalCost.

**Reconciliation verdict:** CLEAN. `OtelDataSource.totalCost` equals `sum(modelCosts)` to floating-point precision. Token counts per model equal the sum of individual span values. `report.costAvailable === (report.source === "otel")` invariant holds end-to-end (verified via subprocess JSON output). Logs sessions carry zero cost fields — no fabricated values.

**Bugs found:** None. All invariants reconciled correctly.

### 2026-06-10 — OTel-Primary Pivot Planning (Planning Batch)

Tank and Trinity completed empirical OTel investigation and architecture proposal for OTel-primary pivot + CLI redesign. **Outcome: FEASIBLE.** OTel span token counts match events.jsonl exactly; session ID preserved; bonus signals (latency, tool calls, server-side billing) exposed. Architecture: DataSource abstraction, `--source otel|logs|auto`, JSON v4→v5. **Status:** Proposed decisions merged to decisions.md pending user approval on 5 open forks (cost re-intro, file rotation, bonus signals in v1, v5 timing, CLI surface). **Upcoming work for Apoc:** P3/P4 — Test suite expansion for dual-source parsing (OTel + events.jsonl), extended metrics validation; timeline depends on user fork resolutions. Implementation blocked until user decision.
