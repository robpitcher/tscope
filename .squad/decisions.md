# Squad Decisions

## Active Decisions

### GitHub Copilot Billing Model & Data Architecture

**Author:** Trinity (Lead/Architect)  
**Date:** 2026-06-02  
**Status:** Active  
**Context:** Foundational research for tscope — GitHub Copilot usage-based billing domain

#### Decision 1: Core Billing Unit
**Decision:** tscope's core domain object is the GitHub AI Credit (1 credit = $0.01 USD).
- Credits are computed from token consumption × per-token model price
- Code completions are NOT billed in credits; they remain unlimited on paid plans
- Rationale: AI Credits are the billing unit GitHub uses for all usage-based charges

#### Decision 2: Dual-Channel Data Ingest Architecture
**Decision:** tscope must support both REST API and manual CSV import for complete billing visibility.

**Channel A — Copilot Usage Metrics API** (REST, programmatic):
- Endpoint: `GET /enterprises/{e}/copilot/metrics/reports/users-1-day` → signed URL → NDJSON download
- Content: per-user, per-day engagement data (token counts for CLI, LOC, interaction counts, model breakdowns)
- **Limitation:** NO dollar amounts; engagement-only
- Auth scope: `manage_billing:copilot` or `read:enterprise`
- Historical range: up to 1 year back

**Channel B — Billing CSV** (web UI only):
- Source: GitHub web UI → Billing → AI usage report → CSV download
- Content: `date, model, username, quantity, gross_amount, discount_amount, net_amount`
- **Critical:** ONLY source of per-user/per-model cost and dollar billing amounts
- No programmatic REST API access for detailed cost breakdowns
- Maximum 31 days per download

**Rationale:** REST API provides engagement/adoption metrics without cost data; CSV provides the billing source-of-truth. Neither channel alone is sufficient.

#### Decision 3: Cost Data Availability
**Decision:** Detailed billing data (per-user + per-model + net_amount) is web-UI-only; no programmatic billing API exists yet.
- REST `/usage` endpoint only returns summarized billing (no per-user breakdown)
- Rationale: This limits automation; tscope must support CSV import until GitHub opens a billing API endpoint
- Risk: Automation gaps for fully hands-off cost tracking

#### Decision 4: Metrics API Engagement Focus
**Decision:** The new Copilot Usage Metrics API (effective April 2, 2026) tracks adoption, not costs.
- Covers: active users, completions, LOC, chat interactions, model usage
- Token counts available per-user for CLI interactions (`totals_by_cli.token_usage`)
- Rationale: Complementary to billing CSV; supports feature adoption analytics

#### Decision 5: Plan Allowances & Overage Model
**Decision:** AI credit allowances vary by plan; all plans overage at $0.01/credit.

- **Individual Plans:**
  - Pro: 1,500 credits/month (1,000 base + 500 flex)
  - Pro+: 7,000 credits/month (3,900 base + 3,100 flex)
  - Copilot Max: 20,000 credits/month

- **Org/Enterprise Plans (pooled per billing entity):**
  - Business: 1,900 credits/user/month (3,000 during promo to Sep 1, 2026)
  - Enterprise: 3,900 credits/user/month (7,000 during promo)

**Rationale:** Enables tscope to model budget consumption, headroom, and overage risk

#### Decision 6: Budget API Integration
**Decision:** tscope can integrate GitHub's Budget API (public preview) to track budget configurations.
- Endpoint: `GET/PATCH /organizations/{org}/settings/billing/budgets[/{id}]`
- Content: amount, scope, prevent_further_usage, alert recipients
- Rationale: Provides headroom/proximity-to-limits visibility for teams

#### Decision 7: Legacy Metrics API Sunset
**Decision:** The old metrics endpoint (`/orgs/{org}/copilot/metrics`) is closed as of April 2, 2026.
- Rationale: tscope must use new report-download endpoints only; no backward-compat needed for legacy API

## Session 2026-06-02: tscope Phase 1 Architecture & Tech Stack

**Merged:** 2026-06-02T23:42:00-04:00 | Sources: Trinity architecture plan, Copilot directive, issue tracking

### D1: Local Session Data Source (VERIFIED)

**Author:** Trinity | **Status:** Active

