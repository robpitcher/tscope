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
