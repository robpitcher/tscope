/**
 * HtmlRenderer — generates a self-contained, system-theme-aware HTML dashboard.
 *
 * Writes a single .html file with inline CSS, JS, and SVG — zero external
 * dependencies, fully offline/email-able. Follows the OS light/dark preference
 * by default, with a manual override toggle.
 *
 * Visuals (in order of priority):
 *   1 Per-model token stacked bar (input/cacheRead/cacheWrite/output)
 *   2 Tokens-by-model horizontal bars (total tokens per model, hover for breakdown)
 *   3 Cache-efficiency % pill per model
 *   4 Tokens-over-time bar chart across sessions (hover for token breakdown)
 *   5 Session header cards (id, datetime, path, totals)
 */

import * as fs from "fs";
import { Report, ParsedSession, InProgressSession, TokenCounts } from "../types";
import { Renderer } from "./Renderer";

/** Public repository URL, surfaced in the header logo link and footer. */
const REPO_URL = "https://github.com/devjoy-pub/tscope";

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

  const totals = models.map(
    (m) =>
      m.tokens.inputTokens +
      m.tokens.cacheReadTokens +
      m.tokens.cacheWriteTokens +
      m.tokens.outputTokens
  );
  const maxTotal = Math.max(...totals, 1);

  let bars = "";
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const y = LEGEND_H + i * (BAR_H + ROW_GAP);
    const totalTokens =
      m.tokens.inputTokens +
      m.tokens.cacheReadTokens +
      m.tokens.cacheWriteTokens +
      m.tokens.outputTokens;
    const scale = BAR_MAX_W / maxTotal;

    const segments: Array<{ tokens: number; color: string; label: string }> = [
      { tokens: m.tokens.inputTokens, color: TOKEN_COLORS.input, label: "Input" },
      { tokens: m.tokens.cacheReadTokens, color: TOKEN_COLORS.cacheRead, label: "Cache Read" },
      { tokens: m.tokens.cacheWriteTokens, color: TOKEN_COLORS.cacheWrite, label: "Cache Write" },
      { tokens: m.tokens.outputTokens, color: TOKEN_COLORS.output, label: "Output" },
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

    bars += `<text x="${xOff + 6}" y="${y + BAR_H / 2 + 5}" class="bar-count">${fmtNum(totalTokens)}</text>`;
  }

  const legendItems = [
    { label: "Input", color: TOKEN_COLORS.input },
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

  const totals = models.map((m) =>
    m.tokens.inputTokens + m.tokens.cacheReadTokens +
    m.tokens.cacheWriteTokens + m.tokens.outputTokens
  );
  const maxTotal = Math.max(...totals, 1);

  let html = `<div class="token-bars">`;
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const total = totals[i];
    const pct = clamp01(total / maxTotal) * 100;
    html += `
  <div class="token-bar-row has-tip" data-title="${esc(m.modelName)}" data-input="${m.tokens.inputTokens}" data-cacheread="${m.tokens.cacheReadTokens}" data-cachewrite="${m.tokens.cacheWriteTokens}" data-output="${m.tokens.outputTokens}" data-total="${total}">
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
// Cache-efficiency pills
// ---------------------------------------------------------------------------

function cacheEfficiencyColor(pct: number): string {
  if (pct >= 60) return "pill-green";
  if (pct >= 30) return "pill-amber";
  return "pill-red";
}

function buildCachePills(models: ModelEntry[]): string {
  if (models.length === 0) return "";
  let html = `<div class="cache-pills">`;
  for (const m of models) {
    const input = m.tokens.inputTokens;
    const cacheRead = m.tokens.cacheReadTokens;
    let pct = input > 0 ? (cacheRead / input) * 100 : 0;
    pct = Math.min(pct, 100);
    const cls = cacheEfficiencyColor(pct);
    const label = input === 0 ? "n/a" : `${pct.toFixed(0)}%`;
    html += `
  <div class="cache-pill-row">
    <span class="cache-model-name">${esc(m.modelName)}</span>
    <span class="pill ${cls}">${label} cache hit</span>
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
  totalTokens: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
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
    bars += `<rect x="${x}" y="${y.toFixed(1)}" width="${BAR_W}" height="${barH.toFixed(1)}" rx="3" class="${cls}" data-input="${s.input}" data-cacheread="${s.cacheRead}" data-cachewrite="${s.cacheWrite}" data-output="${s.output}" data-total="${s.totalTokens}"></rect>`;
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
    .tl-bar { fill: ${TOKEN_COLORS.input}; cursor: pointer; }
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

function buildSessionCard(session: ParsedSession): string {
  const dateStr = toLocalDateTime(session.startTime);
  const modelEntries: ModelEntry[] = Object.entries(session.models).map(
    ([modelName, tokens]) => ({ modelName, tokens })
  );

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
  for (const m of modelEntries) {
    totalInput += m.tokens.inputTokens;
    totalOutput += m.tokens.outputTokens;
    totalCacheRead += m.tokens.cacheReadTokens;
    totalCacheWrite += m.tokens.cacheWriteTokens;
  }
  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite;

  return `
<article class="session-card" data-session-id="${esc(session.sessionId)}">
  <div class="session-header">
    <div class="session-meta">
      <span class="session-id">${esc(session.sessionId)}</span>
      <span class="session-datetime">${dateStr}</span>
    </div>
    <div class="session-summary-chips">
      <span class="chip chip-tokens">${fmtNum(totalTokens)} tokens</span>
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
        <h3 class="chart-title">Cache Efficiency</h3>
        ${buildCachePills(modelEntries)}
      </div>
    </div>
  </div>
  ` : `<p class="muted-note">No model data</p>`}

  ${modelEntries.length > 0 ? `
  <div class="token-totals-row">
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.input}"></span>Input: ${fmtNum(totalInput)}</span>
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.cacheRead}"></span>Cache Read: ${fmtNum(totalCacheRead)}</span>
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.cacheWrite}"></span>Cache Write: ${fmtNum(totalCacheWrite)}</span>
    <span class="token-total-item"><span class="token-dot" style="background:${TOKEN_COLORS.output}"></span>Output: ${fmtNum(totalOutput)}</span>
  </div>
  ` : ""}
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

.filter-badge {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 3px 10px;
}
button.filter-badge { cursor: pointer; transition: background 0.15s, color 0.15s; }
button.filter-badge:hover { background: var(--border); color: var(--text-primary); }
.filter-badge .caret { font-size: 10px; opacity: 0.7; }

.date-filter { position: relative; }
.filter-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 60;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
  padding: 12px;
  min-width: 240px;
}
.filter-popover[hidden] { display: none; }
.preset-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.preset {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 3px 11px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.preset:hover { color: var(--text-primary); border-color: var(--text-muted); }
.preset.is-active { background: var(--accent-blue); border-color: var(--accent-blue); color: #fff; }
.range-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.range-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--text-muted);
}
.range-field input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  padding: 3px 6px;
  color-scheme: dark light;
}
#range-apply {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
#range-apply:hover { background: var(--border); color: var(--text-primary); }
.range-error { margin-top: 8px; font-size: 11px; color: var(--accent-amber); }
.range-error[hidden] { display: none; }

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
.pill-green { background: rgba(63,185,80,.15); color: var(--accent-green); border: 1px solid rgba(63,185,80,.3); }
.pill-amber { background: rgba(227,179,65,.15); color: var(--accent-amber); border: 1px solid rgba(227,179,65,.3); }
.pill-red   { background: rgba(248,81,73,.12);  color: var(--accent-red);   border: 1px solid rgba(248,81,73,.25); }

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

