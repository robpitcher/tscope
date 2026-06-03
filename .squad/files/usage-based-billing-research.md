# GitHub Copilot Usage-Based Billing — Domain Brief

**Researched by:** Trinity (Lead/Architect)  
**Date:** 2026-06-02  
**Primary source:** https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises

---

## 1. Billing Model

GitHub Copilot usage is measured in **GitHub AI Credits**.

- **1 AI credit = $0.01 USD**
- Credits are consumed by AI model interactions: **input tokens**, **output tokens**, and **cached tokens**
- Cost = (tokens × per-token rate for that model) → converted to AI credits
- **Code completions and next edit suggestions are NOT billed in AI credits** — they remain unlimited on all paid plans
- Features that DO consume credits: Copilot Chat, Copilot CLI, Copilot cloud agent, Copilot Spaces, Spark, third-party coding agents

Charges accrue in two phases:
1. **Pool phase:** Usage draws from each billing entity's shared included AI credit pool (no extra cost)
2. **Metered phase:** Once the pool is exhausted, additional usage is charged at $0.01/credit (if "AI credit paid usage" policy is enabled)

---

## 2. Plans & Allowances

### Individual Plans

| Plan          | Price/month | Base Credits | Flex Allotment | Total Monthly Credits |
|---------------|-------------|--------------|----------------|-----------------------|
| Copilot Free  | $0          | (limited)    | —              | Limited + select models |
| Copilot Pro   | $10         | 1,000        | 500            | 1,500                 |
| Copilot Pro+  | $39         | 3,900        | 3,100          | 7,000                 |
| Copilot Max   | $100        | 10,000       | 10,000         | 20,000                |

> **Note:** Individual plans have two tiers of included credits: "base" (fixed, tied to subscription price) and "flex allotment" (variable, designed to adapt as AI economics evolve). Base credits are consumed first.

> **Discount:** 10% discount on model costs when using auto model selection in Chat, CLI, or cloud agent.

### Org/Enterprise Plans (pooled per billing entity)

| Plan               | Included AI Credits per user/month | Standard Overage Rate |
|--------------------|-------------------------------------|----------------------|
| Copilot Business   | 1,900 (pooled)                      | $0.01/credit         |
| Copilot Enterprise | 3,900 (pooled)                      | $0.01/credit         |

> **Promotional period (June 1–September 1, 2026):** Existing customers get elevated included credits:
> - Business: 3,000/user/month  
> - Enterprise: 7,000/user/month

Pool behavior:
- Adding licenses mid-cycle expands the pool immediately
- Removing licenses mid-cycle does not shrink pool until next billing cycle
- Power users can draw more from the pool; lighter users offset consumption

---

## 3. Per-Token Model Pricing

All prices are **per 1 million tokens**. Applies to overage (metered) usage.

### OpenAI

| Model          | Category    | Input   | Cached Input | Output  |
|----------------|-------------|---------|-------------|---------|
| GPT-4.1 *(included)* | Versatile | $2.00 | $0.50 | $8.00 |
| GPT-5 mini *(included)* | Lightweight | $0.25 | $0.025 | $2.00 |
| GPT-5.2        | Versatile   | $1.75   | $0.175      | $14.00  |
| GPT-5.2-Codex  | Powerful    | $1.75   | $0.175      | $14.00  |
| GPT-5.3-Codex  | Powerful    | $1.75   | $0.175      | $14.00  |
| GPT-5.4        | Versatile   | $2.50   | $0.25       | $15.00  |
| GPT-5.4 mini   | Lightweight | $0.75   | $0.075      | $4.50   |
| GPT-5.4 nano   | Lightweight | $0.20   | $0.02       | $1.25   |
| GPT-5.5        | Powerful    | $5.00   | $0.50       | $30.00  |

### Anthropic (+ cache write cost)

| Model              | Category  | Input  | Cached | Cache Write | Output  |
|--------------------|-----------|--------|--------|-------------|---------|
| Claude Haiku 4.5   | Versatile | $1.00  | $0.10  | $1.25       | $5.00   |
| Claude Sonnet 4/4.5/4.6 | Versatile | $3.00 | $0.30 | $3.75 | $15.00 |
| Claude Opus 4.5–4.8 | Powerful | $5.00 | $0.50 | $6.25 | $25.00 |

### Google

| Model           | Category    | Input  | Cached | Output  |
|-----------------|-------------|--------|--------|---------|
| Gemini 2.5 Pro  | Powerful    | $1.25  | $0.125 | $10.00  |
| Gemini 3 Flash  | Lightweight | $0.50  | $0.05  | $3.00   |
| Gemini 3.1 Pro  | Powerful    | $2.00  | $0.20  | $12.00  |
| Gemini 3.5 Flash | Lightweight | $1.50 | $0.15  | $9.00   |

