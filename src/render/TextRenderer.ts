import { Report, ParsedSession, TokenCounts } from "../types";
import { tokenPartition, totalTokens, hasTokenData } from "../tokens";
import { Renderer } from "./Renderer";

const HEAVY = "═".repeat(79);
const LIGHT = "─".repeat(79);

/** Format a number with comma thousands separators */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
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

/** A single label/value pair on its own row (left column only). */
function singleRow(label: string, val: number): string {
  const v = fmt(val).padStart(12);
  const l = (label + ":").padEnd(14);
  return `    ${l}${v}`;
}

function renderModelBlock(modelName: string, tokens: TokenCounts): string {
  const p = tokenPartition(tokens);
  const lines: string[] = [];
  lines.push(`  ${modelName}`);
  lines.push(tokenRow("Fresh Input", p.freshInput, "Output", p.output));
  lines.push(tokenRow("Cache Read", p.cacheRead, "Cache Write", p.cacheWrite));
  lines.push(singleRow("Total (I/O)", p.total));
  return lines.join("\n");
}

function renderSessionBlock(session: ParsedSession): string {
  const lines: string[] = [];
  lines.push(HEAVY);
  lines.push(`SESSION: ${session.sessionId}`);
  lines.push(`Date:    ${toLocalDateTimeStr(session.startTime)}`);
  lines.push(`Path:    ${session.eventsPath}`);
  lines.push(LIGHT);

  const modelEntries = Object.entries(session.models);
  for (let i = 0; i < modelEntries.length; i++) {
    const [modelName, tokens] = modelEntries[i];
    lines.push(renderModelBlock(modelName, tokens));
    if (i < modelEntries.length - 1) {
      lines.push("");
    }
  }

  lines.push(LIGHT);

  let totalFreshInput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalOutput = 0, grandTotal = 0;
  for (const tokens of Object.values(session.models)) {
    const p = tokenPartition(tokens);
    totalFreshInput += p.freshInput;
    totalCacheRead += p.cacheRead;
    totalCacheWrite += p.cacheWrite;
    totalOutput += p.output;
    grandTotal += totalTokens(tokens);
  }

  lines.push("  TOTALS");
  lines.push(tokenRow("Fresh Input", totalFreshInput, "Output", totalOutput));
  lines.push(tokenRow("Cache Read", totalCacheRead, "Cache Write", totalCacheWrite));
  lines.push(singleRow("Total (I/O)", grandTotal));
  lines.push(HEAVY);

  return lines.join("\n");
}

/**
 * TextRenderer — renders the report to stdout in plain text format.
 *
 * Silently excludes sessions with no billable token activity, matching the
 * behavior of the JSON and HTML renderers:
 *   1. In-progress sessions (no shutdown event)
 *   2. Completed sessions whose shutdown event recorded no input/output tokens
 *      (empty `modelMetrics` or all-zero counts across every model)
 */
export class TextRenderer implements Renderer {
  render(report: Report): void {
    const sessionsWithData = report.sessions.filter((s) => hasTokenData(s.models));
    const allSessions: string[] = sessionsWithData.map(renderSessionBlock);

    if (allSessions.length === 0) {
      process.stdout.write(`No sessions found for ${report.filterDescription}.\n`);
      return;
    }

    for (const block of allSessions) {
      process.stdout.write(block + "\n\n");
    }

    const totalSessions = sessionsWithData.length;
    process.stdout.write(`SUMMARY: ${totalSessions} session${totalSessions !== 1 ? "s" : ""}\n`);
  }
}
