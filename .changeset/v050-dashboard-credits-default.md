---
"tscope": minor
---

**Dashboard filtering & sorting, AI credits from event logs, and a friendlier default window.**

- **AI credits from event logs (#13):** Log-sourced sessions now surface estimated AI credits, parsed by summing `session.shutdown.data.totalNanoAiu` across runs (`credits = totalNanoAiu / 1e9`). Sessions from Copilot CLI 1.0+ that previously showed "cost unavailable" now display credits in text, JSON, and HTML output. Sessions without the field degrade gracefully, and OTel remains authoritative in merged (`--source auto`) reports.
- **Dashboard filtering & sorting (#14):** The HTML dashboard gains client-side, stackable (AND) filters — source (All / OTel / Logs), model multi-select, and tokens / credits / API-time thresholds (≥ / ≤) — plus sort controls (Date / Credits / Tokens / API Time, ascending or descending). Sorting reorders both the timeline chart and the session cards, and CSV export reflects the active filters and sort order. The credits and API-time filters appear only when the underlying data is present, and a "Reset filters" button clears all non-date filters. The existing date filter is unchanged.
- **Default to the last 10 sessions (#15):** Running `tscope` with no filter flags now shows the 10 most recent sessions across all history instead of only "today" (which was frequently empty). Explicit flags override the new default: `--date`, `--range`, `--lastdays`, and `--all` behave as before, and an explicit `--max` overrides the implicit cap of 10. Help text and docs are updated to match.