**Decision:** tscope parses local `events.jsonl` files from `%USERPROFILE%\.copilot\session-state\{session-id}\`.

- Source: Copilot CLI stores session data locally; `session.shutdown` event contains `modelMetrics` with full token breakdowns
- Verified schema: consistent across sessions April–June 2026
- Token fields: `data.modelMetrics.{model}.usage.{inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens}`
- **Parsing strategy:** Fast path reads last line; if `type === "session.shutdown"`, use it. Fallback scans for shutdown event. In-progress sessions have no shutdown event — handle gracefully (mark as "in progress", skip totals)
- Alternatives considered: SQLite (`session-store.db`) — works but JSONL is simpler; GitHub Copilot Metrics API — requires auth, out of scope for phase 1

### D2: Tech Stack (CONFIRMED)

**Author:** robpitcher (via Copilot directive) | **Date:** 2026-06-02T23:36:50-04:00 | **Status:** Active

**Decision:** tscope will be built in **Node.js / TypeScript**, distributed via `npm i -g tscope`.

- **Rationale:** Target audience (Copilot CLI users) already has Node; npm gives lowest install friction, fastest dev velocity, best ecosystem for future HTML/charts
- **Alternatives:** Go (runner-up if standalone binary needed), Rust (deferred — no perf/safety need)
- **Binding issues:** 11 GitHub issues created reflecting Node/TS stack, `npm` distribution, binary name `tscope`

### D3: AI Credit Calculation via Bundled Rate Table

**Author:** Trinity | **Status:** Active

**Decision:** tscope bundles a static model-rate lookup table. Credits computed as: `credits = sum((tokens × rate) for each token type) / 1e6 × 100`

- Local session data contains no pricing information
- GitHub publishes pricing but no programmatic API exposes it
- **Risk:** Rate table drift. **Mitigation:** version the table, display as "estimated", warn on unknown models
- **Unknown model handling:** Show tokens, skip credit calc, warn to stderr (CONFIRMED by robpitcher)

### D4: Session Display & Formatting (CONFIRMED)

**Author:** robpitcher | **Status:** Active

- **Session ID:** Display full UUID (not truncated)
- **Timezone:** Display session times in local time; stored data is UTC
- **In-progress handling:** Do not assume last line is shutdown event; must parse gracefully

### D5: Renderer Interface for Extensibility

**Author:** Trinity | **Status:** Active

**Decision:** Define a `Renderer` interface in phase 1; TextRenderer is only initial implementation.

- Future: HtmlRenderer, JsonRenderer can be added without changing core pipeline
- Rationale: User explicitly requested future HTML report support; interface costs nothing now

### D6: Phase 1 Scope & Roadmap

**Author:** Trinity | **Status:** Active | **Issues:** #17 (epic), #1–#11 (phase 1), #12–#16 (phase 2 backlog)

**Phase 1 ready to start (no dependencies):**
- #1 — Project Scaffolding & CLI Skeleton (Tank)
- #2 — Model Rate Lookup Table (Tank)

**Phase 1 dependency chain:**
- #3 — Session Discovery (depends #1) → #4 Date Filtering (depends #3) → #5 Parse events.jsonl (depends #3) → #6 AI Credit (depends #5, #2) → #7 Text Renderer (depends #5, #6) → #8 E2E (depends #3, #4, #5, #6, #7)
- #9 — Unit Tests (depends #5, #2, #6)
- #10 — Renderer Interface (depends #7)
- #11 — README (depends #8)

**Phase 1 defaults:** Local-only (no aggregation), per-user, date filter is current local day

**Phase 2 backlog:** #12 Date Range, #13 JSON Renderer, #14 HTML Report, #15 /chronicle tips, #16 Rate Table Auto-Update

**Dependency convention:** Issues use `Depends on #N` labels; `ready` label for startable tasks, `blocked` for waiting tasks

## Decision: Alpha Disclaimer in README

**Author:** Trinity  
**Date:** 2026-06-03  
**Status:** Active

**Decision:** Added a `> [!WARNING]` GitHub-flavored markdown alert block after the one-line tagline and before the description paragraph.

**Context:** README needs to communicate that tscope is alpha-stage software with expected bugs and potential schema changes.

**Wording:** Bold "Alpha software" lead with single sentence covering early-stage status, bug expectations, schema-may-change caveat, and link to issues page. Tone kept friendly with 🙏 emoji.

**Placement:** Immediately after tagline, before prose description — first substantive thing reader sees without overshadowing project name.

## Decision: NPM Publishing Strategy

**Author:** Trinity  
**Date:** 2026-06-03  
**Status:** Active

**Decision:** Stick with npmjs.org as the sole registry for alpha and beyond.

**Rationale:** GitHub Packages requires scoped package names and consumer `.npmrc`+auth, adding friction to `npm i -g tscope` with zero user benefit. npmjs.org is zero-friction default registry. Package name already claimed on npmjs.org (v0.3.0, same project). D2 distribution model ("one npm command") requires npmjs.org.

**When this could change:** Org-internal pivot, GitHub-only enterprise demand, or scoped `@robpitcher/tscope` variant desired. Future trigger-based decision only.

**Action items:** Publishing workflow should target npmjs.org with `NPM_TOKEN`. Do NOT add `publishConfig.registry` pointing to GitHub Packages.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
