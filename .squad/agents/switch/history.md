# Switch — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Frontend / Dashboard Developer
- **Created:** 2026-06-03

## Learnings

### 2026-06-02 — Phase 2 HTML/Chronicle Design Proposal
- Drafted `tscope-phase2-html-design.md` covering: delivery model (single self-contained `.html`), charting approach (hand-rolled inline SVG + CSS bars, no deps), visuals (stacked token bar, credits donut, cache efficiency pill, credits-over-time sparkline), CLI surface (`--html [FILE]` + `--open`), /chronicle tips integration with 3-level graceful degradation, build tooling (template literals only, no new deps), and sequencing (#13 → #14 → #15). Top 3 open decisions surfaced for robpitcher: cross-session aggregation scope, auto-open default, and chronicle tips opt-in vs always-on.
