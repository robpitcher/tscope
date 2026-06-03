import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { discoverSessions, getSessionStateDir } from "../discovery";
import { SessionRef } from "../types";

/** Create a valid session folder with an events.jsonl under the given base directory */
function makeSession(baseDir: string, sessionId: string): string {
  const sessionDir = path.join(baseDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "events.jsonl"), "", "utf8");
  return sessionDir;
}

describe("discovery", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tscope-discovery-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── getSessionStateDir ────────────────────────────────────────────────────

  describe("getSessionStateDir", () => {
    test("returns a path under the user home directory", () => {
      const dir = getSessionStateDir();
      const home = os.homedir();
      expect(dir.startsWith(home)).toBe(true);
    });

    test("path ends with .copilot/session-state or .copilot\\session-state", () => {
      const dir = getSessionStateDir();
      expect(dir).toMatch(/[/\\]\.copilot[/\\]session-state$/);
    });
  });

  // ── discoverSessions ──────────────────────────────────────────────────────

  describe("discoverSessions", () => {
    test("returns empty array for non-existent directory", () => {
      const nonExistent = path.join(tmpDir, "does-not-exist");
      expect(discoverSessions(nonExistent)).toEqual([]);
    });

    test("returns empty array for empty directory", () => {
      expect(discoverSessions(tmpDir)).toEqual([]);
    });

    test("returns empty array when directory has no subdirectories with events.jsonl", () => {
      // Create a subdirectory with no events.jsonl
      fs.mkdirSync(path.join(tmpDir, "session-no-events"));
      expect(discoverSessions(tmpDir)).toEqual([]);
    });

    test("ignores regular files in the session-state directory", () => {
      // Files at root level (not directories) should be ignored
      fs.writeFileSync(path.join(tmpDir, "events.jsonl"), "", "utf8");
      fs.writeFileSync(path.join(tmpDir, "readme.txt"), "hi", "utf8");
      expect(discoverSessions(tmpDir)).toEqual([]);
    });

    test("discovers a single valid session", () => {
      makeSession(tmpDir, "abc-123");
      const results = discoverSessions(tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("abc-123");
      expect(results[0].eventsPath).toBe(
        path.join(tmpDir, "abc-123", "events.jsonl")
      );
    });

    test("discovers multiple valid sessions", () => {
      makeSession(tmpDir, "session-1");
      makeSession(tmpDir, "session-2");
      makeSession(tmpDir, "session-3");
      const results = discoverSessions(tmpDir);
      expect(results).toHaveLength(3);
      const ids = results.map((r) => r.sessionId).sort();
      expect(ids).toEqual(["session-1", "session-2", "session-3"]);
    });

    test("ignores session folders without events.jsonl", () => {
      makeSession(tmpDir, "good-session");
      // Bad session — has a directory but no events.jsonl
      fs.mkdirSync(path.join(tmpDir, "bad-session"));
      const results = discoverSessions(tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("good-session");
    });

    test("eventsPath points to events.jsonl inside session folder", () => {
      makeSession(tmpDir, "7d15eea1-4d69-49e9-bb21-8370594afd6a");
      const results = discoverSessions(tmpDir);
      expect(results[0].eventsPath).toContain("events.jsonl");
      expect(fs.existsSync(results[0].eventsPath)).toBe(true);
    });

    test("applies a single predicate to filter results", () => {
      makeSession(tmpDir, "keep-me");
      makeSession(tmpDir, "skip-me");

      const onlyKeepMe = (ref: SessionRef) => ref.sessionId === "keep-me";
      const results = discoverSessions(tmpDir, [onlyKeepMe]);
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("keep-me");
    });

    test("applies multiple predicates (ALL must match)", () => {
      makeSession(tmpDir, "alpha-keep");
      makeSession(tmpDir, "beta-keep");
      makeSession(tmpDir, "alpha-skip");

      const startsWithAlpha = (ref: SessionRef) => ref.sessionId.startsWith("alpha");
      const endsWithKeep = (ref: SessionRef) => ref.sessionId.endsWith("keep");

      const results = discoverSessions(tmpDir, [startsWithAlpha, endsWithKeep]);
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("alpha-keep");
    });

    test("returns all sessions when no predicates provided", () => {
      makeSession(tmpDir, "s1");
      makeSession(tmpDir, "s2");
      const results = discoverSessions(tmpDir, []);
      expect(results).toHaveLength(2);
    });

    test("returns all sessions when predicates array is undefined", () => {
      makeSession(tmpDir, "s1");
      makeSession(tmpDir, "s2");
      const results = discoverSessions(tmpDir, undefined);
      expect(results).toHaveLength(2);
    });

    test("predicate that rejects all returns empty array", () => {
      makeSession(tmpDir, "s1");
      makeSession(tmpDir, "s2");
      const rejectAll = (_ref: SessionRef) => false;
      expect(discoverSessions(tmpDir, [rejectAll])).toEqual([]);
    });

    test("sessionId matches directory name (not full path)", () => {
      const name = "conv-7d15eea1-4d69-49e9-bb21";
      makeSession(tmpDir, name);
      const results = discoverSessions(tmpDir);
      expect(results[0].sessionId).toBe(name);
    });
  });
});
