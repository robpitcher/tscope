# Apoc OTel Test Suite — Quality Gate Note

**Author:** Apoc (Tester / Quality Engineer)  
**Date:** 2026-06-10  
**Branch:** `otel`  
**Status:** Complete — Phase 4 done

---

## Test Count

| Suite | Tests Added | Total (suite) |
|---|---|---|
| `otel-source-edge.test.ts` (new) | 36 | 36 |
| `logs-source.test.ts` (new) | 29 | 29 |
| `source-selection.test.ts` (new) | 17 | 17 |
| `renderer-edge-cases.test.ts` (new) | 17 | 17 |
| **Subtotal new** | **87** | |
| Existing (pre-Phase 4) | — | 302 |
| **Grand total** | | **389** |

All 389 tests pass. `npm run build` and `npm run lint` are clean.

---

## Coverage Summary

### OTel Parser Edge Cases (`otel-source-edge.test.ts`)
- **Multi-session interleaving:** 3 and 4 sessions mixed line-by-line — tokens accumulate to correct per-session totals.
- **Multiple models per session:** Per-model tokens and costs accumulate independently; `modelCosts` keys match `models` keys.
- **Reasoning tokens:** `extended.reasoningTokens` populated and summed across spans and models. Undefined when all-zero.
- **Context window utilization:** `extended.contextWindow` populated from span events; `utilizationRatio` is a `number`; last sample wins when multiple events; missing `token_limit` skipped cleanly.
- **`predicate = undefined`:** All sessions returned (both omitted and explicit `undefined`).
- **Reconciliation invariants:** `totalCost === sum(modelCosts)` to floating-point precision. Per-model token counts equal sum of individual span values. `cacheRead`/`cacheWrite` accumulate correctly.
- **Mixed-content resilience:** Valid spans, metric records, `invoke_agent` spans, malformed JSON lines, and empty lines in same file — bad lines skipped, good data intact, `invoke_agent` never double-counted.

### LogsDataSource (`logs-source.test.ts`)
- **Date predicate filtering:** Keeps matching sessions, excludes non-matching ones (timezone-safe: uses same `utcToLocalDateString` the source uses).
- **`predicate = undefined`:** All sessions returned (both omitted and `undefined`).
- **`loadAll()`:** Completed and in-progress sessions separated correctly; date predicate filters both buckets; predicate=undefined includes all.
- **Source provenance invariant:** Every session from `LogsDataSource` has `source: "logs"`, `modelCosts === undefined`, `totalCost === undefined`, `extended === undefined`. No fabricated cost.
- **Token passthrough:** `inputTokens`/`outputTokens` from `events.jsonl` are preserved exactly.

### Source Selection (`source-selection.test.ts`) — subprocess integration
- **`--source otel` absent:** Exit code ≠ 0, stderr contains `Error:` and `otel enable`.
- **`--source otel` empty:** Exit code ≠ 0, stderr contains `otel enable`.
- **`--source otel` valid:** Exit code = 0, JSON output `source: "otel"`, `costAvailable: true`.
- **`--source logs`:** Exits 0 even when `otel.jsonl` present; JSON `source: "logs"`, `costAvailable: false`; no fallback notice on stderr.
- **`auto` + OTel present:** JSON `source: "otel"`, no fallback notice on stderr.
- **`auto` + OTel absent:** JSON `source: "logs"`, exact fallback notice printed exactly once on stderr.
- **`--source invalid`:** Exit code ≠ 0, stderr names the invalid value and lists valid choices.

### Renderer Edge Cases (`renderer-edge-cases.test.ts`)
- **TextRenderer:** Empty OTel report shows `Source: OpenTelemetry` and omits `cost data unavailable`.
- **HtmlRenderer source badge position:** Badge element is in `header-meta` before first `session-card` element in document order.
- **HtmlRenderer credits chip precision:** `totalCost.toFixed(2)` enforced — 1.5 → "1.50 credits", 0.1 → "0.10 credits", 10.0 → "10.00 credits".
- **HtmlRenderer context window fill clamp:** Width = `clamp(0, utilizationRatio, 1) × 100%`. Ratio > 1.0 (anomalous OTel data) clamped to 100%; ratio < 0 clamped to 0%.
- **HtmlRenderer Total Credits reconciliation:** Stat card value = `sum(session.totalCost)` across all sessions (verified with 2- and 3-session reports). Absent for logs reports.

---

## Reconciliation Verdict

**CLEAN — no bugs found.**

| Invariant | Result |
|---|---|
| `OtelDataSource.totalCost === sum(modelCosts)` | ✅ Exact |
| Per-model tokens = sum of per-span values | ✅ Exact |
| `report.costAvailable === (report.source === "otel")` | ✅ End-to-end (subprocess JSON) |
| Logs sessions: `modelCosts === totalCost === extended === undefined` | ✅ Confirmed |
| Context window fill: `width ∈ [0, 100%]` for any input `utilizationRatio` | ✅ Clamped |
| Credits chip: always 2 decimal places | ✅ Confirmed |
| Auto fallback stderr notice: exactly 1 occurrence | ✅ Confirmed |

---

## Bugs Found

**None.** All invariants reconcile correctly. The implementation is solid.

> One observation (not a bug): Switch's handoff flagged that `ExtendedMetrics.contextWindow.utilizationRatio` could be `undefined` if an older OTel SDK omits the field. Tank's parser defaults the computed ratio to `usedTokens / limitTokens` when both are present and skips the sample when either is missing. This is correct behavior — no fix needed, just confirming.

---

## Owner Recommendation

No routing required. Phase 4 complete.
