import { Report, ParsedSession, SessionCredits, InProgressSession, ModelCredits } from "../types";
import { Renderer } from "./Renderer";

const HEAVY = "═".repeat(79);
const LIGHT = "─".repeat(79);

/** Format a number with comma thousands separators */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Format credits to 2 decimal places, trimming trailing zeros */
function fmtCredits(n: number): string {
  if (n === 0) return "0";
  if (n >= 10) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  return n.toFixed(2).replace(/\.?0+$/, "") || "0";
}

/** Convert UTC ISO string to local datetime string: "YYYY-MM-DD HH:MM (local)" */
function toLocalDateTimeStr(utcIso: string): string {
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return utcIso + " (local)";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${min} (local)`;
}

/**
 * Render a two-column token row.
 * Layout: "    Label1:  RightAligned    Label2:  RightAligned"
 */
function tokenRow(
  label1: string,
  val1: number,
  label2: string,
  val2: number
): string {
  const v1 = fmt(val1).padStart(12);
  const v2 = fmt(val2).padStart(12);
  const l1 = (label1 + ":").padEnd(14);
  const l2 = (label2 + ":").padEnd(14);
  return `    ${l1}${v1}    ${l2}${v2}`;
}

function renderModelBlock(mc: ModelCredits): string {
  const lines: string[] = [];
  lines.push(`  ${mc.modelName}`);
  lines.push(tokenRow("Input", mc.tokens.inputTokens, "Cache Read", mc.tokens.cacheReadTokens));
  lines.push(tokenRow("Cache Write", mc.tokens.cacheWriteTokens, "Output", mc.tokens.outputTokens));

  if (!mc.unknownRate && mc.estimatedCredits !== undefined) {
    lines.push(`    → ~${fmtCredits(mc.estimatedCredits)} credits (estimated)`);
  }
  // If unknown rate, warning already emitted by credits.ts; no credit line here

  return lines.join("\n");
}

function renderSessionBlock(session: ParsedSession, credits: SessionCredits): string {
  const lines: string[] = [];

  lines.push(HEAVY);
  lines.push(`SESSION: ${session.sessionId}`);
  lines.push(`Date:    ${toLocalDateTimeStr(session.startTime)}`);

  if (credits.hasUnknownRates && credits.totalCredits === 0) {
    lines.push(`Credits: (unknown — model not in rate table)`);
  } else if (credits.hasUnknownRates) {
    lines.push(`Credits: ~${fmtCredits(credits.totalCredits)} AI credits (partial — some models unknown)`);
  } else {
    lines.push(`Credits: ~${fmtCredits(credits.totalCredits)} AI credits`);
  }

  lines.push(`Path:    ${session.eventsPath}`);
  lines.push(LIGHT);

  // Per-model blocks
  const modelEntries = credits.models;
  for (let i = 0; i < modelEntries.length; i++) {
    lines.push(renderModelBlock(modelEntries[i]));
    if (i < modelEntries.length - 1) {
      lines.push("");
    }
  }

  lines.push(LIGHT);

  // Totals
  let totalInput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalOutput = 0;
  for (const mc of credits.models) {
    totalInput += mc.tokens.inputTokens;
    totalCacheRead += mc.tokens.cacheReadTokens;
    totalCacheWrite += mc.tokens.cacheWriteTokens;
    totalOutput += mc.tokens.outputTokens;
  }

  lines.push("  TOTALS");
  lines.push(tokenRow("Input", totalInput, "Cache Read", totalCacheRead));
  lines.push(tokenRow("Cache Write", totalCacheWrite, "Output", totalOutput));

  lines.push(HEAVY);

  return lines.join("\n");
}

function renderInProgressBlock(session: InProgressSession): string {
  const lines: string[] = [];
  lines.push(HEAVY);
  lines.push(`SESSION: ${session.sessionId}`);
  if (session.startTime) {
    lines.push(`Date:    ${toLocalDateTimeStr(session.startTime)}`);
  }
  lines.push(`Path:    ${session.eventsPath}`);
  lines.push(LIGHT);
  lines.push("  [IN PROGRESS — no token data]");
  lines.push(HEAVY);
  return lines.join("\n");
}

/**
 * TextRenderer — renders the report to stdout in the specified text format.
 */
export class TextRenderer implements Renderer {
  render(report: Report): void {
    const allSessions: string[] = [];

    // Completed sessions
    for (const { session, credits } of report.sessions) {
      allSessions.push(renderSessionBlock(session, credits));
    }

    // In-progress sessions
    for (const inProgress of report.inProgressSessions) {
      allSessions.push(renderInProgressBlock(inProgress));
    }

    if (allSessions.length === 0) {
      process.stdout.write(`No sessions found for ${report.filterDescription}.\n`);
      return;
    }

    for (const block of allSessions) {
      process.stdout.write(block + "\n\n");
    }

    // Footer
    const totalSessions = report.sessions.length + report.inProgressSessions.length;
    const creditStr = report.hasUnknownRates
      ? `~${fmtCredits(report.totalCredits)} AI credits (partial)`
      : `~${fmtCredits(report.totalCredits)} AI credits`;

    process.stdout.write(`SUMMARY: ${totalSessions} session${totalSessions !== 1 ? "s" : ""} | ${creditStr} total\n`);
  }
}
