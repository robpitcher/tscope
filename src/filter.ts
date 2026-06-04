import { SessionRef } from "./types";
import { readSessionStartOrFirstEventTime } from "./parser";

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
 * Returns the local date string (YYYY-MM-DD) for `n` days before today.
 * `n = 0` yields today; `n = 6` yields the date six days ago.
 */
export function localDateNDaysAgo(n: number): string {
  const now = new Date();
  now.setDate(now.getDate() - n);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolves the best-available ISO timestamp for a SessionRef, preferring the
 * session.start (or first event) timestamp from events.jsonl, then falling
 * back to file mtime. Returns null only when neither source is available.
 * Emits a stderr warning on the terminal failure case.
 *
 * Shared by date-filter predicates and recency-based selection so that the
 * two stay in sync about how a session's time is determined.
 */
async function resolveSessionIsoTime(ref: SessionRef): Promise<string | null> {
  const startTime = await readSessionStartOrFirstEventTime(ref.eventsPath);
  if (startTime !== null) {
    return startTime;
  }
  try {
    const { statSync } = await import("fs");
    const stat = statSync(ref.eventsPath);
    return stat.mtime.toISOString();
  } catch {
    process.stderr.write(
      `Warning: could not determine date for session ${ref.sessionId} — skipping\n`
    );
    return null;
  }
}

/**
 * Resolves the local date string for a SessionRef, built on top of
 * resolveSessionIsoTime so date filtering and recency selection agree on
 * which timestamp represents a session.
 */
async function resolveSessionLocalDate(ref: SessionRef): Promise<string | null> {
  const iso = await resolveSessionIsoTime(ref);
  if (iso === null) return null;
  return utcToLocalDateString(iso);
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

/**
 * Returns the `max` most recent ParsedSessions ordered by startTime
 * descending (most recent first). Ties (and sessions with unparseable
 * startTimes) are broken deterministically by sessionId ascending so output
 * is stable across runs.
 *
 * Pure and synchronous — caller is expected to pre-filter to the set of
 * sessions that should count toward the limit (e.g. those with token data).
 */
export function selectMostRecentSessions<T extends { startTime: string; sessionId: string }>(
  sessions: T[],
  max: number
): T[] {
  if (max <= 0 || sessions.length === 0) return [];
  const indices = sessions.map((_, i) => i);
  indices.sort((a, b) => {
    const ta = Date.parse(sessions[a].startTime);
    const tb = Date.parse(sessions[b].startTime);
    const aValid = Number.isFinite(ta);
    const bValid = Number.isFinite(tb);
    // Sessions with unparseable startTimes sort to the end.
    if (!aValid && !bValid) {
      return sessions[a].sessionId.localeCompare(sessions[b].sessionId);
    }
    if (!aValid) return 1;
    if (!bValid) return -1;
    if (tb !== ta) return tb - ta; // descending by time
    return sessions[a].sessionId.localeCompare(sessions[b].sessionId);
  });
  return indices.slice(0, max).map((i) => sessions[i]);
}
