# Switch — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Frontend / Dashboard Developer
- **Created:** 2026-06-03

## Archive

**Detailed history from 2026-06-02 to 2026-06-13 archived in history-archive.md:**
- Phase 2 design, CI setup, distribution strategy (npmjs.org), Phase 3 provenance/cost/metrics implementation, Tank PR fixes, UI refinements, dashboard UI polish, screenshot automation.

---

## Current Work

### 2026-06-14 — Dashboard Screenshot Regeneration (Completed)

**Timestamp:** 2026-06-14T02:38:33Z

- **Task:** Regenerate `docs/images/dashboard-light.png` and `docs/images/dashboard-dark.png` from latest built HtmlRenderer
- **Workflow:** Executed documented workflow from `.github\workflows\update-docs.md`
  - `npm run build` → compiled HtmlRenderer
  - `node scripts/screenshot-dashboard.mjs` → generated captures
  - Playwright Chromium captured at 1280×900 fullPage, light+dark themes
- **Artifacts produced:**
  - dashboard-light.png: 196,678 bytes (2026-06-13)
  - dashboard-dark.png: 200,190 bytes (2026-06-13)
- **Cleanup:** Removed `dashboard-preview.html` and `capture-screenshots.mjs`
- **Status:** ✅ Completed — both PNG files verified as valid renders, not committed per user review policy

---

## Queued for v0.5.0 (2026-06-12)

**GitHub Issue #14:** Dashboard filtering by source/model/tokens/credits/API-time and sorting controls  
**GitHub Issue #15:** Change default filter from today to last 10 sessions

Trinity's scope assessment split a 4-part feature request into 3 standalone issues. Switch owns dashboard filtering/sorting (#14) and default behavior change (#15). Filtering adds source, model, and cost-based controls. Sorting lets users rank by tokens or credits. Default shifts from "today only" to "last 10 sessions" to provide historical context on first load.

---

## Key Learnings

### Docs Drift Prevention (PR #18 review)

### Docs Drift Prevention (PR #18 review)
- Always update docs in the same pass as UI changes — docs drift is costly
- Validate plain-text files after terminal copy-paste to catch control character corruption

### Template-Literal Raw-Newline Pattern
- In TypeScript template literals, `'\n'` becomes a real LF byte
- When emitted in `<script>…</script>` as JS string, raw LF is a SyntaxError
- Fix: double-escape to `'\\n'`, `'\\r'`, `'\\r\\n'`
- All IIFEs share one `<script>` block — one error kills all client-side behavior

### Dashboard Simplification
- Complex client-side filtering/sorting over static CLI reports proved confusing
- Simpler "at-a-glance" read with single "Export CSV" button preferred
- Standardized filter layout: 32px height for all controls
- Sort approach: data attrs on cards, JS reorders via `appendChild` (no rebuild)

### OTel Context-Window Data Fix (Tank, 2026-06-14)
- Tank diagnosed OTel parser was reading stale attribute keys
- Actual data uses `github.copilot.current_tokens` / `github.copilot.token_limit` (not `event.*` prefix / `token_limit` bare key)
- **Impact:** Context-window bar now populates from real live OTel data (not test fixtures)
- Ready for user review/commit

### Windows/CI Patterns
- PowerShell heredocs unsupported in CI — write scripts to files, run with `node`, delete
- Playwright not in project deps — install ad-hoc with `npm install --no-save playwright`
- Use `npx --yes playwright install chromium` (no `--with-deps` on Windows)
- Viewport 1280×900 `fullPage: true` for stable, consistent diffs
