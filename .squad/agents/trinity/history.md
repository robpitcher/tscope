# Trinity — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Lead / Architect
- **Created:** 2026-06-03

## Learnings

### 2026-06-02 — Usage-Based Billing Research

- **Billing unit:** GitHub AI Credits (1 credit = $0.01 USD), computed from token × per-token model rate. Code completions are NOT billed.
- **Plans:** Pro=1,500 credits/mo, Pro+=7,000, Max=20,000; Business=1,900/user (pooled), Enterprise=3,900/user (pooled). Promo elevated amounts through Sep 1, 2026.
- **Costs via API:** NOT available programmatically per-user. The only source of per-user/per-model billing amounts (`net_amount`) is the manual AI usage CSV download from the GitHub billing UI (max 31 days).
- **Usage metrics via API:** Available programmatically via `GET /enterprises/{e}/copilot/metrics/reports/users-1-day` → signed URL → NDJSON. Contains engagement data (tokens for CLI, LOC, interaction counts, model breakdown) but no dollar amounts. History from Oct 10, 2025, up to 1 year.
- **Budget API:** `GET /organizations/{org}/settings/billing/budgets` (public preview) — can read budget amounts, scopes, and alert settings.
- **Legacy metrics API** (`/orgs/{org}/copilot/metrics`) closed April 2, 2026 — must use new report endpoints.
- **tscope ingest strategy:** Two channels — (A) REST API for engagement/token metrics, (B) CSV import for actual billing costs.
- **Main brief:** `.squad/files/usage-based-billing-research.md`

### 2026-06-03 — CI Workflow Established

Tank delivered GitHub Actions CI workflow. All PRs now gated by lint + build + test across Node 18/20/22. Affects how all team members' work gets validated before merge.

### 2026-06-02 — Local Session Data Investigation

**Session data location:**
- Path: `%USERPROFILE%\.copilot\session-state\{session-id}\events.jsonl`
- Each session is a UUID folder (e.g., `7d15eea1-4d69-49e9-bb21-8370594afd6a`) or `conv-{uuid}` folder
- Key files: `events.jsonl` (JSONL events), `workspace.yaml` (metadata)

**Exact token field names (from `session.shutdown` event):**
- `data.modelMetrics.{model}.usage.inputTokens`
- `data.modelMetrics.{model}.usage.outputTokens`
- `data.modelMetrics.{model}.usage.cacheReadTokens`
- `data.modelMetrics.{model}.usage.cacheWriteTokens`
- `data.modelMetrics.{model}.usage.reasoningTokens`
- `data.totalPremiumRequests` — sum of `requests.cost` across models (legacy metric)
- `data.totalNanoAiu` — newer field (May 2026+), not present in older sessions

**Session timestamp:**
- `session.start.data.startTime` — ISO 8601 UTC string (e.g., `2026-06-03T02:58:50.891Z`)
- Also available in `workspace.yaml → created_at`

**Multi-model sessions:** Confirmed. `modelMetrics` is a dictionary keyed by model name. Example session used 4 models simultaneously.

**Tech stack recommendation:** Go (single binary, cross-platform, CLI-native). Status: OPEN — awaiting user confirmation.

**Deliverables created:**
- `.squad/files/tscope-plan.md` — full plan with output format spec
- `.squad/files/tscope-issue-breakdown.md` — 11 phase-1 issues + 5 future issues
- `.squad/decisions/inbox/trinity-tscope-plan.md` — architecture decisions + open questions

### 2026-06-02 — GitHub Issue Breakdown Created

- Created phase-1 tracking epic #17 plus 11 phase-1 implementation issues and 5 phase-2 follow-up issues in `devjoy-pub/tscope`.
- Confirmed final tech stack for phase 1: **Node.js + TypeScript**, installed via `npm i -g tscope`, binary name `tscope`.
- Ready-now work is #1 (scaffolding) and #2 (model rate table); all other phase-1 issues are dependency-blocked.
- Issue map written to `.squad/files/tscope-issue-map.md`; issue creation decision note written to `.squad/decisions/inbox/trinity-issues-created.md`.

## Learnings
- **2026-06-02**: Reviewed PR #18 (Phase 1 implementation). The PR was APPROVED. The implementation by Tank accurately matched the plan and decisions, properly decoupling parsing, credit calculation, and rendering. The math for AI credits (cost / 1e6 * 100) is correct, and edge cases like missing models and in-progress sessions were correctly handled. Minor optimization opportunity noted for the future: aborting readline streams early instead of draining them when searching for session.start.

### 2026-06-02 — Renderer Interface (#10) — PR #19

**Renderer seam design:**
- `src/render/Renderer.ts` — `Renderer` interface (`render(report: Report): void`); unchanged from Tank's phase-1 foundation.
- `src/render/index.ts` (NEW) — `RENDERER_REGISTRY: Map<string, () => Renderer>` + `createRenderer(format): Renderer` factory. This is the sole extension point for phase-2 renderers.
- `src/index.ts` — pipeline now typed against `Renderer` interface; uses `createRenderer('text')`. No concrete class imported.

**To add a phase-2 renderer:**
1. Create `src/render/JsonRenderer.ts` implementing `Renderer`.
2. One line in `src/render/index.ts`: `RENDERER_REGISTRY.set('json', () => new JsonRenderer())`.
3. Pass format string from CLI flag to `createRenderer(format)` — already wired.
4. No other changes to the core pipeline.

