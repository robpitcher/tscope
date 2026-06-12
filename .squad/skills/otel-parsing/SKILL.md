# Skill: OTel JSONL Parsing for Copilot CLI Sessions

**Domain:** Backend / Data Engineering  
**Owner:** Tank  
**Created:** 2026-06-10  

---

## Purpose

Parse the Copilot CLI's OpenTelemetry file export (`~/.copilot/tscope/otel.jsonl`) into per-session, per-model token records that match the `ParsedSession` / `TokenCounts` interface produced by the existing `events.jsonl` parser.

---

## File Location

| Platform | Path |
|---|---|
| Windows | `%USERPROFILE%\.copilot\tscope\otel.jsonl` |
| macOS/Linux | `~/.copilot/tscope/otel.jsonl` |

Enabled by `tscope otel enable --apply` (writes `COPILOT_OTEL_FILE_EXPORTER_PATH` into shell profile).

---

## Record Structure

The file is NDJSON (one JSON object per line). Two top-level `type` values:

### `span` records (per-operation, has session scope)

```json
{
  "type": "span",
  "traceId": "<hex>",
  "spanId": "<hex>",
  "parentSpanId": "<hex>",        // absent on root spans
  "name": "chat gpt-5.3-codex",  // or "invoke_agent", "execute_tool <name>", "elicitation"
  "kind": 2,
  "startTime": [<unix_sec>, <nanoseconds>],
  "endTime":   [<unix_sec>, <nanoseconds>],
  "attributes": {
    "gen_ai.conversation.id": "<session-uuid>",
    "gen_ai.request.model": "<model>",
    "gen_ai.response.model": "<model>",
    "gen_ai.operation.name": "chat",
    "gen_ai.usage.input_tokens": 18957,
    "gen_ai.usage.output_tokens": 40,
    "gen_ai.usage.cache_read_input_tokens": 1536,
    "gen_ai.usage.cache_creation_input_tokens": 0,
    "gen_ai.usage.reasoning_output_tokens": 25,
    "gen_ai.response.finish_reasons": ["stop"],
    "github.copilot.nano_aiu": 3131555000.0,
    "github.copilot.server_duration": 2029.0,
    "github.copilot.cost": 1.0
  },
  "status": { "code": 0 },
  "events": [ ... ],
  "resource": {
    "attributes": {
      "service.name": "github-copilot",
      "service.version": "1.0.61"
    }
  }
}
```

### `metric` records (aggregated histograms, NO session scope)

```json
{
  "type": "metric",
  "name": "gen_ai.client.token.usage",
  "unit": "{token}",
  "dataPoints": [
    {
      "attributes": {
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "<model>",
        "gen_ai.token.type": "input"
      },
      "value": { "count": 1, "sum": 18957.0, "min": ..., "max": ... }
    }
  ]
}
```

**Critical:** Metric dataPoints do NOT carry `gen_ai.conversation.id`. Do NOT use metrics for per-session aggregation. Use spans only.

---

## Token Field Mapping

| tscope `TokenCounts` field | OTel span attribute | Semantics |
|---|---|---|
| `inputTokens` | `gen_ai.usage.input_tokens` | Total input (INCLUDES cache subsets) |
| `outputTokens` | `gen_ai.usage.output_tokens` | Generated output tokens |
| `cacheReadTokens` | `gen_ai.usage.cache_read_input_tokens` | Cache-hit input (subset of input) |
| `cacheWriteTokens` | `gen_ai.usage.cache_creation_input_tokens` | Cache-write input (subset of input) |
| `reasoningTokens` | `gen_ai.usage.reasoning_output_tokens` | Chain-of-thought tokens |

**Token semantics:** `inputTokens` includes `cacheReadTokens` and `cacheWriteTokens` as subsets. `freshInput = inputTokens - cacheReadTokens - cacheWriteTokens`. The `tokenPartition()` function in `tokens.ts` applies unchanged.

---

## Session Identifier

`gen_ai.conversation.id` on `chat`/`invoke_agent` spans = the same UUID as the `session-state/<uuid>/` directory name. Verified: 4/4 sessions match.

---

## Timestamp Conversion

OTel timestamps are `[unixSeconds, nanoseconds]` arrays. Convert to ISO 8601:

