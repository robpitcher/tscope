import * as fs from "fs";
import * as readline from "readline";
import { ParsedSession, InProgressSession, Session, TokenCounts, ChronicleTip } from "./types";
import { addTokenCounts } from "./tokens";

interface RawUserMessage {
  type: "user.message";
  data?: {
    content?: string;
    interactionId?: string;
  };
  timestamp?: string;
}

interface RawAssistantMessage {
  type: "assistant.message";
  data?: {
    content?: string;
    interactionId?: string;
  };
  timestamp?: string;
}

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

type RawEvent = RawSessionStart | RawSessionShutdown | RawUserMessage | RawAssistantMessage | { type: string };

/** A detected /chronicle command invocation, pending its assistant response */
interface ChronicleInvocation {
  variant: "tips" | "cost-tips";
  timestamp: string;
  interactionId: string;
}

/**
 * Match a /chronicle tips or /chronicle cost-tips command. Returns the variant
 * or null. "cost-tips" is tried first so it isn't shadowed by "tips".
 */
function matchChronicleCommand(content: string): "tips" | "cost-tips" | null {
  const m = content.trim().match(/^\/chronicle\s+(cost-tips|tips)\s*$/);
  return m ? (m[1] as "tips" | "cost-tips") : null;
}

/**
 * Build the chronological list of chronicle tips by pairing each detected
 * invocation with the last non-empty assistant message that shares its
 * interactionId (the final rendered tips, after any tool/intermediate turns).
 */
function buildChronicleTips(
  invocations: ChronicleInvocation[],
  lastAssistantByInteraction: Map<string, string>
): ChronicleTip[] {
  const tips: ChronicleTip[] = [];
  for (const inv of invocations) {
    const markdown = lastAssistantByInteraction.get(inv.interactionId);
    if (typeof markdown === "string" && markdown.trim() !== "") {
      tips.push({ variant: inv.variant, timestamp: inv.timestamp, markdown });
    }
  }
  tips.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return tips;
}

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
 * 1. Scan the entire file collecting EVERY session.shutdown event.
 *    A resumed session emits one shutdown per run, and each run's
 *    modelMetrics is reset (per-run, not cumulative), so the true session
 *    totals are the SUM of all shutdowns' per-model usage.
 * 2. If no shutdown found: return InProgressSession.
 * 3. Always scan for session.start to get startTime.
 *
 * Note: if a session was resumed and the latest run has not shut down yet,
 * the file still contains earlier shutdown(s). We report the summed
 * completed-run totals as a parsed session; tokens from the still-running
 * final run are not yet recorded in any shutdown and are therefore omitted.
 *
 * Malformed lines are silently skipped.
 */
