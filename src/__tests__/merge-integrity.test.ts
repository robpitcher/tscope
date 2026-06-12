/**
 * Merge integrity — Apoc Phase 4 (skeptical reconciliation).
 *
 * Arithmetic invariants on top of Tank's basic merge.test.ts unit tests.
 * These go deeper into number accuracy: no double-counting, cost sums,
 * token totals, and large-cardinality scenarios.
 *
 * None of these duplicate Tank's describe blocks; they extend the invariant
 * surface with explicit arithmetic assertions.
 */

import { NormalizedSession } from "../types";
import {
  mergeSessions,
  computeSourceCoverage,
  computeReportSource,
} from "../sources/merge";

// ---------------------------------------------------------------------------
// Session factories with varied costs and token counts
// ---------------------------------------------------------------------------

function otelSession(
  id: string,
  totalCost: number,
  inputTokens = 1000,
  outputTokens = 400
): NormalizedSession {
  return {
    sessionId: id,
    eventsPath: "/fake/otel.jsonl",
    startTime: "2026-06-10T12:00:00.000Z",
    models: {
      "gpt-4": {
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      },
    },
    chronicleTips: [],
    inProgress: false,
    source: "otel",
    totalCost,
    modelCosts: { "gpt-4": totalCost },
  };
}

function logsSession(
  id: string,
  inputTokens = 500,
  outputTokens = 200
): NormalizedSession {
  return {
    sessionId: id,
    eventsPath: `/fake/${id}/events.jsonl`,
    startTime: "2026-06-10T12:00:00.000Z",
    models: {
      "gpt-4": {
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      },
    },
    chronicleTips: [],
    inProgress: false,
    source: "logs",
  };
}

// ---------------------------------------------------------------------------
// 1. Dedup: exactly one entry per overlapping session ID
// ---------------------------------------------------------------------------

