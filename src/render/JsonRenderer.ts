import { Report, ParsedSession, InProgressSession, SessionCredits } from "../types";
import { Renderer } from "./Renderer";

/** Schema version — bump when the shape changes in a breaking way */
const SCHEMA_VERSION = "tscope/report/v1";

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

function serializeCompletedSession(session: ParsedSession, credits: SessionCredits) {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalReasoning = 0;

  const models = credits.models.map((mc) => {
    totalInput += mc.tokens.inputTokens;
    totalOutput += mc.tokens.outputTokens;
    totalCacheRead += mc.tokens.cacheReadTokens;
    totalCacheWrite += mc.tokens.cacheWriteTokens;
    totalReasoning += mc.tokens.reasoningTokens;
    return {
      modelName: mc.modelName,
      usage: {
        input: mc.tokens.inputTokens,
        output: mc.tokens.outputTokens,
        cacheRead: mc.tokens.cacheReadTokens,
        cacheWrite: mc.tokens.cacheWriteTokens,
        reasoning: mc.tokens.reasoningTokens,
      },
      estimatedCredits: mc.unknownRate ? null : (mc.estimatedCredits ?? null),
      unknownRate: mc.unknownRate,
    };
  });

  return {
    sessionId: session.sessionId,
    path: session.eventsPath,
    startTime: session.startTime,
    localDateTime: toLocalDateTime(session.startTime),
    inProgress: false as const,
    models,
    totals: {
      input: totalInput,
      output: totalOutput,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      reasoning: totalReasoning,
      estimatedCredits: credits.totalCredits,
      hasUnknownRates: credits.hasUnknownRates,
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
    models: [] as never[],
    totals: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      estimatedCredits: 0,
      hasUnknownRates: false,
    },
  };
}

/**
 * JsonRenderer — serializes the report to stdout as clean, stable JSON.
 *
 * Stdout receives only valid JSON (pipeable to jq, etc.).
 * Warnings (e.g., unknown model rates) are written to stderr by the upstream
 * credit calculator and remain there — stdout is never polluted.
 *
 * ## Schema: tscope/report/v1
 * Top-level fields:
 *   schema         — stable identifier, bump on breaking changes
 *   generatedAt    — ISO 8601 UTC timestamp of report generation
 *   filter         — description and reportDate of the active filter
 *   summary        — sessionCount, completedCount, inProgressCount,
 *                    totalEstimatedCredits, hasUnknownRates
 *   sessions[]     — one entry per session (completed + in-progress)
 *     sessionId, path, startTime (ISO UTC | null), localDateTime (YYYY-MM-DD HH:MM | null),
 *     inProgress, models[], totals
 *   models[]       — modelName, usage{input,output,cacheRead,cacheWrite,reasoning},
 *                    estimatedCredits (number | null), unknownRate
 *   totals         — summed token counts + estimatedCredits + hasUnknownRates
 */
export class JsonRenderer implements Renderer {
  render(report: Report): void {
    const completedCount = report.sessions.length;
    const inProgressCount = report.inProgressSessions.length;

    const sessions = [
      ...report.sessions.map(({ session, credits }) =>
        serializeCompletedSession(session, credits)
      ),
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
        totalEstimatedCredits: report.totalCredits,
        hasUnknownRates: report.hasUnknownRates,
      },
      sessions,
    };

    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  }
}
