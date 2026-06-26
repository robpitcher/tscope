import * as fs from "fs";
import * as path from "path";
import * as parser from "../parser";
import { LogsDataSource } from "../sources/logsSource";
import { utcToLocalDateString } from "../filter";
import { makeTmpDir } from "./helpers/fs";

function createCompletedSession(
  sessionStateDir: string,
  sessionId: string,
  startTimeISO: string
): void {
  const sessionDir = path.join(sessionStateDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session.start",
      data: { sessionId, startTime: startTimeISO },
      timestamp: startTimeISO,
    }),
    JSON.stringify({
      type: "session.shutdown",
      data: {
        modelMetrics: {
          "gpt-4": {
            usage: {
              inputTokens: 1000,
              outputTokens: 300,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
            },
          },
        },
      },
    }),
  ];
  fs.writeFileSync(path.join(sessionDir, "events.jsonl"), lines.join("\n") + "\n", "utf8");
}

describe("LogsDataSource edge behavior", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir("tscope-logs-edges-");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test("date filtering falls back to events file mtime when start time is unavailable", async () => {
    createCompletedSession(tmpDir, "mtime-fallback", "2026-06-10T12:00:00.000Z");
    const eventsPath = path.join(tmpDir, "mtime-fallback", "events.jsonl");
    const mtime = new Date("2026-01-15T12:00:00.000Z");
    fs.utimesSync(eventsPath, mtime, mtime);
    const targetLocalDate = utcToLocalDateString(mtime.toISOString());

    jest
      .spyOn(parser, "readSessionStartOrFirstEventTime")
      .mockResolvedValue(null);

    const sessions = await new LogsDataSource(tmpDir).loadSessions((localDate) => localDate === targetLocalDate);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("mtime-fallback");
  });

  test("parse failures are warned and skipped while other sessions still load", async () => {
    createCompletedSession(tmpDir, "good-session", "2026-06-10T12:00:00.000Z");
    createCompletedSession(tmpDir, "bad-session", "2026-06-10T13:00:00.000Z");

    const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    const parseEventsActual = parser.parseEventsFile;
    jest.spyOn(parser, "parseEventsFile").mockImplementation(async (sessionId, eventsPath) => {
      if (sessionId === "bad-session") {
        throw new Error("synthetic parse failure");
      }
      return parseEventsActual(sessionId, eventsPath);
    });

    const sessions = await new LogsDataSource(tmpDir).loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("good-session");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("failed to parse session bad-session"));
  });

  test("sessions are skipped when date cannot be resolved from start time or file stat", async () => {
    createCompletedSession(tmpDir, "undated", "2026-06-10T12:00:00.000Z");
    const eventsPath = path.join(tmpDir, "undated", "events.jsonl");

    const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    jest.spyOn(parser, "readSessionStartOrFirstEventTime").mockImplementation(async () => {
      fs.rmSync(eventsPath, { force: true });
      return null;
    });

    const sessions = await new LogsDataSource(tmpDir).loadSessions(() => true);
    expect(sessions).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("could not determine date for session undated"));
  });

  test("loadAll applies predicate consistently to completed and in-progress sessions", async () => {
    createCompletedSession(tmpDir, "done-old", "2026-06-01T12:00:00.000Z");
    createCompletedSession(tmpDir, "done-new", "2026-06-10T12:00:00.000Z");

    const inProgressDir = path.join(tmpDir, "wip-new");
    fs.mkdirSync(inProgressDir, { recursive: true });
    fs.writeFileSync(
      path.join(inProgressDir, "events.jsonl"),
      JSON.stringify({
        type: "session.start",
        data: { sessionId: "wip-new", startTime: "2026-06-10T12:10:00.000Z" },
        timestamp: "2026-06-10T12:10:00.000Z",
      }) + "\n",
      "utf8"
    );

    const wanted = utcToLocalDateString("2026-06-10T12:00:00.000Z");
    const result = await new LogsDataSource(tmpDir).loadAll((d) => d === wanted);

    expect(result.completed.map((s) => s.sessionId)).toEqual(["done-new"]);
    expect(result.inProgress.map((s) => s.sessionId)).toEqual(["wip-new"]);
  });
});
