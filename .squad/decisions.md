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

## Decision: Distribution Model Analysis — npm vs Copilot Plugin vs gh Extension

**Author:** Trinity (Lead/Architect)  
**Date:** 2026-06-03  
**Status:** Decision — D2 CONFIRMED (no amendment)  
**Requested by:** robpitcher  

### Summary

Comprehensive analysis of three potential distribution channels: npm (primary), Copilot CLI plugins (rejected), and gh CLI extensions (secondary, post-v1.0).

### Recommendation: Primary path is npm (`npm i -g tscope`). D2 stands unchanged.

**Key findings:**

- **npm:** Lowest friction (target users have Node), perfect distribution fit, D5 renderers leverage npm/Node ecosystem, already live at v0.3.0 with 236 tests passing. **Primary channel — no change to D2.**

- **Copilot CLI plugin:** Fundamentally wrong architectural fit. Plugins extend the Copilot CLI's agentic experience (agents, skills, hooks, MCP servers). tscope is a standalone reporting CLI that reads local files and exits. No architectural overlap. **Do not pursue.**

- **gh CLI extension:** Valid architecture (`gh tscope ...` via precompiled binary), but adds zero value for tscope's local-only workflow. Requires `gh` CLI dependency (not universally present like Node for Copilot users). **Valid as secondary channel only — post-v1.0, conditional on market reach justification.**

### D2 Amendment Language

**No amendment.** D2 stands as written: *"tscope will be built in Node.js / TypeScript, distributed via npm i -g tscope."*

### Future Option: gh-tscope Extension (Post-v1.0)

If market conditions justify broadening reach to GitHub-native tooling users:
1. Create `gh-tscope` repo (separate or monorepo)
2. Build cross-platform binary pipeline (GitHub Actions matrix: win/mac/linux × amd64/arm64) via `pkg` or `ncc`
3. Publish releases with precompiled binaries
4. Users invoke: `gh extension install robpitcher/gh-tscope` → `gh tscope [options]`

Preconditions:
- v1.0 stable (schema and CLI flags locked)
- Binary size acceptable (pkg bundles Node runtime; ~80–100MB)
- Market demand validated

This is an additive channel, not a replacement. Both paths can coexist.

## OTel-Primary Pivot — Tank Feasibility (2026-06-10)

**Status:** Proposed (pending user approval)

**Author:** Tank (Backend / Data Engineer)  
**Date:** 2026-06-10

### Verdict

**OTel as primary source for per-session, per-model token + cost analysis is FEASIBLE.**

Token counts from OTel span attributes match `events.jsonl` session.shutdown aggregates **exactly** across all 4 live sessions tested (6 distinct model+session combinations, zero discrepancy). All required fields are present with stable OTel GenAI semantic convention names.

**Top 3 caveats:**

1. **Metrics records have no session scope.** The 40 `metric` records in the file are histograms aggregated over an export window and carry no `gen_ai.conversation.id`. Per-session analysis must be built exclusively from the 13 `span` records. Metrics are useful only for aggregate/fleet-level analytics.

2. **Single append-only file for all sessions.** Unlike `events.jsonl` (one file per session directory), `otel.jsonl` intermingles all sessions. The parser must group by `gen_ai.conversation.id` and cannot assume one session per file. No file rotation was found; unbounded growth is a risk in long-term use.

3. **OTel only captures forward from enablement.** Sessions before `tscope otel enable --apply` have no OTel data. The `events.jsonl` path is required as historical/fallback. Dual-source architecture is necessary.

### Field Availability

| Required Field | Status | OTel Source | Verified |
|---|---|---|---|
| Input tokens | **AVAILABLE** | `gen_ai.usage.input_tokens` | ✅ exact match |
| Output tokens | **AVAILABLE** | `gen_ai.usage.output_tokens` | ✅ exact match |
| Cache-read tokens | **AVAILABLE** | `gen_ai.usage.cache_read_input_tokens` | ✅ exact match |
| Cache-write tokens | **AVAILABLE** | `gen_ai.usage.cache_creation_input_tokens` | ✅ exact match (name differs) |
| Reasoning tokens | **AVAILABLE** | `gen_ai.usage.reasoning_output_tokens` | ✅ exact match |
| Model identity | **AVAILABLE** | `gen_ai.response.model` | ✅ same model strings |
| Session identifier | **AVAILABLE** | `gen_ai.conversation.id` | ✅ same UUID |
| Estimated credits | **BONUS** | `github.copilot.nano_aiu` (÷1e9) | ✅ server-side; no rate table needed |

### Bonus Signals in OTel

Server-side billing (`github.copilot.nano_aiu`), per-request latency, streaming metrics, tool call counts, agentic turn depth, stop reasons, context window utilization, MCP server health, tool definitions, anonymized user ID.

## Decision: OTel-Primary Architecture — tscope Pivot (2026-06-10)

**Status:** Proposed (pending user approval)

**Author:** Trinity (Lead/Architect)  
**Date:** 2026-06-10

### Summary

tscope introduces a DataSource abstraction: both an OTel reader and the existing events.jsonl parser produce a common `NormalizedSession` model. OTel is the default source when data exists; logs are the automatic fallback for historical/pre-enablement data. The CLI surface gains `--source` for explicit control.

### Key Decisions

**D-OTel-1: DataSource Interface & Normalized Model**

A `DataSource` interface produces `NormalizedSession[]` from either OTel or events.jsonl. The normalized model extends the current `ParsedSession` with: source provenance tag, optional extended metrics (latency, request count, tool calls, errors), and coverage metadata. Both sources produce the same shape; renderers never know which source was used.

**D-OTel-2: Source Selection Default**

Default is `auto`: use OTel data when `~/.copilot/tscope/otel.jsonl` exists and has entries in the requested date range; fall back to events.jsonl otherwise. Per-session, not all-or-nothing — if OTel covers 5 of 8 sessions and logs cover the other 3, both contribute. De-duplication by session ID (OTel wins on conflict).

**D-OTel-3: CLI Argument Redesign**

New flag: `--source otel|logs|auto` (default: auto). Existing date filters unchanged. `--verbose` added for source-provenance annotations. The `otel` subcommand retained. No flags removed (alpha, but no gratuitous breaks).

**D-OTel-4: Schema Bump to v5**

JSON schema bumps to `tscope/report/v5`. Adds: `source` field per session, `coverage` object at report level, optional `extended` metrics block per session. v4 consumers break on schema string but field additions are additive.

**D-OTel-5: Extended Metrics — Optional Block**

OTel-sourced sessions MAY include an `extended` object with latency, request counts, tool call counts, error counts, model routing info. These appear in HTML dashboard's detail view and JSON but not in the default text renderer. Core view remains token+cost.

### Pending User Decisions (5 Open Forks)

1. **Cost re-introduction:** Should tscope re-introduce per-token cost estimates from `github.copilot.nano_aiu` (OTel) or remain token-only until GitHub publishes a pricing API?
2. **File rotation:** Should tscope implement size/age-based rotation for `otel.jsonl`?
3. **Bonus signals in v1:** Include latency, tool call counts, and other extended metrics in v1, or defer to v2?
4. **JSON v5 bump:** Ship v5 schema immediately, or stay on v4 for backward compat with external consumers?
5. **CLI surface changes:** Accept `--source` flag and `--verbose` for alpha, or hold for v1.0?

**Implementation status:** Not started; 5-phase plan ready (Trinity review gates at phases 2, 4).
