# JSON Output

Use `--json` for machine-readable output:

```bash
tscope --json | jq '.summary'
tscope --all --json | jq '.sessions[].totals'
```

## Schema: `tscope/report/v4`

```json
{
  "schema": "tscope/report/v4",
  "generatedAt": "2026-06-02T23:53:14.000Z",
  "filter": { "description": "today", "reportDate": "2026-06-02" },
  "summary": {
    "sessionCount": 1,
    "completedCount": 1,
    "inProgressCount": 0,
    "totalTokens": 246044
  },
  "sessions": [
    {
      "sessionId": "7d15eea1-...",
      "path": "~/.copilot/session-state/.../events.jsonl",
      "startTime": "2026-06-02T22:58:00.000Z",
      "localDateTime": "2026-06-02 22:58",
      "inProgress": false,
      "models": [
        {
          "modelName": "claude-opus-4.7",
          "usage": {
            "input": 243772,
            "output": 2272,
            "cacheRead": 155776,
            "cacheWrite": 87988,
            "reasoning": 0
          }
        }
      ],
      "totals": {
        "input": 243772,
        "output": 2272,
        "cacheRead": 155776,
        "cacheWrite": 87988,
        "reasoning": 0,
        "total": 246044
      }
    }
  ]
}
```

## Token Totals

`summary.totalTokens` and each session's `totals.total` are computed as **`input + output`** (cache buckets are already part of `input`, so they are not added again). The per-bucket fields (`input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`) are still reported individually for reference.

## In-Progress Sessions

In-progress sessions (those without a `session.shutdown` event, i.e. no token data) are **silently excluded** from JSON output. They do not appear in `sessions[]`, and `summary.inProgressCount` is always `0` (the field is retained for schema shape).

Completed sessions whose `session.shutdown` event recorded no token activity (empty `modelMetrics` or all-zero input/output across every model) are also **silently excluded** from `sessions[]` for the same reason — they contribute nothing measurable to the report.

## Schema History

- **v4** *(current)* — removed the per-session `premiumRequests` field. `tscope` no longer surfaces Copilot's `totalPremiumRequests` value because it's a legacy request-count metric with no actionable use in this tool.
- **v3** — switched `summary.totalTokens` and per-session `totals.total` to `input + output` only (cache read/write are subsets of input, so adding them would double-count).
