import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionRef } from "./types";

/**
 * Returns the path to the Copilot session-state directory for the current user.
 * Cross-platform: uses %USERPROFILE% on Windows, $HOME on macOS/Linux.
 */
export function getSessionStateDir(): string {
  const home = os.homedir();
  return path.join(home, ".copilot", "session-state");
}

/**
 * Predicate type for filtering discovered session refs.
 * Phase 1 uses a "today" predicate; future phases can pass date-range predicates.
 */
export type SessionPredicate = (ref: SessionRef) => boolean;

/**
 * Discover all valid session folders under the session-state directory.
 * A valid session folder is any direct subdirectory that contains an `events.jsonl` file.
 *
 * @param sessionStateDir - Override the default session-state directory (for testing)
 * @param predicates - Optional filter predicates applied after discovery
 * @returns Array of SessionRef objects for all matching sessions
 */
export function discoverSessions(
  sessionStateDir?: string,
  predicates?: SessionPredicate[]
): SessionRef[] {
  const dir = sessionStateDir ?? getSessionStateDir();

  if (!fs.existsSync(dir)) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    process.stderr.write(
      `Warning: could not read session-state directory: ${dir}: ${String(err)}\n`
    );
    return [];
  }

  const results: SessionRef[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const eventsPath = path.join(dir, entry.name, "events.jsonl");
    if (!fs.existsSync(eventsPath)) continue;

    const ref: SessionRef = {
      sessionId: entry.name,
      eventsPath,
    };

    if (predicates && predicates.length > 0) {
      if (!predicates.every((pred) => pred(ref))) continue;
    }

    results.push(ref);
  }

  return results;
}