```typescript
function otelTimeToISO(t: [number, number]): string {
  const ms = t[0] * 1000 + Math.floor(t[1] / 1_000_000);
  return new Date(ms).toISOString();
}
```

Note: OTel `startTime` on the first `invoke_agent` span is ~10s later than `events.jsonl` `session.start.data.startTime` (OTel starts at first LLM call; events.jsonl at session creation). Same local date for date-bucketing — no impact on `--date` / `--range` filters.

---

## Parsing Algorithm

```
1. Read otel.jsonl line by line (NDJSON)
2. Skip malformed lines (try/catch JSON.parse)
3. Skip lines where type !== "span"
4. Skip spans where name doesn't start with "chat "
5. For each "chat <model>" span:
   a. Extract gen_ai.conversation.id → session bucket key
   b. Extract gen_ai.response.model (prefer over gen_ai.request.model)
   c. Accumulate TokenCounts using addTokenCounts() from tokens.ts
   d. Track minimum startTime per conversation → session start time
   e. Accumulate github.copilot.nano_aiu for server-side credit total (optional)
   f. Overwrite lastContextWindowSample with the latest window event from span events
6. For each session bucket (conversation ID):
   a. Build NormalizedSession { sessionId: conversationId, models, startTime, source:"otel", ... }
   b. Use tokens.hasTokenData() to filter zero-token sessions
   c. Apply SessionDatePredicate (sync, against utcToLocalDateString(startTime))
```

**Multi-session interleaving:** All sessions share one file. Group by `gen_ai.conversation.id`. Never assume sequential session boundaries.

**Date filtering:** Convert earliest span's `[unixSeconds, ns]` → ISO 8601 → `utcToLocalDateString()` → apply `SessionDatePredicate` (synchronous string comparison). The async file I/O happens in the source, not the predicate.

**Context window accumulator pattern:** Use a single `lastContextWindowSample: { used, limit } | null` field per session (not an array). Only the last sample is meaningful; retaining all samples wastes memory for large files. Assign on every new sample — the last write wins. See `src/sources/otelSource.ts` `SessionAccumulator`.

**Module location:** `src/sources/otelSource.ts` — exports `OtelDataSource` class and `isOtelAvailable()` helper.

---

## Span Types Reference

| Span name pattern | Has session ID | Has tokens | Notes |
|---|---|---|---|
| `chat <model-name>` | ✅ | ✅ | Primary token source |
| `invoke_agent` | ✅ | ✅ (cumulative) | Wraps chat spans; tokens duplicate chat spans — don't double-count |
| `execute_tool <tool-name>` | ✅ (via parent) | ❌ | Tool call timing only |
| `elicitation` | ❌ | ❌ | User input collection |

**Important:** `invoke_agent` spans carry cumulative token totals that MATCH the sum of their child `chat` spans. Use **either** invoke_agent OR chat spans for aggregation — not both.

---

## Known Metrics (for fleet-level analytics, not per-session)

| Metric name | Unit | Useful for |
|---|---|---|
| `gen_ai.client.operation.duration` | s (histogram) | End-to-end latency distribution |
| `gen_ai.client.operation.time_to_first_chunk` | s (histogram) | TTFT / perceived responsiveness |
| `gen_ai.client.operation.time_per_output_chunk` | s (histogram) | Streaming token velocity |
| `gen_ai.client.token.usage` | {token} (histogram) | Token volume distribution |
| `github.copilot.tool.call.count` | {call} (counter) | Tool usage frequency + success rate |
| `github.copilot.tool.call.duration` | s (histogram) | Tool latency |
| `github.copilot.agent.turn.count` | {turn} (histogram) | Agentic iteration depth |
| `github.copilot.mcp.server.connection.count` | {attempt} (counter) | MCP reliability |

---

## Operational Risks

1. **No file rotation** — implement size/age-based rotation in tscope; `otel.jsonl` grows unbounded
2. **Partial lines** — always wrap JSON.parse in try/catch; OTel flushes spans before session end
3. **Forward-only coverage** — no OTel data before `otel enable --apply`; events.jsonl is historical fallback
4. **Schema stability** — `gen_ai.*` attributes follow OTel GenAI semantic conventions (stable); `github.copilot.*` attributes are proprietary (version with `service.version`)
5. **In-progress detection** — no explicit session-end span; treat sessions without a final `invoke_agent` span's `endTime` as potentially in-progress
