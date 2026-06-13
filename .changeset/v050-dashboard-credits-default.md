---
"tscope": minor
---

**Dashboard filtering & sorting, AI credits from event logs, and a friendlier default window.**

- **AI credits from event logs (#13):** Log-sourced sessions now surface estimated AI credits, parsed by summing `session.shutdown.data.totalNanoAiu` across runs (`credits = totalNanoAiu / 1e9`). Sessions from Copilot CLI 1.0+ that previously showed "cost unavailable" now display credits in text, JSON, and HTML output. Sessions without the field degrade gracefully, and OTel remains authoritative in merged (`--source auto`) reports.
- **Dashboard sort controls and CSV export (#14):** The HTML dashboard toolbar now includes session-card sort controls — a **Sort by** dropdown (Session date / Token count / AI credits) and an ascending/descending toggle (▲ / ▼) — that reorder session cards in the page without regeneration. An **Export CSV** button downloads all embedded sessions as a CSV file for offline analysis. There is no client-side source/model/threshold filtering.
- **Default to the last 20 sessions (#15):** Running `tscope` with no filter flags now shows the 20 most recent sessions across all history instead of only "today" (which was frequently empty). Explicit flags override the new default: `--date`, `--range`, `--lastdays`, and `--all` behave as before, and an explicit `--max` overrides the implicit cap of 20. Help text and docs are updated to match.
