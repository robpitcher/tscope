import { Report, ParsedSession, InProgressSession, TokenCounts } from "../types";
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

function renderModelBlock(modelName: string, tokens: TokenCounts): string {
  const lines: string[] = [];
  lines.push(`  ${modelName}`);
  lines.push(tokenRow("Input", tokens.inputTokens, "Cache Read", tokens.cacheReadTokens));
  lines.push(tokenRow("Cache Write", tokens.cacheWriteTokens, "Output", tokens.outputTokens));
  return lines.join("\n");
}

function renderSessionBlock(session: ParsedSession): string {
  const lines: string[] = [];
  lines.push(HEAVY);
  lines.push(`SESSION: ${session.sessionId}`);
  lines.push(`Date:    ${toLocalDateTimeStr(session.startTime)}`);
  lines.push(`Path:    ${session.eventsPath}`);
  if (session.totalPremiumRequests > 0) {
    lines.push(`Premium: ${session.totalPremiumRequests} requests`);
  }
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

  let totalInput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalOutput = 0;
  for (const tokens of Object.values(session.models)) {
    totalInput += tokens.inputTokens;
    totalCacheRead += tokens.cacheReadTokens;
    totalCacheWrite += tokens.cacheWriteTokens;
    totalOutput += tokens.outputTokens;
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
 * TextRenderer — renders the report to stdout in plain text format.
 */
export class TextRenderer implements Renderer {
  render(report: Report): void {
    const allSessions: string[] = [];

    for (const session of report.sessions) {
      allSessions.push(renderSessionBlock(session));
    }

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

    const totalSessions = report.sessions.length + report.inProgressSessions.length;
    process.stdout.write(`SUMMARY: ${totalSessions} session${totalSessions !== 1 ? "s" : ""}\n`);
  }
}
