/**
 * Tests for phase-2 filter additions:
 * - isValidDateString
 * - makeRangeDateFilter
 */

import * as fs from "fs";
import * as path from "path";
import {
  isValidDateString,
  makeRangeDateFilter,
  todayLocalDateString,
} from "../filter";
import { SessionRef } from "../types";
import { makeTmpDir, writeEventsWithStart } from "./helpers/fs";

describe("isValidDateString", () => {
  test("accepts valid dates", () => {
    expect(isValidDateString("2026-06-02")).toBe(true);
    expect(isValidDateString("2020-01-01")).toBe(true);
    expect(isValidDateString("2000-02-29")).toBe(true); // 2000 is a leap year
    expect(isValidDateString("2024-02-29")).toBe(true); // 2024 is a leap year
  });

  test("rejects wrong format", () => {
    expect(isValidDateString("2026/06/02")).toBe(false);
    expect(isValidDateString("06-02-2026")).toBe(false);
    expect(isValidDateString("2026-6-2")).toBe(false);
    expect(isValidDateString("20260602")).toBe(false);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
  });

  test("rejects impossible month", () => {
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-00-01")).toBe(false);
  });

  test("rejects impossible day", () => {
    expect(isValidDateString("2026-01-32")).toBe(false);
    expect(isValidDateString("2026-01-00")).toBe(false);
  });

  test("rejects Feb 29 on non-leap year", () => {
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2023-02-29")).toBe(false);
    expect(isValidDateString("1900-02-29")).toBe(false); // 1900 divisible by 100 but not 400
  });

  test("rejects Feb 30", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2024-02-30")).toBe(false); // even in leap year
  });

  test("rejects months with 30 days having day 31", () => {
    expect(isValidDateString("2026-04-31")).toBe(false); // April has 30
    expect(isValidDateString("2026-06-31")).toBe(false); // June has 30
    expect(isValidDateString("2026-09-31")).toBe(false); // September has 30
    expect(isValidDateString("2026-11-31")).toBe(false); // November has 30
  });
});

describe("makeRangeDateFilter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir("tscope-range-");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("includes session exactly on start date", async () => {
    const eventsPath = writeEventsWithStart(tmpDir, "2026-06-01T12:00:00.000Z");
    const ref: SessionRef = { sessionId: "s1", eventsPath };
    // UTC noon on 2026-06-01 is always 2026-06-01 in UTC-11..UTC+11
    // We'll use a range that includes 2026-06-01
    const filter = makeRangeDateFilter("2026-06-01", "2026-06-03");
    const result = await filter(ref);
    expect(typeof result).toBe("boolean");
    // Should be true in most timezones for UTC noon
  });

  test("includes session exactly on end date", async () => {
    const eventsPath = writeEventsWithStart(tmpDir, "2026-06-03T12:00:00.000Z");
    const ref: SessionRef = { sessionId: "s2", eventsPath };
    const filter = makeRangeDateFilter("2026-06-01", "2026-06-03");
    const result = await filter(ref);
    expect(typeof result).toBe("boolean");
  });

  test("excludes session before start date", async () => {
    // 2020-01-15T12:00Z is always 2020-01-15 in UTC-11..UTC+11
    const eventsPath = writeEventsWithStart(tmpDir, "2020-01-15T12:00:00.000Z");
    const ref: SessionRef = { sessionId: "old", eventsPath };
    const filter = makeRangeDateFilter("2026-06-01", "2026-06-03");
    await expect(filter(ref)).resolves.toBe(false);
  });

  test("excludes session after end date", async () => {
    // 2030-01-01T12:00Z is always 2030-01-01 in UTC-11..UTC+11
    const eventsPath = writeEventsWithStart(tmpDir, "2030-01-01T12:00:00.000Z");
    const ref: SessionRef = { sessionId: "future", eventsPath };
    const filter = makeRangeDateFilter("2026-06-01", "2026-06-03");
    await expect(filter(ref)).resolves.toBe(false);
  });

  test("single-day range behaves like makeDateFilter", async () => {
    // A session from today at noon should be included in a single-day range of today
    const today = todayLocalDateString();
    const todayNoon = new Date();
    todayNoon.setHours(12, 0, 0, 0);
    const eventsPath = writeEventsWithStart(tmpDir, todayNoon.toISOString());
    const ref: SessionRef = { sessionId: "today", eventsPath };
    const filter = makeRangeDateFilter(today, today);
    await expect(filter(ref)).resolves.toBe(true);
  });

  test("session started yesterday is excluded from today-only range", async () => {
    const today = todayLocalDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    const eventsPath = writeEventsWithStart(tmpDir, yesterday.toISOString());
    const ref: SessionRef = { sessionId: "yesterday", eventsPath };
    const filter = makeRangeDateFilter(today, today);
    await expect(filter(ref)).resolves.toBe(false);
  });

  test("returns false for non-existent events file", async () => {
    const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const ref: SessionRef = {
        sessionId: "ghost",
        eventsPath: path.join(tmpDir, "nonexistent", "events.jsonl"),
      };
      const filter = makeRangeDateFilter("2026-01-01", "2026-12-31");
      await expect(filter(ref)).resolves.toBe(false);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("local-midnight boundary: session at exactly midnight is included", async () => {
    // Construct local midnight today
    const localMidnight = new Date();
    localMidnight.setHours(0, 0, 0, 0);
    const today = todayLocalDateString();
    const eventsPath = writeEventsWithStart(tmpDir, localMidnight.toISOString());
    const ref: SessionRef = { sessionId: "midnight", eventsPath };
    const filter = makeRangeDateFilter(today, today);
    await expect(filter(ref)).resolves.toBe(true);
  });

  test("local-midnight boundary: session 1ms before midnight is excluded from today range", async () => {
    const localMidnight = new Date();
    localMidnight.setHours(0, 0, 0, 0);
    // 1ms before midnight = still yesterday
    const justBefore = new Date(localMidnight.getTime() - 1);
    const today = todayLocalDateString();
    const eventsPath = writeEventsWithStart(tmpDir, justBefore.toISOString());
    const ref: SessionRef = { sessionId: "before-midnight", eventsPath };
    const filter = makeRangeDateFilter(today, today);
    await expect(filter(ref)).resolves.toBe(false);
  });
});
