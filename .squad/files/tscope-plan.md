# tscope — Phase 1 Plan

**Author:** Trinity (Lead/Architect)  
**Date:** 2026-06-02  
**Status:** Draft — pending user approval

---

## 1. Goal & Non-Goals

### Goal
Build `tscope`, a single-command CLI tool that lets a developer query their LOCAL Copilot CLI session data to see how many tokens (input, output, cached read, cached write) were used, grouped by session and model, with AI credits computed where possible.

### Phase 1 Scope
- **Local-only:** Parse `events.jsonl` files from `%USERPROFILE%\.copilot\session-state\{session-id}\`.
- **Default = today:** With no arguments, show sessions from the current day.
- **Per-session output:** Grouped blocks showing session info, per-model token breakdowns, and totals.
- **AI credit estimation:** Using a bundled model-rate lookup table (static, updated manually).

### Non-Goals (Phase 1)
- No aggregation across sessions or time ranges (future).
- No HTML dashboard output (future).
- No integration with `/chronicle tips` (future).
- No network calls to GitHub APIs (this is purely local file parsing).
- No real-time credit pricing from GitHub (bundled lookup table only).

---

## 2. Local Session Data — Schema Reference

### Location
```
%USERPROFILE%\.copilot\session-state\{session-id}\
```
Each session has a UUID folder (e.g., `7d15eea1-4d69-49e9-bb21-8370594afd6a`) or a `conv-{uuid}` folder.

### Key Files per Session
| File | Purpose |
|------|---------|
| `events.jsonl` | **Primary data source** — newline-delimited JSON events |
| `workspace.yaml` | Session metadata: id, cwd, repository, summary, created_at, updated_at |

### events.jsonl Schema (Relevant Event Types)

#### `session.start`
```json
{
  "type": "session.start",
  "data": {
    "sessionId": "UUID",
    "startTime": "2026-06-03T02:58:50.891Z",
    "copilotVersion": "1.0.59",
    "context": {
      "cwd": "C:\\path\\to\\repo",
      "repository": "owner/repo",
      "branch": "main"
    }
  },
  "timestamp": "2026-06-03T02:58:51.252Z"
}
```

#### `session.shutdown` (THE TOKEN DATA SOURCE)
```json
{
  "type": "session.shutdown",
  "data": {
    "shutdownType": "routine",
    "totalPremiumRequests": 7.5,
    "totalNanoAiu": 68465300000,
    "sessionStartTime": 1776374139253,
    "modelMetrics": {
      "claude-opus-4.7": {
        "requests": { "count": 3, "cost": 7.5 },
        "usage": {
          "inputTokens": 243772,
          "outputTokens": 2272,
          "cacheReadTokens": 155776,
          "cacheWriteTokens": 87988,
          "reasoningTokens": 0
        },
        "totalNanoAiu": 68465300000,
        "tokenDetails": {
          "input": { "tokenCount": 8 },
          "cache_read": { "tokenCount": 155776 },
          "cache_write": { "tokenCount": 87988 },
          "output": { "tokenCount": 2272 }
        }
      }
    }
  },
  "timestamp": "2026-06-03T03:06:06.377Z"
}
```

### Token Field Names (Exact — VERIFIED)
| Field Path | Description |
|------------|-------------|
| `data.modelMetrics.{model}.usage.inputTokens` | Total input tokens for this model |
| `data.modelMetrics.{model}.usage.outputTokens` | Output tokens generated |
| `data.modelMetrics.{model}.usage.cacheReadTokens` | Cached prompt tokens read |
| `data.modelMetrics.{model}.usage.cacheWriteTokens` | Tokens written to cache |
| `data.modelMetrics.{model}.usage.reasoningTokens` | Extended thinking tokens (if any) |
| `data.totalPremiumRequests` | Sum of `requests.cost` across all models — useful as cross-check or display |
| `data.totalNanoAiu` | Newer field (~May 2026+); nanoAiu/1e9 may approximate credits |
| `data.sessionStartTime` | Epoch ms timestamp of session start |
| `data.currentModel` | Model active at shutdown |
| `data.currentTokens` | Current context token count |
| `data.systemTokens` | System prompt token count |
| `data.conversationTokens` | Conversation history token count |
| `data.toolDefinitionsTokens` | Tool schema token count |

### Multi-Model Sessions
A single session CAN use multiple models. `modelMetrics` is a dictionary keyed by model name (e.g., `claude-opus-4.6`). Example session used 4 models: `claude-opus-4.6-1m`, `claude-haiku-4.5`, `claude-sonnet-4.5`, `claude-sonnet-4.6`. Per-model attribution is available directly from the dictionary keys.

### Shutdown Event Guarantees (VERIFIED)
- For cleanly-ended sessions, `session.shutdown` IS the last line of `events.jsonl`
- There is exactly ONE `session.shutdown` event per file
- **EDGE CASE:** In-progress/active sessions have NO `session.shutdown` event (last line may be e.g., `tool.execution_complete`)

### Session Date/Time
- Primary: `session.start.data.startTime` (ISO 8601 UTC)
- Fallback: `workspace.yaml → created_at`
- Session ID: folder name or `session.start.data.sessionId`

---

## 3. Data Pipeline

```
[1. Discover Sessions]
    ↓ List session folders in %USERPROFILE%\.copilot\session-state\
    ↓ Filter by date (default: today)
