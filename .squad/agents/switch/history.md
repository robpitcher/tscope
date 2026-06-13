# Switch — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Frontend / Dashboard Developer
- **Created:** 2026-06-03

## Archive

**Detailed history from 2026-06-02 to 2026-06-12 archived in history-archive.md:**
- Phase 2 design, CI setup, distribution strategy (npmjs.org), Phase 3 provenance/cost/metrics implementation, Tank PR fixes, UI refinements.

## Current Work

### 2026-06-13 — Calendar Filter Removed (Final Pass)

**Orchestration Log:** 2026-06-13T02-06-28Z-switch.md

- **Decision:** Completely removed interactive calendar widget and associated JS/CSS
- **Rationale:** Redundant with CLI --since functionality; eliminated visual clutter
- **Implementation:** Removed date-filter popover, calendar UI, all client-side event handlers
- **Preservation:** Static 'Generated At' timestamp and report-level date references remain
- **Decision merged to decisions.md:** "Removed Calendar Filter from UI"

### 2026-06-13 — Restore UI Polish (Background Spawn)

**Orchestration Log:** 2026-06-13T02-19-08Z-switch.md

- **Reason:** Re-apply all dashboard UI polish after it was lost due to a git reset/regression.
- **Expected Outcome:**
  - Restored uniform horizontal filter pills
  - Removed OTel counter from header
  - Moved Export CSV to filters row
  - Placed Total Credits before Total Tokens
  - Moved timestamp to Date Generated card
  - Removed API Time filter
  - Added ▲/▼ for sort indicators
  - Fixed broken tests

### 2026-06-13 — Custom Dropdowns & Pill Styling (Completed)

**Orchestration Log:** 2026-06-13T06-31-32Z-switch.md  
**Decision:** Use custom checkbox dropdowns for Model/Source filters

- **Implementation:** Custom floating dropdown pattern with checkboxes and 'All' toggle for Models/Source
- **Simplified Tokens/Credits:** Removed operator dropdowns, now single number inputs (implicitly >=)
- **UI Refinement:** Applied uniform pill styling (border-radius: 100px) across filter row
- **Decision merged to decisions.md:** "Use custom checkbox dropdowns for Model/Source filters"

### 2026-06-13 — Connected Group Style for Sort Controls (Completed)

- **Change:** Replaced `border-radius: 100px` pill styling on `.export-btn`, `.sort-select`, and `.sort-dir-btn` with `var(--radius)` to match card corner style.
- **Segmented control:** Wrapped `.sort-select` and `.sort-dir-btn` in a new `<div class="sort-group">` (flex container, no gap). Left control has square right corners; right control has square left corners. Removed `border-right` from `.sort-select` to prevent double border at the join.
- **No JS changes.** Build, lint, and all 85 html-renderer tests pass.

