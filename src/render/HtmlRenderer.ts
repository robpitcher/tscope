/**
 * HtmlRenderer — generates a self-contained, system-theme-aware HTML dashboard.
 *
 * Writes a single .html file with inline CSS, JS, and SVG — zero external
 * dependencies, fully offline/email-able. Follows the OS light/dark preference
 * by default, with a manual override toggle.
 *
 * Visuals (in order of priority):
 *   1 Per-model token stacked bar (freshInput/cacheRead/cacheWrite/output)
 *   2 Tokens-by-model horizontal bars (total tokens per model, hover for breakdown)
 *   3 Cache-efficiency % pill per model
 *   4 Tokens-over-time bar chart across sessions (hover for token breakdown)
 *   5 Session header cards (id, datetime, path, totals)
 *
 * Token math note: Copilot's `inputTokens` already includes cache read/write, so
 * the only non-overlapping total is `input + output`. Bars/tooltips use the
 * disjoint partition `freshInput + cacheRead + cacheWrite + output` (see tokens.ts).
 */

import * as fs from "fs";
import { Report, ParsedSession, InProgressSession, TokenCounts, ChronicleTip, NormalizedSession } from "../types";
import { tokenPartition, totalTokens, hasTokenData } from "../tokens";
import { Renderer } from "./Renderer";

/** Public repository URL, surfaced in the header logo link and footer. */
const REPO_URL = "https://github.com/robpitcher/tscope";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** HTML-escape a string to prevent markup injection */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Format a number with thousands separators */
function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

/** Format large token counts compactly (e.g. 1.2M, 45K) */
function fmtTokensCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/**
 * Format a duration in milliseconds as a short human-readable string:
 *   < 1 s   → "850ms"
 *   < 10 s  → "4.7s"  (one decimal of precision)
 *   < 60 s  → "12s"
 *   < 1 h   → "2m 14s"
 *   ≥ 1 h   → "1h 23m"
 * Returns "—" for negative/non-finite inputs.
 *
 * Hours/minutes/seconds are decomposed from a *rounded* whole-second budget
 * so rounding can never produce non-canonical "1m 60s" / "59m 60s" output —
 * the carry propagates correctly.
 */
function fmtDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 10) {
    const txt = totalSec.toFixed(1).replace(/\.0$/, "");
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

/** Convert UTC ISO string to local "YYYY-MM-DD HH:MM" */
function toLocalDateTime(utcIso: string): string {
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return esc(utcIso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${min}`;
}

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Token stacked bar chart (SVG)
// ---------------------------------------------------------------------------

const TOKEN_COLORS = {
  input: "#58a6ff",
  cacheRead: "#3fb950",
  cacheWrite: "#e3b341",
  output: "#a371f7",
};

interface ModelEntry { modelName: string; tokens: TokenCounts; }

function buildTokenBar(models: ModelEntry[]): string {
  if (models.length === 0) return "";

  const BAR_H = 22;
  const BAR_MAX_W = 420;
  const LABEL_W = 200;
  const ROW_GAP = 8;
  const LEGEND_H = 28;
  const SVG_W = LABEL_W + BAR_MAX_W + 80;
  const SVG_H = LEGEND_H + models.length * (BAR_H + ROW_GAP) + ROW_GAP;

  const totals = models.map((m) => totalTokens(m.tokens));
  const maxTotal = Math.max(...totals, 1);

  let bars = "";
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const y = LEGEND_H + i * (BAR_H + ROW_GAP);
    const p = tokenPartition(m.tokens);
    const totalTokensForBar = p.total;
    const scale = BAR_MAX_W / maxTotal;

    const segments: Array<{ tokens: number; color: string; label: string }> = [
      { tokens: p.freshInput, color: TOKEN_COLORS.input, label: "Fresh Input" },
      { tokens: p.cacheRead, color: TOKEN_COLORS.cacheRead, label: "Cache Read" },
      { tokens: p.cacheWrite, color: TOKEN_COLORS.cacheWrite, label: "Cache Write" },
      { tokens: p.output, color: TOKEN_COLORS.output, label: "Output" },
    ];

    const name = m.modelName.length > 28 ? m.modelName.slice(0, 26) + "\u2026" : m.modelName;
    bars += `<text x="${LABEL_W - 8}" y="${y + BAR_H / 2 + 5}" text-anchor="end" class="bar-label">${esc(name)}</text>`;

    let xOff = LABEL_W;
    for (const seg of segments) {
      if (seg.tokens <= 0) continue;
      const w = Math.max(1, seg.tokens * scale);
      bars += `<rect x="${xOff.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${BAR_H}" fill="${seg.color}" rx="2"><title>${seg.label}: ${fmtNum(seg.tokens)}</title></rect>`;
      xOff += w;
    }

    bars += `<text x="${xOff + 6}" y="${y + BAR_H / 2 + 5}" class="bar-count">${fmtNum(totalTokensForBar)}</text>`;
  }

  const legendItems = [
    { label: "Fresh Input", color: TOKEN_COLORS.input },
    { label: "Cache Read", color: TOKEN_COLORS.cacheRead },
    { label: "Cache Write", color: TOKEN_COLORS.cacheWrite },
    { label: "Output", color: TOKEN_COLORS.output },
  ];
  let legend = "";
  let lx = LABEL_W;
  for (const item of legendItems) {
    legend += `<rect x="${lx}" y="4" width="12" height="12" fill="${item.color}" rx="2"/>`;
    legend += `<text x="${lx + 16}" y="14" class="legend-label">${item.label}</text>`;
    lx += item.label.length * 7 + 28;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}" class="chart-svg">
  <style>
    .bar-label { font: 12px/1 'SF Mono', 'Consolas', monospace; fill: var(--text-secondary); }
    .bar-count  { font: 11px/1 'SF Mono', 'Consolas', monospace; fill: var(--text-muted); }
    .legend-label { font: 11px/1 system-ui, sans-serif; fill: var(--text-secondary); }
  </style>
  ${legend}
  ${bars}
</svg>`.trim();
}

// ---------------------------------------------------------------------------
// Tokens-by-model horizontal bars (HTML/CSS)
// ---------------------------------------------------------------------------

function buildTokensByModelBars(models: ModelEntry[]): string {
  if (models.length === 0) return `<p class="muted-note">No model data</p>`;

  const totals = models.map((m) => totalTokens(m.tokens));
  const maxTotal = Math.max(...totals, 1);

  let html = `<div class="token-bars">`;
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const total = totals[i];
    const p = tokenPartition(m.tokens);
    const pct = clamp01(total / maxTotal) * 100;
    html += `
  <div class="token-bar-row has-tip" data-title="${esc(m.modelName)}" data-input="${p.freshInput}" data-cacheread="${p.cacheRead}" data-cachewrite="${p.cacheWrite}" data-output="${p.output}" data-total="${total}">
    <div class="token-bar-model-name">${esc(m.modelName)}</div>
    <div class="token-bar-wrap">
      <div class="token-bar-fill" style="width:${pct.toFixed(1)}%"></div>
    </div>
    <div class="token-bar-value">${fmtTokensCompact(total)}</div>
  </div>`;
  }
  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Cached-input pill (per model)
// ---------------------------------------------------------------------------
//
// Shows what fraction of each model's billed input tokens were served from
// the prompt cache (cheaper than fresh input). This is NOT a traditional
// "cache hit rate" (hits / lookups) — it's the share of input *tokens* that
// came from cache reads. Cache writes count as fresh for this purpose.
//
// We deliberately use a neutral pill (no green/amber/red) because there is
// no universally "good" target: a short one-shot prompt will be 0% and
// that's normal; a long iterative session with a stable prefix can climb
// past 80%. Treat it as informational, not a grade.

function buildCachePills(models: ModelEntry[]): string {
  if (models.length === 0) return "";
  let html = `<div class="cache-pills">`;
  for (const m of models) {
    const input = m.tokens.inputTokens;
    const cacheRead = m.tokens.cacheReadTokens;
    let pct = input > 0 ? (cacheRead / input) * 100 : 0;
    pct = Math.min(pct, 100);
    const label = input === 0 ? "n/a" : `${pct.toFixed(0)}%`;
    const tip = input === 0
      ? "No input tokens recorded for this model"
      : `Share of input tokens served from prompt cache (cacheRead / inputTokens)`;
    html += `
  <div class="cache-pill-row">
    <span class="cache-model-name">${esc(m.modelName)}</span>
    <span class="pill pill-neutral" title="${esc(tip)}">${label} cached input</span>
  </div>`;
  }
  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// Tokens-over-time chart (SVG vertical bars)
// ---------------------------------------------------------------------------

interface SessionTokenSummary {
  id: string;
  /** ISO 8601 UTC start time, or null if unknown (some in-progress sessions). */
  start: string | null;
  label: string;
  source: "otel" | "logs" | null;
  totalCost: number | null;
  models: string[];
  totalTokens: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  /** Cumulative model API time (ms) summed across runs; null when unknown. */
  apiDurationMs: number | null;
  inProgress: boolean;
}

function buildTokensTimelineChart(summaries: SessionTokenSummary[]): string {
  if (summaries.length === 0) return `<p class="muted-note">No sessions to chart</p>`;

  const BAR_W = 40;
  const BAR_GAP = 8;
  const CHART_H = 80;
  const TOP_PAD = 18;      // room for value labels above bars
  const LABEL_H = 18;      // room for per-bar truncated id labels
  const AXIS_H = 18;       // room for the x-axis title
  const LEFT_MARGIN = 52;  // room for the rotated y-axis title
  const RIGHT_PAD = 12;
  const baselineY = TOP_PAD + CHART_H;
  const SVG_H = TOP_PAD + CHART_H + LABEL_H + AXIS_H;
  const plotW = summaries.length * (BAR_W + BAR_GAP) + BAR_GAP;
  const SVG_W = LEFT_MARGIN + plotW + RIGHT_PAD;

  const maxTokens = Math.max(...summaries.map((s) => s.totalTokens), 1);

  let bars = "";
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const x = LEFT_MARGIN + BAR_GAP + i * (BAR_W + BAR_GAP);
    const barH = Math.max(2, clamp01(s.totalTokens / maxTokens) * CHART_H);
    const y = baselineY - barH;
    const labelText = s.label.length > 8 ? s.label.slice(0, 8) : s.label;
    const cls = `tl-bar has-tip${s.inProgress ? " in-progress" : ""}`;
    bars += `<rect x="${x}" y="${y.toFixed(1)}" width="${BAR_W}" height="${barH.toFixed(1)}" rx="3" class="${cls}" tabindex="0" role="button" aria-label="Jump to session ${esc(s.label)}" data-session-id="${esc(s.id)}" data-input="${s.input}" data-cacheread="${s.cacheRead}" data-cachewrite="${s.cacheWrite}" data-output="${s.output}" data-total="${s.totalTokens}"></rect>`;
    bars += `<text x="${x + BAR_W / 2}" y="${baselineY + 13}" text-anchor="middle" class="tl-label">${esc(labelText)}</text>`;
    if (!s.inProgress && s.totalTokens > 0) {
      bars += `<text x="${x + BAR_W / 2}" y="${Math.max(12, y - 3).toFixed(1)}" text-anchor="middle" class="tl-value">${fmtTokensCompact(s.totalTokens)}</text>`;
    }
  }

  const xTitleX = LEFT_MARGIN + plotW / 2;
  const xTitleY = SVG_H - 3;
  const yTitleX = 13;
  const yTitleY = TOP_PAD + CHART_H / 2;
  const axes =
    `<text x="${xTitleX}" y="${xTitleY}" text-anchor="middle" class="axis-title">Session Id (truncated)</text>` +
    `<text x="${yTitleX}" y="${yTitleY}" text-anchor="middle" class="axis-title" transform="rotate(-90 ${yTitleX} ${yTitleY})">Token count</text>`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}" class="chart-svg timeline-svg">
  <style>
    .tl-bar { fill: ${TOKEN_COLORS.input}; cursor: pointer; transition: fill-opacity .12s ease; }
    .tl-bar:hover { fill-opacity: .8; }
    .tl-bar:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
    .tl-bar.in-progress { fill: var(--text-muted); }
    .tl-label { font: 9px/1 'SF Mono','Consolas',monospace; fill: var(--text-secondary); }
    .tl-value { font: 10px/1 system-ui,sans-serif; fill: var(--text-muted); }
    .axis-title { font: 10px/1 system-ui,sans-serif; fill: var(--text-secondary); font-weight: 600; letter-spacing: .03em; }
  </style>
  ${axes}
  ${bars}
</svg>`.trim();
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

/**
 * Convert a constrained subset of Markdown to safe HTML for chronicle tips.
 * All text is HTML-escaped first; only the tags this function emits are
 * introduced, so the output cannot inject markup. Supports headings, ordered
 * and unordered lists, bold, italic, inline code, links (rendered as plain
 * text), and paragraphs.
 */
function renderMarkdownToHtml(md: string): string {
  const inline = (text: string): string => {
    let s = esc(text);
    // Protect inline code spans so bold/italic/link passes can't alter their
    // contents, then restore them afterwards.
    const codes: string[] = [];
    const codeSentinel = "\u0000";
    s = s.replace(/`([^`]+)`/g, (_m, c) => {
      codes.push(c);
      return `${codeSentinel}CODE${codes.length - 1}${codeSentinel}`;
    });
    // Links [text](url) -> "text (url)" as plain text (no anchors, keeps the
    // report's "only repo links" guarantee and avoids unsafe schemes).
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `${t} (${u})`);
    s = s.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_m, pre, i) => `${pre}<em>${i}</em>`);
    const codePattern = new RegExp(`${codeSentinel}CODE(\\d+)${codeSentinel}`, "g");
    s = s.replace(codePattern, (_m, idx) => `<code>${codes[Number(idx)]}</code>`);
    return s;
  };

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let para: string[] = [];

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (!trimmed) {
      flushPara();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      const level = Math.min(6, heading[1].length + 2); // # -> h3, ## -> h4 ...
      out.push(`<h${level} class="ct-h">${inline(heading[2])}</h${level}>`);
      continue;
    }

    const ulItem = trimmed.match(/^[-*]\s+(.*)$/);
    if (ulItem) {
      flushPara();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(ulItem[1])}</li>`);
      continue;
    }

    const olItem = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olItem) {
      flushPara();
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(olItem[1])}</li>`);
      continue;
    }

    closeList();
    para.push(trimmed);
  }

  flushPara();
  closeList();
  return out.join("\n");
}

