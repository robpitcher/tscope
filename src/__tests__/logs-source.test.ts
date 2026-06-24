/**
 * LogsDataSource unit tests — Apoc Phase 4.
 *
 * Tests date-predicate filtering, in-progress session handling, predicate=undefined,
 * source provenance ("logs"), and no-cost invariants.
 */

import * as fs from "fs";
import * as path from "path";
import { LogsDataSource } from "../sources/logsSource";
import { utcToLocalDateString } from "../filter";
import { makeTmpDir } from "./helpers/fs";

/** Create a minimal valid completed events.jsonl in sessionStateDir/sessionId/. */
function createCompletedSession(
  sessionStateDir: string,
  sessionId: string,
  startTimeISO: string,
  inputTokens = 1000,
  outputTokens = 400,
  totalNanoAiu?: number
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
              inputTokens,
              outputTokens,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
            },
          },
        },
        totalApiDurationMs: 5000,
        ...(totalNanoAiu !== undefined ? { totalNanoAiu } : {}),
      },
    }),
  ];
  fs.writeFileSync(path.join(sessionDir, "events.jsonl"), lines.join("\n") + "\n", "utf8");
}

/** Create a minimal in-progress events.jsonl (no session.shutdown). */
function createInProgressSession(
  sessionStateDir: string,
  sessionId: string,
  startTimeISO: string
): void {
  const sessionDir = path.join(sessionStateDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, "events.jsonl"),
    JSON.stringify({
      type: "session.start",
      data: { sessionId, startTime: startTimeISO },
      timestamp: startTimeISO,
    }) + "\n",
    "utf8"
  );
}

