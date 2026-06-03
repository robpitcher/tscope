# tscope — Issue Breakdown

**Author:** Trinity (Lead/Architect)  
**Date:** 2026-06-02  
**Status:** Draft — pending user approval before creating GitHub issues

---

## Phase 1 Issues

### Issue 1: Project Scaffolding & CLI Skeleton
**Owner:** Tank (backend)  
**Dependencies:** None (can start immediately)

**Description:**  
Initialize the Go module (`go mod init`), set up the CLI entry point with Cobra (or stdlib flags), implement `--help` and `--version` flags. Create the directory structure: `cmd/`, `internal/`, `pkg/`. Establish the build script (`go build -o tscope`).

**Acceptance Criteria:**
- Running `tscope --version` prints version string
- Running `tscope --help` prints usage text
- Project builds on Windows, Linux, macOS

---

### Issue 2: Session Discovery — Find Session Folders
**Owner:** Tank (backend)  
**Dependencies:** Issue 1

**Description:**  
Implement a function to enumerate all session folders in `%USERPROFILE%\.copilot\session-state\`. Return a list of paths that contain an `events.jsonl` file. Include basic metadata: folder name (session ID), last modified time.

**Acceptance Criteria:**
- Discovers all valid session folders
- Handles missing `.copilot` directory gracefully (error message, not panic)
- Works on Windows (primary) and Unix paths

---

### Issue 3: Session Date Filtering (Default = Today)
**Owner:** Tank (backend)  
**Dependencies:** Issue 2

**Description:**  
Filter discovered sessions by date. Read the `session.start` event from `events.jsonl` to get `startTime`, parse the ISO 8601 timestamp, compare to current local date. Default behavior: return only sessions from today.

**Acceptance Criteria:**
- `tscope` with no args shows only today's sessions
- Correctly handles UTC → local timezone conversion
- Handles sessions without `session.start` (skip or fallback to file mtime)

---

### Issue 4: Parse events.jsonl for Token Metrics
**Owner:** Tank (backend)  
**Dependencies:** Issue 2

**Description:**  
Parse an `events.jsonl` file to extract token usage. Find the `session.shutdown` event and read `data.modelMetrics`. For each model, extract: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`. Also extract `session.start.data.startTime` for the session timestamp.

**Acceptance Criteria:**
- Correctly parses multi-model sessions
- Returns structured data: map of model → token counts
- Handles sessions with no `session.shutdown` (in-progress sessions) gracefully

---

### Issue 5: Model Rate Lookup Table
**Owner:** Tank (backend)  
**Dependencies:** None (can start in parallel with Issues 1-4)

**Description:**  
Create a bundled model-rate lookup table (JSON file or embedded Go map). Include all known Copilot models with their per-million-token rates: input, cacheRead, cacheWrite, output. Reference `.squad/files/usage-based-billing-research.md` for current pricing.

**Acceptance Criteria:**
- Covers all Claude, GPT, Gemini models in billing research doc
- Exposes a function: `LookupRate(model string) (Rate, bool)`
- Returns false if model is unknown (caller decides how to handle)

---

### Issue 6: AI Credit Calculation
**Owner:** Tank (backend)  
**Dependencies:** Issues 4, 5

**Description:**  
Implement credit calculation: given token counts and model rates, compute estimated AI credits. Formula:
```
credits = ((input × inputRate) + (cacheRead × cacheReadRate) + (cacheWrite × cacheWriteRate) + (output × outputRate)) / 1e6 × 100
```

**Acceptance Criteria:**
- Calculates credits for a single model's token counts
- Sums credits across multiple models in a session
- Returns 0 (with warning) if model is not in rate table

---

### Issue 7: Text Output Renderer
**Owner:** Tank (backend)  
**Dependencies:** Issues 4, 6

**Description:**  
Implement the text output format per the spec in `tscope-plan.md`. Print session blocks with header, per-model token breakdowns, totals line, and summary footer.

**Acceptance Criteria:**
- Output matches the format spec (box-drawing chars, alignment, number formatting)
- Shows "~X credits (estimated)" for each model and session total
- Truncates session ID in header for readability (e.g., first 8 chars + "...")
- Summary line at end: "N sessions | ~X AI credits total"

---

### Issue 8: Integration & E2E Flow
**Owner:** Tank (backend)  
**Dependencies:** Issues 2, 3, 4, 6, 7

**Description:**  
Wire together the full pipeline: discover sessions → filter by date → parse each → calculate credits → render output. This is the main `tscope` command implementation.

**Acceptance Criteria:**
- Running `tscope` with no args shows today's sessions formatted correctly
- Handles 0 sessions (prints "No sessions found for today")
- Handles sessions in progress (skips or shows partial data with note)

---

### Issue 9: Unit Tests for Parser & Calculator
**Owner:** Apoc (tests)  
**Dependencies:** Issues 4, 5, 6

**Description:**  
Write unit tests for the JSONL parser and credit calculator. Use fixture files with sample `events.jsonl` content (redacted/synthetic). Test edge cases: multi-model sessions, missing fields, unknown models.