/** Pick the single most recent chronicle tip across all sessions (or null). */
function pickMostRecentChronicleTip(
  sessions: ParsedSession[],
  inProgressSessions: InProgressSession[]
): { tip: ChronicleTip; sessionId: string } | null {
  let best: { tip: ChronicleTip; sessionId: string } | null = null;
  const consider = (sessionId: string, tips: ChronicleTip[]) => {
    for (const tip of tips) {
      if (best === null || tip.timestamp > best.tip.timestamp) {
        best = { tip, sessionId };
      }
    }
  };
  for (const s of sessions) consider(s.sessionId, s.chronicleTips);
  for (const s of inProgressSessions) consider(s.sessionId, s.chronicleTips);
  return best;
}

/**
 * Build the standalone Chronicle Insights box for the single most recent tip.
 * Rendered as its own section (mirrors the "Tokens Over Time" box) rather than
 * inside a session card.
 */
function buildChronicleBox(
  entry: { tip: ChronicleTip; sessionId: string } | null
): string {
  if (!entry) return "";
  const { tip, sessionId } = entry;
  const when = tip.timestamp ? toLocalDateTime(tip.timestamp) : "";
  const meta =
    `/chronicle ${esc(tip.variant)}` +
    (when ? ` &middot; ${esc(when)}` : "") +
    ` &middot; session <code>${esc(sessionId.slice(0, 8))}</code>`;
  return `
<div class="container">
  <section class="timeline-section chronicle-box">
    <details class="chronicle-details">
      <summary class="chronicle-summary">
        <span class="chronicle-caret">&#x25B8;</span>
        <span class="chronicle-summary-main">&#x1F4A1; Chronicle Insights</span>
        <span class="chronicle-summary-note">A <code>/chronicle ${esc(tip.variant)}</code> run was detected within the session scope of this report &mdash; expand for the details.</span>
      </summary>
      <p class="chronicle-source">${meta}</p>
      <div class="chronicle-body">${renderMarkdownToHtml(tip.markdown)}</div>
    </details>
  </section>
</div>`;
}

// ---------------------------------------------------------------------------
// Credits by model list (OTel-only)
// ---------------------------------------------------------------------------

function buildCreditsByModel(models: ModelEntry[], modelCosts: Record<string, number>): string {
  if (models.length === 0) return `<p class="muted-note">No model data</p>`;
  let html = `<div class="credits-list">`;
  for (const m of models) {
    const cost = modelCosts[m.modelName] ?? 0;
    html += `
  <div class="credit-row">
    <span class="credit-model-name">${esc(m.modelName)}</span>
    <span class="credit-value">${cost.toFixed(2)} cr</span>
  </div>`;
  }
  html += `</div>`;
  return html;
}