describe("LogsDataSource", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // loadSessions — basic behavior
  // ---------------------------------------------------------------------------

  describe("loadSessions", () => {
    test("returns empty array when session-state dir is empty", async () => {
      const src = new LogsDataSource(tmpDir);
      const sessions = await src.loadSessions();
      expect(sessions).toEqual([]);
    });

    test("returns empty array when session-state dir does not exist", async () => {
      const src = new LogsDataSource(path.join(tmpDir, "nonexistent"));
      const sessions = await src.loadSessions();
      expect(sessions).toEqual([]);
    });

    test("returns completed sessions when present", async () => {
      createCompletedSession(tmpDir, "sess-abc", "2026-06-10T12:00:00.000Z");
      const src = new LogsDataSource(tmpDir);
      const sessions = await src.loadSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe("sess-abc");
    });

    test("excludes in-progress sessions from loadSessions result", async () => {
      createInProgressSession(tmpDir, "sess-inprogress", "2026-06-10T12:00:00.000Z");
      const src = new LogsDataSource(tmpDir);
      const sessions = await src.loadSessions();
      expect(sessions).toHaveLength(0);
    });

    test("date predicate keeps matching sessions and excludes non-matching ones", async () => {
      const recentISO = "2026-06-10T12:00:00.000Z";
      const oldISO = "2026-06-01T12:00:00.000Z";
      createCompletedSession(tmpDir, "sess-recent", recentISO);
      createCompletedSession(tmpDir, "sess-old", oldISO);

      const recentLocalDate = utcToLocalDateString(recentISO);
      const oldLocalDate = utcToLocalDateString(oldISO);
      // Sanity: the two dates must be different for the test to be meaningful
      expect(recentLocalDate).not.toBe(oldLocalDate);

      const sessions = await new LogsDataSource(tmpDir).loadSessions(
        (localDate) => localDate === recentLocalDate
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe("sess-recent");
    });

    test("predicate returning false for all sessions returns empty array", async () => {
      createCompletedSession(tmpDir, "sess-A", "2026-06-10T12:00:00.000Z");
      createCompletedSession(tmpDir, "sess-B", "2026-06-09T12:00:00.000Z");

      const sessions = await new LogsDataSource(tmpDir).loadSessions(() => false);
      expect(sessions).toHaveLength(0);
    });

    test("predicate = undefined returns all completed sessions", async () => {
      createCompletedSession(tmpDir, "sess-A", "2026-06-10T12:00:00.000Z");
      createCompletedSession(tmpDir, "sess-B", "2026-06-09T12:00:00.000Z");
      createCompletedSession(tmpDir, "sess-C", "2026-06-01T12:00:00.000Z");

      const sessions = await new LogsDataSource(tmpDir).loadSessions(undefined);
      expect(sessions).toHaveLength(3);
    });

    test("omitted predicate returns all completed sessions", async () => {
      createCompletedSession(tmpDir, "sess-X", "2026-06-05T12:00:00.000Z");
      createCompletedSession(tmpDir, "sess-Y", "2026-06-06T12:00:00.000Z");

      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      expect(sessions).toHaveLength(2);
    });

    test("mixed completed and in-progress: loadSessions returns only completed", async () => {
      createCompletedSession(tmpDir, "done-1", "2026-06-10T12:00:00.000Z");
      createInProgressSession(tmpDir, "wip-1", "2026-06-10T11:00:00.000Z");

      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe("done-1");
    });
  });

  // ---------------------------------------------------------------------------
  // loadAll — completed + in-progress separation
  // ---------------------------------------------------------------------------

  describe("loadAll", () => {
    test("returns completed sessions in the completed field", async () => {
      createCompletedSession(tmpDir, "sess-done", "2026-06-10T12:00:00.000Z");
      const { completed, inProgress } = await new LogsDataSource(tmpDir).loadAll();
      expect(completed).toHaveLength(1);
      expect(inProgress).toHaveLength(0);
    });

    test("returns in-progress sessions in the inProgress field", async () => {
      createInProgressSession(tmpDir, "sess-wip", "2026-06-10T12:00:00.000Z");
      const { completed, inProgress } = await new LogsDataSource(tmpDir).loadAll();
      expect(completed).toHaveLength(0);
      expect(inProgress).toHaveLength(1);
    });

    test("separates completed and in-progress in mixed directory", async () => {
      createCompletedSession(tmpDir, "done-1", "2026-06-10T09:00:00.000Z");
      createCompletedSession(tmpDir, "done-2", "2026-06-10T10:00:00.000Z");
      createInProgressSession(tmpDir, "wip-1", "2026-06-10T11:00:00.000Z");
      createInProgressSession(tmpDir, "wip-2", "2026-06-10T12:00:00.000Z");

      const { completed, inProgress } = await new LogsDataSource(tmpDir).loadAll();
      expect(completed).toHaveLength(2);
      expect(inProgress).toHaveLength(2);
    });

    test("loadAll with predicate = undefined returns all sessions", async () => {
      createCompletedSession(tmpDir, "done-A", "2026-06-08T12:00:00.000Z");
      createCompletedSession(tmpDir, "done-B", "2026-06-09T12:00:00.000Z");
      createInProgressSession(tmpDir, "wip-C", "2026-06-10T12:00:00.000Z");

      const { completed, inProgress } = await new LogsDataSource(tmpDir).loadAll(undefined);
      expect(completed).toHaveLength(2);
      expect(inProgress).toHaveLength(1);
    });

    test("loadAll with date predicate filters both completed and in-progress", async () => {
      const recentISO = "2026-06-10T12:00:00.000Z";
      const oldISO = "2026-06-01T12:00:00.000Z";
      createCompletedSession(tmpDir, "done-recent", recentISO);
      createCompletedSession(tmpDir, "done-old", oldISO);
      createInProgressSession(tmpDir, "wip-recent", recentISO);
      createInProgressSession(tmpDir, "wip-old", oldISO);

      const recentLocalDate = utcToLocalDateString(recentISO);

      const { completed, inProgress } = await new LogsDataSource(tmpDir).loadAll(
        (d) => d === recentLocalDate
      );
      expect(completed).toHaveLength(1);
      expect(completed[0].sessionId).toBe("done-recent");
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].sessionId).toBe("wip-recent");
    });

    test("in-progress sessions have inProgress: true", async () => {
      createInProgressSession(tmpDir, "wip-sess", "2026-06-10T12:00:00.000Z");
      const { inProgress } = await new LogsDataSource(tmpDir).loadAll();
      expect(inProgress[0].inProgress).toBe(true);
    });

    test("loadAll with predicate returning false excludes all sessions", async () => {
      createCompletedSession(tmpDir, "done-1", "2026-06-10T12:00:00.000Z");
      createInProgressSession(tmpDir, "wip-1", "2026-06-10T12:00:00.000Z");

      const { completed, inProgress } = await new LogsDataSource(tmpDir).loadAll(() => false);
      expect(completed).toHaveLength(0);
      expect(inProgress).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Source provenance and cost data
  // ---------------------------------------------------------------------------

  describe("source provenance and logs cost fields", () => {
    test("completed sessions have source: 'logs'", async () => {
      createCompletedSession(tmpDir, "sess-1", "2026-06-10T12:00:00.000Z");
      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      expect(sessions[0].source).toBe("logs");
    });

    test("logs sessions have no modelCosts field (undefined, not null)", async () => {
      createCompletedSession(tmpDir, "sess-1", "2026-06-10T12:00:00.000Z");
      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      expect(sessions[0].modelCosts).toBeUndefined();
    });

    test("logs sessions have no totalCost field (undefined, not null)", async () => {
      createCompletedSession(tmpDir, "sess-1", "2026-06-10T12:00:00.000Z");
      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      expect(sessions[0].totalCost).toBeUndefined();
    });

    test("logs sessions include totalCost when totalNanoAiu is present", async () => {
      createCompletedSession(
        tmpDir,
        "sess-with-cost",
        "2026-06-10T12:00:00.000Z",
        1000,
        400,
        1_750_000_000
      );
      createCompletedSession(tmpDir, "sess-without-cost", "2026-06-10T13:00:00.000Z");

      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      const withCost = sessions.find((s) => s.sessionId === "sess-with-cost");
      const withoutCost = sessions.find((s) => s.sessionId === "sess-without-cost");

      expect(withCost?.source).toBe("logs");
      expect(withCost?.totalCost).toBe(1.75);
      expect(withoutCost?.source).toBe("logs");
      expect(withoutCost?.totalCost).toBeUndefined();
    });

    test("logs sessions have no extended field", async () => {
      createCompletedSession(tmpDir, "sess-1", "2026-06-10T12:00:00.000Z");
      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      expect(sessions[0].extended).toBeUndefined();
    });

    test("all completed sessions in a multi-session run have source: 'logs'", async () => {
      createCompletedSession(tmpDir, "sess-1", "2026-06-10T12:00:00.000Z");
      createCompletedSession(tmpDir, "sess-2", "2026-06-09T12:00:00.000Z");
      createCompletedSession(tmpDir, "sess-3", "2026-06-08T12:00:00.000Z");

      const sessions = await new LogsDataSource(tmpDir).loadSessions();
      expect(sessions).toHaveLength(3);
      for (const s of sessions) {
        expect(s.source).toBe("logs");
        expect(s.modelCosts).toBeUndefined();
        expect(s.totalCost).toBeUndefined();
        expect(s.extended).toBeUndefined();
      }
    });

    test("logs session token counts are preserved from events.jsonl", async () => {
      createCompletedSession(tmpDir, "sess-tokens", "2026-06-10T12:00:00.000Z", 1234, 567);
      const sessions = await new LogsDataSource(tmpDir).loadSessions();

      expect(sessions[0].models["gpt-4"].inputTokens).toBe(1234);
      expect(sessions[0].models["gpt-4"].outputTokens).toBe(567);
    });
  });
});
