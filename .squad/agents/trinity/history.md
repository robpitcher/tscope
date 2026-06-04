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
