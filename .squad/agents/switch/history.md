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

## Learnings
- 2026-06-13: Re-implemented the UI dashboard cleanup. Ensured horizontal filter layout, removed the top header pill, moved Export CSV inline, reordered the total cards (Credits before Tokens), updated Date Generated timestamp and card, removed API Time filter, and changed Asc/Desc sorting to ▲/▼ arrows. Fixed unit tests that were failing because they asserted the presence of the removed UI elements.
- 2026-06-13: Restored custom dropdown filter functionality for models and sources to support multi-select with an 'All' toggle, and applied pill styling to match dashboard UX requirements. Also removed >/< operators for numeric filters in favor of implicit '>=' to simplify the UI.
