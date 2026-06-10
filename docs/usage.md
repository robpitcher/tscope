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

## Data Source

tscope reads from one of two local data sources per run. Use `--source` to control which one is used:

```bash
tscope --source auto   # Default: OTel if available, log parser fallback with notice
tscope --source otel   # Force OTel; exits with error if otel.jsonl is absent
tscope --source logs   # Force the events.jsonl log parser (pre-OTel behavior)
```

### Three modes

| Mode | Behavior |
|---|---|
| `auto` | Checks `~/.copilot/tscope/otel.jsonl`. If present and non-empty, uses OTel. Otherwise falls back to the log parser and prints a notice to stderr. |
| `otel` | Forces OTel. Exits with a non-zero code and a helpful message if `otel.jsonl` is absent or empty. |
| `logs` | Forces the `events.jsonl` log parser. Works exactly as tscope did before OTel support. |

### Auto-fallback notice

When `auto` selects the log parser (OTel not configured), tscope prints to stderr:

```
No OpenTelemetry data found — falling back to log-file parsing.
Run 'tscope otel enable' to use OTel.
```

This message is printed once per run and only in `auto` mode. It is not printed when `--source logs` is explicit.

### Empty-range hint

When the OTel source is active (via `auto` or `--source otel`) but no sessions match the requested date range, tscope prints a hint to stderr, e.g.:

```
Hint: No OTel sessions found for this date range. OTel only captures sessions since
'tscope otel enable' was run. Use --source logs for historical data, or --all to see all
available OTel sessions.
```

The process exits with code 0 — the hint is advisory, not an error.

### Cost availability per source

| Source | Cost shown |
|---|---|
| OTel | Server-side AI credits per session and per model (from `github.copilot.nano_aiu`). |
| Log parser | Cost unavailable — the events.jsonl format does not include billing data. |

### Interaction with date filters

The `--source` flag composes freely with all date filters (`--date`, `--range`, `--lastdays`, `--all`). The date filter is applied **after** the source is loaded — the source determines *where* sessions come from; the filter determines *which* sessions are included.

OTel coverage is forward-only from the moment you run `tscope otel enable --apply`. Sessions that started before OTel was enabled are only available via the log parser (`--source logs`).

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
