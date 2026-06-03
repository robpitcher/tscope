# tscope Issue Map

Generated: 2026-06-02 23:46:41 -04:00
Repo: devjoy-pub/tscope

## Phase 1

| Key | Issue | Title | Owner | Depends on | Status |
|---|---:|---|---|---|---|
| N1 | #1 | Project Scaffolding & CLI Skeleton | Tank | None | ready |
| N5 | #2 | Model Rate Lookup Table | Tank | None | ready |
| N2 | #3 | Session Discovery — Find Session Folders | Tank | #1 | blocked |
| N3 | #4 | Session Date Filtering (Default = Today) | Tank | #3 | blocked |
| N4 | #5 | Parse events.jsonl for Token Metrics | Tank | #3 | blocked |
| N6 | #6 | AI Credit Calculation | Tank | #5, #2 | blocked |
| N7 | #7 | Text Output Renderer | Tank | #5, #6 | blocked |
| N8 | #8 | Integration & E2E Flow | Tank | #3, #4, #5, #6, #7 | blocked |
| N9 | #9 | Unit Tests for Parser & Calculator | Apoc | #5, #2, #6 | blocked |
| N11 | #10 | Renderer Interface for Future Extensibility | Trinity | #7 | blocked |
| N10 | #11 | README & Installation Instructions | Trinity | #8 | blocked |

## Phase 2

| Key | Issue | Title | Owner | Builds on |
|---|---:|---|---|---|
| F1 | #12 | Date Range Filtering | Tank | #4 |
| F2 | #13 | JSON Output Renderer | Tank | #10 |
| F3 | #14 | HTML Report Generator | Switch | #10 |
| F4 | #15 | /chronicle tips Integration | Tank | #8, #14 |
| F5 | #16 | Rate Table Auto-Update | Tank | #2 |

## Epic

- #17 — Epic: tscope phase 1 — local token usage CLI

## Ready to start now

- #1 — Project Scaffolding & CLI Skeleton
- #2 — Model Rate Lookup Table