/* Insights seam reserved for #15 */
/* .insights-section { } */

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
`.trim();

// ---------------------------------------------------------------------------
// Inline JS (theme toggle, delegated chart tooltip, date-range filter engine)
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
    { key: 'input', color: '#58a6ff', label: 'Input' },
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
  // Client-side date-range filtering over the embedded (CLI-selected) sessions.
  var dataEl = document.getElementById('tscope-data');
  if (!dataEl) return;
  var DATA;
  try { DATA = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var SESSIONS = DATA.sessions || [];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localDate(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseYMD(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function fmtYMD(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(ymd, n) { var d = parseYMD(ymd); d.setDate(d.getDate() + n); return fmtYMD(d); }
  function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }
  function compact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'K';
    return String(n);
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function escH(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var anchor = localDate(DATA.generatedAtIso) || DATA.reportDate;
  var dates = [];
  for (var i = 0; i < SESSIONS.length; i++) {
    var ld = localDate(SESSIONS[i].start);
    if (ld) dates.push(ld);
  }
  dates.sort();
  var minDate = dates.length ? dates[0] : anchor;
  var maxDate = dates.length ? dates[dates.length - 1] : anchor;

  function inRange(s, mode, from, to) {
    if (mode === 'all') return true;
    var ld = localDate(s.start);
    if (!ld) return false;
    return ld >= from && ld <= to;
  }

  function buildTimeline(list) {
    if (list.length === 0) return '<p class="muted-note">No sessions to chart</p>';
    var BAR_W = 40, BAR_GAP = 8, CHART_H = 80, TOP_PAD = 18, LABEL_H = 18, AXIS_H = 18, LEFT_MARGIN = 52, RIGHT_PAD = 12;
    var baselineY = TOP_PAD + CHART_H;
    var SVG_H = TOP_PAD + CHART_H + LABEL_H + AXIS_H;
    var plotW = list.length * (BAR_W + BAR_GAP) + BAR_GAP;
    var SVG_W = LEFT_MARGIN + plotW + RIGHT_PAD;
    var maxTokens = 1;
    for (var i = 0; i < list.length; i++) { if (list[i].totalTokens > maxTokens) maxTokens = list[i].totalTokens; }
    var bars = '';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var x = LEFT_MARGIN + BAR_GAP + i * (BAR_W + BAR_GAP);
      var barH = Math.max(2, clamp01(s.totalTokens / maxTokens) * CHART_H);
      var y = baselineY - barH;
      var lbl = (s.label && s.label.length > 8) ? s.label.slice(0, 8) : (s.label || '');
      var cls = 'tl-bar has-tip' + (s.inProgress ? ' in-progress' : '');
      bars += '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + BAR_W + '" height="' + barH.toFixed(1) + '" rx="3" class="' + cls + '" data-input="' + s.input + '" data-cacheread="' + s.cacheRead + '" data-cachewrite="' + s.cacheWrite + '" data-output="' + s.output + '" data-total="' + s.totalTokens + '"></rect>';
      bars += '<text x="' + (x + BAR_W / 2) + '" y="' + (baselineY + 13) + '" text-anchor="middle" class="tl-label">' + escH(lbl) + '</text>';
      if (!s.inProgress && s.totalTokens > 0) {
        bars += '<text x="' + (x + BAR_W / 2) + '" y="' + Math.max(12, y - 3).toFixed(1) + '" text-anchor="middle" class="tl-value">' + compact(s.totalTokens) + '</text>';
      }
    }
    var xTitleX = LEFT_MARGIN + plotW / 2;
    var xTitleY = SVG_H - 3;
    var yTitleX = 13;
    var yTitleY = TOP_PAD + CHART_H / 2;
    var axes = '<text x="' + xTitleX + '" y="' + xTitleY + '" text-anchor="middle" class="axis-title">Session Id (truncated)</text>'
      + '<text x="' + yTitleX + '" y="' + yTitleY + '" text-anchor="middle" class="axis-title" transform="rotate(-90 ' + yTitleX + ' ' + yTitleY + ')">Token count</text>';
    var style = '<style>.tl-bar { fill: #58a6ff; cursor: pointer; }.tl-bar.in-progress { fill: var(--text-muted); }.tl-label { font: 9px/1 "SF Mono","Consolas",monospace; fill: var(--text-secondary); }.tl-value { font: 10px/1 system-ui,sans-serif; fill: var(--text-muted); }.axis-title { font: 10px/1 system-ui,sans-serif; fill: var(--text-secondary); font-weight: 600; letter-spacing: .03em; }</style>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + SVG_W + '" height="' + SVG_H + '" viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" class="chart-svg timeline-svg">' + style + axes + bars + '</svg>';
  }

  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

  function recompute(list) {
    var total = 0, completed = 0, inprog = 0;
    for (var i = 0; i < list.length; i++) {
      total += list[i].totalTokens;
      if (list[i].inProgress) inprog++; else completed++;
    }
    setText('stat-total-value', compact(total));
    setText('stat-total-sub', fmtNum(total) + ' tokens');
    setText('stat-sessions-value', String(list.length));
    setText('stat-sessions-sub', completed + ' completed' + (inprog > 0 ? ', ' + inprog + ' in progress' : ''));
  }

  function toggleCards(list) {
    var visible = {};
    for (var i = 0; i < list.length; i++) visible[list[i].id] = true;
    var cards = document.querySelectorAll('.session-card[data-session-id]');
    var anyVisible = false;
    for (var j = 0; j < cards.length; j++) {
      var on = !!visible[cards[j].getAttribute('data-session-id')];
      cards[j].style.display = on ? '' : 'none';
      if (on) anyVisible = true;
    }
    var empty = document.getElementById('sessions-empty');
    if (empty) empty.hidden = anyVisible || cards.length === 0;
  }

  function apply(mode, from, to, labelText) {
    var filtered = [];
    for (var i = 0; i < SESSIONS.length; i++) {
      if (inRange(SESSIONS[i], mode, from, to)) filtered.push(SESSIONS[i]);
    }
    recompute(filtered);
    var host = document.getElementById('timeline-host');
    if (host) host.innerHTML = buildTimeline(filtered);
    toggleCards(filtered);
    setText('filter-pill-label', labelText);
    setText('stat-filter-value', labelText);
  }

  var presetLabels = { all: 'All', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' };
  function presetRange(mode) {
    if (mode === 'today') return [anchor, anchor];
    if (mode === '7d') return [addDays(anchor, -6), anchor];
    if (mode === '30d') return [addDays(anchor, -29), anchor];
    return [minDate, maxDate];
  }

  // Wire UI.
  var pill = document.getElementById('filter-pill');
  var pop = document.getElementById('filter-popover');
  var df = document.getElementById('date-filter');
  var fromInput = document.getElementById('range-from');
  var toInput = document.getElementById('range-to');
  var applyBtn = document.getElementById('range-apply');
  var errEl = document.getElementById('range-error');
  if (!pill || !pop) return;

  if (fromInput) { fromInput.min = minDate; fromInput.max = maxDate; fromInput.value = minDate; }
  if (toInput) { toInput.min = minDate; toInput.max = maxDate; toInput.value = maxDate; }

  function openPop() { pop.hidden = false; pill.setAttribute('aria-expanded', 'true'); }
  function closePop() { pop.hidden = true; pill.setAttribute('aria-expanded', 'false'); }
  pill.addEventListener('click', function(e) {
    e.stopPropagation();
    if (pop.hidden) openPop(); else closePop();
  });
  document.addEventListener('click', function(e) {
    if (df && !df.contains(e.target)) closePop();
  });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closePop(); });

  function clearActive() {
    var ps = pop.querySelectorAll('.preset');
    for (var i = 0; i < ps.length; i++) ps[i].classList.remove('is-active');
  }

  var presetBtns = pop.querySelectorAll('.preset');
  for (var i = 0; i < presetBtns.length; i++) {
    presetBtns[i].addEventListener('click', function() {
      var mode = this.getAttribute('data-preset');
      clearActive();
      this.classList.add('is-active');
      if (errEl) errEl.hidden = true;
      var r = presetRange(mode);
      apply(mode, r[0], r[1], presetLabels[mode] || 'All');
      closePop();
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      var from = fromInput ? fromInput.value : '';
      var to = toInput ? toInput.value : '';
      if (!from || !to) {
        if (errEl) { errEl.textContent = 'Pick both a start and end date.'; errEl.hidden = false; }
        return;
      }
      if (from > to) { var tmp = from; from = to; to = tmp; }
      if (errEl) errEl.hidden = true;
      clearActive();
      apply('range', from, to, from + ' to ' + to);
      closePop();
    });
  }
})();
`.trim();