### Other

| Model            | Provider  | Category    | Input  | Cached | Output |
|------------------|-----------|-------------|--------|--------|--------|
| MAI-Code-1-Flash | Microsoft | Lightweight | $0.75  | $0.075 | $4.50  |
| Raptor mini      | GitHub    | Versatile   | $0.25  | $0.025 | $2.00  |

> **No "premium request" multiplier table exists in the new billing model.** The older "premium request" terminology applied to a legacy request-based billing model for annual Pro/Pro+ subscribers. The current model is pure token-based pricing converted to AI credits.

---

## 4. Budgets & Spending Limits

Four controls, evaluated in order per request:

| Control                     | Scope       | Active Phase          | Hard Stop? |
|-----------------------------|-------------|-----------------------|------------|
| User-level budget (ULB)     | Per user    | Always (pool+metered) | Always yes |
| Individual ULB              | Per user    | Always                | Always yes |
| Cost center budget          | Group/team  | Metered phase only    | Optional   |
| Enterprise spending limit   | Enterprise  | Metered phase only    | Optional   |

Key behaviors:
- **$0 ULB = immediate block**
- "Lowest remaining headroom wins" — whichever budget runs out first blocks the user
- "Stop usage when budget limit is reached" for cost-center/enterprise budgets is **off by default** — charges accrue unless explicitly enabled
- No automatic fallback to lower-cost models when a budget is exhausted
- Cost centers can be excluded from enterprise budget (independent spending authority)

**Budget REST API** (public preview): `GET/PATCH/DELETE /organizations/{org}/settings/billing/budgets[/{id}]`  
Fields: `budget_amount` (integer USD), `prevent_further_usage` (bool), `budget_scope`, `budget_entity_name`, `budget_product_sku`, `budget_alerting.will_alert`, `budget_alerting.alert_recipients`

---

## 5. Usage Data Availability (CRITICAL for tscope)

### 5a. Web UI / CSV Reports

Available at: GitHub billing settings → "Metered usage" page and "AI usage" page

| Report Type          | Period     | Fields                                                     | Via API? |
|----------------------|------------|------------------------------------------------------------|----------|
| Summarized usage     | Up to 1 yr | date, sku, repository, cost_center_name, org, quantity, gross_amount, discount_amount, net_amount | REST (`/usage`) — summarized only |
| Detailed usage       | Max 31 days | + username, workflow_path | **Web UI only** — NOT via REST API |
| AI usage report      | Max 31 days | date, model, username, quantity, gross/discount/net amounts | Web UI only |

> ⚠️ **Critical constraint:** The **detailed usage report** (with per-user, per-model fields) is **only available through the GitHub web interface** — the REST API `/usage` endpoint only provides summarized data.

### 5b. Copilot Usage Metrics API (Engagement/Adoption — not billing)

These APIs return **engagement/adoption metrics** (active users, completions, chat requests, LOC) — **not AI credit costs or billing amounts**.

**Legacy (closed April 2, 2026):** `GET /orgs/{org}/copilot/metrics`  
**Current (active):** Copilot usage metrics report download endpoints

#### Enterprise Usage Metrics Download Endpoints

| Endpoint | Description | Window |
|----------|-------------|--------|
| `GET /enterprises/{e}/copilot/metrics/reports/enterprise-1-day` | Daily enterprise aggregate | 1 day |
| `GET /enterprises/{e}/copilot/metrics/reports/enterprise-28-day/latest` | Rolling 28-day aggregate | 28 days |
| `GET /enterprises/{e}/copilot/metrics/reports/users-1-day` | Per-user metrics for a day | 1 day |
| `GET /enterprises/{e}/copilot/metrics/reports/users-28-day/latest` | Per-user 28-day metrics | 28 days |
| `GET /enterprises/{e}/copilot/metrics/reports/user-teams-1-day` | User↔team join for a day | 1 day |

Same set exists for orgs: `GET /orgs/{org}/copilot/metrics/reports/...`

**Response format:** Returns `download_links` (signed URLs, time-limited) + `report_day` or `report_start_day`/`report_end_day`.  
**File format:** NDJSON download from signed URL.  
**Historical range:** Available from October 10, 2025; up to 1 year back.  
**Auth:** `manage_billing:copilot` or `read:enterprise` (enterprise); `read:org` (org).  
**Policy requirement:** "Copilot usage metrics" policy must be set to "Enabled everywhere."

#### Auth Scopes Summary

