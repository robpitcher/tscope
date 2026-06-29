import { Report, NormalizedSession } from "../types";
import { Renderer } from "./Renderer";
import { hasTokenData, tokenPartition } from "../tokens";

/**
 * Schema version — bumped to v6.
 * v6 adds: optional `client` field per session (raw `clientName` from
 * `workspace.yaml`, e.g. "github/cli", "github/autopilot", "sdk") and optional
 * `anomalous: true` in a model's `usage` block when `tokenPartition()` detects
 * that the server reported more cache tokens than total input tokens.
 * All v5 fields are preserved and additive.
 *
 * (v5 history: `source` provenance, `costAvailable`, `coverage`, optional
 * per-session `totalCost` / `modelCosts`.
 *  v3: `summary.totalTokens` and per-session `totals.total` switched to
 *  `input + output` only. v2: removed credit estimation entirely.)
 */
const SCHEMA_VERSION = "tscope/report/v6";

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

function serializeCompletedSession(session: NormalizedSession) {
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
    const part = tokenPartition(tokens);
    return {
      modelName,
      usage: {
        input: tokens.inputTokens,
        output: tokens.outputTokens,
        cacheRead: tokens.cacheReadTokens,
        cacheWrite: tokens.cacheWriteTokens,
        reasoning: tokens.reasoningTokens,
        ...(part.anomalous ? { anomalous: true as const } : {}),
      },
    };
  });

  return {
    sessionId: session.sessionId,
    path: session.eventsPath,
    startTime: session.startTime,
    localDateTime: toLocalDateTime(session.startTime),
    inProgress: false as const,
    apiDurationMs: session.apiDurationMs ?? null,
    source: session.source,
    ...(session.clientName !== undefined ? { client: session.clientName } : {}),
    ...(session.totalCost !== undefined ? { totalCost: session.totalCost } : {}),
    ...(session.modelCosts !== undefined ? { modelCosts: session.modelCosts } : {}),
    ...(session.extended !== undefined ? { extended: session.extended } : {}),
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
 * ## Schema: tscope/report/v6
 * Top-level fields:
 *   schema         — stable identifier, bump on breaking changes
 *   generatedAt    — ISO 8601 UTC timestamp of report generation
 *   source         — "otel" | "logs" | "mixed" — data source(s) in this report
 *   costAvailable  — true if any OTel sessions are present (otelCount > 0)
 *   coverage       — { otelCount, logsCount, costCoverage: "all"|"partial"|"none" }
 *                    N OTel / M logs session counts; costCoverage:
 *                      "all"     = all sessions have cost (pure OTel)
 *                      "partial" = mixed: some have cost (OTel), some don't (logs)
 *                      "none"    = no sessions have cost (pure logs or empty)
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
 *     inProgress (always false), apiDurationMs (cumulative model API ms across
 *     runs, or null when no shutdown reported it), source ("otel"|"logs"),
 *     client (optional — raw client_name from workspace.yaml, e.g. "github/cli",
 *     "github/autopilot", "sdk"; absent when workspace.yaml unreadable),
 *     totalCost (AI credits, when available), modelCosts (OTel only,
 *     per-model credits), models[], totals
 *   models[]       — modelName, usage{input,output,cacheRead,cacheWrite,reasoning,
 *                    anomalous? (true when server reported more cache tokens than
 *                    total input tokens, indicating inconsistent source data)}
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
      source: report.source,
      costAvailable: report.costAvailable,
      coverage: report.coverage,
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
