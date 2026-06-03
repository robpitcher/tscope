import * as fs from "fs";
import * as readline from "readline";
import { ParsedSession, InProgressSession, Session, TokenCounts } from "./types";

interface RawSessionStart {
  type: "session.start";
  data: {
    sessionId?: string;
    startTime?: string;
  };
  timestamp?: string;
}

interface RawModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

interface RawModelMetrics {
  usage?: RawModelUsage;
}

interface RawSessionShutdown {
  type: "session.shutdown";
  data: {
    totalPremiumRequests?: number;
    sessionStartTime?: number;
    modelMetrics?: Record<string, RawModelMetrics>;
  };
  timestamp?: string;
}

type RawEvent = RawSessionStart | RawSessionShutdown | { type: string };

/** Parse a single line of JSONL, returning null on failure */
function parseLine(line: string): RawEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as unknown;
    if (typeof obj === "object" && obj !== null && "type" in obj) {
      return obj as RawEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/** Safely read the last non-empty line of a file */
function readLastLine(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed) return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract a normalized TokenCounts from raw model usage */
function extractTokenCounts(raw: RawModelUsage | undefined): TokenCounts {
  return {
    inputTokens: raw?.inputTokens ?? 0,
    outputTokens: raw?.outputTokens ?? 0,
    cacheReadTokens: raw?.cacheReadTokens ?? 0,
    cacheWriteTokens: raw?.cacheWriteTokens ?? 0,
    reasoningTokens: raw?.reasoningTokens ?? 0,
  };
}

/**
 * Parse an events.jsonl file asynchronously.
 *
 * Strategy:
 * 1. Fast path: check last line — if it's session.shutdown, use it.
 * 2. Fallback: scan entire file for session.shutdown.
 * 3. If no shutdown found: return InProgressSession.
 * 4. Always scan for session.start to get startTime.
 *
 * Malformed lines are silently skipped.
 */
export async function parseEventsFile(
  sessionId: string,
  eventsPath: string
): Promise<Session> {
  // Fast path: check last line
  const lastLine = readLastLine(eventsPath);
  let shutdownEvent: RawSessionShutdown | null = null;
  let startEvent: RawSessionStart | null = null;

  if (lastLine) {
    const parsed = parseLine(lastLine);
    if (parsed && parsed.type === "session.shutdown") {
      shutdownEvent = parsed as RawSessionShutdown;
    }
  }

  // Always scan the file for session.start, and fallback scan for shutdown if needed
  const needsShutdownScan = shutdownEvent === null;

  // Use a container to hold mutable scan results so TypeScript control flow
  // doesn't narrow variables to `never` after the async scan completes.
  const scanResult: {
    startEvent: RawSessionStart | null;
    shutdownEvent: RawSessionShutdown | null;
  } = { startEvent: null, shutdownEvent: shutdownEvent };

  await new Promise<void>((resolve, reject) => {
    let stream: fs.ReadStream;
    try {
      stream = fs.createReadStream(eventsPath, { encoding: "utf8" });
    } catch (err) {
      reject(err);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      const event = parseLine(line);
      if (!event) return;

      if (event.type === "session.start" && scanResult.startEvent === null) {
        scanResult.startEvent = event as RawSessionStart;
      }

      if (needsShutdownScan && event.type === "session.shutdown" && scanResult.shutdownEvent === null) {
        scanResult.shutdownEvent = event as RawSessionShutdown;
      }
    });

    rl.on("close", resolve);
    rl.on("error", reject);
    stream.on("error", reject);
  });

  startEvent = scanResult.startEvent;
  shutdownEvent = scanResult.shutdownEvent;

  // Determine start time
  const startTime: string | undefined =
    startEvent?.data?.startTime ??
    startEvent?.timestamp ??
    undefined;

  if (shutdownEvent === null) {
    // Session is in-progress — no shutdown event found
    const inProgress: InProgressSession = {
      sessionId,
      eventsPath,
      startTime,
      inProgress: true,
    };
    return inProgress;
  }

  // Extract model metrics
  const rawMetrics = shutdownEvent.data?.modelMetrics ?? {};
  const models: Record<string, TokenCounts> = {};

  for (const [modelName, metrics] of Object.entries(rawMetrics)) {
    if (typeof modelName === "string" && metrics && typeof metrics === "object") {
      models[modelName] = extractTokenCounts(metrics.usage);
    }
  }

  const session: ParsedSession = {
    sessionId,
    eventsPath,
    startTime: startTime ?? shutdownEvent.timestamp ?? new Date(0).toISOString(),
    models,
    totalPremiumRequests: shutdownEvent.data?.totalPremiumRequests ?? 0,
    inProgress: false,
  };

  return session;
}

/**
 * Read only the session.start event from an events.jsonl file (used for date filtering).
 * Returns the startTime string or null if not found.
 */
export async function readSessionStartTime(eventsPath: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let found: string | null = null;
    let stream: fs.ReadStream;

    try {
      stream = fs.createReadStream(eventsPath, { encoding: "utf8" });
    } catch {
      resolve(null);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (found !== null) return; // already found, drain remaining lines
      const event = parseLine(line);
      if (event && event.type === "session.start") {
        const se = event as RawSessionStart;
        found = se.data?.startTime ?? se.timestamp ?? null;
        // Don't close early — readline doesn't support that cleanly; just drain
      }
    });

    rl.on("close", () => resolve(found));
    rl.on("error", () => resolve(found));
    stream.on("error", () => resolve(found));
  });
}

/**
 * Read the best-effort start timestamp for date filtering. Prefers the
 * `session.start` event's startTime (or its timestamp); when no session.start
 * event exists (e.g. imported conversations), falls back to the timestamp of
 * the first event that carries one. Returns null only when the file has no
 * usable timestamp at all (callers may then fall back to file mtime).
 */
export async function readSessionStartOrFirstEventTime(
  eventsPath: string
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let startTime: string | null = null;
    let firstEventTime: string | null = null;
    let stream: fs.ReadStream;

    try {
      stream = fs.createReadStream(eventsPath, { encoding: "utf8" });
    } catch {
      resolve(null);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (startTime !== null) return; // session.start found — drain remaining lines
      const event = parseLine(line);
      if (!event) return;

      if (event.type === "session.start") {
        const se = event as RawSessionStart;
        startTime = se.data?.startTime ?? se.timestamp ?? null;
        return;
      }

      if (firstEventTime === null) {
        const ts = (event as { timestamp?: string }).timestamp;
        if (typeof ts === "string") firstEventTime = ts;
      }
    });

    const finish = () => resolve(startTime ?? firstEventTime);
    rl.on("close", finish);
    rl.on("error", finish);
    stream.on("error", finish);
  });
}
