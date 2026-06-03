# JSON Output

Use `--json` for machine-readable output:

```bash
tscope --json | jq '.summary'
tscope --all --json | jq '.sessions[].totals'
```

## Schema: `tscope/report/v3`

```json
{
  "schema": "tscope/report/v3",
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
      "premiumRequests": 3,
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
