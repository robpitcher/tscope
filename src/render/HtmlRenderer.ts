/**
 * HtmlRenderer — generates a self-contained, dark-mode HTML dashboard.
 *
 * Writes a single .html file with inline CSS, JS, and SVG — zero external
 * dependencies, fully offline/email-able.
 *
 * Visuals (in order of priority):
 *   ① Per-model token stacked bar (input/cacheRead/cacheWrite/output)
 *   ② Credits-by-model horizontal bars
 *   ③ Cache-efficiency % pill per model
 *   ④ Credits-over-time mini bar chart across sessions
 *   ⑤ Session header cards (id, datetime, path, totals, premium requests)
 */

import * as fs from "fs";
import { Report, ParsedSession, SessionCredits, InProgressSession, ModelCredits } from "../types";
import { Renderer } from "./Renderer";

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

/** Format credits to a readable precision */
function fmtCredits(n: number): string {
  if (n === 0) return "0";
  if (n >= 10) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
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

function buildTokenBar(models: ModelCredits[]): string {
  if (models.length === 0) return "";

  const BAR_H = 22;
  const BAR_MAX_W = 420;
  const LABEL_W = 200;
  const ROW_GAP = 8;
  const LEGEND_H = 28;
  const SVG_W = LABEL_W + BAR_MAX_W + 80; // +80 for trailing token count text
  const SVG_H = LEGEND_H + models.length * (BAR_H + ROW_GAP) + ROW_GAP;

  // Find max total to scale bars
  const totals = models.map(
    (mc) =>
      mc.tokens.inputTokens +
      mc.tokens.cacheReadTokens +
      mc.tokens.cacheWriteTokens +
      mc.tokens.outputTokens
  );
  const maxTotal = Math.max(...totals, 1);

  let bars = "";
  for (let i = 0; i < models.length; i++) {
    const mc = models[i];
    const y = LEGEND_H + i * (BAR_H + ROW_GAP);
    const totalTokens =
      mc.tokens.inputTokens +
      mc.tokens.cacheReadTokens +
      mc.tokens.cacheWriteTokens +
      mc.tokens.outputTokens;
    const scale = BAR_MAX_W / maxTotal;

    const segments: Array<{ tokens: number; color: string }> = [
      { tokens: mc.tokens.inputTokens, color: TOKEN_COLORS.input },
      { tokens: mc.tokens.cacheReadTokens, color: TOKEN_COLORS.cacheRead },
      { tokens: mc.tokens.cacheWriteTokens, color: TOKEN_COLORS.cacheWrite },
      { tokens: mc.tokens.outputTokens, color: TOKEN_COLORS.output },
    ];

    // Model name label (truncated at ~28 chars)
    const name = mc.modelName.length > 28 ? mc.modelName.slice(0, 26) + "…" : mc.modelName;
    bars += `<text x="${LABEL_W - 8}" y="${y + BAR_H / 2 + 5}" text-anchor="end" class="bar-label">${esc(name)}</text>`;

    // Stacked bar segments
    let xOff = LABEL_W;
    for (const seg of segments) {
      if (seg.tokens <= 0) continue;
      const w = Math.max(1, seg.tokens * scale);
      bars += `<rect x="${xOff.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${BAR_H}" fill="${seg.color}" rx="2"/>`;
      xOff += w;
    }

    // Total token count after bar
    bars += `<text x="${xOff + 6}" y="${y + BAR_H / 2 + 5}" class="bar-count">${fmtNum(totalTokens)}</text>`;
  }

  // Legend
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
    .bar-label { font: 12px/1 'SF Mono', 'Consolas', monospace; fill: #8b949e; }
    .bar-count  { font: 11px/1 'SF Mono', 'Consolas', monospace; fill: #7d8590; }
    .legend-label { font: 11px/1 system-ui, sans-serif; fill: #8b949e; }
  </style>
  ${legend}
  ${bars}
</svg>`.trim();
}

// ---------------------------------------------------------------------------
// Credits-by-model horizontal bars (HTML/CSS)
// ---------------------------------------------------------------------------

function buildCreditsBars(models: ModelCredits[]): string {
  const knownModels = models.filter((mc) => !mc.unknownRate && mc.estimatedCredits !== undefined);
  if (knownModels.length === 0) {
    const hasUnknown = models.some((mc) => mc.unknownRate);
    return hasUnknown
      ? `<p class="muted-note">Credits unavailable — model rate unknown</p>`
      : `<p class="muted-note">No credits to display</p>`;
  }

  const maxCredits = Math.max(...knownModels.map((mc) => mc.estimatedCredits ?? 0), 0.001);

  let html = `<div class="credits-bars">`;
  for (const mc of models) {
    const credits = mc.estimatedCredits ?? 0;
    const pct = clamp01(credits / maxCredits) * 100;
    const label = mc.unknownRate
      ? `<span class="unknown-badge">rate unknown</span>`
      : `~${fmtCredits(credits)} cr`;
    html += `
  <div class="credits-row">
    <div class="credits-model-name">${esc(mc.modelName)}</div>
    <div class="credits-bar-wrap">
      <div class="credits-bar-fill" style="width:${pct.toFixed(1)}%"></div>
    </div>
    <div class="credits-value">${label}</div>
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

function buildCachePills(models: ModelCredits[]): string {
  if (models.length === 0) return "";
  let html = `<div class="cache-pills">`;
  for (const mc of models) {
    const input = mc.tokens.inputTokens;
    const cacheRead = mc.tokens.cacheReadTokens;
    let pct = input > 0 ? (cacheRead / input) * 100 : 0;
    pct = Math.min(pct, 100);
    const cls = cacheEfficiencyColor(pct);
    const label = input === 0 ? "n/a" : `${pct.toFixed(0)}%`;
    html += `
  <div class="cache-pill-row">
    <span class="cache-model-name">${esc(mc.modelName)}</span>
    <span class="pill ${cls}">${label} cache hit</span>
  </div>`;
  }
  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// Credits-over-time chart (SVG vertical bars)
// ---------------------------------------------------------------------------

interface SessionSummary {
  label: string;
  credits: number;
  inProgress: boolean;
}

function buildCreditsTimelineChart(summaries: SessionSummary[]): string {
  if (summaries.length === 0) return `<p class="muted-note">No sessions to chart</p>`;

  const BAR_W = 40;
  const BAR_GAP = 8;
  const CHART_H = 80;
  const LABEL_H = 20;
  const SVG_H = CHART_H + LABEL_H + 4;
  const SVG_W = summaries.length * (BAR_W + BAR_GAP) + BAR_GAP;

  const maxCredits = Math.max(...summaries.map((s) => s.credits), 0.001);

  let bars = "";
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const x = BAR_GAP + i * (BAR_W + BAR_GAP);
    const barH = Math.max(2, clamp01(s.credits / maxCredits) * CHART_H);
    const y = CHART_H - barH;
    const color = s.inProgress ? "#484f58" : "#58a6ff";
    const labelText =
      s.label.length > 5 ? s.label.slice(-5) : s.label; // last 5 chars of session id
    bars += `<rect x="${x}" y="${y.toFixed(1)}" width="${BAR_W}" height="${barH.toFixed(1)}" fill="${color}" rx="3">
    <title>${esc(s.label)}: ~${fmtCredits(s.credits)} cr</title>
  </rect>`;
    bars += `<text x="${x + BAR_W / 2}" y="${SVG_H - 2}" text-anchor="middle" class="tl-label">${esc(labelText)}</text>`;
    // Credit value above bar
    if (!s.inProgress && s.credits > 0) {
      bars += `<text x="${x + BAR_W / 2}" y="${Math.max(10, y - 3).toFixed(1)}" text-anchor="middle" class="tl-value">~${fmtCredits(s.credits)}</text>`;
    }
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}" class="chart-svg timeline-svg">
  <style>
    .tl-label { font: 10px/1 'SF Mono','Consolas',monospace; fill: #484f58; }
    .tl-value { font: 10px/1 system-ui,sans-serif; fill: #8b949e; }
  </style>
  ${bars}
</svg>`.trim();
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

function buildSessionCard(session: ParsedSession, credits: SessionCredits): string {
  const dateStr = toLocalDateTime(session.startTime);
  const creditsLabel = credits.hasUnknownRates && credits.totalCredits === 0
    ? "n/a (unknown rate)"
    : credits.hasUnknownRates
    ? `~${fmtCredits(credits.totalCredits)} cr (partial)`
    : `~${fmtCredits(credits.totalCredits)} cr`;

  // Token totals
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
  for (const mc of credits.models) {
    totalInput += mc.tokens.inputTokens;
    totalOutput += mc.tokens.outputTokens;
    totalCacheRead += mc.tokens.cacheReadTokens;
    totalCacheWrite += mc.tokens.cacheWriteTokens;
  }

  return `
<article class="session-card">
  <div class="session-header">
    <div class="session-meta">
      <span class="session-id">${esc(session.sessionId)}</span>
      <span class="session-datetime">${dateStr}</span>
    </div>
    <div class="session-summary-chips">
      <span class="chip chip-credits">${esc(creditsLabel)}</span>
      <span class="chip chip-tokens">${fmtNum(totalInput + totalOutput + totalCacheRead + totalCacheWrite)} tokens</span>
      ${session.totalPremiumRequests > 0 ? `<span class="chip chip-premium">${session.totalPremiumRequests} premium req</span>` : ""}
    </div>
  </div>
  <div class="session-path">${esc(session.eventsPath)}</div>

  ${credits.models.length > 0 ? `
  <div class="session-charts">
    <div class="chart-section">
      <h3 class="chart-title">Token Usage by Model</h3>
      ${buildTokenBar(credits.models)}
    </div>
    <div class="chart-columns">
      <div class="chart-section">
        <h3 class="chart-title">Credits by Model</h3>
        ${buildCreditsBars(credits.models)}
      </div>
      <div class="chart-section">
        <h3 class="chart-title">Cache Efficiency</h3>
        ${buildCachePills(credits.models)}
      </div>
    </div>
  </div>
  ` : `<p class="muted-note">No model data</p>`}

  ${credits.models.length > 0 ? `
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
<article class="session-card session-card--in-progress">
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
  <p class="muted-note in-progress-note">⏳ Session is ongoing — no token data yet</p>
</article>`;
}

// ---------------------------------------------------------------------------
// Inline CSS
// ---------------------------------------------------------------------------

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-base:       #0d1117;
  --bg-surface:    #161b22;
  --bg-elevated:   #21262d;
  --border:        #30363d;
  --text-primary:  #e6edf3;
  --text-secondary: #8b949e;
  --text-muted:    #484f58;
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
  --text-muted:    #9198a1;
  --accent-blue:   #0969da;
  --accent-green:  #1a7f37;
  --accent-amber:  #9a6700;
  --accent-red:    #d1242f;
  --accent-purple: #8250df;
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

/* ── Header ─────────────────────────────────────────────────────────────── */
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

/* ── Summary strip ────────────────────────────────────────────────────────── */
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

/* ── Credits timeline ───────────────────────────────────────────────────── */
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

/* ── Session cards ──────────────────────────────────────────────────────── */
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

/* Chips */
.chip {
  font-size: 11px;
  font-weight: 600;
  border-radius: 20px;
  padding: 2px 9px;
  white-space: nowrap;
}
.chip-credits   { background: rgba(88,166,255,.12); color: var(--accent-blue); border: 1px solid rgba(88,166,255,.25); }
.chip-tokens    { background: rgba(163,113,247,.12); color: var(--accent-purple); border: 1px solid rgba(163,113,247,.25); }
.chip-premium   { background: rgba(63,185,80,.12);  color: var(--accent-green); border: 1px solid rgba(63,185,80,.25); }
.chip-in-progress { background: rgba(72,79,88,.3); color: var(--text-secondary); border: 1px solid var(--border); }

.session-path {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
  margin-bottom: 16px;
}

/* ── Charts inside cards ────────────────────────────────────────────────── */
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

/* Credits bars */
.credits-bars { display: flex; flex-direction: column; gap: 7px; }

.credits-row {
  display: grid;
  grid-template-columns: 160px 1fr 80px;
  align-items: center;
  gap: 8px;
}

.credits-model-name {
  font-size: 11px;
  font-family: 'SF Mono','Consolas',monospace;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credits-bar-wrap {
  background: var(--bg-elevated);
  border-radius: 3px;
  height: 12px;
  overflow: hidden;
}

.credits-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  border-radius: 3px;
  min-width: 2px;
  transition: width 0.3s ease;
}

.credits-value {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: right;
  white-space: nowrap;
}

.unknown-badge {
  font-size: 10px;
  color: var(--text-muted);
  font-style: italic;
}

/* Cache pills */
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

/* Token totals row */
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

/* Muted notes */
.muted-note {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.in-progress-note {
  margin-top: 12px;
}

/* ── Insights seam (reserved for #15 /chronicle tips) ───────────────────── */
/* DEFERRED: this section is intentionally empty — Tank will fill it in #15  */
/* .insights-section { } */

/* ── Empty-state ─────────────────────────────────────────────────────────── */
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

/* ── Footer ──────────────────────────────────────────────────────────────── */
.site-footer {
  border-top: 1px solid var(--border);
  margin-top: 48px;
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
`.trim();

// ---------------------------------------------------------------------------
// Inline JS (theme toggle only)
// ---------------------------------------------------------------------------

const JS = `
(function() {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  var stored = localStorage.getItem('tscope-theme');
  if (stored === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    btn.textContent = '☀ Light';
  }
  btn.addEventListener('click', function() {
    var current = document.documentElement.getAttribute('data-theme');
    if (current === 'light') {
      document.documentElement.removeAttribute('data-theme');
      btn.textContent = '☾ Dark';
      localStorage.setItem('tscope-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      btn.textContent = '☀ Light';
      localStorage.setItem('tscope-theme', 'light');
    }
  });
})();
`.trim();

// ---------------------------------------------------------------------------
// Full HTML assembly
// ---------------------------------------------------------------------------

function buildHtml(report: Report, generatedAt: string): string {
  const { sessions, inProgressSessions, totalCredits, hasUnknownRates, filterDescription, reportDate } = report;

  const completedCount = sessions.length;
  const inProgressCount = inProgressSessions.length;
  const totalSessions = completedCount + inProgressCount;

  // Summary stats
  const creditsDisplay = hasUnknownRates
    ? `~${fmtCredits(totalCredits)}<small style="font-size:14px;font-weight:400;color:var(--text-muted)"> + unknowns</small>`
    : `~${fmtCredits(totalCredits)}`;

  const statCards = `
<div class="summary-strip container">
  <div class="stat-card">
    <div class="stat-label">Est. Credits</div>
    <div class="stat-value accent-blue">${creditsDisplay}</div>
    <div class="stat-sub">AI credits (estimated)</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Sessions</div>
    <div class="stat-value">${totalSessions}</div>
    <div class="stat-sub">${completedCount} completed${inProgressCount > 0 ? `, ${inProgressCount} in progress` : ""}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Date Filter</div>
    <div class="stat-value" style="font-size:16px;">${esc(filterDescription)}</div>
    <div class="stat-sub">Report date: ${esc(reportDate)}</div>
  </div>
  ${hasUnknownRates ? `
  <div class="stat-card" style="border-color: rgba(248,81,73,.25);">
    <div class="stat-label" style="color:var(--accent-red)">Unknown Rates</div>
    <div class="stat-value accent-amber" style="font-size:18px;">⚠</div>
    <div class="stat-sub">Some models not in rate table</div>
  </div>` : ""}
</div>`;

  // Credits-over-time chart (render for all sessions incl. in-progress)
  const allSummaries: SessionSummary[] = [
    ...sessions.map(({ session, credits }) => ({
      label: session.sessionId.slice(-8),
      credits: credits.totalCredits,
      inProgress: false,
    })),
    ...inProgressSessions.map((s) => ({
      label: s.sessionId.slice(-8),
      credits: 0,
      inProgress: true,
    })),
  ];

  const timelineSection =
    totalSessions > 0
      ? `
<section class="timeline-section container">
  <h2 class="section-title">Credits Over Time</h2>
  ${buildCreditsTimelineChart(allSummaries)}
  <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">Each bar = one session · hover for details</p>
</section>`
      : "";

  // Session cards
  let sessionCardsHtml = "";
  if (totalSessions === 0) {
    sessionCardsHtml = `
<div class="empty-state container">
  <h2>No sessions found</h2>
  <p>for filter: ${esc(filterDescription)}</p>
</div>`;
  } else {
    let cards = "";
    for (const { session, credits } of sessions) {
      cards += buildSessionCard(session, credits);
    }
    for (const s of inProgressSessions) {
      cards += buildInProgressCard(s);
    }
    sessionCardsHtml = `<div class="sessions-list container">${cards}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tscope — ${esc(filterDescription)} — Token Report</title>
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
      <span class="filter-badge">🗓 ${esc(filterDescription)}</span>
      <span style="font-size:12px;color:var(--text-muted)">Generated ${esc(generatedAt)}</span>
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle colour theme">☾ Dark</button>
    </div>
  </div>
</header>

${statCards}
${timelineSection}
${sessionCardsHtml}

<footer class="site-footer">
  <p>tscope · GitHub Copilot Token Usage Report · Credits are estimated using a bundled rate table</p>
</footer>

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
 *                    The caller is responsible for setting a sensible default.
 */
export class HtmlRenderer implements Renderer {
  constructor(private readonly outputPath: string) {}

  render(report: Report): void {
    const generatedAt = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const html = buildHtml(report, generatedAt);
    fs.writeFileSync(this.outputPath, html, "utf8");
    process.stderr.write(`Report written to ${this.outputPath}\n`);
  }
}
