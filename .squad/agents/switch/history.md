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
  - Enforced single-row layout with horizontal scrolling via lex-wrap: nowrap; overflow-x: auto;
  - Standardized all control elements to height: 32px with ox-sizing: border-box
  - Fixed Sort dropdown dark mode visibility with ackground: var(--bg-surface) on <option> elements
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
