# switch-merge-provenance.md — Per-session badges + coverage summary

**Date:** 2026-06-10  
**Author:** Switch  
**Status:** IMPLEMENTED — otel branch, commit f298a9c

---

## What was rendered

### HTML

**Per-session source badge (HARD REQUIREMENT — done)**

Every session card now has a source badge as the first chip in the
`.session-summary-chips` row, reading `session.source`:

- `"otel"` → `<span class="source-badge source-badge--otel">OTel</span>`
  (accent-blue pill)
- `"logs"` → `<span class="source-badge source-badge--logs">log parser</span>`
  (muted pill, dashed border conveying "historical")

The badge is placed *before* the duration/tokens chips so left-to-right reading
order is: provenance → speed → volume → cost.

**Coverage summary in header (mixed reports)**

For `report.source === "mixed"`, the old single badge is replaced by:
```html
<span class="coverage-summary" title="Sources: 1 OTel + 3 logs sessions — cost available for OTel sessions only">
  <span class="cov-otel">1 OTel</span>
  <span class="cov-sep"> · </span>
  <span class="cov-logs">3 logs</span>
</span>
```
Pure `"otel"` / `"logs"` headers keep their existing single `source-badge` (no
change — existing tests preserved).

**Cost unavailable chip on logs cards**

Logs session cards show `<span class="chip chip-cost-unavail">no cost data</span>`
(transparent background, dashed border, muted text) instead of a credits chip.
OTel cards keep their green `.chip-credits`. "Total Credits" stat subtitle is
"OTel sessions only" for mixed reports.

### Text Renderer

Each session block now has a `Source:  OTel` or `Source:  log parser` line
between the `Path:` line and the light `────` divider.

Footer for mixed reports changed from the old "Source: mixed (OTel + logs)" to:
```
Sources: 2 OTel, 3 logs — cost available for OTel sessions only
```
(reads `report.coverage.otelCount` and `report.coverage.logsCount`)

Pure otel/logs footers are unchanged.

### JSON Renderer

No changes needed. Tank's implementation already serializes:
- `sessions[].source` per session ✅
- Top-level `coverage` object ✅
- `extended` object per OTel session ✅

---

## What Apoc should test in the renderers

### New coverage needed (not in Switch's test files)

| Area | What to test |
|---|---|
| HTML per-session badge | OTel card has `source-badge--otel`, logs card has `source-badge--logs` — covered in Switch's `html-renderer.test.ts` ✅ |
| HTML coverage summary | Mixed report: coverage-summary element present, correct counts — covered ✅ |
| HTML cost chip | Logs card: `chip-cost-unavail` present; OTel card: no chip-cost-unavail — covered ✅ |
| HTML mixed credits subtitle | "OTel sessions only" for mixed, "AI billing credits" for pure OTel — covered ✅ |
| Text per-session tag | "Source:  OTel" / "Source:  log parser" inside each session block — covered ✅ |
| Text mixed footer | "Sources: N OTel, M logs" — covered ✅ |
| **Not yet covered** | `--max` flag + mixed report: coverage counts in HTML reflect the *sliced* session set (currently the HTML receives the pre-sliced `report.sessions`, so this should work, but integration test worth having) |
| **Not yet covered** | Edge: `coverage.otelCount === 0` but `source === "mixed"` — e.g. "0 OTel · 5 logs" in coverage summary. Should render gracefully (no crash, shows "0 OTel"). |
| **Not yet covered** | Text renderer: mixed report where `logsCount === 0` — "Sources: 3 OTel, 0 logs". Cosmetically odd but shouldn't crash. |
| **Not yet covered** | HTML: per-session badge tooltip for a logs card says "cost data unavailable" — currently not asserted (the card-level `chip-cost-unavail` carries that text in its title, and the per-session badge's title also mentions "cost data unavailable"). Worth a dedicated tooltip test. |
| **Not yet covered** | HTML: client-side CSV export for a mixed report — `source` column not in the CSV schema yet; confirm no regressions in the download path. |

### Regression risk areas from this change

1. **`renderer-edge-cases.test.ts` badge-position tests** — verified passing (461
   total pass). Those tests look for `class="source-badge` from the header region,
   which still works because pure otel/logs header badges are unchanged.

2. **Text `source footer appears after SUMMARY` test** — was updated to use
   `lastIndexOf("Source:")` since per-session lines now precede the footer. Apoc
   should be aware if adding new "Source:" prefixed content to session blocks.

3. **`chip-cost-unavail` on every logs session** — even in a pure logs report every
   card shows "no cost data". This is intentional (always-honest) but the volume of
   chips in a logs-only report could feel noisy. Worth a UX review if user feedback
   surfaces it; easy to scope to `source === "mixed"` only if needed.