function buildSessionCard(session: NormalizedSession): string {
  const dateStr = toLocalDateTime(session.startTime);
  const modelEntries: ModelEntry[] = Object.entries(session.models).map(
    ([modelName, tokens]) => ({ modelName, tokens })
  );

  let totalFreshInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
  for (const m of modelEntries) {
    const p = tokenPartition(m.tokens);
    totalFreshInput += p.freshInput;
    totalOutput += p.output;
    totalCacheRead += p.cacheRead;
    totalCacheWrite += p.cacheWrite;
  }
  const totalTokensForCard = totalFreshInput + totalCacheRead + totalCacheWrite + totalOutput;

  return `
<article class="session-card" data-session-id="${esc(session.sessionId)}">
  <div class="session-header">
    <div class="session-meta">
      <span class="session-id">${esc(session.sessionId)}</span>
      <span class="session-datetime">${dateStr}</span>
    </div>
    <div class="session-summary-chips">
      ${session.source === "otel"
        ? `<span class="source-badge source-badge--otel" title="Data source: OpenTelemetry">OTel</span>`
        : `<span class="source-badge source-badge--logs" title="Data source: event log parser — cost data unavailable">log parser</span>`}
      ${session.apiDurationMs !== undefined ? `<span class="chip chip-duration" title="Cumulative model API time (compute only — excludes idle / user think time)">${esc(fmtDuration(session.apiDurationMs))} API</span>` : ""}
      <span class="chip chip-tokens">${fmtNum(totalTokensForCard)} tokens</span>
      ${session.totalCost !== undefined
        ? `<span class="chip chip-credits" title="Estimated AI credits from OpenTelemetry billing data">${session.totalCost.toFixed(2)} credits</span>`
        : session.source === "logs"
        ? `<span class="chip chip-cost-unavail" title="Cost data unavailable — run &#x27;tscope otel enable&#x27; to get billing data">no cost data</span>`
        : ""}
    </div>
  </div>
  <div class="session-path">${esc(session.eventsPath)}</div>

  ${modelEntries.length > 0 ? `
  <div class="session-charts">
    <div class="chart-section">
      <h3 class="chart-title">Token Usage by Model</h3>
      ${buildTokenBar(modelEntries)}
    </div>
    <div class="chart-columns">
      <div class="chart-section">
        <h3 class="chart-title">Tokens by Model</h3>
        ${buildTokensByModelBars(modelEntries)}
      </div>
      <div class="chart-section">
        <h3 class="chart-title">Cached Input %</h3>
        ${buildCachePills(modelEntries)}
      </div>
      ${session.modelCosts !== undefined ? `
      <div class="chart-section">
        <h3 class="chart-title">Credits by Model</h3>
        ${buildCreditsByModel(modelEntries, session.modelCosts)}
      </div>` : ""}
    </div>
  </div>
  ` : `<p class="muted-note">No model data</p>`}

  ${modelEntries.length > 0 ? `
  <div class="token-totals-row">
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.input}"></span>Fresh Input: ${fmtNum(totalFreshInput)}</span>
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.cacheRead}"></span>Cache Read: ${fmtNum(totalCacheRead)}</span>
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.cacheWrite}"></span>Cache Write: ${fmtNum(totalCacheWrite)}</span>
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.output}"></span>Output: ${fmtNum(totalOutput)}</span>
  </div>
  ` : ""}

  ${session.extended?.contextWindow ? (() => {
    const cw = session.extended!.contextWindow!;
    const pct = clamp01(cw.utilizationRatio) * 100;
    const isHigh = pct >= 80;
    return `
  <div class="ctx-window-section">
    <h3 class="chart-title">Context Window</h3>
    <div class="ctx-window-wrap">
      <div class="ctx-window-fill${isHigh ? " ctx-window-high" : ""}" style="width:${pct.toFixed(1)}%" title="${fmtNum(cw.usedTokens)} / ${fmtNum(cw.limitTokens)} tokens used"></div>
    </div>
    <div class="ctx-window-label">${fmtNum(cw.usedTokens)} / ${fmtNum(cw.limitTokens)} tokens &middot; ${pct.toFixed(0)}% used</div>
  </div>`;
  })() : ""}
</article>`;
}

function buildInProgressCard(session: InProgressSession): string {
  const dateStr = session.startTime ? toLocalDateTime(session.startTime) : "unknown time";
  return `
<article class="session-card session-card--in-progress" data-session-id="${esc(session.sessionId)}">
  <div class="session-header">
    <div class="session-meta">
      <span class="session-id">${esc(session.sessionId)}</span>
      <span class="session-datetime">${dateStr}</span>
    </div>
    <div class="session-summary-chips">
      <span class="chip chip-in-progress">In Progress</span>
    </div>
  </div>
  <div class="session-path">${esc(session.eventsPath)}</div>
  <p class="muted-note in-progress-note">&#x23F3; Session is ongoing &#x2014; no token data yet</p>
</article>`;
}

// ---------------------------------------------------------------------------
// Inline CSS
// ---------------------------------------------------------------------------

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root, [data-theme="dark"] {
  --bg-base:       #0d1117;
  --bg-surface:    #161b22;
  --bg-elevated:   #21262d;
  --border:        #30363d;
  --text-primary:  #f0f6fc;
  --text-secondary: #b6c2cf;
  --text-muted:    #8b949e;
  --accent-blue:   #58a6ff;
  --accent-green:  #3fb950;
  --accent-amber:  #e3b341;
  --accent-red:    #f85149;
  --accent-purple: #a371f7;
  --radius:        8px;
  --radius-sm:     4px;
}