| Data Source | Required Scopes |
|-------------|-----------------|
| Org metrics reports | `read:org` |
| Enterprise metrics reports | `manage_billing:copilot` or `read:enterprise` |
| Billing usage CSV export (UI) | Org owner / billing manager |
| Budget REST API | Org admin or billing manager |

---

## 6. Data Schema (Usage Metrics API — NDJSON)

### Per-User Daily Record (users-1-day)

```json
{
  "day": "2025-10-01",               // date
  "user_id": 1,                       // integer
  "user_login": "login1",             // string
  "enterprise_id": "1",               // string
  "used_agent": false,
  "used_chat": false,
  "used_cli": true,
  "user_initiated_interaction_count": 0,  // explicit prompts sent
  "code_generation_activity_count": 1,    // distinct output events
  "code_acceptance_activity_count": 1,    // accepted suggestions
  "loc_suggested_to_add_sum": 10,     // lines suggested
  "loc_added_sum": 8,                 // lines actually added
  "loc_deleted_sum": 0,
  "totals_by_cli": {
    "prompt_count": 2,
    "request_count": 2,
    "session_count": 2,
    "token_usage": {
      "avg_tokens_per_request": 4400.0,
      "output_tokens_sum": 5000,
      "prompt_tokens_sum": 3800
    }
  },
  "totals_by_feature": [...],          // by feature (code_completion, agent_edit, etc.)
  "totals_by_ide": [...],              // by IDE (vscode, etc.)
  "totals_by_language_feature": [...], // by language + feature
  "totals_by_model_feature": [...],    // by model + feature (chat only)
  "totals_by_language_model": [...]    // by language + model
}
```

### Enterprise-Level Daily Record (enterprise-1-day)

Wraps `day_totals[]` array with same sub-fields plus:
- `daily_active_users`, `weekly_active_users`, `monthly_active_users`
- `daily_active_cli_users`
- `pull_requests` stats (total created, merged, copilot-reviewed, etc.)
- `report_start_day` / `report_end_day` for 28-day reports

### User-Teams Record (user-teams-1-day)

```json
{
  "user_id": 1001,
  "user_login": "octocat",
  "day": "2026-05-14",
  "organization_id": "999",   // or enterprise_id
  "team_id": 42,
  "slug": "frontend"
}
```
Join to per-user records on `user_id` + `day` + entity id to get team-level metrics.  
⚠️ Teams with fewer than 5 seated Copilot users are omitted.

### Billing CSV Reports

| Field                  | Description |
|------------------------|-------------|
| `date`                 | UTC day of usage |
| `product`              | GitHub product |
| `sku`                  | Specific product SKU |
| `quantity`             | Amount of SKU used |
| `unit_type`            | Unit of measurement |
| `applied_cost_per_quantity` | Unit cost |
| `gross_amount`         | Total usage amount |
| `discount_amount`      | Included/discounted portion |
| `net_amount`           | Billable amount (gross − discount) |
| `username`             | User (detailed report only) |
| `organization`         | Org associated with usage |
| `repository`           | Repo associated (if applicable) |
| `workflow_path`        | GH Actions workflow (detailed only) |
| `cost_center_name`     | Cost center (if applicable) |
| `model`                | Model used — e.g., `claude-sonnet-4` (AI usage report only) |

---

## 7. Gaps & Risks

1. **Billing data not in the metrics API:** The Copilot usage metrics API tracks engagement (tokens, LOC, chat counts) but does NOT expose AI credit costs or dollar amounts. The only source of actual billing amounts is the billing CSV reports, and the per-user/per-model detailed CSV is web-UI-only (no REST API download).

2. **Token data present for CLI only (partially):** The example schema shows `token_usage` (prompt_tokens_sum, output_tokens_sum) in `totals_by_cli`, but this may not be uniformly available across all features in the API — the field appears in CLI-specific breakdowns.

3. **Model attribution for auto-selection:** When Copilot auto-selects a model, activity is attributed to the actual model, not "Auto" — but this requires updated IDE/client versions (VS Code 1.120+, etc.).

4. **Legacy API sunset:** The old `/orgs/{org}/copilot/metrics` endpoint was closed April 2, 2026. Any existing tooling using it must migrate to the new report-download endpoints.

5. **Promotional period complexity:** The elevated credit allowances for Business/Enterprise expire September 1, 2026 — any tool showing "included vs. overage" calculations must account for this window.

6. **Individual plan flex allotment is variable:** GitHub explicitly reserves the right to change the flex allotment amounts as "AI economics evolve." This means the effective included allowance for individual plans can change without a price change.

7. **Report schema evolution:** GitHub states it "aims to minimize changes" but fields have been removed before (`usage_at` → `date`, `workflow_name` → `workflow_path`). The NDJSON schema is subject to change.

