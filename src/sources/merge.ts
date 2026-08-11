/**
 * Merge helpers for combining OTel and log-parser sessions into a single
 * unified NormalizedSession[].
 *
 * Dedup rule: if a session ID appears in both sources, OTel remains the base
 * record for tokens and extended detail, while exact shutdown metrics from
 * the log record enrich cost and API duration.
 *
 * These helpers are stateless pure functions; all IO is the caller's
 * responsibility.
 */

import { NormalizedSession, ReportSourceKind, SourceCoverage } from "../types";

/**
 * Merge OTel and log-parser sessions into a single unified array.
 * OTel sessions remain the primary record on overlap. Log shutdown metrics
 * take priority for total/per-model credits and API duration when available.
 */
export function mergeSessions(
  otelSessions: NormalizedSession[],
  logsSessions: NormalizedSession[]
): NormalizedSession[] {
  const logsById = new Map(logsSessions.map((session) => [session.sessionId, session]));
  const otelIds = new Set(otelSessions.map((session) => session.sessionId));

  const mergedOtel = otelSessions.map((otel) => {
    const logs = logsById.get(otel.sessionId);
    if (!logs) return otel;

    const totalCost = logs.totalCost ?? otel.totalCost;
    const costSource = logs.totalCost !== undefined ? "logs" as const : otel.costSource;
    const preferredModelCosts = logs.modelCosts ?? otel.modelCosts;
    const modelCosts = costsReconcile(totalCost, preferredModelCosts)
      ? preferredModelCosts
      : undefined;

    return {
      ...otel,
      ...(totalCost !== undefined ? { totalCost } : {}),
      ...(costSource !== undefined ? { costSource } : {}),
      ...(modelCosts !== undefined ? { modelCosts: { ...modelCosts } } : { modelCosts: undefined }),
      ...(logs.apiDurationMs !== undefined
        ? {
            apiDurationMs: logs.apiDurationMs,
            apiDurationSource: logs.apiDurationSource ?? ("logs" as const),
          }
        : {}),
    };
  });

  const uniqueLogsSessions = logsSessions.filter((session) => !otelIds.has(session.sessionId));
  return [...mergedOtel, ...uniqueLogsSessions];
}

function costsReconcile(
  totalCost: number | undefined,
  modelCosts: Record<string, number> | undefined
): modelCosts is Record<string, number> {
  if (!modelCosts || Object.keys(modelCosts).length === 0) return false;
  if (totalCost === undefined) return true;
  const modelTotal = Object.values(modelCosts).reduce((sum, cost) => sum + cost, 0);
  return Math.abs(modelTotal - totalCost) <= 1e-9;
}

/**
 * Compute per-source session counts and cost-availability from a merged
 * session array (typically the final report sessions after any --max slice).
 */
export function computeSourceCoverage(sessions: NormalizedSession[]): SourceCoverage {
  let otelCount = 0;
  let logsCount = 0;
  for (const s of sessions) {
    if (s.source === "otel") otelCount++;
    else logsCount++;
  }
  const sessionsWithCost = sessions.filter((session) => session.totalCost !== undefined).length;
  const costCoverage: "all" | "partial" | "none" =
    sessions.length > 0 && sessionsWithCost === sessions.length
      ? "all"
      : sessionsWithCost > 0
        ? "partial"
        : "none";
  return { otelCount, logsCount, costCoverage };
}

/**
 * Derive the report-level source label from a coverage object.
 * "mixed" when both sources contributed sessions; falls back to the
 * dominant source, or "logs" when the report is empty.
 */
export function computeReportSource(coverage: SourceCoverage): ReportSourceKind {
  if (coverage.otelCount > 0 && coverage.logsCount > 0) return "mixed";
  if (coverage.otelCount > 0) return "otel";
  return "logs";
}
