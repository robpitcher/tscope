import { Report, NormalizedSession, TokenCounts } from "../types";
import { tokenPartition, totalTokens, hasTokenData } from "../tokens";
import { Renderer } from "./Renderer";
import { ansiEnabled, bold, dim } from "./style";
import { resolveClientLabel } from "../workspace";

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

function renderModelBlock(modelName: string, tokens: TokenCounts, styled: boolean): string {
  const p = tokenPartition(tokens);
  const lines: string[] = [];
  lines.push(`  ${bold(modelName, styled)}`);
  lines.push(tokenRow("Fresh Input", p.freshInput, "Output", p.output));
  lines.push(tokenRow("Cache Read", p.cacheRead, "Cache Write", p.cacheWrite));
  if (tokens.reasoningTokens > 0) {
    lines.push(singleRow("Reasoning", tokens.reasoningTokens));
  }
  lines.push(singleRow("Total (I/O)", p.total));
  return lines.join("\n");
}

/**
 * Format a duration in milliseconds as a short string used in the text
 * report. Mirrors the HTML renderer's formatter so output is consistent:
 *   < 1 s   → "850ms"
 *   < 10 s  → "4.7s"   (one decimal of precision)
 *   < 60 s  → "12s"
 *   < 1 h   → "2m 14s"
 *   ≥ 1 h   → "1h 23m"
 *
 * The hour/minute/second budget is decomposed from a *rounded* whole-second
 * count, which guarantees canonical output: rounding 59.95s up never yields
 * "1m 60s", and rounding 3599.5s up never yields "59m 60s" — the carry
 * propagates correctly into minutes and hours.
 */
function fmtDurationMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 10) {
    const txt = totalSec.toFixed(1).replace(/\.0$/, "");
    // If toFixed(1) pushed us to "10" (e.g. 9.96 → "10.0" → "10"), fall
    // through to the integer-second branch for a consistent display.
    if (txt !== "10") return `${txt}s`;
  }
  const totalSecRounded = Math.round(totalSec);
  if (totalSecRounded < 60) return `${totalSecRounded}s`;
  const hr = Math.floor(totalSecRounded / 3600);
  const remAfterHr = totalSecRounded - hr * 3600;
  const min = Math.floor(remAfterHr / 60);
  const sec = remAfterHr - min * 60;
  if (hr === 0) return `${min}m ${sec}s`;
  return `${hr}h ${min}m`;
}

function renderSessionBlock(session: NormalizedSession, styled: boolean): string {
  const lines: string[] = [];
  lines.push(bold(HEAVY, styled));
  lines.push(bold(`SESSION: ${session.sessionId}`, styled));
  lines.push(`Date:    ${toLocalDateTimeStr(session.startTime)}`);
  if (session.apiDurationMs !== undefined) {
    lines.push(`API time: ${fmtDurationMs(session.apiDurationMs)} (cumulative model compute)`);
  }
  lines.push(dim(`Path:    ${session.eventsPath}`, styled));
  lines.push(`Source:  ${session.source === "otel" ? "OTel" : "log parser"}`);
  if (session.clientName !== undefined) {
    const label = resolveClientLabel(session.clientName) ?? session.clientName;
    lines.push(`Client:  ${label}`);
  }
  lines.push(LIGHT);

  const modelEntries = Object.entries(session.models);
  for (let i = 0; i < modelEntries.length; i++) {
    const [modelName, tokens] = modelEntries[i];
    lines.push(renderModelBlock(modelName, tokens, styled));
    if (i < modelEntries.length - 1) {
      lines.push("");
    }
  }

  lines.push(LIGHT);

  let totalFreshInput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalOutput = 0, grandTotal = 0, totalReasoning = 0;
  for (const tokens of Object.values(session.models)) {
    const p = tokenPartition(tokens);
    totalFreshInput += p.freshInput;
    totalCacheRead += p.cacheRead;
    totalCacheWrite += p.cacheWrite;
    totalOutput += p.output;
    grandTotal += totalTokens(tokens);
    totalReasoning += tokens.reasoningTokens;
  }

  lines.push(`  ${bold("TOTALS", styled)}`);
  lines.push(tokenRow("Fresh Input", totalFreshInput, "Output", totalOutput));
  lines.push(tokenRow("Cache Read", totalCacheRead, "Cache Write", totalCacheWrite));
  if (totalReasoning > 0) {
    lines.push(singleRow("Reasoning", totalReasoning));
  }
  lines.push(singleRow("Total (I/O)", grandTotal));

  if (session.totalCost !== undefined) {
    const numStr = session.totalCost.toFixed(2).padStart(12);
    lines.push(`    ${"Cost:".padEnd(14)}${numStr} credits`);
    if (session.modelCosts !== undefined) {
      for (const [model, cost] of Object.entries(session.modelCosts)) {
        const costStr = cost.toFixed(2).padStart(12);
        lines.push(`      ${model.padEnd(12)}${costStr} cr`);
      }
    }
  }
  if (session.extended?.contextWindow) {
    const cw = session.extended.contextWindow;
    const pct = (Math.max(0, Math.min(1, cw.utilizationRatio)) * 100).toFixed(0);
    const usedStr = fmt(cw.usedTokens).padStart(12);
    lines.push(`    ${"Context:".padEnd(14)}${usedStr} / ${fmt(cw.limitTokens)} tokens (${pct}% used)`);
  }

  lines.push(bold(HEAVY, styled));

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
    const styled = ansiEnabled();
    const allSessions: string[] = sessionsWithData.map((s) => renderSessionBlock(s, styled));

    if (allSessions.length === 0) {
      process.stdout.write(`No sessions found for ${report.filterDescription}.\n`);
    } else {
      for (const block of allSessions) {
        process.stdout.write(block + "\n\n");
      }

      const totalSessions = sessionsWithData.length;
      process.stdout.write(
        `${bold(`SUMMARY: ${totalSessions} session${totalSessions !== 1 ? "s" : ""}`, styled)}\n`
      );
    }

    const anyLogCost = sessionsWithData.some((s) => s.source === "logs" && s.totalCost !== undefined);

    if (report.source === "mixed") {
      const { otelCount, logsCount } = report.coverage;
      const costDesc = anyLogCost
        ? "cost available for OTel sessions; estimated credits for some log sessions"
        : "cost available for OTel sessions only";
      process.stdout.write(`Sources: ${otelCount} OTel, ${logsCount} logs — ${costDesc}\n`);
    } else {
      const sourceLabel =
        report.source === "otel" ? "OpenTelemetry" : "event logs (historical)";
      const costNote = report.source === "logs"
        ? anyLogCost
          ? " — estimated AI credits from event log where available"
          : " — cost data unavailable"
        : "";
      process.stdout.write(`Source: ${sourceLabel}${costNote}\n`);
    }
  }
}