[2. Parse events.jsonl]
    ↓ Read session.start → extract startTime, sessionId
    ↓ Scan for session.shutdown event (see parsing strategy below)
    ↓ If found: extract modelMetrics
    ↓ If NOT found: mark session as "in progress" (skip or show partial)
[3. Aggregate per Session+Model]
    ↓ For each model key in modelMetrics:
    ↓   extract inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens
[4. Compute AI Credits]
    ↓ Lookup model in bundled price table
    ↓ credits = (inputTokens × inputRate + outputTokens × outputRate + ...) / 1e6 × 100
    ↓ Optional: cross-check against totalPremiumRequests
[5. Render Output]
    ↓ Group by session, print formatted blocks
```

### Parsing Strategy for session.shutdown

**Recommended approach:**
1. **Fast path:** Read the last line of `events.jsonl`. If `type === "session.shutdown"`, use it.
2. **Fallback:** If last line is NOT a shutdown event, scan the file for any event with `type === "session.shutdown"`.
3. **No shutdown found:** The session is in-progress. Handle gracefully:
   - Option A: Skip the session entirely (recommended for phase 1)
   - Option B: Display session as "IN PROGRESS — no totals yet"

**Do NOT:** Blindly assume the last line has totals — this will crash or produce garbage for active sessions.

---

## 4. Output Format Specification

### Example Output (Concrete)
```
═══════════════════════════════════════════════════════════════════════════════
SESSION: 7d15eea1-4d69-49e9-bb21-8370594afd6a
Date:    2026-06-02 22:58 (local)
Credits: ~6.85 AI credits
Path:    C:\Users\rober\.copilot\session-state\7d15eea1-...\events.jsonl
───────────────────────────────────────────────────────────────────────────────
  claude-opus-4.7
    Input:        243,772    Cache Read:    155,776
    Cache Write:   87,988    Output:          2,272
    → ~6.85 credits (estimated)
───────────────────────────────────────────────────────────────────────────────
  TOTALS
    Input:        243,772    Cache Read:    155,776
    Cache Write:   87,988    Output:          2,272
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
SESSION: 0d46718a-c723-4adb-99ef-738e84aeed91
Date:    2026-04-10 21:32 (local)
Credits: ~542 AI credits
Path:    C:\Users\rober\.copilot\session-state\0d46718a-...\events.jsonl
───────────────────────────────────────────────────────────────────────────────
  claude-opus-4.6-1m
    Input:      6,932,350    Cache Read:  6,572,169
    Cache Write:        0    Output:         49,259
    → ~417 credits (estimated)

  claude-haiku-4.5
    Input:      1,369,155    Cache Read:  1,248,935
    Cache Write:        0    Output:         11,309
    → ~73 credits (estimated)

  claude-sonnet-4.5
    Input:        479,610    Cache Read:    354,006
    Cache Write:        0    Output:          3,865
    → ~49 credits (estimated)

  claude-sonnet-4.6
    Input:        200,680    Cache Read:     48,128
    Cache Write:        0    Output:            246
    → ~3 credits (estimated)
───────────────────────────────────────────────────────────────────────────────
  TOTALS
    Input:      8,981,795    Cache Read:  8,223,238
    Cache Write:        0    Output:         64,679
═══════════════════════════════════════════════════════════════════════════════

