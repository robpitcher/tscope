# JSON Output

Use `--json` for machine-readable output:

```bash
tscope --json | jq '.summary'
tscope --all --json | jq '.sessions[].totals'
```

## Schema: `tscope/report/v6`

### Mixed report (OTel + logs merged, default `--source auto`)

```json
{
  "schema": "tscope/report/v6",
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
      "client": "github/cli",
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
  "schema": "tscope/report/v6",
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
      "client": "github/cli",
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

### Log-parser source

When `--source logs` (or OTel is not configured and no merge occurs), the output differs as follows:
- `source` is `"logs"`
- `costAvailable` is `false` (tracks OTel availability only; individual sessions may still have `totalCost`)
- `coverage.costCoverage` is `"none"` (no OTel sessions; individual sessions may still have `totalCost`)
- Per-session `source` is `"logs"`
- `modelCosts` and `extended` are **absent** (not `null`) — these are OTel-only fields
- `totalCost` is present when `session.shutdown.data.totalNanoAiu` was recorded by Copilot CLI 1.0+, and **absent** for older sessions

```json
{
  "schema": "tscope/report/v6",
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
      "totalCost": 1.23,
      ...
    }
  ]
}
```

## Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `schema` | `string` | Schema version identifier. Currently `"tscope/report/v6"`. |
| `generatedAt` | `string` | ISO 8601 UTC timestamp when the report was generated. |
| `source` | `"otel"` \| `"logs"` \| `"mixed"` | Which data source produced the report. `"mixed"` when `--source auto` merges OTel and logs. |
| `costAvailable` | `boolean` | `true` when at least one OTel session is present (OTel source or mixed with OTel sessions). `false` for logs-only reports. Note: individual log-parser sessions may still include `totalCost` from `totalNanoAiu` even when `costAvailable` is `false`. |
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
| `costCoverage` | `"all"` \| `"partial"` \| `"none"` | OTel cost-data coverage across the report. `"all"` = pure OTel (all sessions have authoritative server-side cost). `"partial"` = mixed report with OTel + logs. `"none"` = no OTel sessions. Note: log-parser sessions may independently carry `totalCost` from `totalNanoAiu` regardless of this field. |

## Per-Session Fields

`sessions[]` is ordered by `startTime` descending (newest session first). Ties
are broken by `sessionId` ascending for deterministic output. Sessions whose
`startTime` cannot be parsed are sorted after all parseable timestamps.

| Field | Type | Present when | Description |
|---|---|---|---|
| `sessionId` | `string` | Always | Session UUID. |
| `path` | `string` | Always | Source file path (OTel: shared `otel.jsonl`; logs: per-session `events.jsonl`). |
| `startTime` | `string` | Always | ISO 8601 UTC start time. |
| `localDateTime` | `string \| null` | Always | Local `YYYY-MM-DD HH:MM` representation. |
| `inProgress` | `false` | Always | Always `false` (in-progress sessions are excluded). |
| `apiDurationMs` | `number \| null` | Always | Cumulative model API duration in ms across resumed runs, or `null` if not recorded. |
| `source` | `"otel"` \| `"logs"` | Always | Which source produced this session. Use this for per-session provenance badges in the UI. |
| `client` | `string` | OTel and logs sessions when `workspace.yaml` is readable | Raw `client_name` from `workspace.yaml`. Known values: `"github/cli"` (Copilot CLI), `"github/autopilot"` (Copilot App), `"sdk"`. Unrecognized values are passed through as-is. **Absent** when `workspace.yaml` is missing or has no `client_name` field. |
| `totalCost` | `number` | OTel sessions, and log-parser sessions with `totalNanoAiu` | Total AI credits for this session. For OTel sessions, summed from per-span `github.copilot.nano_aiu` (server-side billing). For log-parser sessions, derived from `session.shutdown.data.totalNanoAiu / 1e9` (estimated; present in Copilot CLI 1.0+). |
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

### Model Usage Fields (`models[].usage`)

| Field | Type | Present when | Description |
|---|---|---|---|
| `input` | `number` | Always | Total input tokens (includes cache read/write). |
| `output` | `number` | Always | Output tokens. |
| `cacheRead` | `number` | Always | Cache read tokens (subset of `input`). |
| `cacheWrite` | `number` | Always | Cache write tokens (subset of `input`). |
| `reasoning` | `number` | Always | Reasoning tokens. |
| `anomalous` | `true` | When detected | Present (and `true`) when the server reported more cache tokens than total input tokens — indicates inconsistent source data. `freshInput` is clamped to `0` in this case. Absent in normal sessions. |

## Token Totals

`summary.totalTokens` and each session's `totals.total` are computed as **`input + output`** (cache buckets are already part of `input`, so they are not added again). The per-bucket fields (`input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`) are still reported individually for reference.

## In-Progress Sessions

In-progress sessions (those without a `session.shutdown` event, i.e. no token data) are **silently excluded** from JSON output. They do not appear in `sessions[]`, and `summary.inProgressCount` is always `0` (the field is retained for schema shape).

Completed sessions whose `session.shutdown` event recorded no token activity (empty `modelMetrics` or all-zero input/output across every model) are also **silently excluded** from `sessions[]` for the same reason — they contribute nothing measurable to the report.

## Schema History

- **v6** *(current)* — OTel-enriched metadata gaps closed. Added optional per-session `client` field (raw `client_name` from `workspace.yaml`; present for both OTel and log-parser sessions when resolvable). Added optional `anomalous: true` in model `usage` objects when `tokenPartition()` detects inconsistent cache vs. input token counts. All v5 fields preserved — changes are additive.
- **v5** — OTel-primary pivot with merge support. Added top-level `source` (`"otel"` | `"logs"` | `"mixed"`) and `coverage` object. Per-session source badges and mixed-report cost indicators. OTel sessions include optional `totalCost`, `modelCosts`, and `extended`; log-parser sessions include `totalCost` when `totalNanoAiu` is present (Copilot CLI 1.0+). All v4 fields preserved — changes are additive.
- **v4** — removed the per-session `premiumRequests` field. `tscope` no longer surfaces Copilot's `totalPremiumRequests` value because it's a legacy request-count metric with no actionable use in this tool.
- **v3** — switched `summary.totalTokens` and per-session `totals.total` to `input + output` only (cache read/write are subsets of input, so adding them would double-count).

## v5 → v6 Migration Note

v6 is **additive** — all v5 fields are present and unchanged. Consumers can continue to read v5 fields without modification. What changes:

1. `schema` is now `"tscope/report/v6"`. Consumers that pin on the exact schema string `"tscope/report/v5"` must update their guard.
2. New optional per-session field: `client` — raw `client_name` string from `workspace.yaml`. **Absent** (not `null`) when `workspace.yaml` is missing or has no `client_name` field. Safe to read with `session.client ?? null`.
3. New optional field in each `models[].usage` object: `anomalous: true` — present only when `tokenPartition()` detects that reported cache tokens exceed total input tokens. Absent in normal sessions. Safe to read with `usage.anomalous ?? false`.

Minimal migration: update the schema version check from `"tscope/report/v5"` to `"tscope/report/v6"`. No existing field was removed or renamed.

## v4 → v5 Migration Note

v5 is **additive** — all v4 fields are present and unchanged. Consumers can continue to read v4 fields without modification. What changes:

1. `schema` is now `"tscope/report/v5"`. Consumers that pin on the exact schema string `"tscope/report/v4"` must update their guard.
2. New top-level fields: `source` (`"otel"` | `"logs"` | `"mixed"`) and `coverage` object with `otelCount`, `logsCount`, and `costCoverage`.
3. New per-session fields: `source` (always present; identifies which source contributed this session). New OTel-only fields: `modelCosts`, `extended`. These fields are **absent** (not `null`) on log-parser sessions. `totalCost` is present for OTel sessions and for log-parser sessions that include `totalNanoAiu` (Copilot CLI 1.0+); absent for older log sessions — check `source === "otel"` or the presence of `modelCosts` to determine whether to read per-model cost data.

Minimal migration: update the schema version check from `"tscope/report/v4"` to `"tscope/report/v5"`. No existing field was removed or renamed.
