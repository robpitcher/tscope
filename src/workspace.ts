/**
 * Helpers for reading the agentic surface ("client") that produced a session.
 *
 * Each Copilot session folder contains a `workspace.yaml` sibling to
 * `events.jsonl`. Its `client_name` field records which surface wrote the
 * session — e.g. "github/cli" (Copilot CLI), "github/autopilot" (the GitHub
 * Copilot app), or "sdk". This value is NOT present in `events.jsonl`, so it
 * must be read from `workspace.yaml`, keyed by sessionId (the folder name,
 * which equals the OTel conversation id). That lets us attach the client to
 * sessions from either data source.
 *
 * We intentionally parse the single `client_name:` line with a regex rather
 * than adding a YAML dependency — workspace.yaml is a flat key/value file.
 */

import * as fs from "fs";
import * as path from "path";
import { NormalizedSession } from "./types";

/** Matches a top-level `client_name:` line, capturing the (optionally quoted) value. */
const CLIENT_NAME_RE = /^client_name:\s*(.+?)\s*$/m;
/** Session IDs must be a single, safe folder name. */
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Read the `client_name` from a session folder's `workspace.yaml`.
 * Returns the trimmed value (quotes stripped) or undefined when the file is
 * missing/unreadable or has no `client_name` field. Never throws.
 */
export function readWorkspaceClientName(sessionDir: string): string | undefined {
  let content: string;
  try {
    content = fs.readFileSync(path.join(sessionDir, "workspace.yaml"), "utf8");
  } catch {
    return undefined;
  }
  const match = CLIENT_NAME_RE.exec(content);
  if (!match) return undefined;
  const value = match[1].replace(/^["']|["']$/g, "").trim();
  return value === "" ? undefined : value;
}

/**
 * Resolve the client name for a session by sessionId, looking up
 * `<sessionStateDir>/<sessionId>/workspace.yaml`. Returns undefined when
 * unresolvable.
 */
export function resolveClientName(
  sessionStateDir: string,
  sessionId: string
): string | undefined {
  if (!SAFE_SESSION_ID_RE.test(sessionId)) return undefined;
  return readWorkspaceClientName(path.join(sessionStateDir, sessionId));
}

/**
 * Return a copy of the sessions with `clientName` populated where it can be
 * resolved from `workspace.yaml`. Sessions whose client cannot be resolved are
 * returned unchanged (no `clientName`). Source-agnostic: works for OTel and
 * log-parser sessions alike since both key by sessionId.
 */
export function enrichSessionsWithClient(
  sessions: NormalizedSession[],
  sessionStateDir: string
): NormalizedSession[] {
  return sessions.map((session) => {
    const clientName = resolveClientName(sessionStateDir, session.sessionId);
    return clientName === undefined ? session : { ...session, clientName };
  });
}
