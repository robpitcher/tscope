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

### 2026-06-10 — Phase 3 (merge edition): per-session provenance in renderers

**Branch:** `otel`

**What landed:**

- **Per-session source badges (HTML — hard requirement):**
  - `buildSessionCard()` now injects a `.source-badge` pill as the first chip in
    `.session-summary-chips`, reading `session.source` (not `report.source`).
    - `"otel"` → `<span class="source-badge source-badge--otel">OTel</span>`
    - `"logs"` → `<span class="source-badge source-badge--logs">log parser</span>`
  - Placement: before the duration and tokens chips, so it reads left-to-right as
    "where did this come from, how long, how many tokens, cost".

- **Coverage summary in header (HTML — mixed reports):**
  - `buildHtml()` now destructs `report.coverage` and uses a 3-way conditional on
    `report.source`.
  - `"mixed"` → `.coverage-summary` span with nested `.cov-otel` + `.cov-sep` +
    `.cov-logs` spans: "1 OTel · 3 logs". No single badge is used for mixed.
  - Pure `"otel"` and `"logs"` keep their existing single `.source-badge` in the
    header (backward compat; existing tests unchanged).

- **Cost unavailable chip (HTML — logs session cards):**
  - Logs session cards get `<span class="chip chip-cost-unavail">no cost data</span>`
    instead of a credits chip. Dashed border + muted text = subtle/honest.
  - OTel cards with `totalCost` still show `.chip-credits` in green.
  - "Total Credits" stat card subtitle becomes "OTel sessions only" for mixed
    reports so it's explicit these credits don't include log sessions.

- **Per-session source tag (TextRenderer):**
  - `renderSessionBlock()` adds `Source:  OTel` or `Source:  log parser` between
    the `Path:` line and the light `─────` divider.
  - Footer for mixed changed from "Source: mixed (OTel + logs)" to
    "Sources: N OTel, M logs — cost available for OTel sessions only"
    (reads `report.coverage.otelCount` / `logsCount`).
  - Pure otel/logs footer unchanged.

- **style.ts / CSS:**
  - No changes to `style.ts` (text renderer only uses bold/dim, inline HTML handles styling).
  - New CSS classes added inline in `HtmlRenderer.ts`:
    - `.coverage-summary`, `.cov-otel`, `.cov-sep`, `.cov-logs` — the header coverage pill
    - `.chip-cost-unavail` — transparent background, dashed border, muted text
  - All new rules use `var(--accent-blue)`, `var(--text-muted)`, `var(--border)` so
    they're correct in both light and dark themes automatically.

- **Test count:** 302 → 461 (added 159 new assertions across `html-renderer.test.ts`
  and `text-renderer.test.ts`). One existing text-renderer test updated to use
  `lastIndexOf("Source:")` since per-session source lines now precede the footer.

**Key design calls:**
- Badge label is "OTel" (short) on cards; header uses full "OpenTelemetry" for pure
  OTel reports. Compact on cards, informative in the header where there's space.
- Logs card "no cost data" chip uses a dashed border: conventional UX affordance for
  "something's absent", very low visual weight, doesn't compete with token chips.
- Coverage summary chosen over a two-badge legend: "1 OTel · 3 logs" is
  self-explanatory with no decode step. Inline numbers make the mix concrete.
- Did NOT add per-session source to the JSON renderer — Tank already serialized
  `session.source` in v5; verified it's correct, no touch needed.

### 2026-06-12 — Screenshot Automation Added

**Workflow:** `.github/workflows/update-docs.md`

- **Screenshot files:** `docs/images/dashboard-light.png` and `docs/images/dashboard-dark.png`
  — referenced via `<picture>` (prefers-color-scheme) in `README.md` lines ~15-18 and
  `docs/html-dashboard.md` lines ~10-13. Caption: "_Generated from synthetic sample data._"
- **Dashboard generation:** `tscope --html [FILE]` writes a self-contained HTML file.
  The CLI reads from `~/.copilot/` which is unavailable on CI runners, so the helper script
  bypasses the CLI and calls `HtmlRenderer` directly with a hardcoded synthetic `Report`.
- **Helper script:** `scripts/screenshot-dashboard.mjs` — builds a synthetic Report,
  instantiates `HtmlRenderer`, writes `dashboard-preview.html`. Verified working.
- **gh-aw playwright approach:** The `playwright:` toolset key has no confirmed support in
  gh-aw; used `bash: true` (already present) + `npx playwright install chromium --with-deps`
  inline in the job. More robust than relying on an unverified toolset key.
- **Viewport:** 1280×900 `fullPage: true` for stable, consistent diffs.
- **Timeout bumped:** 15 → 25 minutes to accommodate Playwright Chromium install (~3-4 min).
- **Trigger:** Screenshot step runs only when `src/render/HtmlRenderer.ts` or related render
  files change — skip on unrelated doc-only changes.

### 2026-06-11 — Tank's PR #8 Review Fixes Complete

**Branch:** `otel` | **Commit:** 3b82f00

Tank resolved all 4 open Copilot review comments (PR #8). Key fixes relevant to renderers:

1. **TextRenderer clamping:** Context-window utilization % now clamped to [0,1] to match HtmlRenderer behavior and prevent out-of-bounds fills in CSS.
2. **OtelDataSource memory:** Replaced `contextWindowSamples[]` array with single `lastContextWindowSample` (O(1) memory instead of O(n)).
3. **Docs clarification:** docs/how-it-works.md updated re: reasoning tokens in text output.
4. **Provenance fix:** src/index.ts now respects explicit `--source otel` on empty results (no misleading "logs" label).

**Validation:** 533 tests passing (+3 new edge cases), lint/build clean.

## Learnings
- (2026-06-13T00:52:07.174-04:00) Redesigned the filter bar to be cleaner and simpler based on user feedback. The 'Source' and 'Models' native multi-selects were replaced with custom floating dropdown menus containing checkboxes and 'All' toggles. Numeric filters (Tokens, Credits, API Time) were simplified into 'Gemini style' inline minimal inputs instead of separate <select> operators, hardcoding to '≥' (minimum threshold) as it covers the vast majority of use cases while dramatically reducing visual noise in the HtmlRenderer.ts dashboard.
