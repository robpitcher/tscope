# tscope

## 0.7.0

### Minor Changes

- b14c6d2: Add automatic rotation and pruning for the OTel export file to bound unbounded growth. The live file is automatically rotated to numbered archives (.1, .2, ...) when it exceeds 20 MB (configurable), and old archives are pruned to keep only the 5 most recent (configurable). Archives are seamlessly read for historical reports. Features include:

  - **Auto-rotation (opportunistic)**: Rotates during normal `tscope` reads; disable with `TSCOPE_OTEL_AUTOROTATE=0`
  - **Manual control**: Use `tscope otel prune` with options like `--max-size`, `--keep`, `--force`, `--dry-run`, `-y`
  - **Configuration**: Environment variables `TSCOPE_OTEL_MAX_SIZE`, `TSCOPE_OTEL_KEEP`
  - **Status reporting**: `tscope otel status` now shows rotation configuration and file/archive sizes
  - **Concurrency-safe**: Atomic rename on POSIX; graceful error handling on Windows

### Patch Changes

- a85c5d1: Guarantee deterministic newest-first session ordering across all filter modes and output formats. Matched sessions are now sorted by start time before applying `--max`, so filtered reports consistently return the most recent sessions first.

## 0.6.1

### Patch Changes

- c563273: Update session card badge labels and colors

  - Rename CLI badge label from "CLI" to "Copilot CLI" for consistency with the "Copilot App" badge
  - Match CLI badge color to the Copilot App badge (orange) so both Copilot surfaces share the same visual identity
  - Match OTel source badge color to the log parser badge (muted grey) so both source provenance badges look alike

## 0.6.0

### Minor Changes

- f676ae4: Add a client badge to each HTML session card showing the agentic surface that produced the session (CLI, Copilot App, or SDK), read from the session's `workspace.yaml`. The client is also included as a `client` column in the CSV export.

  This release also improves reliability and release quality for the OTel/log ingestion and shipping pipeline:

  - Unify JSONL stream readers across parser and OTel source code paths, including explicit cleanup on error paths to make ingestion more robust.
  - Add focused unit test coverage for `tscope otel` subcommands and shared test helpers to reduce test duplication and improve maintainability.
  - Strengthen CI/release safeguards by introducing workflow verification gates and an Agentic Workflow compile-check guard to catch stale generated workflow outputs before merge.

## 0.5.1

### Patch Changes

- 0371798: Fix OTel context window parsing: read the correct span-event attribute keys (`github.copilot.current_tokens` and `github.copilot.token_limit`) so the context window size displays correctly in the dashboard.

## 0.5.0

### Minor Changes

- cf3f4b5: **Dashboard filtering & sorting, AI credits from event logs, and a friendlier default window.**

  - **AI credits from event logs (#13):** Log-sourced sessions now surface estimated AI credits, parsed by summing `session.shutdown.data.totalNanoAiu` across runs (`credits = totalNanoAiu / 1e9`). Sessions from Copilot CLI 1.0+ that previously showed "cost unavailable" now display credits in text, JSON, and HTML output. Sessions without the field degrade gracefully, and OTel remains authoritative in merged (`--source auto`) reports.
  - **Dashboard sort controls and CSV export (#14):** The HTML dashboard toolbar now includes session-card sort controls — a **Sort by** dropdown (Session date / Token count / AI credits) and an ascending/descending toggle (▲ / ▼) — that reorder session cards in the page without regeneration. An **Export CSV** button downloads all embedded sessions as a CSV file for offline analysis. There is no client-side source/model/threshold filtering.
  - **Default to the last 20 sessions (#15):** Running `tscope` with no filter flags now shows the 20 most recent sessions across all history instead of only "today" (which was frequently empty). Explicit flags override the new default: `--date`, `--range`, `--lastdays`, and `--all` behave as before, and an explicit `--max` overrides the implicit cap of 20. Help text and docs are updated to match.

## 0.4.0

### Minor Changes

- a2dc315: **OTel-primary pivot with merge support: unified reports, per-session provenance, cost data, reasoning + context-window metrics.**

  - New `--source auto|otel|logs` flag (default: `auto`). `auto` **merges** OTel and log-parser sessions into one unified report — OTel is authoritative on overlap (no double-counting), logs provide historical context. `otel` forces OTel-only. `logs` forces log-parser only.
  - Deduplicated, merged reports in all output formats: text, JSON, and HTML. Per-session source badges show which sessions are OTel vs. log-parser, so you always know cost availability.
  - Per-session and per-model **AI credit cost** from the OTel `github.copilot.nano_aiu` attribute — server-side billing, no rate-table guesswork. OTel sessions show credits; log-parser sessions show "cost unavailable".
  - **Reasoning tokens** and **context-window utilization** (`extended` block) surfaced in OTel sessions (text, JSON, HTML).
  - HTML dashboard: **coverage summary** for mixed reports ("N OTel · M logs"), **per-session source badge** on every card, **cost unavailable badge** on logs cards, _Total Credits_ stat card (OTel only), _Credits by Model_ chart, and context-window utilization bar (amber ≥ 80%).
  - JSON schema `tscope/report/v5` — evolved in place (no v6 bump). New top-level fields: `source` (`"otel"` | `"logs"` | `"mixed"`), `coverage` object (`otelCount`, `logsCount`, `costCoverage`). New per-session `source` field. OTel-only fields: `totalCost`, `modelCosts`, `extended`. All v4 fields preserved — additive.
  - Empty-range OTel hint: when the OTel source finds no sessions for the requested date range, a helpful advisory is printed to stderr pointing to `--source logs` or `--all`.

### Patch Changes

- a2dc315: Fix stale CLI help text for `otel enable` and `otel disable` commands. The removed `--apply` flag is no longer mentioned; help text now accurately reflects the new preview-then-confirm flow.
- a2dc315: `tscope otel enable` / `disable` now prompt for a Y/N confirmation instead of requiring the `--apply` flag. The command previews the change, then asks "Apply this change? [y/N]" — pressing `y`/`yes` writes the change; anything else cancels. The `--apply` flag has been removed.
- a2dc315: Fix four issues flagged in PR #8 review:

  - **Provenance under empty result set**: `--source otel` with a non-matching date filter now correctly reports `source: "otel"` instead of falling back to `"logs"`. The footer and JSON output now reflect the explicitly selected source mode even when no sessions are returned.
  - **Context window clamping in text renderer**: The text report now clamps `utilizationRatio` to [0, 1] before formatting the percentage, matching the HTML renderer's `clamp01()` guard. Anomalous OTel values (used > limit, or negative) no longer produce ">100%" or negative percentages in text output.
  - **Memory efficiency in OTel parser**: `OtelDataSource` now retains only the most recent context-window sample per session (replacing the unbounded `contextWindowSamples[]` accumulator). Behaviour is unchanged — only the last sample was used — but memory usage for large `otel.jsonl` files is significantly reduced.
  - **Documentation**: `docs/how-it-works.md` note about reasoning tokens updated to reflect that text output shows a Reasoning row for _all_ sources (OTel and log parser) when `> 0`; only HTML omits reasoning tokens.

## 0.3.1

### Patch Changes

- 0410e38: Adopt Changesets for version management and releases.
