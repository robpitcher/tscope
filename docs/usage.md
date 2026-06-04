# Usage

## Basic Usage

Show today's sessions:

```bash
tscope
```

## Help & Version

```bash
tscope --help       # Show usage and options
tscope --version    # Show version
```

## Date Filtering

```bash
tscope --date 2026-06-02              # Sessions for a specific date
tscope --range 2026-06-01 2026-06-02  # Sessions in a date range (YYYY-MM-DD, inclusive)
tscope --lastdays 7                   # Sessions from the last 7 days (today + previous 6)
tscope --all                          # All sessions (no date filter)
```

## Limiting Result Size

`--max N` caps the report to the `N` most recent sessions within the matched
set. Sessions are ordered by start time (newest first) before the cap is
applied, so you always get the latest activity:

```bash
tscope --lastdays 30 --max 10         # 10 most recent sessions in the last 30 days
tscope --all --max 25                 # 25 most recent sessions overall
```

`N` must be a positive integer. When fewer than `N` sessions match the filter,
the report includes them all. `--max` composes with every date filter
(`--date`, `--range`, `--lastdays`, `--all`, or the default "today").

### How a session's date is determined

Sessions are bucketed by their **start date** — the timestamp of the `session.start` event (or, for sessions without one, the timestamp of the first recorded event), converted to your local timezone. A session is only counted on the day it *started*.

This means if you **continue a session from a previous day**, it stays under the day it started and will **not** appear in today's report — even though you worked on it today. Use `--all`, or `--date`/`--range` for the original start day, to see it. Bucketing by start date keeps each session's token totals attributed to a single day (token metrics are cumulative for the whole session, so counting a multi-day session on every active day would double-count usage).

## Output Formats

```bash
tscope --json               # Machine-readable JSON to stdout
tscope --html               # Generate HTML dashboard (default filename) and open it
tscope --html report.html   # Generate HTML dashboard at specified path and open it
```

See [JSON Output](json-output.md) and [HTML Dashboard](html-dashboard.md) for details.

## Sample Output

```
═══════════════════════════════════════════════════════════════════════════════
SESSION: 7d15eea1-4d69-49e9-bb21-8370594afd6a
Date:    2026-06-02 22:58 (local)
Path:    C:\Users\rober\.copilot\session-state\7d15eea1-...\events.jsonl
───────────────────────────────────────────────────────────────────────────────
  claude-opus-4.7
    Fresh Input:            8    Output:          2,272
    Cache Read:       155,776    Cache Write:    87,988
    Total (I/O):      246,044
───────────────────────────────────────────────────────────────────────────────
  TOTALS
    Fresh Input:            8    Output:          2,272
    Cache Read:       155,776    Cache Write:    87,988
    Total (I/O):      246,044
═══════════════════════════════════════════════════════════════════════════════

SUMMARY: 1 session
```

### How tokens add up

Copilot reports `inputTokens` as the **grand total of all input**, and it already **includes** cache read and cache write tokens. So the only non-overlapping total is **`input + output`** — adding the cache buckets on top would double-count them. `tscope` therefore shows a disjoint breakdown — **Fresh Input** (`input − cacheRead − cacheWrite`), **Cache Read**, **Cache Write**, **Output** — whose parts sum to the **Total (I/O)**.

Also note: a **resumed** session writes one `session.shutdown` per run, and each run's metrics are reset (per-run, not cumulative). `tscope` sums the metrics across **all** shutdown events to report true session totals.
