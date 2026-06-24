/**
 * Shared filesystem helpers for tests that need temporary directories,
 * events files, and OTel/logs session fixtures on disk.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Create a temp directory with an optional prefix (default: "tscope-test-"). */
export function makeTmpDir(prefix = "tscope-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Write a JSONL events file to `dir/events.jsonl` and return its path.
 * Each element of `lines` is serialised as one JSON line.
 */
export function writeTempEvents(dir: string, lines: object[]): string {
  const filePath = path.join(dir, "events.jsonl");
  const content = lines.map((l) => JSON.stringify(l)).join("\n");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/** Append one JSON line to `filePath` (creates the file if absent). */
export function writeLine(filePath: string, obj: object): void {
  fs.appendFileSync(filePath, JSON.stringify(obj) + "\n", "utf8");
}

/**
 * Write a minimal `dir/events.jsonl` containing a single `session.start`
 * event at `startTime` and return the file path.
 */
export function writeEventsWithStart(dir: string, startTime: string): string {
  const event = {
    type: "session.start",
    data: { sessionId: "filter-test", startTime },
    timestamp: startTime,
  };
  const filePath = path.join(dir, "events.jsonl");
  fs.writeFileSync(filePath, JSON.stringify(event) + "\n", "utf8");
  return filePath;
}

/**
 * Write a complete logs session (session.start + session.shutdown) to
 * `sessionStateDir/<sessionId>/events.jsonl`.
 *
 * Default token counts: 500 input / 200 output for model "gpt-4".
 */
export function writeLogsSession(
  sessionStateDir: string,
  sessionId: string,
  startTimeISO: string,
  inputTokens = 500,
  outputTokens = 200
): void {
  const sessionDir = path.join(sessionStateDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session.start",
      data: { sessionId, startTime: startTimeISO },
      timestamp: startTimeISO,
    }),
    JSON.stringify({
      type: "session.shutdown",
      data: {
        modelMetrics: {
          "gpt-4": {
            usage: {
              inputTokens,
              outputTokens,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
            },
          },
        },
        totalApiDurationMs: 1000,
      },
    }),
  ];
  fs.writeFileSync(
    path.join(sessionDir, "events.jsonl"),
    lines.join("\n") + "\n",
    "utf8"
  );
}
