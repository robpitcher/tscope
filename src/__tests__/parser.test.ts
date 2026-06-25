import * as fs from "fs";
import * as path from "path";
import { parseEventsFile, readSessionStartOrFirstEventTime } from "../parser";
import { makeTmpDir, writeTempEvents } from "./helpers/fs";

describe("parser", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir("tscope-test-");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sessionStart = {
    type: "session.start",
    data: {
      sessionId: "test-session-id",
      startTime: "2026-06-02T22:58:00.000Z",
    },
    timestamp: "2026-06-02T22:58:00.100Z",
  };

  const shutdownEvent = {
    type: "session.shutdown",
    data: {
      shutdownType: "routine",
      totalPremiumRequests: 7.5,
      modelMetrics: {
        "claude-opus-4.7": {
          usage: {
            inputTokens: 243772,
            outputTokens: 2272,
            cacheReadTokens: 155776,
            cacheWriteTokens: 87988,
            reasoningTokens: 0,
          },
        },
      },
    },
    timestamp: "2026-06-02T23:06:00.000Z",
  };

  test("parses single-model session with shutdown as last line", async () => {
    const eventsPath = writeTempEvents(tmpDir, [sessionStart, shutdownEvent]);
    const session = await parseEventsFile("test-id", eventsPath);

    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;

    expect(session.startTime).toBe("2026-06-02T22:58:00.000Z");
    expect(Object.keys(session.models)).toEqual(["claude-opus-4.7"]);
    expect(session.models["claude-opus-4.7"].inputTokens).toBe(243772);
    expect(session.models["claude-opus-4.7"].outputTokens).toBe(2272);
    expect(session.models["claude-opus-4.7"].cacheReadTokens).toBe(155776);
    expect(session.models["claude-opus-4.7"].cacheWriteTokens).toBe(87988);
  });

  test("parses multi-model session", async () => {
    const multiModelShutdown = {
      type: "session.shutdown",
      data: {
        totalPremiumRequests: 10,
        modelMetrics: {
          "claude-opus-4.6-1m": {
            usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50, cacheWriteTokens: 0, reasoningTokens: 0 },
          },
          "claude-haiku-4.5": {
            usage: { inputTokens: 200, outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 0, reasoningTokens: 0 },
          },
        },
      },
      timestamp: "2026-06-02T23:06:00.000Z",
    };

    const eventsPath = writeTempEvents(tmpDir, [sessionStart, multiModelShutdown]);
    const session = await parseEventsFile("test-id", eventsPath);

    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;

    expect(Object.keys(session.models)).toHaveLength(2);
    expect(session.models["claude-opus-4.6-1m"].inputTokens).toBe(100);
    expect(session.models["claude-haiku-4.5"].inputTokens).toBe(200);
  });

  test("handles in-progress session (no shutdown event)", async () => {
    const toolEvent = {
      type: "tool.execution_complete",
      data: { toolName: "bash", exitCode: 0 },
      timestamp: "2026-06-02T23:00:00.000Z",
    };

    const eventsPath = writeTempEvents(tmpDir, [sessionStart, toolEvent]);
    const session = await parseEventsFile("test-id", eventsPath);

    expect(session.inProgress).toBe(true);
    expect(session.startTime).toBe("2026-06-02T22:58:00.000Z");
  });

  test("handles shutdown NOT on last line (fallback scan)", async () => {
    const afterShutdown = { type: "some.other.event", data: {}, timestamp: "2026-06-02T23:10:00.000Z" };
    const eventsPath = writeTempEvents(tmpDir, [sessionStart, shutdownEvent, afterShutdown]);
    const session = await parseEventsFile("test-id", eventsPath);

    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    expect(Object.keys(session.models)).toEqual(["claude-opus-4.7"]);
  });

  describe("resumed sessions (multiple shutdown events)", () => {
    const run1 = {
      type: "session.shutdown",
      data: {
        totalPremiumRequests: 15,
        modelMetrics: {
          "claude-opus-4.8": {
            usage: { inputTokens: 424135, outputTokens: 8365, cacheReadTokens: 371888, cacheWriteTokens: 51689, reasoningTokens: 1547 },
          },
        },
      },
      timestamp: "2026-06-03T15:31:39.000Z",
    };
    const resume = { type: "session.resume", data: {}, timestamp: "2026-06-03T17:36:48.000Z" };
    const run2 = {
      type: "session.shutdown",
      data: {
        totalPremiumRequests: 30,
        modelMetrics: {
          "claude-opus-4.8": {
            usage: { inputTokens: 100648, outputTokens: 56, cacheReadTokens: 50259, cacheWriteTokens: 50385, reasoningTokens: 0 },
          },
        },
      },
      timestamp: "2026-06-03T17:44:47.000Z",
    };

    test("sums per-model usage across all shutdowns", async () => {
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, run1, resume, run2]);
      const session = await parseEventsFile("resumed", eventsPath);

      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      const t = session.models["claude-opus-4.8"];
      expect(t.inputTokens).toBe(524783); // 424135 + 100648
      expect(t.outputTokens).toBe(8421); // 8365 + 56
      expect(t.cacheReadTokens).toBe(422147); // 371888 + 50259
      expect(t.cacheWriteTokens).toBe(102074); // 51689 + 50385
      expect(t.reasoningTokens).toBe(1547); // 1547 + 0
    });

    test("merges models that appear in only one run", async () => {
      const run2WithNewModel = {
        type: "session.shutdown",
        data: {
          modelMetrics: {
            "gpt-5.5": {
              usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 0, reasoningTokens: 0 },
            },
          },
        },
        timestamp: "2026-06-03T17:44:47.000Z",
      };
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, run1, resume, run2WithNewModel]);
      const session = await parseEventsFile("resumed-multi-model", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(Object.keys(session.models).sort()).toEqual(["claude-opus-4.8", "gpt-5.5"]);
      expect(session.models["claude-opus-4.8"].inputTokens).toBe(424135);
      expect(session.models["gpt-5.5"].inputTokens).toBe(1000);
    });

    test("startTime falls back to FIRST shutdown timestamp when no session.start", async () => {
      const eventsPath = writeTempEvents(tmpDir, [run1, resume, run2]);
      const session = await parseEventsFile("resumed-no-start", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.startTime).toBe("2026-06-03T15:31:39.000Z");
    });

    test("sums totalApiDurationMs across all shutdowns", async () => {
      const run1WithDuration = { ...run1, data: { ...run1.data, totalApiDurationMs: 9273 } };
      const run2WithDuration = { ...run2, data: { ...run2.data, totalApiDurationMs: 4500 } };
      const eventsPath = writeTempEvents(
        tmpDir,
        [sessionStart, run1WithDuration, resume, run2WithDuration]
      );
      const session = await parseEventsFile("resumed-duration", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.apiDurationMs).toBe(13773);
    });
  });

  describe("apiDurationMs (cumulative model API time)", () => {
    test("captures totalApiDurationMs from a single shutdown", async () => {
      const withDuration = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalApiDurationMs: 4669 },
      };
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, withDuration]);
      const session = await parseEventsFile("dur-single", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.apiDurationMs).toBe(4669);
    });

    test("apiDurationMs is undefined when no shutdown reports it", async () => {
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, shutdownEvent]);
      const session = await parseEventsFile("dur-missing", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.apiDurationMs).toBeUndefined();
    });

    test("ignores negative and non-finite duration values", async () => {
      const badShutdown1 = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalApiDurationMs: -5 },
        timestamp: "2026-06-02T23:06:01.000Z",
      };
      const goodShutdown = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalApiDurationMs: 1234 },
        timestamp: "2026-06-02T23:06:02.000Z",
      };
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, badShutdown1, goodShutdown]);
      const session = await parseEventsFile("dur-bad", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.apiDurationMs).toBe(1234);
    });
  });

  describe("totalCost (AI credits from totalNanoAiu)", () => {
    test("captures totalNanoAiu from a single shutdown as AI credits", async () => {
      const withNanoAiu = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalNanoAiu: 1_500_000_000 },
      };
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, withNanoAiu]);
      const session = await parseEventsFile("cost-single", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.totalCost).toBe(1.5);
    });

    test("sums totalNanoAiu across multiple shutdowns", async () => {
      const run1 = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalNanoAiu: 1_250_000_000 },
        timestamp: "2026-06-02T23:06:01.000Z",
      };
      const run2 = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalNanoAiu: 750_000_000 },
        timestamp: "2026-06-02T23:06:02.000Z",
      };
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, run1, run2]);
      const session = await parseEventsFile("cost-resumed", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.totalCost).toBe(2);
    });

    test("totalCost is undefined when no shutdown reports totalNanoAiu", async () => {
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, shutdownEvent]);
      const session = await parseEventsFile("cost-missing", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.totalCost).toBeUndefined();
    });

    test("ignores negative and non-numeric totalNanoAiu values", async () => {
      const badShutdown1 = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalNanoAiu: -1 },
        timestamp: "2026-06-02T23:06:01.000Z",
      };
      const badShutdown2 = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalNanoAiu: "not-a-number" },
        timestamp: "2026-06-02T23:06:02.000Z",
      };
      const goodShutdown = {
        ...shutdownEvent,
        data: { ...shutdownEvent.data, totalNanoAiu: 250_000_000 },
        timestamp: "2026-06-02T23:06:03.000Z",
      };
      const eventsPath = writeTempEvents(
        tmpDir,
        [sessionStart, badShutdown1, badShutdown2, goodShutdown]
      );
      const session = await parseEventsFile("cost-bad", eventsPath);
      expect(session.inProgress).toBe(false);
      if (session.inProgress) return;
      expect(session.totalCost).toBe(0.25);
    });
  });

  test("handles malformed lines gracefully", async () => {
    const content =
      JSON.stringify(sessionStart) +
      "\nthis is not json at all\n{broken json\n" +
      JSON.stringify(shutdownEvent) +
      "\n";
    const filePath = path.join(tmpDir, "events.jsonl");
    fs.writeFileSync(filePath, content, "utf8");

    const session = await parseEventsFile("test-id", filePath);
    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    expect(session.models["claude-opus-4.7"].inputTokens).toBe(243772);
  });

  test("handles missing usage fields with zero defaults", async () => {
    const partialShutdown = {
      type: "session.shutdown",
      data: {
        modelMetrics: {
          "claude-haiku-4.5": {
            usage: { inputTokens: 500 }, // missing other fields
          },
        },
      },
    };
    const eventsPath = writeTempEvents(tmpDir, [sessionStart, partialShutdown]);
    const session = await parseEventsFile("test-id", eventsPath);

    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    expect(session.models["claude-haiku-4.5"].inputTokens).toBe(500);
    expect(session.models["claude-haiku-4.5"].outputTokens).toBe(0);
    expect(session.models["claude-haiku-4.5"].cacheReadTokens).toBe(0);
  });

  test("handles empty file (in-progress, no crash)", async () => {
    const filePath = path.join(tmpDir, "events.jsonl");
    fs.writeFileSync(filePath, "", "utf8");
    const session = await parseEventsFile("empty-session", filePath);
    expect(session.inProgress).toBe(true);
    expect(session.startTime).toBeUndefined();
  });

  test("handles file with only whitespace lines (in-progress, no crash)", async () => {
    const filePath = path.join(tmpDir, "events.jsonl");
    fs.writeFileSync(filePath, "   \n\n   \n", "utf8");
    const session = await parseEventsFile("ws-session", filePath);
    expect(session.inProgress).toBe(true);
  });

  test("handles file with only session.start (in-progress)", async () => {
    const eventsPath = writeTempEvents(tmpDir, [sessionStart]);
    const session = await parseEventsFile("start-only", eventsPath);
    expect(session.inProgress).toBe(true);
    expect(session.startTime).toBe("2026-06-02T22:58:00.000Z");
  });

  test("startTime falls back to session.start timestamp when data.startTime missing", async () => {
    const startNoData = {
      type: "session.start",
      data: { sessionId: "x" }, // no startTime in data
      timestamp: "2026-06-02T10:00:00.000Z",
    };
    const eventsPath = writeTempEvents(tmpDir, [startNoData, shutdownEvent]);
    const session = await parseEventsFile("fallback-ts", eventsPath);
    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    expect(session.startTime).toBe("2026-06-02T10:00:00.000Z");
  });

  test("startTime falls back to shutdown timestamp when no session.start found", async () => {
    const eventsPath = writeTempEvents(tmpDir, [shutdownEvent]);
    const session = await parseEventsFile("no-start", eventsPath);
    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    // Should use shutdownEvent.timestamp as last resort
    expect(session.startTime).toBe("2026-06-02T23:06:00.000Z");
  });

  test("shutdown with empty modelMetrics produces empty models dict", async () => {
    const emptyMetricsShutdown = {
      type: "session.shutdown",
      data: { modelMetrics: {} },
      timestamp: "2026-06-02T23:06:00.000Z",
    };
    const eventsPath = writeTempEvents(tmpDir, [sessionStart, emptyMetricsShutdown]);
    const session = await parseEventsFile("empty-metrics", eventsPath);
    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    expect(Object.keys(session.models)).toHaveLength(0);
  });

  test("shutdown with null usage for a model defaults all token counts to 0", async () => {
    const nullUsageShutdown = {
      type: "session.shutdown",
      data: {
        modelMetrics: {
          "claude-haiku-4.5": {
            // no usage field at all
          },
        },
      },
      timestamp: "2026-06-02T23:06:00.000Z",
    };
    const eventsPath = writeTempEvents(tmpDir, [sessionStart, nullUsageShutdown]);
    const session = await parseEventsFile("null-usage", eventsPath);
    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    const counts = session.models["claude-haiku-4.5"];
    expect(counts.inputTokens).toBe(0);
    expect(counts.outputTokens).toBe(0);
    expect(counts.cacheReadTokens).toBe(0);
    expect(counts.cacheWriteTokens).toBe(0);
    expect(counts.reasoningTokens).toBe(0);
  });

  test("handles CRLF line endings without crashing", async () => {
    const lines = [sessionStart, shutdownEvent]
      .map((l) => JSON.stringify(l))
      .join("\r\n");
    const filePath = path.join(tmpDir, "events.jsonl");
    fs.writeFileSync(filePath, lines + "\r\n", "utf8");
    const session = await parseEventsFile("crlf-session", filePath);
    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    expect(session.models["claude-opus-4.7"].inputTokens).toBe(243772);
  });

  test("only uses first session.start found (ignores subsequent ones)", async () => {
    const secondStart = {
      type: "session.start",
      data: { sessionId: "second", startTime: "2026-06-02T23:00:00.000Z" },
      timestamp: "2026-06-02T23:00:00.000Z",
    };
    const eventsPath = writeTempEvents(tmpDir, [sessionStart, secondStart, shutdownEvent]);
    const session = await parseEventsFile("multi-start", eventsPath);
    expect(session.inProgress).toBe(false);
    if (session.inProgress) return;
    // First session.start wins
    expect(session.startTime).toBe("2026-06-02T22:58:00.000Z");
  });

  describe("chronicle tips extraction", () => {
    const chronicleUser = (variant: string, interactionId: string, timestamp: string) => ({
      type: "user.message",
      data: { content: `/chronicle ${variant}`, interactionId },
      timestamp,
    });
    const assistantMsg = (content: string, interactionId: string, timestamp: string) => ({
      type: "assistant.message",
      data: { content, interactionId },
      timestamp,
    });

    test("captures cost-tips with the final assistant response", async () => {
      const events = [
        sessionStart,
        chronicleUser("cost-tips", "iid-1", "2026-06-02T23:00:00.000Z"),
        assistantMsg("", "iid-1", "2026-06-02T23:00:05.000Z"), // tool-only turn
        assistantMsg("## Tips\n\nUse `/compact` more.", "iid-1", "2026-06-02T23:01:00.000Z"),
        shutdownEvent,
      ];
      const eventsPath = writeTempEvents(tmpDir, events);
      const session = await parseEventsFile("chron-id", eventsPath);

      expect(session.chronicleTips).toHaveLength(1);
      expect(session.chronicleTips[0].variant).toBe("cost-tips");
      expect(session.chronicleTips[0].timestamp).toBe("2026-06-02T23:00:00.000Z");
      expect(session.chronicleTips[0].markdown).toBe("## Tips\n\nUse `/compact` more.");
    });

    test("captures /chronicle tips (non-cost variant)", async () => {
      const events = [
        sessionStart,
        chronicleUser("tips", "iid-2", "2026-06-02T23:00:00.000Z"),
        assistantMsg("Here are your tips.", "iid-2", "2026-06-02T23:01:00.000Z"),
        shutdownEvent,
      ];
      const eventsPath = writeTempEvents(tmpDir, events);
      const session = await parseEventsFile("chron-tips", eventsPath);

      expect(session.chronicleTips).toHaveLength(1);
      expect(session.chronicleTips[0].variant).toBe("tips");
      expect(session.chronicleTips[0].markdown).toBe("Here are your tips.");
    });

    test("uses interactionId, not adjacency, to pair command and response", async () => {
      // An injected system-reminder user.message shares the interactionId; an
      // unrelated turn in between must not be mistaken for the response.
      const events = [
        sessionStart,
        chronicleUser("cost-tips", "iid-3", "2026-06-02T23:00:00.000Z"),
        { type: "user.message", data: { content: "<system_reminder>noise", interactionId: "iid-3" }, timestamp: "2026-06-02T23:00:10.000Z" },
        assistantMsg("FINAL TIPS", "iid-3", "2026-06-02T23:02:00.000Z"),
        shutdownEvent,
      ];
      const eventsPath = writeTempEvents(tmpDir, events);
      const session = await parseEventsFile("chron-iid", eventsPath);

      expect(session.chronicleTips).toHaveLength(1);
      expect(session.chronicleTips[0].markdown).toBe("FINAL TIPS");
    });

    test("captures multiple invocations in chronological order", async () => {
      const events = [
        sessionStart,
        chronicleUser("tips", "iid-b", "2026-06-02T23:30:00.000Z"),
        assistantMsg("second", "iid-b", "2026-06-02T23:31:00.000Z"),
        chronicleUser("cost-tips", "iid-a", "2026-06-02T23:00:00.000Z"),
        assistantMsg("first", "iid-a", "2026-06-02T23:01:00.000Z"),
        shutdownEvent,
      ];
      const eventsPath = writeTempEvents(tmpDir, events);
      const session = await parseEventsFile("chron-multi", eventsPath);

      expect(session.chronicleTips).toHaveLength(2);
      expect(session.chronicleTips.map((t) => t.markdown)).toEqual(["first", "second"]);
    });

    test("ignores invocations with no assistant response", async () => {
      const events = [
        sessionStart,
        chronicleUser("tips", "iid-x", "2026-06-02T23:00:00.000Z"),
        shutdownEvent,
      ];
      const eventsPath = writeTempEvents(tmpDir, events);
      const session = await parseEventsFile("chron-none", eventsPath);
      expect(session.chronicleTips).toHaveLength(0);
    });

    test("does not match unrelated slash commands or prose", async () => {
      const events = [
        sessionStart,
        { type: "user.message", data: { content: "/chronicle", interactionId: "iid-q" }, timestamp: "2026-06-02T23:00:00.000Z" },
        { type: "user.message", data: { content: "tell me about /chronicle tips", interactionId: "iid-r" }, timestamp: "2026-06-02T23:00:01.000Z" },
        assistantMsg("nope", "iid-q", "2026-06-02T23:00:02.000Z"),
        assistantMsg("nope2", "iid-r", "2026-06-02T23:00:03.000Z"),
        shutdownEvent,
      ];
      const eventsPath = writeTempEvents(tmpDir, events);
      const session = await parseEventsFile("chron-neg", eventsPath);
      expect(session.chronicleTips).toHaveLength(0);
    });

    test("captures tips for in-progress sessions too", async () => {
      const events = [
        sessionStart,
        chronicleUser("cost-tips", "iid-ip", "2026-06-02T23:00:00.000Z"),
        assistantMsg("in progress tips", "iid-ip", "2026-06-02T23:01:00.000Z"),
        // no shutdown event
      ];
      const eventsPath = writeTempEvents(tmpDir, events);
      const session = await parseEventsFile("chron-ip", eventsPath);
      expect(session.inProgress).toBe(true);
      expect(session.chronicleTips).toHaveLength(1);
      expect(session.chronicleTips[0].markdown).toBe("in progress tips");
    });
  });

  describe("readSessionStartOrFirstEventTime", () => {
    test("prefers session.start startTime when present", async () => {
      const eventsPath = writeTempEvents(tmpDir, [sessionStart, shutdownEvent]);
      const result = await readSessionStartOrFirstEventTime(eventsPath);
      expect(result).toBe("2026-06-02T22:58:00.000Z");
    });

    test("falls back to first event timestamp when no session.start", async () => {
      const toolEvent = {
        type: "tool.execution_complete",
        data: { toolName: "bash" },
        timestamp: "2026-06-02T18:51:05.793Z",
      };
      const eventsPath = writeTempEvents(tmpDir, [toolEvent, shutdownEvent]);
      const result = await readSessionStartOrFirstEventTime(eventsPath);
      expect(result).toBe("2026-06-02T18:51:05.793Z");
    });

    test("returns null when no event carries a timestamp", async () => {
      const noTs = { type: "tool.execution_complete", data: { toolName: "bash" } };
      const eventsPath = writeTempEvents(tmpDir, [noTs]);
      const result = await readSessionStartOrFirstEventTime(eventsPath);
      expect(result).toBeNull();
    });

    test("returns null for empty file", async () => {
      const filePath = path.join(tmpDir, "events.jsonl");
      fs.writeFileSync(filePath, "", "utf8");
      const result = await readSessionStartOrFirstEventTime(filePath);
      expect(result).toBeNull();
    });

    test("falls back to event timestamp when session.start has no data.startTime", async () => {
      const startNoData = {
        type: "session.start",
        data: {},
        timestamp: "2026-06-02T10:00:00.000Z",
      };
      const eventsPath = writeTempEvents(tmpDir, [startNoData]);
      const result = await readSessionStartOrFirstEventTime(eventsPath);
      expect(result).toBe("2026-06-02T10:00:00.000Z");
    });

    test("does not crash for malformed lines", async () => {
      const content = "not json\n" + JSON.stringify(sessionStart) + "\nalso not json\n";
      const filePath = path.join(tmpDir, "events.jsonl");
      fs.writeFileSync(filePath, content, "utf8");
      const result = await readSessionStartOrFirstEventTime(filePath);
      expect(result).toBe("2026-06-02T22:58:00.000Z");
    });

    test("returns null when file cannot be read", async () => {
      const missingPath = path.join(tmpDir, "missing-events.jsonl");
      const result = await readSessionStartOrFirstEventTime(missingPath);
      expect(result).toBeNull();
    });
  });

  describe("stream-level error semantics", () => {
    test("parseEventsFile rejects when file cannot be read", async () => {
      const missingPath = path.join(tmpDir, "missing-events.jsonl");
      await expect(parseEventsFile("missing-session", missingPath)).rejects.toThrow();
    });
  });
});
