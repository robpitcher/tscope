import { Report, ParsedSession } from "../types";
import { Renderer } from "./Renderer";
import { hasTokenData } from "../tokens";

/**
 * Schema version — bumped to v4.
 * Breaking change vs v3: removed the per-session `premiumRequests` field.
 * tscope no longer surfaces Copilot's `totalPremiumRequests` value because
 * it's a legacy request-count metric with no actionable use in this tool.
 *
 * (v3 history, retained for reference: bumped from v2 because
 * `summary.totalTokens` and per-session `totals.total` switched to
 * `input + output` only — adding cache read/write on top would double-count
 * since `inputTokens` already includes them.)
 */
const SCHEMA_VERSION = "tscope/report/v4";

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
    models,
    totals: {
      input: totalInput,
      output: totalOutput,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      reasoning: totalReasoning,
      // Non-overlapping grand total: input already includes cache read/write.
      total: totalInput + totalOutput,
    },
  };
}

/**
 * JsonRenderer — serializes the report to stdout as clean, stable JSON.
 *
 * Stdout receives only valid JSON (pipeable to jq, etc.).
 *
 * ## Schema: tscope/report/v4
 * Top-level fields:
 *   schema         — stable identifier, bump on breaking changes
 *   generatedAt    — ISO 8601 UTC timestamp of report generation
 *   filter         — description and reportDate of the active filter
 *   summary        — sessionCount, completedCount, inProgressCount, totalTokens
 *                    (in-progress sessions are silently excluded, so
 *                    inProgressCount is always 0 and sessionCount equals
 *                    completedCount; field is retained for schema shape)
 *                    (totalTokens = sum of input+output; cache is part of input)
 *   sessions[]     — one entry per completed session with non-zero token
 *                    activity (in-progress and zero-token sessions are
 *                    silently excluded — see JsonRenderer.render)
 *     sessionId, path, startTime (ISO UTC string), localDateTime (YYYY-MM-DD HH:MM string),
 *     inProgress (always false), models[], totals
 *   models[]       — modelName, usage{input,output,cacheRead,cacheWrite,reasoning}
 *   totals         — summed token counts; `total` = input+output (cacheRead and
 *                    cacheWrite are subsets of input, not added on top)
 */
export class JsonRenderer implements Renderer {
  render(report: Report): void {
    // Silently exclude sessions with no billable token activity:
    //   1. In-progress sessions (no shutdown event)
    //   2. Completed sessions with empty models or all-zero input/output
    // `summary.inProgressCount` is always 0 (retained for schema shape).
    const sessionsWithData = report.sessions.filter((s) => hasTokenData(s.models));
    const completedCount = sessionsWithData.length;

    let totalTokensSum = 0;
    const sessions = sessionsWithData.map((session) => {
      const s = serializeCompletedSession(session);
      totalTokensSum += s.totals.total;
      return s;
    });

    const output = {
      schema: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      filter: {
        description: report.filterDescription,
        reportDate: report.reportDate,
      },
      summary: {
        sessionCount: completedCount,
        completedCount,
        inProgressCount: 0,
        totalTokens: totalTokensSum,
      },
      sessions,
    };

    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  }
}
