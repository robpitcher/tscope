import { SessionRef } from "./types";
import { readSessionStartTime } from "./parser";

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
 * Async date-filter predicate factory.
 * Returns a function that, given a SessionRef, resolves to true if the session
 * started on the given local date.
 *
 * Architecture seam: phase 1 uses "today"; future phases can pass any date string.
 */
export function makeDateFilter(localDate: string) {
  return async (ref: SessionRef): Promise<boolean> => {
    const startTime = await readSessionStartTime(ref.eventsPath);
    if (startTime === null) {
      // No session.start found; try file mtime as fallback
      try {
        const { statSync } = await import("fs");
        const stat = statSync(ref.eventsPath);
        const mtime = stat.mtime.toISOString();
        return utcToLocalDateString(mtime) === localDate;
      } catch {
        process.stderr.write(
          `Warning: could not determine date for session ${ref.sessionId} — skipping\n`
        );
        return false;
      }
    }
    return utcToLocalDateString(startTime) === localDate;
  };
}