**Acceptance Criteria:**
- Parser tests cover: single-model, multi-model, missing shutdown event
- Calculator tests cover: known model, unknown model, zero tokens
- Tests run in CI (`go test ./...`)

---

### Issue 10: README & Installation Instructions
**Owner:** Trinity (lead)  
**Dependencies:** Issue 8 (after E2E works)

**Description:**  
Write the README.md with: project overview, installation instructions (go install, binary download), usage examples, limitations (local-only, estimated credits), and contribution guidelines.

**Acceptance Criteria:**
- Clear install instructions for Go users
- Binary download instructions for non-Go users (after release workflow exists)
- Documents the "estimated credits" caveat

---

### Issue 11: Renderer Interface for Future Extensibility
**Owner:** Trinity (architecture)  
**Dependencies:** Issue 7

**Description:**  
Refactor the text renderer into an interface (`Renderer`) so HTML/JSON renderers can be added later without changing the core pipeline. Phase 1 only ships TextRenderer, but the interface is in place.

**Acceptance Criteria:**
- `Renderer` interface defined with `Render(sessions []Session) string` or similar
- TextRenderer implements Renderer
- Core pipeline uses the interface, not a concrete type

---

## Dependency Graph & Parallelism

```
                    ┌──────────────────┐
                    │  Issue 1: Scaffold │
                    └────────┬─────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
   │ Issue 2:       │ │ Issue 5:       │ │                │
   │ Session        │ │ Rate Table     │ │  (parallel)    │
   │ Discovery      │ │ (parallel)     │ │                │
   └───────┬────────┘ └───────┬────────┘ └────────────────┘
           │                  │
           ▼                  │
   ┌────────────────┐         │
   │ Issue 3:       │         │
   │ Date Filter    │         │
   └───────┬────────┘         │
           │                  │
           ▼                  │
   ┌────────────────┐         │
   │ Issue 4:       │         │
   │ Parse events   │         │
   └───────┬────────┘         │
           │                  │
           └─────────┬────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Issue 6:       │
            │ Credit Calc    │
            └───────┬────────┘
                    │
                    ▼
            ┌────────────────┐
            │ Issue 7:       │
            │ Text Renderer  │
            └───────┬────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
         ▼          ▼          ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Issue 8:     │ │ Issue 9:     │ │ Issue 11:    │
│ E2E Flow     │ │ Tests (Apoc) │ │ Interface    │
└──────┬───────┘ └──────────────┘ └──────────────┘
       │
       ▼
┌──────────────┐
│ Issue 10:    │
│ README       │
└──────────────┘
```

### What Can Run in Parallel

| Phase | Issues | Notes |
|-------|--------|-------|
| **Phase A** | 1 | Scaffold — blocking start |
| **Phase B** | 2, 5 | Discovery + Rate Table — parallel |
| **Phase C** | 3, 4 | Date filter + Parser — sequential after 2 |
| **Phase D** | 6 | Credit calc — needs 4 + 5 |
| **Phase E** | 7 | Renderer — needs 4 + 6 |
| **Phase F** | 8, 9, 11 | E2E, Tests, Interface — parallel after 7 |
| **Phase G** | 10 | README — after 8 |

---

## Future / Phase 2 Issues (Captured for Backlog)

### FUTURE: Issue F1 — Date Range Filtering
**Owner:** Tank  
**Dependencies:** Issue 3

**Description:**  
Add `--date YYYY-MM-DD` and `--range START END` flags to filter sessions by date range instead of just today.

---

### FUTURE: Issue F2 — JSON Output Renderer
**Owner:** Tank  
**Dependencies:** Issue 11

**Description:**  
Implement `JsonRenderer` that outputs structured JSON for machine consumption. Add `--json` flag.

---

### FUTURE: Issue F3 — HTML Report Generator
**Owner:** Switch (frontend)  
**Dependencies:** Issue 11

**Description:**  
Implement `HtmlRenderer` that generates a standalone HTML file with charts (tokens by model, credits over time). Add `--html FILE` flag.

---

### FUTURE: Issue F4 — `/chronicle tips` Integration
**Owner:** Tank  
**Dependencies:** Issue 8

**Description:**  
Add ability to invoke `copilot /chronicle tips` and incorporate the output into the HTML report as an "Insights" section.

---

### FUTURE: Issue F5 — Rate Table Auto-Update
**Owner:** Tank  
**Dependencies:** Issue 5

**Description:**  
Add `--update-rates` flag that fetches current model pricing from a GitHub-hosted JSON file and updates the local bundled rates.

---

## Issue Ownership Summary

| Owner | Phase 1 Issues | Future Issues |
|-------|----------------|---------------|
| **Tank** (backend) | 1, 2, 3, 4, 5, 6, 7, 8 | F1, F2, F4, F5 |
| **Apoc** (tests) | 9 | — |
| **Trinity** (architecture) | 10, 11 | — |
| **Switch** (frontend) | — | F3 |

---

## Notes for Issue Creation

When creating these as GitHub issues:
1. Use labels: `phase-1`, `backend`, `testing`, `documentation`, `future`
2. Set up milestones: "Phase 1 MVP", "Phase 2 Reports"
3. Link dependencies using "Depends on #X" in issue body
4. Assign owners per table above
