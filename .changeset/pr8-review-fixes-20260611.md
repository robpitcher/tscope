---
"tscope": patch
---

Fix four issues flagged in PR #8 review:

- **Provenance under empty result set**: `--source otel` with a non-matching date filter now correctly reports `source: "otel"` instead of falling back to `"logs"`. The footer and JSON output now reflect the explicitly selected source mode even when no sessions are returned.
- **Context window clamping in text renderer**: The text report now clamps `utilizationRatio` to [0, 1] before formatting the percentage, matching the HTML renderer's `clamp01()` guard. Anomalous OTel values (used > limit, or negative) no longer produce ">100%" or negative percentages in text output.
- **Memory efficiency in OTel parser**: `OtelDataSource` now retains only the most recent context-window sample per session (replacing the unbounded `contextWindowSamples[]` accumulator). Behaviour is unchanged — only the last sample was used — but memory usage for large `otel.jsonl` files is significantly reduced.
- **Documentation**: `docs/how-it-works.md` note about reasoning tokens updated to reflect that text output shows a Reasoning row for *all* sources (OTel and log parser) when `> 0`; only HTML omits reasoning tokens.