8. **5-user minimum for org/team metrics:** The metrics API only returns data for orgs/teams with 5+ active licensed users on a given day. Small teams will have gaps.

9. **Detailed billing CSV is UI-only:** There is no programmatic way to retrieve per-user, per-model, per-day billing data (with dollar amounts) via REST API — only via manual web download. This is the single biggest constraint for tscope automation.

10. **"AI credit paid usage" policy must be enabled:** For metered usage to occur at all, the org/enterprise must explicitly enable this policy. tscope should handle the case where orgs have this disabled.

---

## Implications for tscope

### What Data We Can Ingest

| Source | Method | Contains Costs? | Contains Per-User? | Historical Range |
|--------|--------|-----------------|-------------------|-----------------|
| Copilot Usage Metrics API (users-1-day) | REST → signed URL → NDJSON | ❌ (engagement only) | ✅ | 1 year (from Oct 2025) |
| Copilot Usage Metrics API (enterprise-1-day) | REST → signed URL → NDJSON | ❌ | Aggregate only | 1 year |
| Billing CSV — Detailed usage | Web UI download | ✅ (net_amount) | ✅ (username) | 31 days |
| Billing CSV — AI usage report | Web UI download | ✅ | ✅ (user + model) | 31 days |
| Billing CSV — Summarized | REST `/usage` | ✅ | ❌ | 1 year |

**Primary ingest strategy:** tscope should support **two input modes**:
1. **REST API ingest** (requires `manage_billing:copilot` or `read:enterprise` token) → pulls usage metrics NDJSON for engagement/token data per user per day
2. **CSV import** (user manually downloads from GitHub billing UI) → provides actual AI credit costs and net billing amounts

### Suggested Initial Data Model

```sql
-- Core entities
users (user_id, user_login, enterprise_id, organization_id)
days  (day DATE)

-- Usage metrics (from API, no costs)
usage_metrics (
  id, day, user_id, user_login, entity_id, entity_type (org|enterprise),
  used_agent BOOL, used_chat BOOL, used_cli BOOL,
  user_initiated_interaction_count INT,
  code_generation_activity_count INT,
  code_acceptance_activity_count INT,
  loc_suggested_to_add INT, loc_added INT, loc_deleted INT,
  prompt_tokens_sum INT, output_tokens_sum INT  -- CLI only currently
)

-- Usage metrics by dimension
usage_by_feature (usage_metrics_id, feature, interaction_count, loc_added, loc_suggested)
usage_by_ide    (usage_metrics_id, ide, interaction_count, loc_added)
usage_by_model  (usage_metrics_id, model, feature, interaction_count)
usage_by_language (usage_metrics_id, language, feature, loc_added)

-- Billing records (from CSV import)
billing_records (
  id, date, sku, product, username, organization, repository,
  model, cost_center_name, workflow_path,
  quantity DECIMAL, unit_type, applied_cost_per_quantity DECIMAL,
  gross_amount DECIMAL, discount_amount DECIMAL, net_amount DECIMAL
)

-- Org/Enterprise config snapshot
plans (entity_id, entity_type, plan_name, users_count, 
       included_credits_per_user, pool_total_credits,
       snapshot_date)
```

### Feature Opportunities

1. **Daily credit burn rate** — show how fast the shared pool is being consumed vs. remaining
2. **Per-user efficiency** — tokens spent vs. code accepted (acceptance rate × LOC)
3. **Model cost breakdown** — using billing CSV `model` field to show spend by model
4. **Budget headroom** — integrate with budget API to show how close each user/cost-center is to limits
5. **Pool exhaustion forecasting** — given burn rate, predict when metered overage kicks in
6. **Team-level rollups** — join user-teams report with per-user metrics to aggregate by team
7. **CLI vs. IDE vs. web usage** — separate telemetry channels for tscope itself vs. other Copilot surface areas
8. **Alert when approaching budget limits** — mirror GitHub's own alerting in a developer-centric dashboard
9. **CSV import pipeline** — guided flow for users to download and import their billing CSV for full cost visibility

---

## Source URLs

- https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises
- https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals
- https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
- https://docs.github.com/en/copilot/concepts/billing/budgets-for-usage-based-billing
- https://docs.github.com/en/rest/copilot/copilot-usage (legacy, closed April 2026)
- https://docs.github.com/en/rest/copilot/copilot-usage-metrics
- https://docs.github.com/en/copilot/reference/copilot-usage-metrics/example-schema
- https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics
- https://docs.github.com/en/billing/reference/billing-reports
- https://docs.github.com/en/rest/billing/enhanced-billing
