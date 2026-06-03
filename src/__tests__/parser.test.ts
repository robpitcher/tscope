import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseEventsFile } from "../parser";

/** Write a JSONL events file to a temp directory for testing */
function writeTempEvents(tmpDir: string, lines: object[]): string {
  const filePath = path.join(tmpDir, "events.jsonl");
  const content = lines.map((l) => JSON.stringify(l)).join("\n");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("parser", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tscope-test-"));
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
    expect(session.totalPremiumRequests).toBe(7.5);
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
});
