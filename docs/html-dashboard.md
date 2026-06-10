# HTML Dashboard

Use `--html` to generate a self-contained HTML report (which opens automatically in your browser and follows your system's light/dark theme):

```bash
tscope --html               # Generate dashboard with default filename and open it
tscope --html report.html   # Generate dashboard at the specified path and open it
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/dashboard-dark.png">
  <img alt="tscope HTML dashboard" src="images/dashboard-light.png">
</picture>

> _Generated from synthetic sample data._

## Features

- **Coverage summary** — for merged reports (default `--source auto`), shows "N OTel · M logs" and explains cost availability. For single-source reports, shows a source badge (blue for OTel, muted for logs).
- **Per-session source badge** — every session card displays its own source badge ("OTel" or "log parser") so you always know which sessions have authoritative cost data.
- **Total Tokens** summary stat card
- **Total Credits** stat card — shows the sum of AI credits across OTel sessions only. For mixed reports, the subtitle notes "OTel sessions only". Absent for pure logs-only reports.
- **Tokens Over Time** chart (one bar per session, chronological; hover a bar for the token-type breakdown)
- **Credits by Model** chart — OTel sessions only; shows AI credit totals grouped by model name
- **Chronicle Insights** box — if any session ran `/chronicle tips` or `/chronicle cost-tips`, the most recent set of recommendations is parsed and shown in its own box, below the *Tokens Over Time* chart and above the session list (see below)
- Per-session cards with:
  - **Source badge** — "OTel" (blue) or "log parser" (muted) so you know provenance at a glance
  - **Credit chip** (green, OTel only) — shows `X.XX credits` for the session's total cost
  - **Cost unavailable chip** (logs only) — transparent badge saying "no cost data" to indicate logs do not include billing data
  - **Token Usage by Model** — stacked bar chart (fresh input / cacheRead / cacheWrite / output)
  - **Tokens by Model** — horizontal bars (total tokens per model; hover for the token-type breakdown)
  - **Cache Efficiency** — % cache hit rate per model
  - **Context Window** bar (OTel only, when utilization data is present) — a horizontal fill bar showing the most recently observed context usage vs. the model's limit. The bar turns amber (`.ctx-window-high`) when utilization reaches ≥ 80%. The fill is clamped to [0, 100%] so anomalous OTel data never overflows the bar.

The HTML file is fully self-contained (no external dependencies, works offline). The only outbound links point to the project repository.

## In-Progress Sessions

In-progress sessions (those without a `session.shutdown` event, i.e. no token data) are **silently excluded** from the HTML dashboard. They do not appear in the stat cards, the *Tokens Over Time* chart, the session list, or Chronicle Insights. Completed sessions that recorded no token activity (empty `modelMetrics` or all-zero counts) are excluded for the same reason. This behavior matches the text and JSON output formats.

## Interacting With the Timeline

Click (or keyboard-activate with **Enter** / **Space**) any bar in the *Tokens Over Time* chart to scroll to that session's card and apply a persistent blue highlight ring. The highlight stays in place until you click outside the selected card (or press **Escape**), so you can read or compare the card's contents at your own pace. Clicking another bar moves the selection to its card.

## Chronicle Insights

If any session within the report's scope contains a `/chronicle tips` or `/chronicle cost-tips` invocation, `tscope` extracts the assistant's resulting recommendations and renders them in a dedicated **Chronicle Insights** box, positioned between the *Tokens Over Time* chart and the session list.

- Tips are detected by matching the `/chronicle tips` / `/chronicle cost-tips` command in each session's `events.jsonl`, then pairing it with the final assistant response via the shared `interactionId` (robust against the intermediate tool and system events in between).
- If multiple sessions (or multiple invocations) contain tips, only the **most recent** one is shown. The box notes its variant, local timestamp, and source session id.
- The box is **collapsible and closed by default**: a caret to the left of the heading and a summary note indicate that a `/chronicle` run was detected within the report's session scope; clicking it expands the full recommendations.
- The Markdown is converted to safe HTML (headings, lists, bold, inline code); all content is HTML-escaped, and links are rendered as plain text so the report keeps its "only links point to the project repository" guarantee.
- Chronicle Insights appear only in the **HTML** report (not text or JSON).

## Interactive Date-Range Filter

The date pill in the report header (e.g. `🗓 today`) is interactive. Click it to open a picker with presets (**Today**, **7 days**, **30 days**, **All**) and a custom **from/to** date range. Selecting a range instantly re-filters the report in the browser — the stat cards, the *Tokens Over Time* chart, and the session list all update, with no regeneration required.

### Notes

- The report is a **snapshot**: the picker can only filter over the sessions that were embedded when the file was generated by the active CLI date filter (`--all`, `--date`, `--range`, `--lastdays`, or today's default). Running `tscope --all --html` embeds every session and makes the picker most useful; running `tscope --html` (today only) embeds just today's sessions, so the presets all resolve to that same set.
- Presets are anchored to the report's **generation time**, not your current wall-clock time, so they stay stable however long after generation you open the file.
- Sessions are bucketed by their **local start date** (see [Date Filtering](usage.md#date-filtering)). In-progress sessions with no recorded start time appear only under **All**.
