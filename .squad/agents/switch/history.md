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

### 2026-06-10 — OTel-Primary Pivot Planning (Planning Batch)

Tank and Trinity completed empirical OTel investigation and architecture proposal for OTel-primary pivot + CLI redesign. **Outcome: FEASIBLE.** OTel span token counts match events.jsonl exactly; session ID preserved; bonus signals (latency, tool calls, server-side billing) exposed. Architecture: DataSource abstraction, `--source otel|logs|auto`, JSON v4→v5. **Status:** Proposed decisions merged to decisions.md pending user approval on 5 open forks (cost re-intro, file rotation, bonus signals in v1, v5 timing, CLI surface). **Upcoming work for Switch:** P3/P4 — HTML renderer enhancements for extended metrics (latency, tool calls); timeline depends on user fork resolutions. Implementation blocked until user decision.