[data-theme="light"] {
  --bg-base:       #f6f8fa;
  --bg-surface:    #ffffff;
  --bg-elevated:   #f6f8fa;
  --border:        #d0d7de;
  --text-primary:  #1f2328;
  --text-secondary: #656d76;
  --text-muted:    #6e7781;
  --accent-blue:   #0969da;
  --accent-green:  #1a7f37;
  --accent-amber:  #9a6700;
  --accent-red:    #d1242f;
  --accent-purple: #8250df;
}

/* Follow the OS preference when the user has not chosen a theme explicitly */
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --bg-base:       #f6f8fa;
    --bg-surface:    #ffffff;
    --bg-elevated:   #f6f8fa;
    --border:        #d0d7de;
    --text-primary:  #1f2328;
    --text-secondary: #656d76;
    --text-muted:    #6e7781;
    --accent-blue:   #0969da;
    --accent-green:  #1a7f37;
    --accent-amber:  #9a6700;
    --accent-red:    #d1242f;
    --accent-purple: #8250df;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg-base);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
  min-height: 100vh;
}

a { color: var(--accent-blue); text-decoration: none; }
a:hover { text-decoration: underline; }

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 20px;
}

.site-header {
  border-bottom: 1px solid var(--border);
  padding: 20px 0;
  margin-bottom: 32px;
}

.site-header .container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.site-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.site-title .logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--accent-blue);
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}


.gh-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: color 0.15s;
}
.gh-link:hover { color: var(--text-primary); }
.gh-link svg { width: 22px; height: 22px; display: block; }

.theme-toggle {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 10px;
  transition: background 0.15s, color 0.15s;
}
.theme-toggle:hover { background: var(--border); color: var(--text-primary); }
.export-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.export-btn:disabled:hover { background: var(--bg-elevated); color: var(--text-secondary); }

.report-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
  margin-bottom: 12px;
}
.dashboard-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.dashboard-controls::-webkit-scrollbar {
  display: none;
}
.dashboard-controls > * {
  flex-shrink: 0;
}

.export-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 100px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 0 12px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: background 0.15s, color 0.15s;
}
.export-btn:hover {
  background: var(--border);
  color: var(--text-primary);
}

.summary-strip {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}

.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  flex: 1;
  min-width: 140px;
}

.stat-card .stat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.stat-card .stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-card .stat-value.accent-blue  { color: var(--accent-blue); }
.stat-card .stat-value.accent-green { color: var(--accent-green); }
.stat-card .stat-value.accent-amber { color: var(--accent-amber); }

.stat-card .stat-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.timeline-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 32px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.sessions-list { display: flex; flex-direction: column; gap: 20px; }

.session-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 24px;
  overflow: hidden;
}

.session-card--in-progress {
  border-color: var(--text-muted);
  opacity: 0.75;
}

.session-card--flash {
  animation: card-flash 1.6s ease-out;
}
@keyframes card-flash {
  0%   { box-shadow: 0 0 0 1px var(--accent-blue), 0 0 0 0 rgba(88,166,255,.5); }
  25%  { box-shadow: 0 0 0 1px var(--accent-blue), 0 0 0 8px rgba(88,166,255,.22); }
  100% { box-shadow: 0 0 0 0 rgba(88,166,255,0); }
}
@media (prefers-reduced-motion: reduce) {
  .session-card--flash { animation-duration: .01ms; }
}

/* Persistent selection ring applied when the user activates a timeline bar.
   Stays until the user clicks outside the card (or selects a different one). */
.session-card--selected {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 1px var(--accent-blue);
}

.session-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.session-meta { display: flex; flex-direction: column; gap: 2px; }

.session-id {
  font-family: 'SF Mono', 'Consolas', 'Liberation Mono', monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-blue);
  word-break: break-all;
}

.session-datetime {
  font-size: 12px;
  color: var(--text-secondary);
}

.session-summary-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

.chip {
  font-size: 11px;
  font-weight: 600;
  border-radius: 20px;
  padding: 2px 9px;
  white-space: nowrap;
}
.chip-tokens    { background: rgba(163,113,247,.12); color: var(--accent-purple); border: 1px solid rgba(163,113,247,.25); }
.chip-duration  { background: rgba(88,166,255,.10); color: var(--accent-blue); border: 1px solid rgba(88,166,255,.25); font-variant-numeric: tabular-nums; }
.chip-in-progress { background: rgba(72,79,88,.3); color: var(--text-secondary); border: 1px solid var(--border); }

.session-path {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
  margin-bottom: 16px;
}

.session-charts { display: flex; flex-direction: column; gap: 20px; }

.chart-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 680px) {
  .chart-columns { grid-template-columns: 1fr; }
}

.chart-section {}

.chart-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.chart-svg { display: block; max-width: 100%; overflow: visible; }
.timeline-svg { overflow: visible; }

.token-bars { display: flex; flex-direction: column; gap: 7px; }

.token-bar-row {
  display: grid;
  grid-template-columns: 160px 1fr 60px;
  align-items: center;
  gap: 8px;
}

.token-bar-model-name {
  font-size: 11px;
  font-family: 'SF Mono','Consolas',monospace;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-bar-wrap {
  background: var(--bg-elevated);
  border-radius: 3px;
  height: 12px;
  overflow: hidden;
}

.token-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  border-radius: 3px;
  min-width: 2px;
  transition: width 0.3s ease;
}

.token-bar-value {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: right;
  white-space: nowrap;
}

.cache-pills { display: flex; flex-direction: column; gap: 7px; }

