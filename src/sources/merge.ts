/**
 * Merge helpers for combining OTel and log-parser sessions into a single
 * unified NormalizedSession[].
 *
 * Dedup rule: if a session ID appears in both sources, the OTel record wins
 * and the logs duplicate is discarded — no double-counting.
 *
 * These helpers are stateless pure functions; all IO is the caller's
 * responsibility.
 */

import { NormalizedSession, ReportSourceKind, SourceCoverage } from "../types";

/**
 * Merge OTel and log-parser sessions into a single unified array.
 * OTel sessions take priority: any logs session whose ID matches an OTel
 * session is silently dropped (OTel is authoritative on overlap).
 */
export function mergeSessions(
  otelSessions: NormalizedSession[],
  logsSessions: NormalizedSession[]
): NormalizedSession[] {
  const otelIds = new Set(otelSessions.map((s) => s.sessionId));
  const uniqueLogsSessions = logsSessions.filter((s) => !otelIds.has(s.sessionId));
  return [...otelSessions, ...uniqueLogsSessions];
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
  const costCoverage: "all" | "partial" | "none" =
    otelCount > 0 && logsCount === 0
      ? "all"
      : otelCount > 0
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
