# apoc-merge-tests.md — Phase 4 Merge Edition: Test Coverage Report

**Date:** 2026-06-10  
**Author:** Apoc  
**Status:** COMPLETE — otel branch, commit 6ff20a7

---

## Total test count

| Baseline (before this turn) | New this turn | Final total |
|---|---|---|
| 461 | 69 | **530** |

All 530 tests pass. `npm run build` and `npm run lint` clean.

---

## What's covered

### merge-integrity.test.ts (28 tests) — pure reconciliation

| Area | Tests |
|---|---|
| Dedup: exactly one entry per overlap pattern | 4 |
| Token counts: OTel values preserved, not doubled | 3 |
| Cost integrity: credits from OTel only, none from logs | 5 |
| Coverage accuracy: otelCount + logsCount == merged.length | 4 |
| costAvailable === (otelCount > 0) invariant | 5 |
| Report source label derivation (otel/logs/mixed) | 4 |
| Large-cardinality reconciliation (50+50, 30+30+20, 5-cost sum) | 3 |

**Key invariants verified (pure functions):**
- `merged.length == uniqueOtelIds.length + uniqueLogsIds.length` for any overlap pattern
- `sum(merged.totalCost) == sum(otelSessions.totalCost)` to float precision
- `merged[overlap].models["gpt-4"].inputTokens == otelSession.inputTokens` (NOT otel+logs sum)
- `computeSourceCoverage(merged).otelCount + .logsCount == merged.length`
- `coverage.otelCount > 0` iff at least one OTel session survived

### merge-integration.test.ts (18 tests) — subprocess end-to-end

| Area | Tests |
|---|---|
| `--max` after merge: coverage sums to slice size | 3 |
| Auto mode + OTel present + no session-state dir | 3 |
| Both sources empty after date filter: graceful | 3 |
| `--source otel`/`--source logs` never produce `mixed` | 4 |
| JSON provenance: per-session source, overlap dedup visible | 5 |

**Gap coverage (from Tank's handoff):**
- `--max N` on mixed set: `coverage.otelCount + coverage.logsCount == N` ✅
- `--source auto` + OTel present + missing session-state dir: `source='otel'`, `logsCount=0` ✅

### merge-renderer-gaps.test.ts (23 tests) — renderer edge cases

| Area | Tests |
|---|---|
| HTML: `otelCount=0` + `source='mixed'` → "0 OTel", no crash | 4 |
| Text: `logsCount=0` + `source='mixed'` → "Sources: N OTel, 0 logs" | 3 |
| HTML: per-session logs badge has `title` mentioning "cost data unavailable" | 2 |
| JSON: `coverage.otelCount/logsCount` match actual session sources | 7 |
| HTML: `--max` simulation — slice coverage matches rendered HTML | 2 |
| Text: per-session source tags in mixed report | 4 |
| (Subtotal note: 4+3+2+7+2+4 = 22; one describe block has an extra test) | +1 |

**Gap coverage (from Switch's handoff):**
- HTML `otelCount=0` + `source='mixed'` edge case ✅
- Text `logsCount=0` + `source='mixed'` edge case ✅
- HTML per-session logs badge `title` attribute (cost unavailability) ✅
- JSON per-session `source` vs `coverage` consistency ✅
- HTML `--max` simulation with coverage-summary ✅

---

## Reconciliation verdict

**CLEAN.** All arithmetic invariants hold end-to-end:

1. **No double-counting:** `merged[overlap].tokens == otelSession.tokens` (not OTel+logs sum or half).
2. **Cost accuracy:** `sum(merged.totalCost) == sum(OTel costs only)` verified to `toBeCloseTo(…, 8)` precision.
3. **Coverage math:** `otelCount + logsCount == sessions.length` for all test cases.
4. **costAvailable gate:** `true` exactly when `otelCount > 0` — invariant holds in subprocess JSON output across pure-otel, pure-logs, mixed, and empty scenarios.
5. **Single-source isolation:** `--source otel` and `--source logs` never produce `source='mixed'`; logs sessions are absent from OTel output and vice-versa.
6. **Merge dedup end-to-end:** Subprocess test confirms that when `SHARED_ID` appears in both sources, exactly one session with that ID appears in JSON output with `source='otel'`.

---

## Bugs found

**None.** The implementation reconciles correctly across all invariant tests. The merge helper (`src/sources/merge.ts`), OTel data source, logs source, and all three renderers are consistent.

---

## Not covered by this turn (out of scope / cosmetic)

- HTML: CSV export `source` column — Switch's note flagged this as a potential regression. Light check confirms the CSV schema test in `html-renderer.test.ts` still passes (no `source` column in current CSV schema, no regression). Adding a `source` column to the CSV is a product decision, not a bug.
- HTML: tooltip title text on OTel per-session badges — already covered in Switch's suite.
- Text formatter carry-over edge cases — already covered in `text-renderer.test.ts`.
