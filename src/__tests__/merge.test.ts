/**
 * Unit tests for the merge helper (src/sources/merge.ts).
 *
 * Covers:
 *   - mergeSessions: OTel-wins dedup, OTel-only, logs-only, no overlap
 *   - computeSourceCoverage: per-source counts + costCoverage values
 *   - computeReportSource: "otel" | "logs" | "mixed" derivation
 */

import { NormalizedSession } from "../types";
import {
  mergeSessions,
  computeSourceCoverage,
  computeReportSource,
} from "../sources/merge";

// ---------------------------------------------------------------------------
// Minimal session factories
// ---------------------------------------------------------------------------

function otelSession(id: string): NormalizedSession {
  return {
    sessionId: id,
    eventsPath: "/fake/otel.jsonl",
    startTime: "2026-06-10T12:00:00.000Z",
    models: {
      "gpt-4": {
        inputTokens: 1000,
        outputTokens: 400,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      },
    },
    chronicleTips: [],
    inProgress: false,
    source: "otel",
    totalCost: 1.23,
    modelCosts: { "gpt-4": 1.23 },
  };
}

function logsSession(id: string): NormalizedSession {
  return {
    sessionId: id,
    eventsPath: `/fake/${id}/events.jsonl`,
    startTime: "2026-06-10T12:00:00.000Z",
    models: {
      "gpt-4": {
        inputTokens: 500,
        outputTokens: 200,
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
// mergeSessions
// ---------------------------------------------------------------------------

describe("mergeSessions", () => {
  test("OTel-only: all OTel sessions pass through", () => {
    const result = mergeSessions([otelSession("a"), otelSession("b")], []);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.source === "otel")).toBe(true);
  });

  test("logs-only: all log sessions pass through when OTel list is empty", () => {
    const result = mergeSessions([], [logsSession("x"), logsSession("y"), logsSession("z")]);
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.source === "logs")).toBe(true);
  });

  test("no overlap: union of both sources", () => {
    const result = mergeSessions([otelSession("otel-1")], [logsSession("logs-1")]);
    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.sessionId);
    expect(ids).toContain("otel-1");
    expect(ids).toContain("logs-1");
  });

  test("overlap: OTel wins — duplicate logs session is dropped", () => {
    const sharedId = "shared-session-id";
    const otel = otelSession(sharedId);
    const logs = logsSession(sharedId);
    const result = mergeSessions([otel], [logs]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("otel");
  });

  test("overlap: no double-counting — token values from OTel session only", () => {
    const sharedId = "shared-id";
    const otel = otelSession(sharedId); // inputTokens = 1000
    const logs = { ...logsSession(sharedId) }; // inputTokens = 500
    const result = mergeSessions([otel], [logs]);
    expect(result).toHaveLength(1);
    expect(result[0].models["gpt-4"].inputTokens).toBe(1000); // OTel value
  });

  test("multiple overlapping IDs: all logs duplicates are dropped", () => {
    const result = mergeSessions(
      [otelSession("shared-1"), otelSession("shared-2")],
      [logsSession("shared-1"), logsSession("shared-2"), logsSession("unique-logs")]
    );
    // shared-1 and shared-2 from OTel + unique-logs from logs = 3 total
    expect(result).toHaveLength(3);
    const ids = result.map((s) => s.sessionId);
    expect(ids).toContain("shared-1");
    expect(ids).toContain("shared-2");
    expect(ids).toContain("unique-logs");
    // Verify the shared sessions come from OTel
    const s1 = result.find((s) => s.sessionId === "shared-1")!;
    const s2 = result.find((s) => s.sessionId === "shared-2")!;
    expect(s1.source).toBe("otel");
    expect(s2.source).toBe("otel");
  });

  test("empty + empty = empty", () => {
    expect(mergeSessions([], [])).toEqual([]);
  });

  test("OTel sessions appear before unique logs sessions in result order", () => {
    const result = mergeSessions([otelSession("otel-1")], [logsSession("logs-1")]);
    expect(result[0].source).toBe("otel");
    expect(result[1].source).toBe("logs");
  });
});

// ---------------------------------------------------------------------------
// computeSourceCoverage
// ---------------------------------------------------------------------------

