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

## Learnings
- 2026-06-13: Re-implemented the UI dashboard cleanup. Ensured horizontal filter layout, removed the top header pill, moved Export CSV inline, reordered the total cards (Credits before Tokens), updated Date Generated timestamp and card, removed API Time filter, and changed Asc/Desc sorting to ▲/▼ arrows. Fixed unit tests that were failing because they asserted the presence of the removed UI elements.
