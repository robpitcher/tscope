# Switch — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Frontend / Dashboard Developer
- **Created:** 2026-06-03

## Learnings

### 2026-06-02 — Phase 2 HTML/Chronicle Design Proposal
- Drafted `tscope-phase2-html-design.md` covering: delivery model (single self-contained `.html`), charting approach (hand-rolled inline SVG + CSS bars, no deps), visuals (stacked token bar, credits donut, cache efficiency pill, credits-over-time sparkline), CLI surface (`--html [FILE]` + `--open`), /chronicle tips integration with 3-level graceful degradation, build tooling (template literals only, no new deps), and sequencing (#13 → #14 → #15). Top 3 open decisions surfaced for robpitcher: cross-session aggregation scope, auto-open default, and chronicle tips opt-in vs always-on.

### 2026-06-03 — CI Workflow Established

CI workflow now runs on every PR: lint + build + test across Node 18/20/22. All contributions validated automatically before merge.

### 2026-06-03 — Repository URL Migration (Trinity Lead)

Trinity completed migration of canonical repository URL from `devjoy-pub/tscope` to `robpitcher/tscope`. All in-repo references updated including critical HTML report links. Build clean, 236 tests passing. See `.squad/decisions/decisions.md` for details.

### 2026-06-03 — GitHub Repository Housekeeping & Publishing Strategy (Trinity Lead)

Trinity created full GitHub collaboration infrastructure: CONTRIBUTING.md (contributor guide), .github/pull_request_template.md (PR checklist), .github/ISSUE_TEMPLATE/{bug_report,feature_request}.md (issue templates), and decision note on GitHub Packages publishing. **Decision: stick with npmjs.org as sole registry.** Rationale: GitHub Packages requires scoped package names + consumer .npmrc auth, adding friction to `npm i -g tscope` with zero user benefit. npmjs.org is zero-friction default. Package `tscope` already claimed on npmjs.org (v0.3.0, same project). D2 distribution model requires npmjs.org. All files staged for user review/commit.

### 2026-06-04 — Distribution Model Analysis Complete (Trinity Lead)

Trinity validated D2 (npm as primary distribution channel) against comprehensive analysis of Copilot CLI plugin model and gh CLI extensions. **Outcome: D2 confirmed, no amendment.** Copilot plugins are wrong architectural fit for standalone binary. gh-tscope extension viable as secondary channel post-v1.0 if reach expansion justifies cross-platform binary pipeline. Decision merged to decisions.md. Future horizon noted: add gh-tscope extension + precompiled binaries (win/mac/linux, amd64/arm64) post-v1.0, conditional on market demand.

### 2026-06-10 — Phase 3: Source Provenance, Cost, Extended Metrics in Renderers

**Branch:** `otel`

**What landed:**

- **Source provenance (all 3 renderers):**
  - TextRenderer: `Source: OpenTelemetry` or `Source: event logs (historical) — cost data unavailable` footer line, always emitted (even on empty reports).
  - HtmlRenderer: `.source-badge--otel` / `.source-badge--logs` pill in the site header `header-meta`, right after the date-filter. OTel = accent-blue, Logs = muted with tooltip noting cost unavailability.
  - JsonRenderer: already had `source`/`costAvailable` at top-level (verified correct, no change needed).

- **Cost display:**
  - TextRenderer: Per-session `Cost: X.XX credits` row (right-aligned, matches existing `singleRow` style), only when `session.totalCost !== undefined`. No fake 0 for logs.
  - HtmlRenderer: `.chip-credits` (green) per session card when `totalCost` set. "Total Credits" stat card in summary strip (OTel only). "Credits by Model" section in chart-columns when `modelCosts` present.
  - JsonRenderer: `totalCost` / `modelCosts` already emitted by Tank, no change.

- **Extended metrics (OTel-only, conditional):**
  - TextRenderer: `Reasoning:` row in model block (from `tokens.reasoningTokens`) when > 0; also in TOTALS summary. `Context: X,XXX / X,XXX tokens (X% used)` below TOTALS when `extended.contextWindow` present.
  - HtmlRenderer: `Context Window` section with a CSS fill bar in each session card when `extended.contextWindow` present. High-utilization (≥80%) gets `.ctx-window-high` (amber). Title = "Context Window", label = "X,XXX / X,XXX tokens · X% used".
  - JsonRenderer: `extended` object serialized when present (Tank left this for Phase 3).

- **style.ts:** No changes needed — text renderer uses bold/dim only; HTML styling is inline in HtmlRenderer.ts.

- **Test count:** 124 (baseline) → 302 (added 40 tests across text/html/json renderer test files). All 302 pass; lint and build clean.

**Key design calls:**
- Reasoning tokens shown at both per-model and TOTALS level in text (non-redundant: per-model gives breakdown, TOTALS gives session-wide total).
- Context window bar uses accent-blue for fill, amber at ≥80% utilization as a natural threshold for "heads up" — not a hard warning.
- Did NOT add ctx-window to the tokens-over-time timeline chart (would break the existing token-only narrative there).
- "Total Credits" stat card is static (not wired to the JS date-filter recompute) to avoid adding cost data to the `allSummaries` payload shape. Acceptable for Phase 3; can be dynamicized in Phase 4 if Apoc tests warrant.


Tank and Trinity completed empirical OTel investigation and architecture proposal for OTel-primary pivot + CLI redesign. **Outcome: FEASIBLE.** OTel span token counts match events.jsonl exactly; session ID preserved; bonus signals (latency, tool calls, server-side billing) exposed. Architecture: DataSource abstraction, `--source otel|logs|auto`, JSON v4→v5. **Status:** Proposed decisions merged to decisions.md pending user approval on 5 open forks (cost re-intro, file rotation, bonus signals in v1, v5 timing, CLI surface). **Upcoming work for Switch:** P3/P4 — HTML renderer enhancements for extended metrics (latency, tool calls); timeline depends on user fork resolutions. Implementation blocked until user decision.