## Learnings
- 2026-06-13: Complex client-side filtering/sorting over a static CLI report proved too confusing and cluttered. Removed all interactive filter/sort UI and JavaScript to favor a simpler "at-a-glance" read with a single "Export CSV" button for offline manipulation.
- 2026-06-13: Re-implemented the UI dashboard cleanup. Ensured horizontal filter layout, removed the top header pill, moved Export CSV inline, reordered the total cards (Credits before Tokens), updated Date Generated timestamp and card, removed API Time filter, and changed Asc/Desc sorting to ▲/▼ arrows. Fixed unit tests that were failing because they asserted the presence of the removed UI elements.
- 2026-06-13: Restored custom dropdown filter functionality for models and sources to support multi-select with an 'All' toggle, and applied pill styling to match dashboard UX requirements. Also removed >/< operators for numeric filters in favor of implicit '>=' to simplify the UI.
- 2026-06-13: Standardized dashboard filter layout. Set a fixed height of 32px for all filter pills, inputs, and standalone buttons to ensure a uniform appearance. Removed redundant background styling from inner elements like the sort direction arrow so they sit flush inside their parent pills. Added explicit background styling to native <option> elements to ensure the 'Sort by' dropdown text remains visible in dark mode, and updated the control group container to strictly enforce a single-row scrollable layout.
- 2026-06-13: Added a sort dropdown for session cards. Key files: `src/render/HtmlRenderer.ts` (toolbar HTML ~line 1683, CSS ~line 785, JS IIFE ~line 1513, data attrs on card articles ~line 514/588). Approach: stamped `data-sort-start`, `data-sort-tokens`, `data-sort-cost` directly onto each `<article>` at render time; client JS reads those attributes and reorders existing DOM nodes via `appendChild` (no card rebuild). Sort defaults: date=newest first, tokens=highest first, credits=highest first; sessions with no cost data sort to the bottom for credits. In-progress cards sort alongside completed cards for date/tokens (natural fallout: they'll be at the bottom for tokens since they have 0, and bottom for credits since they have no cost). Style: `.sort-select` matches `.export-btn` pill look (100px border-radius, 32px height, same colors). Tests: `src/__tests__/html-renderer.test.ts` — new test "renders a sort dropdown to the left of the CSV button" verifies presence, ordering, options, CSS, and data attributes.
- 2026-06-13: **Template-literal raw-newline gotcha.** In TypeScript, `'\n'` inside a backtick template literal resolves to a real LF byte (0x0A) in the string value. When that value is emitted inside `<script>…</script>` as a single-quoted JS string, the raw LF is a SyntaxError — ECMAScript string literals cannot contain literal line terminators. Same applies to `'\r'` (CR) and `'\r\n'` (CRLF). Fix: double-escape to `'\\n'`, `'\\r'`, `'\\r\\n'` so the emitted JS has the proper escape-sequence form. Convention: match the pattern already used for `\\t` and `\\r` in the CSV injection regex. The critical second consequence: ALL IIFEs share a single `<script>` block, so a SyntaxError anywhere in the JS constant kills ALL client-side behaviour (sort, CSV, theme toggle, tooltips).
- 2026-06-13: Sort dropdown implementation complete. Three options: session date (newest first), token count (highest first), AI credits consumed (highest first). DOM reordering preserves card structure; no rebuilds. In-progress cards integrate naturally (date sort), or float to bottom (token/credit sorts). All tests pass (83 total), lint clean, build passes. Global tscope reinstalled and verified.

### 2026-06-13 — Toolbar Right-Align & Icon-Only Theme Toggle (Completed)

- **Toolbar:** Changed `.report-toolbar` from `justify-content: space-between` to `justify-content: flex-end` so the Sort group and CSV button float to the right edge of the stat cards container.
- **Theme toggle:** Replaced elongated pill (text "Dark"/"Light" with icon) with a 32×32 round icon-only button (`border-radius: 50%`). Button shows ☾ when in light mode (click to go dark) and ☀ when in dark mode (click to go light). `aria-label` and `title` update dynamically to "Switch to dark/light theme" for accessibility.
- Build, lint, and all 85 html-renderer tests pass.



**Orchestration Log:** 2026-06-13T02-41-13Z-switch.md

- **Decision:** Fix filter row wrapping and standardize control heights
- **Implementation:** 
  - Enforced single-row layout with horizontal scrolling via flex-wrap: nowrap; overflow-x: auto;
  - Standardized all control elements to height: 32px with box-sizing: border-box
  - Fixed Sort dropdown dark mode visibility with background: var(--bg-surface) on <option> elements
  - Removed inner border/background from sort direction button
- **Decision merged to decisions.md:** "Standardize Dashboard Filters"

### 2026-06-13 — Remove All Interactive Filtering (Current)

**Orchestration Log:** 2026-06-13T02-48-11Z-switch.md

- **Reason:** Remove all interactive filtering and sorting from the dashboard due to user frustration with layout/styling
- **Implementation:** 
  - Completely removed filter/sort UI components
  - Removed associated CSS styling for filter controls
  - Removed client-side JavaScript logic for filter/sort operations (`recomputeView`, etc.)
  - Preserved the Export CSV button in a clean row above the summary cards
  - Dashboard now renders sessions statically based on CLI input
- **Decision merged to decisions.md:** "Remove all interactive filtering and sorting from the dashboard"

## Learnings (PR #18 review)
- 2026-06-13: Docs drift is costly. After removing the date-range picker and adding sort controls, README, html-dashboard.md, and the changeset all described the old UI. Always update docs in the same pass as the UI change. Also: control characters (0x08 backspace) in history markdown eat leading letters silently — validate plain-text files after any copy-paste from terminal output.

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

---

## Queued for v0.5.0 (2026-06-12)

**GitHub Issue #14:** Dashboard filtering by source/model/tokens/credits/API-time and sorting controls  
**GitHub Issue #15:** Change default filter from today to last 10 sessions

Trinity's scope assessment split a 4-part feature request into 3 standalone issues. Switch owns dashboard filtering/sorting (#14) and default behavior change (#15). Filtering adds source, model, and cost-based controls. Sorting lets users rank by tokens or credits. Default shifts from "today only" to "last 10 sessions" to provide historical context on first load.

