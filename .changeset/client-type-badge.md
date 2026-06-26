---
"tscope": minor
---

Add a client badge to each HTML session card showing the agentic surface that produced the session (CLI, Copilot App, or SDK), read from the session's `workspace.yaml`. The client is also included as a `client` column in the CSV export.

This release also improves reliability and release quality for the OTel/log ingestion and shipping pipeline:

- Unify JSONL stream readers across parser and OTel source code paths, including explicit cleanup on error paths to make ingestion more robust.
- Add focused unit test coverage for `tscope otel` subcommands and shared test helpers to reduce test duplication and improve maintainability.
- Strengthen CI/release safeguards by introducing workflow verification gates and an Agentic Workflow compile-check guard to catch stale generated workflow outputs before merge.
