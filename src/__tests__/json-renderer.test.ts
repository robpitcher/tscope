/**
 * Tests for JsonRenderer — verifies JSON shape, field types, and edge cases.
 * Schema: tscope/report/v5 (adds source provenance + costAvailable; v4 fields intact)
 */

import { JsonRenderer } from "../render/JsonRenderer";
import { Report, NormalizedSession, InProgressSession } from "../types";
import {
  EMPTY_REPORT,
  SAMPLE_SESSION,
  SAMPLE_IN_PROGRESS,
} from "./helpers/fixtures";
import { captureJson } from "./helpers/render";

describe("JsonRenderer", () => {
  describe("output is valid JSON", () => {
    test("empty report produces valid JSON", () => {
      expect(() => captureJson(EMPTY_REPORT)).not.toThrow();
    });

    test("report with sessions produces valid JSON", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
      };
      expect(() => captureJson(report)).not.toThrow();
    });
  });

  describe("top-level schema fields", () => {
    test("includes schema field with v5 value", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.schema).toBe("tscope/report/v5");
    });

    test("includes source field matching report.source", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.source).toBe("logs");
    });

    test("includes costAvailable field matching report.costAvailable", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.costAvailable).toBe(false);
    });

    test("source is 'otel' when report.source is otel", () => {
      const report: Report = { ...EMPTY_REPORT, source: "otel", costAvailable: true };
      const out = captureJson(report);
      expect(out.source).toBe("otel");
      expect(out.costAvailable).toBe(true);
    });

    test("source is 'mixed' when report.source is mixed", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        source: "mixed",
        costAvailable: true,
        coverage: { otelCount: 2, logsCount: 3, costCoverage: "partial" },
      };
      const out = captureJson(report);
      expect(out.source).toBe("mixed");
    });
  });

  describe("coverage field", () => {
    test("coverage field is present in output", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.coverage).toBeDefined();
    });

    test("coverage has otelCount, logsCount, costCoverage fields", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(typeof out.coverage.otelCount).toBe("number");
      expect(typeof out.coverage.logsCount).toBe("number");
      expect(typeof out.coverage.costCoverage).toBe("string");
    });

    test("empty logs report has coverage {otelCount:0, logsCount:0, costCoverage:'none'}", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.coverage.otelCount).toBe(0);
      expect(out.coverage.logsCount).toBe(0);
      expect(out.coverage.costCoverage).toBe("none");
    });

    test("otel-only coverage: costCoverage is 'all'", () => {
      const otelSession: NormalizedSession = { ...SAMPLE_SESSION, source: "otel" };
      const report: Report = {
        ...EMPTY_REPORT,
        source: "otel",
        costAvailable: true,
        coverage: { otelCount: 1, logsCount: 0, costCoverage: "all" },
        sessions: [otelSession],
      };
      const out = captureJson(report);
      expect(out.coverage.otelCount).toBe(1);
      expect(out.coverage.logsCount).toBe(0);
      expect(out.coverage.costCoverage).toBe("all");
    });

    test("mixed coverage: costCoverage is 'partial'", () => {
      const otelSession: NormalizedSession = { ...SAMPLE_SESSION, source: "otel" };
      const logsSession: NormalizedSession = {
        ...SAMPLE_SESSION,
        sessionId: "logs-session-id",
        source: "logs",
      };
      const report: Report = {
        ...EMPTY_REPORT,
        source: "mixed",
        costAvailable: true,
        coverage: { otelCount: 1, logsCount: 1, costCoverage: "partial" },
        sessions: [otelSession, logsSession],
      };
      const out = captureJson(report);
      expect(out.coverage.otelCount).toBe(1);
      expect(out.coverage.logsCount).toBe(1);
      expect(out.coverage.costCoverage).toBe("partial");
      expect(out.source).toBe("mixed");
    });

    test("logs-only coverage: costCoverage is 'none', otelCount is 0", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        coverage: { otelCount: 0, logsCount: 2, costCoverage: "none" },
        sessions: [SAMPLE_SESSION, { ...SAMPLE_SESSION, sessionId: "s2" }],
      };
      const out = captureJson(report);
      expect(out.coverage.otelCount).toBe(0);
      expect(out.coverage.logsCount).toBe(2);
      expect(out.coverage.costCoverage).toBe("none");
    });
  });

  describe("top-level schema fields (continued)", () => {
    test("includes generatedAt as ISO 8601 UTC string", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(typeof out.generatedAt).toBe("string");
      expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test("includes filter.description matching report.filterDescription", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.filter.description).toBe("today");
    });

    test("includes filter.reportDate matching report.reportDate", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.filter.reportDate).toBe("2026-06-02");
    });

    test("filterDescription is preserved for --all mode", () => {
      const report: Report = { ...EMPTY_REPORT, filterDescription: "all time" };
      const out = captureJson(report);
      expect(out.filter.description).toBe("all time");
    });

    test("filterDescription is preserved for date range mode", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        filterDescription: "2026-06-01 to 2026-06-02",
      };
      const out = captureJson(report);
      expect(out.filter.description).toBe("2026-06-01 to 2026-06-02");
    });
  });

  describe("summary fields", () => {
    test("empty report has zeroed summary", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.summary.sessionCount).toBe(0);
      expect(out.summary.completedCount).toBe(0);
      expect(out.summary.inProgressCount).toBe(0);
      expect(out.summary.totalTokens).toBe(0);
    });

    test("summary has no credit fields", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.summary.totalEstimatedCredits).toBeUndefined();
      expect(out.summary.hasUnknownRates).toBeUndefined();
    });

    test("in-progress sessions are silently excluded from counts", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      };
      const out = captureJson(report);
      // In-progress sessions are dropped entirely; only completed are counted.
      expect(out.summary.sessionCount).toBe(1);
      expect(out.summary.completedCount).toBe(1);
      expect(out.summary.inProgressCount).toBe(0);
    });

    test("totalTokens sums input+output across sessions (cache is part of input)", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
      };
      const out = captureJson(report);
      // (1000+500) + (300+100) = 1900 — cacheRead/cacheWrite are subsets of input
      expect(out.summary.totalTokens).toBe(1900);
    });
  });

  describe("completed session shape", () => {
    let out: ReturnType<typeof JSON.parse>;
    let sessionOut: ReturnType<typeof JSON.parse>;

    beforeEach(() => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
      };
      out = captureJson(report);
      sessionOut = out.sessions[0];
    });

    test("session has correct sessionId", () => {
      expect(sessionOut.sessionId).toBe(SAMPLE_SESSION.sessionId);
    });

    test("session has correct path", () => {
      expect(sessionOut.path).toBe(SAMPLE_SESSION.eventsPath);
    });

    test("session startTime is ISO 8601 string", () => {
      expect(typeof sessionOut.startTime).toBe("string");
      expect(sessionOut.startTime).toBe(SAMPLE_SESSION.startTime);
    });

    test("session localDateTime is YYYY-MM-DD HH:MM string", () => {
      expect(typeof sessionOut.localDateTime).toBe("string");
      expect(sessionOut.localDateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    test("session inProgress is false", () => {
      expect(sessionOut.inProgress).toBe(false);
    });

    test("session apiDurationMs is null when source session has none", () => {
      // SAMPLE_SESSION doesn't set apiDurationMs.
      expect(sessionOut.apiDurationMs).toBeNull();
    });

    test("session apiDurationMs is preserved when set on the source session", () => {
      const withDuration: Report = {
        ...EMPTY_REPORT,
        sessions: [{ ...SAMPLE_SESSION, apiDurationMs: 4669 }],
      };
      const result = captureJson(withDuration);
      expect(result.sessions[0].apiDurationMs).toBe(4669);
    });

    test("session does not include a premiumRequests field", () => {
      expect(sessionOut.premiumRequests).toBeUndefined();
    });

    test("session has correct number of models", () => {
      expect(sessionOut.models).toHaveLength(2);
    });

    test("model has correct structure (no credit fields)", () => {
      const model = sessionOut.models[0];
      expect(model.modelName).toBe("claude-sonnet-4-5");
      expect(typeof model.usage.input).toBe("number");
      expect(typeof model.usage.output).toBe("number");
      expect(typeof model.usage.cacheRead).toBe("number");
      expect(typeof model.usage.cacheWrite).toBe("number");
      expect(typeof model.usage.reasoning).toBe("number");
      // No credit fields
      expect(model.estimatedCredits).toBeUndefined();
      expect(model.unknownRate).toBeUndefined();
    });

    test("model usage token counts are correct", () => {
      const model = sessionOut.models[0];
      expect(model.usage.input).toBe(1000);
      expect(model.usage.output).toBe(500);
      expect(model.usage.cacheRead).toBe(700);
      expect(model.usage.cacheWrite).toBe(100);
      expect(model.usage.reasoning).toBe(50);
    });

    test("session totals sum across all models (no credit fields)", () => {
      const totals = sessionOut.totals;
      expect(totals.input).toBe(1300); // 1000 + 300
      expect(totals.output).toBe(600); // 500 + 100
      expect(totals.cacheRead).toBe(700); // 700 + 0
      expect(totals.cacheWrite).toBe(100);
      expect(totals.reasoning).toBe(50);
      expect(totals.total).toBe(1900); // input + output (cache is part of input)
      // No credit fields in totals
      expect(totals.estimatedCredits).toBeUndefined();
      expect(totals.hasUnknownRates).toBeUndefined();
    });
  });

  describe("in-progress sessions are silently excluded", () => {
    test("in-progress-only report produces empty sessions array", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      };
      const out = captureJson(report);
      expect(out.sessions).toEqual([]);
      expect(out.summary.sessionCount).toBe(0);
      expect(out.summary.completedCount).toBe(0);
      expect(out.summary.inProgressCount).toBe(0);
    });

    test("mixed report omits in-progress entries from sessions[]", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      };
      const out = captureJson(report);
      expect(out.sessions).toHaveLength(1);
      expect(out.sessions[0].sessionId).toBe(SAMPLE_SESSION.sessionId);
      expect(out.sessions[0].inProgress).toBe(false);
      // No entry should match the in-progress session id.
      const ids = (out.sessions as Array<{ sessionId: string }>).map((s) => s.sessionId);
      expect(ids).not.toContain(SAMPLE_IN_PROGRESS.sessionId);
    });

    test("in-progress session with no startTime is also excluded", () => {
      const noStart: InProgressSession = {
        sessionId: "no-start",
        eventsPath: "/some/path",
        startTime: undefined,
        chronicleTips: [],
        inProgress: true,
      };
      const report: Report = {
        ...EMPTY_REPORT,
        inProgressSessions: [noStart],
      };
      const out = captureJson(report);
      expect(out.sessions).toEqual([]);
    });
  });

  describe("sessions array ordering", () => {
    test("only completed sessions appear; in-progress are excluded", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      };
      const out = captureJson(report);
      expect(out.sessions).toHaveLength(1);
      expect(out.sessions[0].inProgress).toBe(false);
    });
  });

  describe("extended metrics serialization", () => {
    const OTEL_SESSION: NormalizedSession = {
      ...SAMPLE_SESSION,
      source: "otel",
      totalCost: 2.34,
      modelCosts: { "claude-sonnet-4-5": 2.34 },
      extended: {
        reasoningTokens: 150,
        contextWindow: {
          usedTokens: 12500,
          limitTokens: 128000,
          utilizationRatio: 0.0977,
        },
      },
    };

    test("extended field is included in serialized session when present", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        source: "otel",
        costAvailable: true,
        sessions: [OTEL_SESSION],
      };
      const out = captureJson(report);
      expect(out.sessions[0].extended).toBeDefined();
    });

    test("extended.reasoningTokens is serialized correctly", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        source: "otel",
        costAvailable: true,
        sessions: [OTEL_SESSION],
      };
      const out = captureJson(report);
      expect(out.sessions[0].extended.reasoningTokens).toBe(150);
    });

    test("extended.contextWindow is serialized correctly", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        source: "otel",
        costAvailable: true,
        sessions: [OTEL_SESSION],
      };
      const out = captureJson(report);
      const cw = out.sessions[0].extended.contextWindow;
      expect(cw.usedTokens).toBe(12500);
      expect(cw.limitTokens).toBe(128000);
      expect(cw.utilizationRatio).toBeCloseTo(0.0977);
    });

    test("extended field is absent when session has no extended data (logs)", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
      };
      const out = captureJson(report);
      expect(out.sessions[0].extended).toBeUndefined();
    });

    test("extended with only reasoningTokens (no contextWindow) serializes correctly", () => {
      const partialExtended: NormalizedSession = {
        ...SAMPLE_SESSION,
        source: "otel",
        extended: { reasoningTokens: 75 },
      };
      const report: Report = {
        ...EMPTY_REPORT,
        source: "otel",
        costAvailable: true,
        sessions: [partialExtended],
      };
      const out = captureJson(report);
      expect(out.sessions[0].extended.reasoningTokens).toBe(75);
      expect(out.sessions[0].extended.contextWindow).toBeUndefined();
    });
  });

  describe("JSON output ends with newline", () => {
    test("output string ends with newline character", () => {
      const chunks: string[] = [];
      jest.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
      });
      new JsonRenderer().render(EMPTY_REPORT);
      (process.stdout.write as jest.Mock).mockRestore();
      const raw = chunks.join("");
      expect(raw.endsWith("\n")).toBe(true);
    });
  });

  describe("numbers stay as numbers (not strings)", () => {
    test("token counts are numeric in JSON", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
      };
      const out = captureJson(report);
      const model = out.sessions[0].models[0];
      expect(typeof model.usage.input).toBe("number");
      expect(typeof out.summary.totalTokens).toBe("number");
    });
  });

  describe("sessions with no token data are silently excluded", () => {
    test("completed session with empty models map is excluded", () => {
      const emptyModelsSession: NormalizedSession = {
        sessionId: "empty-models",
        eventsPath: "/some/path",
        startTime: "2026-06-02T20:00:00.000Z",
        models: {},
        chronicleTips: [],
        inProgress: false,
        source: "logs",
      };
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [emptyModelsSession],
      };
      const out = captureJson(report);
      expect(out.sessions).toEqual([]);
      expect(out.summary.sessionCount).toBe(0);
      expect(out.summary.completedCount).toBe(0);
      expect(out.summary.totalTokens).toBe(0);
    });

    test("completed session with all-zero token counts is excluded", () => {
      const zeroSession: NormalizedSession = {
        sessionId: "all-zero",
        eventsPath: "/some/path",
        startTime: "2026-06-02T20:00:00.000Z",
        models: {
          "claude-opus": {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
          },
        },
        chronicleTips: [],
        inProgress: false,
        source: "logs",
      };
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [zeroSession],
      };
      const out = captureJson(report);
      expect(out.sessions).toEqual([]);
      expect(out.summary.completedCount).toBe(0);
    });

    test("mixed report drops empty session but keeps session with real data", () => {
      const emptyModelsSession: NormalizedSession = {
        sessionId: "empty-models",
        eventsPath: "/some/path",
        startTime: "2026-06-02T20:00:00.000Z",
        models: {},
        chronicleTips: [],
        inProgress: false,
        source: "logs",
      };
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION, emptyModelsSession],
      };
      const out = captureJson(report);
      expect(out.sessions).toHaveLength(1);
      expect(out.sessions[0].sessionId).toBe(SAMPLE_SESSION.sessionId);
      expect(out.summary.completedCount).toBe(1);
    });
  });
});
