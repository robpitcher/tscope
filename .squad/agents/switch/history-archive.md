# Switch — History Archive

## Phase 2–3 Consolidation (2026-06-02 to 2026-06-12)

### Foundation & CI Setup
- Phase 2 HTML/Chronicle design drafted covering delivery (single `.html`), charting (inline SVG + CSS bars), visuals (token bars, credits donut, sparklines), CLI surface (`--html`, `--open`), build tooling (template literals), and sequencing.
- CI workflow established: lint + build + test on every PR across Node 18/20/22.
- Repository URL migrated from `devjoy-pub/tscope` → `robpitcher/tscope` with all refs updated.
- GitHub collaboration infrastructure completed: CONTRIBUTING.md, PR templates, issue templates.

### Distribution Model & Strategy
- Decision finalized: npmjs.org as sole registry (D2 model). GitHub Packages rejected (scoped names, auth friction). Package claimed on npmjs.org (v0.3.0).
- Analysis validated D2 vs Copilot plugins and gh extensions. No amendment. Post-v1.0 horizon: consider gh-tscope extension + precompiled binaries (win/mac/linux, amd64/arm64).

### Phase 3: Source Provenance, Cost, Extended Metrics (Branch: `otel`)
- **Provenance (all 3 renderers):** TextRenderer source footer, HtmlRenderer source badges (OTel=blue, Logs=muted), JsonRenderer cost/source top-level.
- **Cost display:** Per-session costs in TextRenderer (right-aligned), HtmlRenderer `.chip-credits` (green), totals stat card (OTel only).
- **Extended metrics (OTel-only):** Reasoning tokens (per-model + TOTALS), context window bars (amber ≥80%), no ctx-window in timeline.
- **Per-session provenance:** HtmlRenderer session cards now show per-session source badges; mixed reports show coverage summary ("1 OTel · 3 logs"); TextRenderer adds per-session source line.
- **Test boost:** 124 → 302 tests; all pass, lint/build clean. Later: 302 → 461 after merge (159 new assertions).

### Tank PR #8 Review Fixes
- TextRenderer context % clamped to [0,1] to prevent out-of-bounds CSS fills.
- OtelDataSource memory optimized: `contextWindowSamples[]` → single `lastContextWindowSample`.
- Docs clarified re: reasoning tokens in text output.
- Provenance fix: explicit `--source otel` respected on empty results.
- 533 tests passing (+3 edge cases).

### Dashboard UI Refinement (2026-06-13)
- **Filter bar redesign:** 'Source' & 'Models' multi-selects → custom dropdown checkboxes with 'All' toggles. Numeric filters (Tokens, Credits, API Time) → Gemini-style inline minimal inputs, hardcoded to '≥'.
- **Sidebar layout:** Fixed-width column, uniform control sizing, collapsible toggle, mobile stack.
- **Header reorganization:** Removed OTel/logs pill, moved Export CSV to header, pulled timestamp into separate row.
- **Filter & stat cleanup:** Removed API Time filter, added visible `<label>` elements, changed sort direction buttons (Asc/Desc → ▲/▼), reordered stat cards (Credits → Tokens), renamed "Date Filter" → "Date Generated" (holds report timestamp).

### Scribe Session (2026-06-13T02:06:28Z)
- Calendar filter widget completely removed (HTML, JS, CSS).
- Rationale: Redundant with CLI `--since` functionality.
- Preservation: Static 'Generated At' timestamp and report-level date refs remain.

---

**Status:** All work phases consolidated. Ready for next phase or maintenance.