.cache-pill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cache-model-name {
  font-size: 11px;
  font-family: 'SF Mono','Consolas',monospace;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.pill {
  font-size: 11px;
  font-weight: 600;
  border-radius: 20px;
  padding: 2px 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.pill-neutral {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.token-totals-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.token-total-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-secondary);
}

.token-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.muted-note {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.in-progress-note {
  margin-top: 12px;
}

/* Chronicle Insights (/chronicle tips & cost-tips) — roadmap #15 */
.chronicle-details { width: 100%; }

.chronicle-summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  user-select: none;
}
.chronicle-summary::-webkit-details-marker { display: none; }

.chronicle-summary-main {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.chronicle-summary-note {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}
.chronicle-summary-note code {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: "SF Mono", "Consolas", monospace;
  font-size: 11px;
}

.chronicle-caret {
  color: var(--accent-blue);
  transition: transform .15s ease;
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  align-self: center;
}
.chronicle-details[open] .chronicle-caret { transform: rotate(90deg); }

.chronicle-source {
  font-size: 12px;
  color: var(--text-muted);
  margin: 12px 0 14px;
}
.chronicle-source code {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: "SF Mono", "Consolas", monospace;
  font-size: 11px;
}

.chronicle-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}
.chronicle-body h3, .chronicle-body h4, .chronicle-body h5, .chronicle-body h6 {
  color: var(--text-secondary);
  margin: 12px 0 6px;
}
.chronicle-body h3 { font-size: 14px; }
.chronicle-body h4 { font-size: 13px; }
.chronicle-body h5, .chronicle-body h6 { font-size: 12px; }
.chronicle-body p { margin: 6px 0; }
.chronicle-body ul, .chronicle-body ol { margin: 6px 0 6px 20px; }
.chronicle-body li { margin: 3px 0; }
.chronicle-body code {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: "SF Mono", "Consolas", monospace;
  font-size: 12px;
}
.chronicle-body strong { color: var(--text-primary); font-weight: 600; }

.empty-state {
  text-align: center;
  padding: 64px 24px;
  color: var(--text-muted);
}

.empty-state h2 {
  font-size: 18px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.site-footer {
  border-top: 1px solid var(--border);
  margin-top: 48px;
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.footer-contribute {
  margin-top: 6px;
  color: var(--text-secondary);
}
.footer-contribute a { font-weight: 600; }

.chart-tooltip {
  position: fixed;
  z-index: 50;
  display: none;
  pointer-events: none;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-primary);
  box-shadow: 0 6px 20px rgba(0,0,0,.35);
  max-width: 260px;
}
.chart-tooltip .tip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.6;
  white-space: nowrap;
}
.chart-tooltip .tip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.chart-tooltip .tip-title { font-weight: 600; margin-bottom: 2px; }
.chart-tooltip .tip-total { font-weight: 600; }

.token-bar-row.has-tip { cursor: pointer; }

/* Source provenance badge */
.source-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  border-radius: 20px;
  padding: 3px 10px;
  white-space: nowrap;
  border: 1px solid;
}
.source-badge--otel {
  background: rgba(88,166,255,.12);
  color: var(--accent-blue);
  border-color: rgba(88,166,255,.25);
}
.source-badge--logs {
  background: var(--bg-elevated);
  color: var(--text-muted);
  border-color: var(--border);
}

/* Coverage summary in header (mixed source reports) */
.coverage-summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: 3px 10px;
  white-space: nowrap;
}
.cov-otel { color: var(--accent-blue); }
.cov-sep { color: var(--text-muted); }
.cov-logs { color: var(--text-muted); }

/* Cost-unavailable chip (logs sessions — complements .chip base class) */
.chip-cost-unavail {
  background: transparent;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  font-weight: 400;
}

/* AI credits chip (OTel sessions) */
.chip-credits { background: rgba(63,185,80,.12); color: var(--accent-green); border: 1px solid rgba(63,185,80,.25); }

/* Credits by model list */
.credits-list { display: flex; flex-direction: column; gap: 7px; }
.credit-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.credit-model-name {
  font-size: 11px;
  font-family: 'SF Mono','Consolas',monospace;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.credit-value {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--accent-green);
  white-space: nowrap;
}

