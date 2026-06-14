# Decisions

## Decision: Context Window Attribute Keys Are `github.copilot.*` Prefixed

**Date:** 2026-06-13  
**Author:** Tank  
**Status:** Decided — fix applied

### Context

The tscope OTel parser reads context-window utilization from span events on `chat` spans.  
The original parser implementation used attribute keys `event.github.copilot.current_tokens` and `token_limit`,  
which were inferred/assumed at implementation time but never verified against live data.

### Finding

Inspection of `~/.copilot/tscope/otel.jsonl` (2118 lines, 103 matching spans) confirmed:

| Field | **Parser expected** | **Actual data key** |
|---|---|---|
| Used tokens | `event.github.copilot.current_tokens` | `github.copilot.current_tokens` |
| Token limit | `token_limit` | `github.copilot.token_limit` |
| Event name | `gen_ai.context.window` (test only) | `github.copilot.session.usage_info` |

Both keys follow the `github.copilot.*` proprietary namespace consistently (same as `github.copilot.nano_aiu`, `github.copilot.server_duration`, etc.).

### Decision

Use `github.copilot.current_tokens` and `github.copilot.token_limit` as the canonical attribute keys for context window data. The parser does not need to filter by event name (presence of both numeric attributes is sufficient).

### Files Changed

- `src/sources/otelSource.ts` — lines 50–51 (interface), lines 197–198 (parser read)
- `src/__tests__/otel-source-edge.test.ts` — `contextWindowEvent()` helper
- `src/types.ts` — line 30 (doc comment)
