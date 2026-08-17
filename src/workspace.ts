/**
 * Helpers for reading display metadata for a session.
 *
 * Each Copilot session folder contains a `workspace.yaml` sibling to
 * `events.jsonl`. Its `client_name` field records which surface wrote the
 * session, and its `name` field contains the friendly session name. These
 * values are NOT present in `events.jsonl`, so they must be read from
 * `workspace.yaml`, keyed by sessionId.
 *
 * We intentionally parse the relevant lines with anchored regexes rather than
 * adding a YAML dependency — workspace.yaml is a flat key/value file.
 */

import * as fs from "fs";
import * as path from "path";
/** Matches a top-level `client_name:` line, capturing the (optionally quoted) value. */
const CLIENT_NAME_RE = /^client_name:\s*(.+?)\s*$/m;
/** Matches only a top-level `name:` line, not keys such as `client_name:`. */
const SESSION_NAME_RE = /^name:\s*(.+?)\s*$/m;
/** Session IDs must be a single, safe folder name. */
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface WorkspaceFields {
  clientName?: string;
  sessionName?: string;
}

function parseWorkspaceValue(content: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(content);
  if (!match) return undefined;
  const value = match[1].replace(/^["']|["']$/g, "").trim();
  return value === "" ? undefined : value;
}

/** Read all supported workspace fields with at most one filesystem read. */
function readWorkspaceFields(sessionDir: string): WorkspaceFields {
  let content: string;
  try {
    content = fs.readFileSync(path.join(sessionDir, "workspace.yaml"), "utf8");
  } catch {
    return {};
  }
  return {
    clientName: parseWorkspaceValue(content, CLIENT_NAME_RE),
    sessionName: parseWorkspaceValue(content, SESSION_NAME_RE),
  };
}

/**
 * Read the `client_name` from a session folder's `workspace.yaml`.
 * Returns the trimmed value (quotes stripped) or undefined when the file is
 * missing/unreadable or has no `client_name` field. Never throws.
 */
export function readWorkspaceClientName(sessionDir: string): string | undefined {
  return readWorkspaceFields(sessionDir).clientName;
}

/** Read the friendly `name` from a session folder's `workspace.yaml`. */
export function readWorkspaceSessionName(sessionDir: string): string | undefined {
  return readWorkspaceFields(sessionDir).sessionName;
}

function resolveWorkspaceFields(
  sessionStateDir: string,
  sessionId: string
): WorkspaceFields {
  if (!SAFE_SESSION_ID_RE.test(sessionId)) return {};
  return readWorkspaceFields(path.join(sessionStateDir, sessionId));
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
  return resolveWorkspaceFields(sessionStateDir, sessionId).clientName;
}

/** Resolve the friendly session name by safe session ID. */
export function resolveSessionName(
  sessionStateDir: string,
  sessionId: string
): string | undefined {
  return resolveWorkspaceFields(sessionStateDir, sessionId).sessionName;
}

/**
 * Friendly display labels for known `client_name` values from `workspace.yaml`.
 * Shared by all renderers so Text, JSON, and HTML display consistent names.
 */
export const CLIENT_LABELS: Record<string, string> = {
  "github/cli": "Copilot CLI",
  "github/autopilot": "Copilot App",
  sdk: "SDK",
};

/**
 * Map a raw `clientName` to its friendly display label.
 * Returns `undefined` for unknown / unrecognized values so callers can
 * fall back to the raw string or omit the field.
 */
export function resolveClientLabel(clientName: string): string | undefined {
  return CLIENT_LABELS[clientName];
}

/**
 * Return copies of sessions with workspace metadata populated where available.
 * The generic shape supports both completed and in-progress sessions.
 */
export function enrichSessionsWithWorkspace<T extends {
  sessionId: string;
  clientName?: string;
  sessionName?: string;
}>(
  sessions: T[],
  sessionStateDir: string
): T[] {
  return sessions.map((session) => {
    const fields = resolveWorkspaceFields(sessionStateDir, session.sessionId);
    if (fields.clientName === undefined && fields.sessionName === undefined) {
      return session;
    }
    return { ...session, ...fields };
  });
}
