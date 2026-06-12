# JSON Output

Use `--json` for machine-readable output:

```bash
tscope --json | jq '.summary'
tscope --all --json | jq '.sessions[].totals'
```

## Schema: `tscope/report/v5`

### Mixed report (OTel + logs merged, default `--source auto`)

```json
{
  "schema": "tscope/report/v5",
  "generatedAt": "2026-06-10T20:00:00.000Z",
  "source": "mixed",
  "costAvailable": true,
  "coverage": {
    "otelCount": 12,
    "logsCount": 3,
    "costCoverage": "partial"
  },
  "filter": { "description": "today", "reportDate": "2026-06-10" },
  "summary": {
    "sessionCount": 15,
    "completedCount": 15,
    "inProgressCount": 0,
    "totalTokens": 900000
  },
  "sessions": [
    {
      "sessionId": "7d15eea1-4d69-49e9-bb21-8370594afd6a",
      "path": "~/.copilot/tscope/otel.jsonl",
      "startTime": "2026-06-10T20:00:00.000Z",
      "localDateTime": "2026-06-10 13:00",
      "inProgress": false,
      "apiDurationMs": null,
      "source": "otel",
      "totalCost": 2.34,
      "modelCosts": {
        "claude-opus-4.7": 2.34
      },
      "extended": {
        "reasoningTokens": 1024,
        "contextWindow": {
          "usedTokens": 180000,
          "limitTokens": 200000,
          "utilizationRatio": 0.9
        }
      },
      "models": [
        {
          "modelName": "claude-opus-4.7",
          "usage": {
            "input": 243772,
            "output": 2272,
            "cacheRead": 155776,
            "cacheWrite": 87988,
            "reasoning": 1024
          }
        }
      ],
      "totals": {
        "input": 243772,
        "output": 2272,
        "cacheRead": 155776,
        "cacheWrite": 87988,
        "reasoning": 1024,
        "total": 246044
      }
    },
    {
      "sessionId": "abc12345-6789-abcd-ef01-234567890abc",
      "path": "~/.copilot/session-state/abc12345.../events.jsonl",
      "startTime": "2026-06-10T18:00:00.000Z",
      "localDateTime": "2026-06-10 11:00",
      "inProgress": false,
      "apiDurationMs": null,
      "source": "logs",
      "models": [
        {
          "modelName": "gpt-4o",
          "usage": {
            "input": 100000,
            "output": 50000,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ],
      "totals": {
        "input": 100000,
        "output": 50000,
        "cacheRead": 0,
        "cacheWrite": 0,
        "total": 150000
      }
    }
  ]
}
```

### OTel source (with cost data)

```json
{
  "schema": "tscope/report/v5",
  "generatedAt": "2026-06-10T20:00:00.000Z",
  "source": "otel",
  "costAvailable": true,
  "coverage": {
    "otelCount": 12,
    "logsCount": 0,
    "costCoverage": "all"
  },
  "filter": { "description": "today", "reportDate": "2026-06-10" },
  "summary": {
    "sessionCount": 12,
    "completedCount": 12,
    "inProgressCount": 0,
    "totalTokens": 800000
  },
  "sessions": [
    {
      "sessionId": "7d15eea1-4d69-49e9-bb21-8370594afd6a",
      "path": "~/.copilot/tscope/otel.jsonl",
      "startTime": "2026-06-10T20:00:00.000Z",
      "localDateTime": "2026-06-10 13:00",
      "inProgress": false,
      "apiDurationMs": null,
      "source": "otel",
      "totalCost": 2.34,
      "modelCosts": {
        "claude-opus-4.7": 2.34
      },
      "extended": {
        "reasoningTokens": 1024,
        "contextWindow": {
          "usedTokens": 180000,
          "limitTokens": 200000,
          "utilizationRatio": 0.9
        }
      },
      "models": [
        {
          "modelName": "claude-opus-4.7",
          "usage": {
            "input": 243772,
            "output": 2272,
            "cacheRead": 155776,
            "cacheWrite": 87988,
            "reasoning": 1024
          }
        }
      ],
      "totals": {
        "input": 243772,
        "output": 2272,
        "cacheRead": 155776,
        "cacheWrite": 87988,
        "reasoning": 1024,
        "total": 246044
      }
    }
  ]
}
```

### Log-parser source (without cost data)

When `--source logs` (or OTel is not configured and no merge occurs), the output is identical except:
- `source` is `"logs"`
- `costAvailable` is `false`
- `coverage.costCoverage` is `"none"`
- Per-session `source` is `"logs"`
- `totalCost`, `modelCosts`, and `extended` are **absent** (not `null`)

```json
{
  "schema": "tscope/report/v5",
  "source": "logs",
  "costAvailable": false,
  "coverage": {
    "otelCount": 0,
    "logsCount": 5,
    "costCoverage": "none"
  },
  "sessions": [
    {
      "source": "logs",
      "sessionId": "...",
      ...
    }
  ]
}
```

## Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `schema` | `string` | Schema version identifier. Currently `"tscope/report/v5"`. |
| `generatedAt` | `string` | ISO 8601 UTC timestamp when the report was generated. |
| `source` | `"otel"` \| `"logs"` \| `"mixed"` | Which data source produced the report. `"mixed"` when `--source auto` merges OTel and logs. |
| `costAvailable` | `boolean` | `true` when cost data is present (OTel source or mixed with OTel sessions). `false` for logs-only. |
| `coverage` | `SourceCoverage` | Breakdown of session sources and cost availability (see below). |
| `filter.description` | `string` | Human-readable description of the active date filter. |
| `filter.reportDate` | `string` | The local date (`YYYY-MM-DD`) at generation time. |
| `summary.sessionCount` | `number` | Number of sessions in `sessions[]`. |
| `summary.completedCount` | `number` | Same as `sessionCount` (in-progress sessions are excluded). |
| `summary.inProgressCount` | `number` | Always `0` (retained for schema shape). |
| `summary.totalTokens` | `number` | Sum of `totals.total` across all sessions (`input + output`). |

### Coverage Object (`coverage`)

| Field | Type | Description |
|---|---|---|
| `otelCount` | `number` | Number of sessions whose `source` is `"otel"` in this report. |
| `logsCount` | `number` | Number of sessions whose `source` is `"logs"` in this report. |
| `costCoverage` | `"all"` \| `"partial"` \| `"none"` | Whether cost data is available for all, some, or no sessions. `"all"` = pure OTel. `"partial"` = mixed report with OTel + logs. `"none"` = pure logs or empty. |

## Per-Session Fields

| Field | Type | Present when | Description |
|---|---|---|---|
| `sessionId` | `string` | Always | Session UUID. |
| `path` | `string` | Always | Source file path (OTel: shared `otel.jsonl`; logs: per-session `events.jsonl`). |
| `startTime` | `string` | Always | ISO 8601 UTC start time. |
| `localDateTime` | `string \| null` | Always | Local `YYYY-MM-DD HH:MM` representation. |
| `inProgress` | `false` | Always | Always `false` (in-progress sessions are excluded). |
| `apiDurationMs` | `number \| null` | Always | Cumulative model API duration in ms across resumed runs, or `null` if not recorded. |
| `source` | `"otel"` \| `"logs"` | Always | Which source produced this session. Use this for per-session provenance badges in the UI. |
| `totalCost` | `number` | OTel only | Total AI credits for this session (sum across all models). |
| `modelCosts` | `Record<string, number>` | OTel only | Per-model AI credit breakdown. Keys match `models[].modelName`. |
| `extended` | `object` | OTel only (when present) | Extended metrics — see below. |
| `models[]` | `array` | Always | Per-model token breakdown. |
| `totals` | `object` | Always | Session-level token totals. |

### Extended Metrics (`extended`)

The `extended` object is only present on OTel sessions, and only when at least one sub-field has data:

| Field | Type | Description |
|---|---|---|
| `extended.reasoningTokens` | `number` | Total reasoning tokens across all models and spans. Present only when `> 0`. |
| `extended.contextWindow.usedTokens` | `number` | Most recently observed context window occupancy (tokens). |
| `extended.contextWindow.limitTokens` | `number` | Context window size limit (tokens). |
| `extended.contextWindow.utilizationRatio` | `number` | `usedTokens / limitTokens` — a value in `[0, 1]` under normal conditions. |

## Token Totals

`summary.totalTokens` and each session's `totals.total` are computed as **`input + output`** (cache buckets are already part of `input`, so they are not added again). The per-bucket fields (`input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`) are still reported individually for reference.

## In-Progress Sessions

In-progress sessions (those without a `session.shutdown` event, i.e. no token data) are **silently excluded** from JSON output. They do not appear in `sessions[]`, and `summary.inProgressCount` is always `0` (the field is retained for schema shape).

Completed sessions whose `session.shutdown` event recorded no token activity (empty `modelMetrics` or all-zero input/output across every model) are also **silently excluded** from `sessions[]` for the same reason — they contribute nothing measurable to the report.

## Schema History

- **v5** *(current)* — OTel-primary pivot with merge support. Added top-level `source` (`"otel"` | `"logs"` | `"mixed"`) and `coverage` object. Per-session source badges and mixed-report cost indicators. OTel sessions include optional `totalCost`, `modelCosts`, and `extended`. All v4 fields preserved — changes are additive.
- **v4** — removed the per-session `premiumRequests` field. `tscope` no longer surfaces Copilot's `totalPremiumRequests` value because it's a legacy request-count metric with no actionable use in this tool.
- **v3** — switched `summary.totalTokens` and per-session `totals.total` to `input + output` only (cache read/write are subsets of input, so adding them would double-count).

## v4 → v5 Migration Note

v5 is **additive** — all v4 fields are present and unchanged. Consumers can continue to read v4 fields without modification. What changes:

1. `schema` is now `"tscope/report/v5"`. Consumers that pin on the exact schema string `"tscope/report/v4"` must update their guard.
2. New top-level fields: `source` (`"otel"` | `"logs"` | `"mixed"`) and `coverage` object with `otelCount`, `logsCount`, and `costCoverage`.
3. New per-session fields: `source` (always present; identifies which source contributed this session). New OTel-only fields: `totalCost`, `modelCosts`, `extended`. These fields are **absent** (not `null`) on log-parser sessions — check `source === "otel"` to decide whether to read them.

Minimal migration: update the schema version check from `"tscope/report/v4"` to `"tscope/report/v5"`. No existing field was removed or renamed.
