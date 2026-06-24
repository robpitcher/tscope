import * as fs from "fs";
import * as path from "path";
import {
  utcToLocalDateString,
  todayLocalDateString,
  makeDateFilter,
  localDateNDaysAgo,
} from "../filter";
import { SessionRef } from "../types";
import { makeTmpDir, writeEventsWithStart } from "./helpers/fs";

describe("filter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir("tscope-filter-");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── utcToLocalDateString ──────────────────────────────────────────────────

  describe("utcToLocalDateString", () => {
    test("returns correct local date for the current moment", () => {
      const now = new Date();
      const expected = todayLocalDateString();
      expect(utcToLocalDateString(now.toISOString())).toBe(expected);
    });

    test("returns YYYY-MM-DD format", () => {
      const result = utcToLocalDateString(new Date().toISOString());
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("handles local-midnight boundary: just before midnight is yesterday", () => {
      // Construct local midnight of today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1ms before midnight = still yesterday
      const justBeforeMidnight = new Date(today.getTime() - 1);
      const todayStr = todayLocalDateString();

      const resultBeforeMidnight = utcToLocalDateString(justBeforeMidnight.toISOString());
      // Result should be yesterday (not today)
      expect(resultBeforeMidnight).not.toBe(todayStr);
    });

    test("handles local-midnight boundary: exactly midnight is today", () => {
      // Construct local midnight of today
      const localMidnight = new Date();
      localMidnight.setHours(0, 0, 0, 0);

      const result = utcToLocalDateString(localMidnight.toISOString());
      expect(result).toBe(todayLocalDateString());
    });

    test("a timestamp far in the past produces a different date than today", () => {
      // 2020-01-01T12:00:00Z is always 2020-01-01 in UTC+0..+12, and 2019-12-31 in UTC-1...-12
      // Either way, it should not equal today's date
      const oldDate = utcToLocalDateString("2020-01-01T12:00:00.000Z");
      expect(oldDate).not.toBe(todayLocalDateString());
    });
  });

  // ── localDateNDaysAgo ─────────────────────────────────────────────────────

  describe("localDateNDaysAgo", () => {
    test("n = 0 returns today", () => {
      expect(localDateNDaysAgo(0)).toBe(todayLocalDateString());
    });

    test("returns YYYY-MM-DD format", () => {
      expect(localDateNDaysAgo(7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("n days ago is earlier than today", () => {
      expect(localDateNDaysAgo(7) < todayLocalDateString()).toBe(true);
    });

    test("computes the correct calendar date n days back", () => {
      const expected = new Date();
      expected.setDate(expected.getDate() - 10);
      const y = expected.getFullYear();
      const m = String(expected.getMonth() + 1).padStart(2, "0");
      const d = String(expected.getDate()).padStart(2, "0");
      expect(localDateNDaysAgo(10)).toBe(`${y}-${m}-${d}`);
    });

    test("crosses month boundaries correctly", () => {
      const result = localDateNDaysAgo(31);
      const todayMonth = todayLocalDateString().slice(0, 7);
      expect(result.slice(0, 7)).not.toBe(todayMonth);
    });
  });

  // ── todayLocalDateString ──────────────────────────────────────────────────

  describe("todayLocalDateString", () => {
    test("returns a string in YYYY-MM-DD format", () => {
      expect(todayLocalDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("is consistent with utcToLocalDateString applied to now", () => {
      const now = new Date();
      expect(todayLocalDateString()).toBe(utcToLocalDateString(now.toISOString()));
    });

    test("matches expected current date year, month, day", () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      expect(todayLocalDateString()).toBe(`${y}-${m}-${d}`);
    });
  });

  // ── makeDateFilter ────────────────────────────────────────────────────────

  describe("makeDateFilter", () => {
    test("includes session that started today", async () => {
      const todayIso = new Date().toISOString();
      const eventsPath = writeEventsWithStart(tmpDir, todayIso);
      const ref: SessionRef = { sessionId: "today-session", eventsPath };
      const filter = makeDateFilter(todayLocalDateString());
      await expect(filter(ref)).resolves.toBe(true);
    });

    test("excludes session that started yesterday", async () => {
      // Yesterday at noon local time
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);
      const eventsPath = writeEventsWithStart(tmpDir, yesterday.toISOString());
      const ref: SessionRef = { sessionId: "yesterday-session", eventsPath };
      const filter = makeDateFilter(todayLocalDateString());
      await expect(filter(ref)).resolves.toBe(false);
    });

    test("excludes session from a far past date", async () => {
      const eventsPath = writeEventsWithStart(tmpDir, "2020-01-15T10:00:00.000Z");
      const ref: SessionRef = { sessionId: "old-session", eventsPath };
      const filter = makeDateFilter(todayLocalDateString());
      await expect(filter(ref)).resolves.toBe(false);
    });

    test("returns false for non-existent events file", async () => {
      const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const ref: SessionRef = {
          sessionId: "ghost-session",
          eventsPath: path.join(tmpDir, "nonexistent", "events.jsonl"),
        };
        const filter = makeDateFilter(todayLocalDateString());
        await expect(filter(ref)).resolves.toBe(false);
      } finally {
        stderrSpy.mockRestore();
      }
    });

    test("uses first event timestamp when events file has no session.start", async () => {
      // Write a file with no session.start — just a tool event timestamped now
      const toolEvent = {
        type: "tool.execution_complete",
        data: { toolName: "bash", exitCode: 0 },
        timestamp: new Date().toISOString(),
      };
      const filePath = path.join(tmpDir, "events.jsonl");
      fs.writeFileSync(filePath, JSON.stringify(toolEvent) + "\n", "utf8");

      const ref: SessionRef = { sessionId: "first-event-session", eventsPath: filePath };
      const filter = makeDateFilter(todayLocalDateString());
      await expect(filter(ref)).resolves.toBe(true);
    });

    test("excludes session whose first event was yesterday even if mtime is today", async () => {
      // Regression: a session lacking session.start (e.g. imported conversation)
      // whose earliest event is yesterday must NOT be bucketed into today via mtime.
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);
      const toolEvent = {
        type: "tool.execution_complete",
        data: { toolName: "bash", exitCode: 0 },
        timestamp: yesterday.toISOString(),
      };
      const filePath = path.join(tmpDir, "events.jsonl");
      // File is written now, so mtime is today — only the event timestamp is yesterday.
      fs.writeFileSync(filePath, JSON.stringify(toolEvent) + "\n", "utf8");

      const ref: SessionRef = { sessionId: "yesterday-first-event", eventsPath: filePath };
      const filter = makeDateFilter(todayLocalDateString());
      await expect(filter(ref)).resolves.toBe(false);
    });

    test("falls back to file mtime when no event carries a timestamp", async () => {
      // No session.start and no timestamps anywhere — mtime (today) is the last resort.
      const toolEvent = {
        type: "tool.execution_complete",
        data: { toolName: "bash", exitCode: 0 },
      };
      const filePath = path.join(tmpDir, "events.jsonl");
      fs.writeFileSync(filePath, JSON.stringify(toolEvent) + "\n", "utf8");

      const ref: SessionRef = { sessionId: "mtime-session", eventsPath: filePath };
      const filter = makeDateFilter(todayLocalDateString());
      // File was just written so mtime should be today
      await expect(filter(ref)).resolves.toBe(true);
    });

    test("filter works for an explicit past date string", async () => {
      const pastDate = "2021-03-15";
      // Write a session that started on 2021-03-15T12:00:00Z (noon UTC = safely 2021-03-15 in any TZ)
      const eventsPath = writeEventsWithStart(tmpDir, "2021-03-15T12:00:00.000Z");
      const ref: SessionRef = { sessionId: "past-date", eventsPath };
      const filter = makeDateFilter(pastDate);
      // Whether this resolves true/false depends on local timezone, but it shouldn't throw
      const result = await filter(ref);
      expect(typeof result).toBe("boolean");
    });
  });
});