describe("computeSourceCoverage", () => {
  test("empty sessions → {otelCount:0, logsCount:0, costCoverage:'none'}", () => {
    const cov = computeSourceCoverage([]);
    expect(cov).toEqual({ otelCount: 0, logsCount: 0, costCoverage: "none" });
  });

  test("OTel-only → costCoverage: 'all'", () => {
    const cov = computeSourceCoverage([otelSession("a"), otelSession("b")]);
    expect(cov.otelCount).toBe(2);
    expect(cov.logsCount).toBe(0);
    expect(cov.costCoverage).toBe("all");
  });

  test("logs-only → costCoverage: 'none'", () => {
    const cov = computeSourceCoverage([logsSession("x"), logsSession("y")]);
    expect(cov.otelCount).toBe(0);
    expect(cov.logsCount).toBe(2);
    expect(cov.costCoverage).toBe("none");
  });

  test("mixed (OTel + logs) → costCoverage: 'partial'", () => {
    const cov = computeSourceCoverage([otelSession("o1"), logsSession("l1"), logsSession("l2")]);
    expect(cov.otelCount).toBe(1);
    expect(cov.logsCount).toBe(2);
    expect(cov.costCoverage).toBe("partial");
  });

  test("counts are accurate for a large mixed set", () => {
    const sessions: NormalizedSession[] = [
      ...Array.from({ length: 5 }, (_, i) => otelSession(`otel-${i}`)),
      ...Array.from({ length: 3 }, (_, i) => logsSession(`logs-${i}`)),
    ];
    const cov = computeSourceCoverage(sessions);
    expect(cov.otelCount).toBe(5);
    expect(cov.logsCount).toBe(3);
    expect(cov.costCoverage).toBe("partial");
  });

  test("single OTel session → costCoverage: 'all'", () => {
    const cov = computeSourceCoverage([otelSession("only")]);
    expect(cov.otelCount).toBe(1);
    expect(cov.logsCount).toBe(0);
    expect(cov.costCoverage).toBe("all");
  });

  test("single logs session → costCoverage: 'none'", () => {
    const cov = computeSourceCoverage([logsSession("only")]);
    expect(cov.otelCount).toBe(0);
    expect(cov.logsCount).toBe(1);
    expect(cov.costCoverage).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// computeReportSource
// ---------------------------------------------------------------------------

describe("computeReportSource", () => {
  test("otelCount > 0, logsCount = 0 → 'otel'", () => {
    expect(computeReportSource({ otelCount: 3, logsCount: 0, costCoverage: "all" })).toBe("otel");
  });

  test("otelCount = 0, logsCount > 0 → 'logs'", () => {
    expect(computeReportSource({ otelCount: 0, logsCount: 4, costCoverage: "none" })).toBe("logs");
  });

  test("otelCount > 0, logsCount > 0 → 'mixed'", () => {
    expect(computeReportSource({ otelCount: 2, logsCount: 3, costCoverage: "partial" })).toBe("mixed");
  });

  test("otelCount = 0, logsCount = 0 → 'logs' (empty report fallback)", () => {
    expect(computeReportSource({ otelCount: 0, logsCount: 0, costCoverage: "none" })).toBe("logs");
  });

  test("single OTel session → 'otel'", () => {
    expect(computeReportSource({ otelCount: 1, logsCount: 0, costCoverage: "all" })).toBe("otel");
  });

  test("single logs session → 'logs'", () => {
    expect(computeReportSource({ otelCount: 0, logsCount: 1, costCoverage: "none" })).toBe("logs");
  });
});

// ---------------------------------------------------------------------------
// Round-trip: merge → coverage → source
// ---------------------------------------------------------------------------

describe("round-trip: merge → coverage → source", () => {
  test("OTel-only round-trip produces source: 'otel'", () => {
    const merged = mergeSessions([otelSession("a"), otelSession("b")], []);
    const cov = computeSourceCoverage(merged);
    expect(computeReportSource(cov)).toBe("otel");
    expect(cov.costCoverage).toBe("all");
  });

  test("logs-only round-trip produces source: 'logs'", () => {
    const merged = mergeSessions([], [logsSession("x"), logsSession("y")]);
    const cov = computeSourceCoverage(merged);
    expect(computeReportSource(cov)).toBe("logs");
    expect(cov.costCoverage).toBe("none");
  });

  test("mixed (no overlap) round-trip produces source: 'mixed'", () => {
    const merged = mergeSessions([otelSession("o1")], [logsSession("l1"), logsSession("l2")]);
    const cov = computeSourceCoverage(merged);
    expect(computeReportSource(cov)).toBe("mixed");
    expect(cov.otelCount).toBe(1);
    expect(cov.logsCount).toBe(2);
    expect(cov.costCoverage).toBe("partial");
  });

  test("overlap round-trip: after OTel wins, produces source: 'otel'", () => {
    const sharedId = "shared";
    const merged = mergeSessions([otelSession(sharedId)], [logsSession(sharedId)]);
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBe(1);
    expect(cov.logsCount).toBe(0); // logs duplicate dropped
    expect(computeReportSource(cov)).toBe("otel");
    expect(cov.costCoverage).toBe("all");
  });

  test("partial overlap: unique logs session remains, overlap → OTel wins", () => {
    const merged = mergeSessions(
      [otelSession("shared")],
      [logsSession("shared"), logsSession("unique")]
    );
    const cov = computeSourceCoverage(merged);
    expect(cov.otelCount).toBe(1);
    expect(cov.logsCount).toBe(1); // only "unique" survived
    expect(computeReportSource(cov)).toBe("mixed");
    expect(cov.costCoverage).toBe("partial");
  });
});