SUMMARY: 2 sessions | ~549 AI credits total
```

### Output Rules
1. **Session Header**: date+time (local TZ), estimated credits, session ID (truncated for display), path to events.jsonl
2. **Per-model lines**: model name, then 2-column token breakdown (input/cache_read, cache_write/output), then estimated credits
3. **Session Totals**: sum all token types across models
4. **Footer**: total session count and total estimated credits

---

## 5. CLI Surface (Phase 1)

### Invocation
```
tscope [options]
```

### Flags (Phase 1 — keep minimal)
| Flag | Description | Default |
|------|-------------|---------|
| (none) | Show today's sessions | — |
| `--help` | Show help text | — |
| `--version` | Show version | — |

### Future Flags (NOT Phase 1 — architecture must not block these)
| Flag | Description |
|------|-------------|
| `--date YYYY-MM-DD` | Show sessions for a specific date |
| `--range START END` | Show sessions in a date range |
| `--all` | Show all sessions |
| `--json` | Output as JSON (machine-readable) |
| `--html FILE` | Generate HTML report |

---

## 6. Model-Rate Table Approach

### The Problem
GitHub publishes per-model pricing ($/M tokens), but this is NOT in the local session data. tscope must compute AI credits from tokens, which requires knowing the rate for each model.

### Solution: Bundled Lookup Table
tscope ships with a static JSON or code-embedded table of model rates:

```json
{
  "claude-haiku-4.5": { "input": 1.00, "cacheRead": 0.10, "cacheWrite": 1.25, "output": 5.00 },
  "claude-sonnet-4.5": { "input": 3.00, "cacheRead": 0.30, "cacheWrite": 3.75, "output": 15.00 },
  "claude-sonnet-4.6": { "input": 3.00, "cacheRead": 0.30, "cacheWrite": 3.75, "output": 15.00 },
  "claude-opus-4.5": { "input": 5.00, "cacheRead": 0.50, "cacheWrite": 6.25, "output": 25.00 },
  "claude-opus-4.6": { "input": 5.00, "cacheRead": 0.50, "cacheWrite": 6.25, "output": 25.00 },
  "claude-opus-4.6-1m": { "input": 5.00, "cacheRead": 0.50, "cacheWrite": 6.25, "output": 25.00 },
  "claude-opus-4.7": { "input": 5.00, "cacheRead": 0.50, "cacheWrite": 6.25, "output": 25.00 },
  "claude-opus-4.8": { "input": 5.00, "cacheRead": 0.50, "cacheWrite": 6.25, "output": 25.00 },
  "gpt-5.2": { "input": 1.75, "cacheRead": 0.175, "output": 14.00 },
  "gpt-5.4": { "input": 2.50, "cacheRead": 0.25, "output": 15.00 },
  "gpt-5.5": { "input": 5.00, "cacheRead": 0.50, "output": 30.00 },
  "gemini-3.1-pro": { "input": 2.00, "cacheRead": 0.20, "output": 12.00 }
}
```

**Credit formula:**
```
credits = ((inputTokens × inputRate) + (cacheReadTokens × cacheReadRate) + (cacheWriteTokens × cacheWriteRate) + (outputTokens × outputRate)) / 1e6 × 100
```

### Risk: Rate Table Drift
GitHub may change pricing. tscope's estimates will drift. Mitigation:
- Display credits as "~X credits (estimated)" with a note that rates are bundled
- Log a warning if a model is encountered that's not in the lookup table
- Version the rate table; support `tscope --update-rates` (future) or user-editable config (future)

---

## 7. Architecture Seams for Future Features

### HTML Report Generation
- **Seam:** Output renderer is a pluggable interface. Phase 1 implements `TextRenderer`. Phase 2 adds `HtmlRenderer`.
- **Data model:** The parsed session data is a structured object (not just printed inline). This object can be passed to any renderer.

### `/chronicle tips` Integration
- **Seam:** Post-processing hook after sessions are aggregated. Phase 1 leaves this as a no-op.
- **Requirement:** tscope must be able to invoke `copilot /chronicle tips` and capture its output. This is a separate subprocess call, not local file parsing.

### Date Range Filtering
- **Seam:** Session discovery accepts filter predicates. Phase 1 implements "date == today". Future adds arbitrary date ranges.

### JSON Output
- **Seam:** Renderer interface. Phase 1 has TextRenderer. Add JsonRenderer later.

---

## 8. Scope Creep Watch

These are OUT of Phase 1. If someone suggests them, push back:

| Feature | Rationale for Deferral |
|---------|------------------------|
| Aggregation across sessions | Explicitly deferred per project vision |
| Real-time rate fetching | Adds network dependency; bundled table is simpler |
| Cost breakdown by repository | Nice-to-have, not core need |
| Team/org-wide metrics | Phase 1 is single-user local |
| Integration with GitHub billing API | Requires auth, network; local-only for now |
| SQLite caching of parsed data | Premature optimization |
| Interactive TUI | Just print text; keep it simple |

---

## 9. Open Questions for User

1. **Tech stack:** See tech recommendation below. User should confirm Go vs Rust vs Node.
2. **Rate table updates:** How often should we update bundled rates? Manual release? Fetch on demand (phase 2)?
3. **Unknown models:** If a session uses a model not in the rate table, should we error, warn, or skip credit calculation?
4. **Session ID display:** Full UUID or truncated (e.g., first 8 chars)?
5. **Timezone:** Display session times in local TZ (as shown) or UTC?

---

## 10. Tech Stack Recommendation

### Recommendation: **Go**

**Rationale:**
- Single static binary — no runtime dependencies, trivial install (`go install` or download binary)
- Excellent for CLI tools (Cobra, stdlib flag parsing)
- Fast startup, low memory
- Cross-platform builds are trivial (`GOOS=windows/linux/darwin`)
- JSON/JSONL parsing is stdlib
- Path to HTML generation: Go's `html/template` is production-ready

**Alternative considered:** Rust
- Same benefits (single binary, fast, cross-platform)
- Steeper learning curve for contributors
- Slightly more ceremony for simple CLI tasks

**Not recommended:** Node.js
- Requires Node runtime on user machine
- Distribution friction (npm install, bundling)
- Acceptable if team strongly prefers JS, but not optimal for this use case

**Decision status:** OPEN — awaiting user confirmation.