describe("dedup — exactly one entry per overlap", () => {
  test("one overlap: merged length is 1, not 2", () => {
    const merged = mergeSessions([otelSession("x", 1.0)], [logsSession("x")]);
    expect(merged).toHaveLength(1);
  });

  test("three full overlaps: merged length equals OTel count (no logs duplication)", () => {
    const merged = mergeSessions(
      [otelSession("a", 1.0), otelSession("b", 2.0), otelSession("c", 3.0)],
      [logsSession("a"), logsSession("b"), logsSession("c")]
    );
    expect(merged).toHaveLength(3);
    expect(merged.every((s) => s.source === "otel")).toBe(true);
  });

  test("partial overlap (2 shared, 1 unique logs): merged length is 3", () => {
    const merged = mergeSessions(
      [otelSession("shared-1", 1.0), otelSession("shared-2", 2.0)],
      [logsSession("shared-1"), logsSession("shared-2"), logsSession("unique")]
    );
    expect(merged).toHaveLength(3);
    const ids = merged.map((s) => s.sessionId);
    expect(ids).toContain("unique");
    expect(ids.filter((id) => id === "shared-1")).toHaveLength(1);
    expect(ids.filter((id) => id === "shared-2")).toHaveLength(1);
  });

  test("each ID appears exactly once after merge regardless of overlap count", () => {
    const ids = ["a", "b", "c", "d"];
    const merged = mergeSessions(
      ids.map((id) => otelSession(id, 1.0)),
      ids.map((id) => logsSession(id))
    );
    const resultIds = merged.map((s) => s.sessionId);
    const uniqueIds = new Set(resultIds);
    expect(uniqueIds.size).toBe(ids.length);
    expect(resultIds).toHaveLength(ids.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Token count integrity — no double-counting
// ---------------------------------------------------------------------------

describe("token count integrity — no double-counting", () => {
  test("overlap: merged session carries OTel token counts, not logs counts", () => {
    const otel = otelSession("shared", 1.0, 1000, 400);
    const logs = logsSession("shared", 500, 200);
    const merged = mergeSessions([otel], [logs]);
    expect(merged).toHaveLength(1);
    expect(merged[0].models["gpt-4"].inputTokens).toBe(1000);
    expect(merged[0].models["gpt-4"].outputTokens).toBe(400);
  });

  test("overlap: merged total is OTel value only — not OTel+logs sum", () => {
    // OTel: 800 in + 300 out = 1100 total tokens
    // Logs duplicate: 600 in + 200 out = 800 total tokens
    // Merged must be 1100 (OTel), NOT 1900 (sum) or any blend
    const merged = mergeSessions([otelSession("s", 1.0, 800, 300)], [logsSession("s", 600, 200)]);
    const t = merged[0].models["gpt-4"];
    expect(t.inputTokens + t.outputTokens).toBe(1100);
  });

  test("union (no overlap): token totals are additive across unique sessions", () => {
    const otel = otelSession("o", 1.0, 1000, 400);
    const logs = logsSession("l", 600, 200);
    const merged = mergeSessions([otel], [logs]);
    expect(merged).toHaveLength(2);
    const totalInput = merged.reduce((acc, s) => acc + s.models["gpt-4"].inputTokens, 0);
    const totalOutput = merged.reduce((acc, s) => acc + s.models["gpt-4"].outputTokens, 0);
    expect(totalInput).toBe(1000 + 600);
    expect(totalOutput).toBe(400 + 200);
  });
});

// ---------------------------------------------------------------------------
// 3. Cost integrity — credits from OTel only, none from logs
// ---------------------------------------------------------------------------

describe("cost integrity — OTel credits only", () => {
  test("overlap: merged totalCost equals OTel cost, not a sum", () => {
    const merged = mergeSessions(
      [otelSession("s", 1.23, 1000, 400)],
      [logsSession("s")]
    );
    expect(merged[0].totalCost).toBe(1.23);
  });

  test("logs session has no totalCost before or after merge", () => {
    const logs = logsSession("l");
    expect(logs.totalCost).toBeUndefined();
    const merged = mergeSessions([], [logs]);
    expect(merged[0].totalCost).toBeUndefined();
  });

  test("union: total of all costs equals sum of OTel costs only", () => {
    const merged = mergeSessions(
      [otelSession("o1", 1.0), otelSession("o2", 2.0), otelSession("o3", 3.0)],
      [logsSession("l1"), logsSession("l2")]
    );
    const total = merged.reduce((acc, s) => acc + (s.totalCost ?? 0), 0);
    expect(total).toBeCloseTo(6.0, 10);
  });

  test("all logs sessions in merged set have totalCost=undefined and modelCosts=undefined", () => {
    const merged = mergeSessions(
      [otelSession("o", 1.0)],
      [logsSession("l1"), logsSession("l2")]
    );
    for (const s of merged.filter((x) => x.source === "logs")) {
      expect(s.totalCost).toBeUndefined();
      expect(s.modelCosts).toBeUndefined();
    }
  });

  test("cost reconciliation: OTel cost sum + 0*(logs) == total in merged set", () => {
    const merged = mergeSessions(
      [otelSession("o1", 1.5), otelSession("o2", 0.75)],
      [logsSession("l1"), logsSession("l2"), logsSession("l3")]
    );
    const otelCostSum = merged
      .filter((s) => s.source === "otel")
      .reduce((acc, s) => acc + (s.totalCost ?? 0), 0);
    const logsCostSum = merged
      .filter((s) => s.source === "logs")
      .reduce((acc, s) => acc + (s.totalCost ?? 0), 0);
    expect(otelCostSum).toBeCloseTo(2.25, 10);
    expect(logsCostSum).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Coverage accuracy after merge
// ---------------------------------------------------------------------------

describe("coverage accuracy after merge", () => {
  test("100% overlap: coverage is {otelCount:N, logsCount:0, costCoverage:'all'}", () => {
    const merged = mergeSessions(
      [otelSession("a", 1.0), otelSession("b", 2.0)],
      [logsSession("a"), logsSession("b")]
    );
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBe(2);
    expect(cov.logsCount).toBe(0);
    expect(cov.costCoverage).toBe("all");
  });

  test("0% overlap: coverage reflects true mix of unique sessions", () => {
    const merged = mergeSessions(
      [otelSession("o1", 1.0), otelSession("o2", 2.0)],
      [logsSession("l1"), logsSession("l2"), logsSession("l3")]
    );
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBe(2);
    expect(cov.logsCount).toBe(3);
    expect(cov.costCoverage).toBe("partial");
  });

  test("partial overlap: coverage counts surviving (post-dedup) sessions", () => {
    // 3 OTel (2 overlap + 1 unique) + 3 logs (2 overlap + 1 unique)
    // After dedup: 3 OTel + 1 unique logs = 4 total
    const merged = mergeSessions(
      [otelSession("shared-1", 1.0), otelSession("shared-2", 2.0), otelSession("otel-only", 3.0)],
      [logsSession("shared-1"), logsSession("shared-2"), logsSession("logs-only")]
    );
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBe(3);
    expect(cov.logsCount).toBe(1);
    expect(merged).toHaveLength(4);
  });

  test("otelCount + logsCount == merged.length for any mix", () => {
    const merged = mergeSessions(
      [otelSession("o1", 1.0), otelSession("shared", 2.0)],
      [logsSession("shared"), logsSession("l1"), logsSession("l2")]
    );
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount + cov.logsCount).toBe(merged.length);
  });
});

// ---------------------------------------------------------------------------
// 5. costAvailable invariant: true iff otelCount > 0
// ---------------------------------------------------------------------------

describe("costAvailable invariant: otelCount > 0 ⟺ costAvailable", () => {
  test("OTel-only: otelCount > 0 → costAvailable=true", () => {
    const merged = mergeSessions([otelSession("o1", 1.0)], []);
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBeGreaterThan(0);
    expect(cov.otelCount > 0).toBe(true);
  });

  test("logs-only: otelCount = 0 → costAvailable=false", () => {
    const merged = mergeSessions([], [logsSession("l1"), logsSession("l2")]);
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBe(0);
    expect(cov.otelCount > 0).toBe(false);
  });

  test("mixed: otelCount > 0 → costAvailable=true", () => {
    const merged = mergeSessions([otelSession("o1", 1.0)], [logsSession("l1")]);
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBeGreaterThan(0);
    expect(cov.otelCount > 0).toBe(true);
  });

  test("empty set: otelCount = 0 → costAvailable=false", () => {
    const cov = computeSourceCoverage([]);
    expect(cov.otelCount).toBe(0);
    expect(cov.otelCount > 0).toBe(false);
  });

  test("after --max simulation (slice): costAvailable derived from sliced coverage", () => {
    const merged = mergeSessions(
      [otelSession("o1", 1.0), otelSession("o2", 2.0), otelSession("o3", 3.0)],
      [logsSession("l1"), logsSession("l2")]
    );
    // Simulate --max 2: keep first 2 (both OTel in this ordering)
    const sliced = merged.slice(0, 2);
    const cov = computeSourceCoverage(sliced);
    expect(cov.otelCount > 0).toBe(true);
    expect(cov.otelCount + cov.logsCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. Report source label derivation
// ---------------------------------------------------------------------------

describe("report source label derivation after merge", () => {
  test("full overlap → source is 'otel' (all logs dropped)", () => {
    const merged = mergeSessions([otelSession("s", 1.0)], [logsSession("s")]);
    const cov = computeSourceCoverage(merged);
    expect(computeReportSource(cov)).toBe("otel");
  });

  test("union with unique logs sessions → source is 'mixed'", () => {
    const merged = mergeSessions([otelSession("o", 1.0)], [logsSession("l")]);
    const cov = computeSourceCoverage(merged);
    expect(computeReportSource(cov)).toBe("mixed");
  });

  test("logs-fallback (no OTel) → source is 'logs'", () => {
    const merged = mergeSessions([], [logsSession("l1"), logsSession("l2")]);
    const cov = computeSourceCoverage(merged);
    expect(computeReportSource(cov)).toBe("logs");
  });

  test("empty set → source is 'logs' (graceful fallback)", () => {
    const cov = computeSourceCoverage(mergeSessions([], []));
    expect(computeReportSource(cov)).toBe("logs");
  });
});

// ---------------------------------------------------------------------------
// 7. Large-cardinality reconciliation
// ---------------------------------------------------------------------------

describe("large-cardinality reconciliation", () => {
  test("50 OTel + 50 unique logs → 100 total, counts correct", () => {
    const otelSessions = Array.from({ length: 50 }, (_, i) => otelSession(`otel-${i}`, i * 0.1));
    const logsSessions = Array.from({ length: 50 }, (_, i) => logsSession(`logs-${i}`));
    const merged = mergeSessions(otelSessions, logsSessions);
    const cov = computeSourceCoverage(merged);
    expect(merged).toHaveLength(100);
    expect(cov.otelCount).toBe(50);
    expect(cov.logsCount).toBe(50);
  });

  test("30 shared + 20 unique logs → 50 total (30 OTel + 20 logs)", () => {
    const otelSessions = Array.from({ length: 30 }, (_, i) => otelSession(`shared-${i}`, 1.0));
    const logsSessions = [
      ...Array.from({ length: 30 }, (_, i) => logsSession(`shared-${i}`)),
      ...Array.from({ length: 20 }, (_, i) => logsSession(`unique-${i}`)),
    ];
    const merged = mergeSessions(otelSessions, logsSessions);
    const cov = computeSourceCoverage(merged);
    expect(merged).toHaveLength(50);
    expect(cov.otelCount).toBe(30);
    expect(cov.logsCount).toBe(20);
  });

  test("total cost in large mixed set equals sum of OTel costs only", () => {
    const costs = [1.1, 2.2, 3.3, 0.5, 0.9];
    const otelSessions = costs.map((cost, i) => otelSession(`otel-${i}`, cost));
    const logsSessions = Array.from({ length: 3 }, (_, i) => logsSession(`logs-${i}`));
    const merged = mergeSessions(otelSessions, logsSessions);
    const actualTotal = merged.reduce((acc, s) => acc + (s.totalCost ?? 0), 0);
    const expectedTotal = costs.reduce((a, b) => a + b, 0);
    expect(actualTotal).toBeCloseTo(expectedTotal, 8);
  });
});