/* Context-window utilization bar */
.ctx-window-section { margin-top: 16px; }
.ctx-window-wrap {
  height: 8px;
  background: var(--bg-elevated);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
}
.ctx-window-fill {
  height: 100%;
  background: var(--accent-blue);
  border-radius: 4px;
  min-width: 2px;
}
.ctx-window-high { background: var(--accent-amber); }
.ctx-window-label {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
`.trim();

// ---------------------------------------------------------------------------
// Inline JS (theme toggle, delegated chart tooltip, CSV export)
// ---------------------------------------------------------------------------

const JS = `
(function() {
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  var stored = null;
  try { stored = localStorage.getItem('tscope-theme'); } catch (e) {}
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  }
  function effective() {
    var dt = root.getAttribute('data-theme');
    if (dt) return dt;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function label() {
    if (!btn) return;
    btn.textContent = effective() === 'light' ? '\u2600 Light' : '\u263E Dark';
  }
  label();
  if (btn) {
    btn.addEventListener('click', function() {
      var next = effective() === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('tscope-theme', next); } catch (e) {}
      label();
    });
  }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function() { if (!root.getAttribute('data-theme')) label(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();

(function() {
  // Tooltip via event delegation so it survives timeline re-renders.
  var tip = document.getElementById('chart-tooltip');
  if (!tip) return;
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  var SEGMENTS = [
    { key: 'input', color: '#58a6ff', label: 'Fresh Input' },
    { key: 'cacheread', color: '#3fb950', label: 'Cache Read' },
    { key: 'cachewrite', color: '#e3b341', label: 'Cache Write' },
    { key: 'output', color: '#a371f7', label: 'Output' }
  ];
  function addRow(dotColor, text, cls) {
    var row = document.createElement('div');
    row.className = 'tip-row';
    if (dotColor) {
      var dot = document.createElement('span');
      dot.className = 'tip-dot';
      dot.style.background = dotColor;
      row.appendChild(dot);
    }
    var span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text;
    row.appendChild(span);
    tip.appendChild(row);
  }
  function build(el) {
    var d = el.dataset;
    tip.innerHTML = '';
    if (d.title) addRow(null, d.title, 'tip-title');
    for (var i = 0; i < SEGMENTS.length; i++) {
      var s = SEGMENTS[i];
      addRow(s.color, s.label + ': ' + fmt(d[s.key]));
    }
    addRow(null, 'Total: ' + fmt(d.total), 'tip-total');
  }
  function move(e) {
    var pad = 14;
    var r = tip.getBoundingClientRect();
    var x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > window.innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
    tip.style.left = Math.max(4, x) + 'px';
    tip.style.top = Math.max(4, y) + 'px';
  }
  function isEl(t) { return t && t.nodeType === 1 && t.closest; }
  var current = null;
  document.addEventListener('pointerover', function(e) {
    var t = e.target;
    if (!isEl(t)) return;
    var el = t.closest('.has-tip');
    if (!el || el === current) return;
    current = el;
    build(el);
    tip.style.display = 'block';
    move(e);
  });
  document.addEventListener('pointermove', function(e) { if (current) move(e); });
  document.addEventListener('pointerout', function(e) {
    if (!current) return;
    var rel = e.relatedTarget;
    if (rel && rel.nodeType === 1 && current.contains(rel)) return;
    current = null;
    tip.style.display = 'none';
  });
})();

(function() {
  // Click (or keyboard-activate) a timeline bar to jump to that session's card,
  // briefly flash it, AND apply a persistent selection ring that stays until
  // the user clicks somewhere outside the selected card (or activates another
  // bar, which moves the selection).
  function clearSelection() {
    var prev = document.querySelectorAll('.session-card--selected');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('session-card--selected');
  }
  function jump(bar) {
    var sid = bar.getAttribute('data-session-id');
    if (!sid) return;
    var card = document.querySelector('.session-card[data-session-id="' + sid + '"]');
    if (!card || card.style.display === 'none') return;
    if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearSelection();
    card.classList.add('session-card--selected');
    card.classList.remove('session-card--flash');
    void card.offsetWidth; // restart the animation if re-triggered
    card.classList.add('session-card--flash');
  }
  function barFrom(e) {
    var t = e.target;
    if (!t || t.nodeType !== 1 || !t.closest) return null;
    return t.closest('.tl-bar');
  }
  document.addEventListener('click', function(e) {
    var bar = barFrom(e);
    if (bar) { jump(bar); return; }
    // Click was outside any timeline bar — clear selection if the click was
    // also outside the currently selected card. Clicks inside the selected
    // card preserve the highlight so users can interact with the card content.
    var selected = document.querySelector('.session-card--selected');
    if (!selected) return;
    var target = e.target;
    if (target && target.nodeType === 1 && typeof selected.contains === 'function' && selected.contains(target)) return;
    clearSelection();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { clearSelection(); return; }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var bar = barFrom(e);
    if (bar) { e.preventDefault(); jump(bar); }
  });
})();

(function() {
  // Client-side CSV export of all sessions in the payload.
  var dataEl = document.getElementById('tscope-data');
  if (!dataEl) return;
  var DATA;
  try { DATA = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var SESSIONS = DATA.sessions || [];

  var CSV_COLUMNS = [
    'sessionId', 'startTime', 'label', 'source', 'inProgress', 'models',
    'totalTokens', 'totalCost', 'freshInputTokens', 'cacheReadTokens',
    'cacheWriteTokens', 'outputTokens', 'apiDurationMs'
  ];

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (/^[=+\\-@\\t\\r]/.test(s)) s = "'" + s;
    if (s.indexOf('"') !== -1 || s.indexOf(',') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildCsv(list) {
    var lines = [CSV_COLUMNS.join(',')];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var row = [
        csvCell(s.id), csvCell(s.start || ''), csvCell(s.label),
        csvCell(s.source || ''), csvCell(s.inProgress ? 'true' : 'false'),
        csvCell((s.models || []).join(';')), csvCell(s.totalTokens),
        csvCell(s.totalCost == null ? '' : s.totalCost), csvCell(s.input),
        csvCell(s.cacheRead), csvCell(s.cacheWrite), csvCell(s.output),
        csvCell(s.apiDurationMs == null ? '' : s.apiDurationMs)
      ];
      lines.push(row.join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  var exportBtn = document.getElementById('export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      if (SESSIONS.length === 0) return;
      var csv = buildCsv(SESSIONS);
      var datePart = DATA.reportDate || 'report';
      var filename = 'tscope-sessions-' + datePart + '.csv';
      
      var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 0);
    });
  }
})();
`.trim();

// ---------------------------------------------------------------------------
// Full HTML assembly
// ---------------------------------------------------------------------------

function buildHtml(report: Report, generatedAt: string, generatedAtIso: string): string {
  const { sessions, inProgressSessions, filterDescription, reportDate, source, costAvailable } = report;

  const completedCount = sessions.length;
  const inProgressCount = inProgressSessions.length;
  const totalSessions = completedCount + inProgressCount;

  let grandTotalTokens = 0;
  let grandTotalCredits = 0;
  for (const session of sessions) {
    for (const tokens of Object.values(session.models)) {
      grandTotalTokens += totalTokens(tokens);
    }
    if (session.totalCost !== undefined) grandTotalCredits += session.totalCost;
  }

  const statCards = `
<div class="summary-strip container">
  ${costAvailable ? `
  <div class="stat-card">
    <div class="stat-label">Total Credits</div>
    <div class="stat-value accent-green" id="stat-credits-value">${grandTotalCredits.toFixed(2)}</div>
    <div class="stat-sub" id="stat-credits-sub">${source === "mixed" ? "OTel sessions only" : "AI billing credits"}</div>
  </div>` : ""}
  <div class="stat-card">
    <div class="stat-label">Total Tokens</div>
    <div class="stat-value accent-blue" id="stat-total-value">${fmtTokensCompact(grandTotalTokens)}</div>
    <div class="stat-sub" id="stat-total-sub">${fmtNum(grandTotalTokens)} tokens</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Sessions</div>
    <div class="stat-value" id="stat-sessions-value">${totalSessions}</div>
    <div class="stat-sub" id="stat-sessions-sub">${completedCount} completed${inProgressCount > 0 ? `, ${inProgressCount} in progress` : ""}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Date Generated</div>
    <div class="stat-value" style="font-size:16px;" id="stat-filter-value">${esc(generatedAt)}</div>
    <div class="stat-sub">Filter: ${esc(filterDescription)}</div>
  </div>
</div>`;

  const allSummaries: SessionTokenSummary[] = [
    ...sessions.map((session) => {
      let total = 0, input = 0, cacheRead = 0, cacheWrite = 0, output = 0;
      for (const tokens of Object.values(session.models)) {
        const p = tokenPartition(tokens);
        input += p.freshInput;
        cacheRead += p.cacheRead;
        cacheWrite += p.cacheWrite;
        output += p.output;
        total += p.total;
      }
      return {
        id: session.sessionId,
        start: session.startTime || null,
        label: session.sessionId.slice(0, 8),
        source: session.source,
        totalCost: session.totalCost ?? null,
        models: Object.keys(session.models),
        totalTokens: total,
        input,
        cacheRead,
        cacheWrite,
        output,
        apiDurationMs: session.apiDurationMs ?? null,
        inProgress: false,
      };
    }),
    ...inProgressSessions.map((s) => ({
      id: s.sessionId,
      start: s.startTime || null,
      label: s.sessionId.slice(0, 8),
      source: "logs" as const,
      totalCost: null,
      models: [],
      totalTokens: 0,
      input: 0,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
      apiDurationMs: null,
      inProgress: true,
    })),
  ];



  const timelineSection =
    totalSessions > 0
      ? `
<div class="container">
  <section class="timeline-section">
    <h2 class="section-title">Tokens Over Time</h2>
    <div id="timeline-host">${buildTokensTimelineChart(allSummaries)}</div>
  </section>
</div>`
      : "";

  const chronicleBox = buildChronicleBox(
    pickMostRecentChronicleTip(sessions, inProgressSessions)
  );

  let sessionCardsHtml = "";
  if (totalSessions === 0) {
    sessionCardsHtml = `
<div class="empty-state container">
  <h2>No sessions found</h2>
  <p>for filter: ${esc(filterDescription)}</p>
</div>`;
  } else {
    let cards = "";
    for (const session of sessions) {
      cards += buildSessionCard(session);
    }
    for (const s of inProgressSessions) {
      cards += buildInProgressCard(s);
    }
    sessionCardsHtml =
      `<div class="sessions-list container" id="sessions-host">${cards}</div>` +
      `<div class="empty-state container" id="sessions-empty" hidden>` +
      `<h2>No sessions in range</h2><p>Try a wider date range.</p></div>`;
  }

  // Self-contained payload for client-side CSV export. `<` is escaped so the JSON
  // cannot terminate the surrounding <script> element.
  const payload = {
    reportDate,
    generatedAtIso,
    sessions: allSummaries,
  };
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const dataScript = `<script id="tscope-data" type="application/json">${payloadJson}</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tscope \u2014 ${esc(filterDescription)} \u2014 Token Report</title>
  <style>${CSS}</style>
</head>
<body>

<header class="site-header">
  <div class="container">
    <div class="site-title">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="10.5" cy="10.5" r="6.5"></circle>
          <line x1="15.25" y1="15.25" x2="20" y2="20"></line>
        </svg>
      </span>
      tscope
    </div>
    <div class="header-meta">
      <a class="gh-link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer" aria-label="View tscope on GitHub" title="View tscope on GitHub">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      </a>
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle colour theme">&#x263E; Dark</button>
    </div>
  </div>
</header>

<div class="report-toolbar container">
  <div class="dashboard-controls" id="dashboard-controls" aria-label="Dashboard controls">
    <button class="export-btn" id="export-csv" type="button" aria-label="Export sessions to CSV" title="Download all sessions as a CSV file">&#x2B07; CSV</button>
  </div>
</div>

${statCards}
${timelineSection}
${chronicleBox}
${sessionCardsHtml}

<footer class="site-footer">
  <p class="footer-contribute">Contribute or report issues <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">here</a>.</p>
</footer>

<div id="chart-tooltip" class="chart-tooltip" role="tooltip"></div>

${dataScript}
<script>${JS}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HtmlRenderer class
// ---------------------------------------------------------------------------

/**
 * HtmlRenderer — renders the report as a self-contained HTML dashboard.
 *
 * @param outputPath  Absolute or relative path to write the .html file.
 */
export class HtmlRenderer implements Renderer {
  constructor(private readonly outputPath: string) {}

  render(report: Report): void {
    // Silently exclude sessions with no token data:
    //   1. In-progress sessions (no shutdown event)
    //   2. Completed sessions with empty models or all-zero input/output
    const filteredReport: Report = {
      ...report,
      sessions: report.sessions.filter((s) => hasTokenData(s.models)),
      inProgressSessions: [],
    };
    const now = new Date();
    const generatedAt = now.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const html = buildHtml(filteredReport, generatedAt, now.toISOString());
    fs.writeFileSync(this.outputPath, html, "utf8");
    process.stderr.write(`Report written to ${this.outputPath}\n`);
  }
}