// ---------------------------------------------------------------------------
// Full HTML assembly
// ---------------------------------------------------------------------------

function buildHtml(report: Report, generatedAt: string, generatedAtIso: string): string {
  const { sessions, inProgressSessions, filterDescription, reportDate } = report;

  const completedCount = sessions.length;
  const inProgressCount = inProgressSessions.length;
  const totalSessions = completedCount + inProgressCount;

  let grandTotalTokens = 0;
  for (const session of sessions) {
    for (const tokens of Object.values(session.models)) {
      grandTotalTokens += tokens.inputTokens + tokens.outputTokens +
        tokens.cacheReadTokens + tokens.cacheWriteTokens;
    }
  }

  const statCards = `
<div class="summary-strip container">
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
    <div class="stat-label">Date Filter</div>
    <div class="stat-value" style="font-size:16px;" id="stat-filter-value">${esc(filterDescription)}</div>
    <div class="stat-sub">Report date: ${esc(reportDate)}</div>
  </div>
</div>`;

  const allSummaries: SessionTokenSummary[] = [
    ...sessions.map((session) => {
      let total = 0, input = 0, cacheRead = 0, cacheWrite = 0, output = 0;
      for (const tokens of Object.values(session.models)) {
        input += tokens.inputTokens;
        cacheRead += tokens.cacheReadTokens;
        cacheWrite += tokens.cacheWriteTokens;
        output += tokens.outputTokens;
        total += tokens.inputTokens + tokens.outputTokens +
          tokens.cacheReadTokens + tokens.cacheWriteTokens;
      }
      return {
        id: session.sessionId,
        start: session.startTime || null,
        label: session.sessionId.slice(0, 8),
        totalTokens: total,
        input,
        cacheRead,
        cacheWrite,
        output,
        inProgress: false,
      };
    }),
    ...inProgressSessions.map((s) => ({
      id: s.sessionId,
      start: s.startTime || null,
      label: s.sessionId.slice(0, 8),
      totalTokens: 0,
      input: 0,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
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

  // Self-contained payload for client-side date filtering. The picker filters
  // only within these (the CLI-selected) sessions. `<` is escaped so the JSON
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
      <span class="logo">ts</span>
      tscope
    </div>
    <div class="header-meta">
      <div class="date-filter" id="date-filter">
        <button class="filter-badge" id="filter-pill" aria-haspopup="true" aria-expanded="false" title="Filter sessions by date">&#x1F5D3; <span id="filter-pill-label">${esc(filterDescription)}</span> <span class="caret">&#x25BE;</span></button>
        <div class="filter-popover" id="filter-popover" hidden>
          <div class="preset-row">
            <button type="button" class="preset is-active" data-preset="all">All</button>
            <button type="button" class="preset" data-preset="today">Today</button>
            <button type="button" class="preset" data-preset="7d">7 days</button>
            <button type="button" class="preset" data-preset="30d">30 days</button>
          </div>
          <div class="range-row">
            <label class="range-field">From <input type="date" id="range-from"></label>
            <label class="range-field">To <input type="date" id="range-to"></label>
            <button type="button" id="range-apply">Apply</button>
          </div>
          <p class="range-error" id="range-error" hidden></p>
        </div>
      </div>
      <span style="font-size:12px;color:var(--text-muted)">Generated ${esc(generatedAt)}</span>
      <a class="gh-link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer" aria-label="View tscope on GitHub" title="View tscope on GitHub">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      </a>
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle colour theme">&#x263E; Dark</button>
    </div>
  </div>
</header>

${statCards}
${timelineSection}
${sessionCardsHtml}

<footer class="site-footer">
  <p>tscope &middot; GitHub Copilot Token Usage Report</p>
  <p class="footer-contribute">Contribute or report issues on <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
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
    const now = new Date();
    const generatedAt = now.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const html = buildHtml(report, generatedAt, now.toISOString());
    fs.writeFileSync(this.outputPath, html, "utf8");
    process.stderr.write(`Report written to ${this.outputPath}\n`);
  }
}
