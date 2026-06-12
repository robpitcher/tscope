/**
 * LogsDataSource — wraps the existing events.jsonl parser.
 *
 * Discovers all session directories under ~/.copilot/session-state, applies
 * a date predicate to each (via the session.start timestamp), then parses the
 * matching ones with parseEventsFile. Returns NormalizedSession[] with
 * source:"logs", no cost data, and no extended metrics.
 */

import * as fs from "fs";
import {
  DataSource,
  InProgressSession,
  NormalizedSession,
  SessionDatePredicate,
  SessionRef,
} from "../types";
import { discoverSessions, getSessionStateDir } from "../discovery";
import { parseEventsFile, readSessionStartOrFirstEventTime } from "../parser";
import { utcToLocalDateString } from "../filter";

const FILTER_CONCURRENCY = 16;

/**
 * Resolve a session's local date string for date filtering.
 * Reads the events.jsonl start time; falls back to file mtime; returns null on failure.
 */
async function resolveSessionLocalDate(ref: SessionRef): Promise<string | null> {
  const startTime = await readSessionStartOrFirstEventTime(ref.eventsPath);
  if (startTime !== null) {
    return utcToLocalDateString(startTime);
  }
  try {
    const stat = fs.statSync(ref.eventsPath);
    return utcToLocalDateString(stat.mtime.toISOString());
  } catch {
    process.stderr.write(
      `Warning: could not determine date for session ${ref.sessionId} — skipping\n`
    );
    return null;
  }
}

/** Filter refs concurrently using the date predicate. */
async function filterRefsByDate(
  refs: SessionRef[],
  predicate: SessionDatePredicate,
  concurrency: number
): Promise<SessionRef[]> {
  if (refs.length === 0) return [];

  const keep = new Array<boolean>(refs.length).fill(false);
  const workerCount = Math.min(Math.max(1, concurrency), refs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < refs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const ref = refs[index];
      const localDate = await resolveSessionLocalDate(ref);
      if (localDate !== null && predicate(localDate, ref.sessionId)) {
        keep[index] = true;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return refs.filter((_, i) => keep[i]);
}

export class LogsDataSource implements DataSource {
  private sessionStateDir?: string;

  constructor(sessionStateDir?: string) {
    this.sessionStateDir = sessionStateDir;
  }

  async loadSessions(predicate?: SessionDatePredicate): Promise<NormalizedSession[]> {
    const dir = this.sessionStateDir ?? getSessionStateDir();
    const allRefs = discoverSessions(dir);

    const filteredRefs = predicate
      ? await filterRefsByDate(allRefs, predicate, FILTER_CONCURRENCY)
      : allRefs;

    const sessions: NormalizedSession[] = [];
    for (const ref of filteredRefs) {
      let parsed;
      try {
        parsed = await parseEventsFile(ref.sessionId, ref.eventsPath);
      } catch (err) {
        process.stderr.write(
          `Warning: failed to parse session ${ref.sessionId}: ${String(err)}\n`
        );
        continue;
      }
      if (!parsed.inProgress) {
        sessions.push({ ...parsed, source: "logs" });
      }
    }
    return sessions;
  }

  async loadInProgressSessions(predicate?: SessionDatePredicate): Promise<InProgressSession[]> {
    const dir = this.sessionStateDir ?? getSessionStateDir();
    const allRefs = discoverSessions(dir);

    const filteredRefs = predicate
      ? await filterRefsByDate(allRefs, predicate, FILTER_CONCURRENCY)
      : allRefs;

    const inProgress: InProgressSession[] = [];
    for (const ref of filteredRefs) {
      let parsed;
      try {
        parsed = await parseEventsFile(ref.sessionId, ref.eventsPath);
      } catch (err) {
        process.stderr.write(
          `Warning: failed to parse session ${ref.sessionId}: ${String(err)}\n`
        );
        continue;
      }
      if (parsed.inProgress) {
        inProgress.push(parsed as InProgressSession);
      }
    }
    return inProgress;
  }

  /**
   * Load both completed and in-progress sessions in a single pass (more efficient
   * than calling loadSessions + loadInProgressSessions separately, since each
   * would read every qualifying file twice).
   */
  async loadAll(predicate?: SessionDatePredicate): Promise<{
    completed: NormalizedSession[];
    inProgress: InProgressSession[];
  }> {
    const dir = this.sessionStateDir ?? getSessionStateDir();
    const allRefs = discoverSessions(dir);

    const filteredRefs = predicate
      ? await filterRefsByDate(allRefs, predicate, FILTER_CONCURRENCY)
      : allRefs;

    const completed: NormalizedSession[] = [];
    const inProgress: InProgressSession[] = [];

    for (const ref of filteredRefs) {
      let parsed;
      try {
        parsed = await parseEventsFile(ref.sessionId, ref.eventsPath);
      } catch (err) {
        process.stderr.write(
          `Warning: failed to parse session ${ref.sessionId}: ${String(err)}\n`
        );
        continue;
      }
      if (parsed.inProgress) {
        inProgress.push(parsed as InProgressSession);
      } else {
        completed.push({ ...parsed, source: "logs" });
      }
    }

    return { completed, inProgress };
  }
}
