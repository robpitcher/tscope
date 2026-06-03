import { SessionRef } from "./types";
import { readSessionStartTime } from "./parser";

/**
 * Validates that a string is a well-formed, calendar-valid YYYY-MM-DD date.
 * Rejects malformed strings and impossible dates (e.g. 2026-02-30, 2026-13-01).
 */
export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() + 1 === month &&
    d.getDate() === day
  );
}

/**
 * Returns the local date string (YYYY-MM-DD) for a given ISO 8601 UTC timestamp.
 * Uses the system's local timezone.
 */
export function utcToLocalDateString(utcIso: string): string {
  const d = new Date(utcIso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's local date string (YYYY-MM-DD).
 */
export function todayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolves the local date string for a SessionRef, using the start time from the
 * events file, falling back to file mtime, and emitting a stderr warning on failure.
 */
async function resolveSessionLocalDate(ref: SessionRef): Promise<string | null> {
  const startTime = await readSessionStartTime(ref.eventsPath);
  if (startTime !== null) {
    return utcToLocalDateString(startTime);
  }
  try {
    const { statSync } = await import("fs");
    const stat = statSync(ref.eventsPath);
    return utcToLocalDateString(stat.mtime.toISOString());
  } catch {
    process.stderr.write(
      `Warning: could not determine date for session ${ref.sessionId} — skipping\n`
    );
    return null;
  }
}

/**
 * Async date-filter predicate factory.
 * Returns a function that, given a SessionRef, resolves to true if the session
 * started on the given local date.
 *
 * Architecture seam: phase 1 uses "today"; future phases can pass any date string.
 */
export function makeDateFilter(localDate: string) {
  return async (ref: SessionRef): Promise<boolean> => {
    const sessionDate = await resolveSessionLocalDate(ref);
    if (sessionDate === null) return false;
    return sessionDate === localDate;
  };
}

/**
 * Async date-range filter predicate factory (inclusive on both ends).
 * Returns a function that resolves to true if the session's local date falls
 * within [startDate, endDate] inclusive.
 *
 * Precondition: startDate <= endDate (validated by caller).
 */
export function makeRangeDateFilter(startDate: string, endDate: string) {
  return async (ref: SessionRef): Promise<boolean> => {
    const sessionDate = await resolveSessionLocalDate(ref);
    if (sessionDate === null) return false;
    return sessionDate >= startDate && sessionDate <= endDate;
  };
}