**Outcome:** 20/20 tests pass, strict TS build clean, CLI output byte-identical to pre-refactor.

### 2026-06-03 — Alpha Stage Disclaimer Added

**Work completed:**
- Added `> [!WARNING]` GitHub-flavored markdown alert block to README immediately after tagline
- Wording emphasizes: early-stage/alpha status, expected bugs, potential schema changes, link to issues page
- Tone: friendly, scannable, using 🙏 emoji to match project voice

**Outcome:** Stakeholders and users now see clear alpha-stage caveat at first glance in README. Reduces support friction from users encountering bugs. Addresses robpitcher's request to clearly communicate development status.

### 2026-06-03 — Repository URL Migration (devjoy-pub → robpitcher)

**Work completed:** Swept the entire repo for `devjoy-pub` references and migrated all to `robpitcher/tscope`.

**Files changed (6):**
- `README.md` — alpha disclaimer issues link
- `docs/contributing.md` — issues link
- `docs/installation.md` — git clone URL
- `src/render/HtmlRenderer.ts` — `REPO_URL` constant (root cause for HTML report links)
- `src/__tests__/html-renderer.test.ts` — 3 URL assertions
- `dist/render/HtmlRenderer.js` — regenerated by `npm run build`

**Files intentionally skipped:**
- `.squad/` files (team memory — not project URLs)
- `tscope-report-2026-06-03.html` (generated artifact — will regenerate with correct URLs)

**Key gotcha — HTML report URLs:** The URLs in the HTML report are not a template file or inline strings in `index.ts`. They are emitted entirely from `src/render/HtmlRenderer.ts` via the `REPO_URL` constant at line 26. Changing that one constant updates all occurrences in the rendered output (header gh-link, footer contribute link). No other source files embed the repo URL.

**Outcome:** All 236 tests pass post-migration. Build clean. Zero `devjoy-pub` matches outside `.squad/` and the stale generated artifact.

### 2026-06-03 — Repo Housekeeping (CONTRIBUTING, PR template, issue templates)

**Work completed:**

- `CONTRIBUTING.md` (repo root) — friendly, alpha-aware contributor guide covering dev setup (`npm install`, `npm run build`, `npm test`, `npm run lint`, `npm run dev`), how to run, filing issues, submitting PRs, squad label workflow, commit message guidance, Node ≥18 requirement, and a short code-of-conduct paragraph. No DCO/CLA. ~1 page.
- `.github/pull_request_template.md` — 4-section PR template: Summary, Linked issues, What changed, How to test. 5-item checklist (build, tests, lint, docs).
- `.github/ISSUE_TEMPLATE/bug_report.md` — Bug template with: what happened, expected behavior, repro steps, environment (OS/Node/tscope version), optional session file sample with privacy reminder. Auto-labels: `squad`, `bug`.
- `.github/ISSUE_TEMPLATE/feature_request.md` — Feature template with: problem, proposed solution, alternatives, GitHub Copilot billing context field. Auto-labels: `squad`, `enhancement`.
- `.github/ISSUE_TEMPLATE/config.yml` — Disables blank issues; adds Discussions contact link.
- `.squad/decisions/inbox/trinity-github-packages-decision.md` — GitHub Packages vs npmjs.org analysis (see below).

**GitHub Packages decision summary:**
- `tscope` (unscoped) is already published on npmjs.org at v0.3.0 — same project, name is claimed.
- GitHub Packages requires scoped names + consumer auth → breaks the `npm i -g tscope` install model (D2).
- **Recommendation:** npmjs.org only. GitHub Packages adds friction with no benefit for a public CLI. Revisit only if org-internal distribution is ever needed.

**Contributors should know:**
- Both issue templates auto-apply the `squad` label → Lead triage picks them up automatically.
- The existing docs `contributing.md` in `docs/` is minimal (3 lines); the new root `CONTRIBUTING.md` is the canonical contributor doc. Consider linking or replacing the docs version in a future pass.

### 2026-06-03 — Distribution Model Analysis

**Question from robpitcher:** Should tscope be packaged as a Node package, a Copilot extension, or a gh CLI extension?

**Research conducted:**
- Verified Copilot CLI plugin model (docs.github.com, June 2026) — plugins bundle agents/skills/hooks/MCP/LSP configs, invoked inside Copilot CLI sessions. Real and documented.
- Verified gh CLI extension model — interpreted scripts or precompiled binaries, installed via `gh extension install owner/gh-tscope`.
- GitHub Copilot Extensions (marketplace/chat flavor) — requires HTTP server + OAuth, entirely wrong for tscope.

**Recommendation:** D2 CONFIRMED — stay on npm. Not amending.

**Reasoning:**
- Copilot CLI plugins add agents/skills/hooks to the Copilot session. tscope is a standalone local file-reader that exits. Wrong shape entirely — cannot fit tscope into this model.
- gh extension model is architecturally valid but adds no friction reduction for target users (Copilot CLI users already have Node). Binary path requires cross-platform build pipeline and 80-100MB binaries (pkg bundles Node runtime).
- npm: zero friction for target user, already live at v0.3.0, best ecosystem fit for future HTML/JSON renderers (D5 Renderer interface).

**Secondary option (future):** Add `gh-tscope` as an ADDITIVE distribution channel post-v1.0 once schema is stable and a cross-platform binary pipeline exists. Not a replacement — an additional reach channel.

**Decision note:** `.squad/decisions/inbox/trinity-distribution-model-analysis.md`
