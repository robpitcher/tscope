/**
 * Tests for JsonRenderer — verifies JSON shape, field types, and edge cases.
 * Schema: tscope/report/v3 (totalTokens = input+output; cache is part of input)
 */

import { JsonRenderer } from "../render/JsonRenderer";
import { Report, ParsedSession, InProgressSession } from "../types";

/** Capture stdout output from a renderer call */
function captureOutput(report: Report): string {
  const chunks: string[] = [];
  jest.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  const renderer = new JsonRenderer();
  renderer.render(report);
  (process.stdout.write as jest.Mock).mockRestore();
  return chunks.join("");
}

/** Parse the captured output as JSON */
function captureJson(report: Report): ReturnType<typeof JSON.parse> {
  return JSON.parse(captureOutput(report));
}

const EMPTY_REPORT: Report = {
  sessions: [],
  inProgressSessions: [],
  reportDate: "2026-06-02",
  filterDescription: "today",
};

const SAMPLE_SESSION: ParsedSession = {
  sessionId: "abc-00000000-1111-2222-3333-444444444444",
  eventsPath: "/home/user/.copilot/session-state/abc/events.jsonl",
  startTime: "2026-06-02T20:00:00.000Z",
  models: {
    "claude-sonnet-4-5": {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 100,
      reasoningTokens: 50,
    },
    "claude-haiku-4-5": {
      inputTokens: 300,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    },
  },
  totalPremiumRequests: 5,
  chronicleTips: [],
  inProgress: false,
};

const SAMPLE_IN_PROGRESS: InProgressSession = {
  sessionId: "xyz-99999999-8888-7777-6666-555555555555",
  eventsPath: "/home/user/.copilot/session-state/xyz/events.jsonl",
  startTime: "2026-06-02T21:00:00.000Z",
  chronicleTips: [],
  inProgress: true,
};

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
    test("includes schema field with v3 value", () => {
      const out = captureJson(EMPTY_REPORT);
      expect(out.schema).toBe("tscope/report/v3");
    });

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

    test("counts completed and in-progress correctly", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      };
      const out = captureJson(report);
      expect(out.summary.sessionCount).toBe(2);
      expect(out.summary.completedCount).toBe(1);
      expect(out.summary.inProgressCount).toBe(1);
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

    test("session has premiumRequests field", () => {
      expect(sessionOut.premiumRequests).toBe(5);
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
      expect(model.usage.cacheRead).toBe(200);
      expect(model.usage.cacheWrite).toBe(100);
      expect(model.usage.reasoning).toBe(50);
    });

    test("session totals sum across all models (no credit fields)", () => {
      const totals = sessionOut.totals;
      expect(totals.input).toBe(1300); // 1000 + 300
      expect(totals.output).toBe(600); // 500 + 100
      expect(totals.cacheRead).toBe(200);
      expect(totals.cacheWrite).toBe(100);
      expect(totals.reasoning).toBe(50);
      expect(totals.total).toBe(1900); // input + output (cache is part of input)
      // No credit fields in totals
      expect(totals.estimatedCredits).toBeUndefined();
      expect(totals.hasUnknownRates).toBeUndefined();
    });
  });

  describe("in-progress session shape", () => {
    let sessionOut: ReturnType<typeof JSON.parse>;

    beforeEach(() => {
      const report: Report = {
        ...EMPTY_REPORT,
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      };
      const out = captureJson(report);
      sessionOut = out.sessions[0];
    });

    test("sessionId is correct", () => {
      expect(sessionOut.sessionId).toBe(SAMPLE_IN_PROGRESS.sessionId);
    });

    test("inProgress is true", () => {
      expect(sessionOut.inProgress).toBe(true);
    });

    test("models array is empty", () => {
      expect(sessionOut.models).toEqual([]);
    });

    test("totals are zeroed", () => {
      expect(sessionOut.totals.input).toBe(0);
    });

    test("premiumRequests is null for in-progress session", () => {
      expect(sessionOut.premiumRequests).toBeNull();
    });

    test("startTime is ISO string when available", () => {
      expect(sessionOut.startTime).toBe(SAMPLE_IN_PROGRESS.startTime);
    });

    test("in-progress session with no startTime has null startTime and localDateTime", () => {
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
      expect(out.sessions[0].startTime).toBeNull();
      expect(out.sessions[0].localDateTime).toBeNull();
    });
  });

  describe("sessions array ordering", () => {
    test("completed sessions appear before in-progress sessions", () => {
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION],
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      };
      const out = captureJson(report);
      expect(out.sessions[0].inProgress).toBe(false);
      expect(out.sessions[1].inProgress).toBe(true);
    });
  });

  describe("JSON output ends with newline", () => {
    test("output string ends with newline character", () => {
      const raw = captureOutput(EMPTY_REPORT);
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

  describe("zero-token session", () => {
    test("session with no models has zero totalTokens contribution", () => {
      const emptyModelsSession: ParsedSession = {
        sessionId: "empty-models",
        eventsPath: "/some/path",
        startTime: "2026-06-02T20:00:00.000Z",
        models: {},
        totalPremiumRequests: 0,
        chronicleTips: [],
        inProgress: false,
      };
      const report: Report = {
        ...EMPTY_REPORT,
        sessions: [emptyModelsSession],
      };
      const out = captureJson(report);
      expect(out.summary.totalTokens).toBe(0);
      expect(out.sessions[0].premiumRequests).toBe(0);
    });
  });
});