export async function parseEventsFile(
  sessionId: string,
  eventsPath: string
): Promise<Session> {
  let startEvent: RawSessionStart | null = null;

  // Use a container to hold mutable scan results so TypeScript control flow
  // doesn't narrow variables to `never` after the async scan completes.
  const scanResult: {
    startEvent: RawSessionStart | null;
    shutdownEvents: RawSessionShutdown[];
    chronicleInvocations: ChronicleInvocation[];
    chronicleInteractionIds: Set<string>;
    lastAssistantByInteraction: Map<string, string>;
  } = {
    startEvent: null,
    shutdownEvents: [],
    chronicleInvocations: [],
    chronicleInteractionIds: new Set<string>(),
    lastAssistantByInteraction: new Map<string, string>(),
  };

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

      if (event.type === "session.shutdown") {
        scanResult.shutdownEvents.push(event as RawSessionShutdown);
      }

      if (event.type === "user.message") {
        const um = event as RawUserMessage;
        const content = um.data?.content;
        const interactionId = um.data?.interactionId;
        if (typeof content === "string" && typeof interactionId === "string") {
          const variant = matchChronicleCommand(content);
          if (variant) {
            scanResult.chronicleInvocations.push({
              variant,
              timestamp: um.timestamp ?? "",
              interactionId,
            });
            scanResult.chronicleInteractionIds.add(interactionId);
          }
        }
      }

      if (event.type === "assistant.message") {
        const am = event as RawAssistantMessage;
        const interactionId = am.data?.interactionId;
        const content = am.data?.content;
        if (
          typeof interactionId === "string" &&
          scanResult.chronicleInteractionIds.has(interactionId) &&
          typeof content === "string" &&
          content.trim() !== ""
        ) {
          // Last non-empty assistant message for a chronicle interaction wins
          // (the final rendered tips). The command always precedes its response,
          // so its interactionId is already registered by this point.
          scanResult.lastAssistantByInteraction.set(interactionId, content);
        }
      }
    });

    rl.on("close", resolve);
    rl.on("error", reject);
    stream.on("error", reject);
  });

  startEvent = scanResult.startEvent;
  const shutdownEvents = scanResult.shutdownEvents;

  const chronicleTips = buildChronicleTips(
    scanResult.chronicleInvocations,
    scanResult.lastAssistantByInteraction
  );

  // Determine start time
  const startTime: string | undefined =
    startEvent?.data?.startTime ??
    startEvent?.timestamp ??
    undefined;

  if (shutdownEvents.length === 0) {
    // Session is in-progress — no shutdown event found
    const inProgress: InProgressSession = {
      sessionId,
      eventsPath,
      startTime,
      chronicleTips,
      inProgress: true,
    };
    return inProgress;
  }

  // Sum per-model usage and premium requests across ALL shutdowns. A resumed
  // session has one shutdown per run, each reporting only that run's metrics,
  // so the cumulative session totals are the sum across runs.
  const models: Record<string, TokenCounts> = {};
  let totalPremiumRequests = 0;

  for (const shutdown of shutdownEvents) {
    totalPremiumRequests += shutdown.data?.totalPremiumRequests ?? 0;
    const rawMetrics = shutdown.data?.modelMetrics ?? {};
    for (const [modelName, metrics] of Object.entries(rawMetrics)) {
      if (typeof modelName === "string" && metrics && typeof metrics === "object") {
        const counts = extractTokenCounts(metrics.usage);
        models[modelName] = models[modelName]
          ? addTokenCounts(models[modelName], counts)
          : counts;
      }
    }
  }

  const session: ParsedSession = {
    sessionId,
    eventsPath,
    startTime: startTime ?? shutdownEvents[0].timestamp ?? new Date(0).toISOString(),
    models,
    totalPremiumRequests,
    chronicleTips,
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
    let resolved = false;
    let stream: fs.ReadStream;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve(found);
    };

    try {
      stream = fs.createReadStream(eventsPath, { encoding: "utf8" });
    } catch {
      resolve(null);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (found !== null) return;
      const event = parseLine(line);
      if (event && event.type === "session.start") {
        const se = event as RawSessionStart;
        found = se.data?.startTime ?? se.timestamp ?? null;
        if (found !== null) {
          rl.close();
          stream.destroy();
          finish();
        }
      }
    });

    rl.on("close", finish);
    rl.on("error", finish);
    stream.on("error", finish);
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
    let resolved = false;
    let stream: fs.ReadStream;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve(startTime ?? firstEventTime);
    };

    try {
      stream = fs.createReadStream(eventsPath, { encoding: "utf8" });
    } catch {
      resolve(null);
      return;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (startTime !== null) return;
      const event = parseLine(line);
      if (!event) return;

      if (event.type === "session.start") {
        const se = event as RawSessionStart;
        startTime = se.data?.startTime ?? se.timestamp ?? null;
        if (startTime !== null) {
          rl.close();
          stream.destroy();
          finish();
        }
        return;
      }

      if (firstEventTime === null) {
        const ts = (event as { timestamp?: string }).timestamp;
        if (typeof ts === "string") firstEventTime = ts;
      }
    });

    rl.on("close", finish);
    rl.on("error", finish);
    stream.on("error", finish);
  });
}
