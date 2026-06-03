import { Report, ParsedSession, InProgressSession } from "../types";
import { Renderer } from "./Renderer";

/** Schema version — bumped to v2 (breaking: credit fields removed) */
const SCHEMA_VERSION = "tscope/report/v2";

/** Convert UTC ISO string to local "YYYY-MM-DD HH:MM" or null if invalid */
function toLocalDateTime(utcIso: string): string | null {
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${min}`;
}

function serializeCompletedSession(session: ParsedSession) {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalReasoning = 0;

  const models = Object.entries(session.models).map(([modelName, tokens]) => {
    totalInput += tokens.inputTokens;
    totalOutput += tokens.outputTokens;
    totalCacheRead += tokens.cacheReadTokens;
    totalCacheWrite += tokens.cacheWriteTokens;
    totalReasoning += tokens.reasoningTokens;
    return {
      modelName,
      usage: {
        input: tokens.inputTokens,
        output: tokens.outputTokens,
        cacheRead: tokens.cacheReadTokens,
        cacheWrite: tokens.cacheWriteTokens,
        reasoning: tokens.reasoningTokens,
      },
    };
  });

  return {
    sessionId: session.sessionId,
    path: session.eventsPath,
    startTime: session.startTime,
    localDateTime: toLocalDateTime(session.startTime),
    inProgress: false as const,
    premiumRequests: session.totalPremiumRequests,
    models,
    totals: {
      input: totalInput,
      output: totalOutput,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      reasoning: totalReasoning,
    },
  };
}

function serializeInProgressSession(session: InProgressSession) {
  return {
    sessionId: session.sessionId,
    path: session.eventsPath,
    startTime: session.startTime ?? null,
    localDateTime: session.startTime ? toLocalDateTime(session.startTime) : null,
    inProgress: true as const,
    premiumRequests: null,
    models: [] as never[],
    totals: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
    },
  };
}

/**
 * JsonRenderer — serializes the report to stdout as clean, stable JSON.
 *
 * Stdout receives only valid JSON (pipeable to jq, etc.).
 *
 * ## Schema: tscope/report/v2
 * Top-level fields:
 *   schema         — stable identifier, bump on breaking changes
 *   generatedAt    — ISO 8601 UTC timestamp of report generation
 *   filter         — description and reportDate of the active filter
 *   summary        — sessionCount, completedCount, inProgressCount, totalTokens
 *   sessions[]     — one entry per session (completed + in-progress)
 *     sessionId, path, startTime (ISO UTC | null), localDateTime (YYYY-MM-DD HH:MM | null),
 *     inProgress, premiumRequests (number | null), models[], totals
 *   models[]       — modelName, usage{input,output,cacheRead,cacheWrite,reasoning}
 *   totals         — summed token counts
 */
export class JsonRenderer implements Renderer {
  render(report: Report): void {
    const completedCount = report.sessions.length;
    const inProgressCount = report.inProgressSessions.length;

    let totalTokens = 0;
    const sessions = [
      ...report.sessions.map((session) => {
        const s = serializeCompletedSession(session);
        totalTokens += s.totals.input + s.totals.output + s.totals.cacheRead + s.totals.cacheWrite;
        return s;
      }),
      ...report.inProgressSessions.map(serializeInProgressSession),
    ];

    const output = {
      schema: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      filter: {
        description: report.filterDescription,
        reportDate: report.reportDate,
      },
      summary: {
        sessionCount: completedCount + inProgressCount,
        completedCount,
        inProgressCount,
        totalTokens,
      },
      sessions,
    };

    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  }
}
