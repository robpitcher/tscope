/**
 * HtmlRenderer — generates a self-contained, dark-mode HTML dashboard.
 *
 * Writes a single .html file with inline CSS, JS, and SVG — zero external
 * dependencies, fully offline/email-able.
 *
 * Visuals (in order of priority):
 *   1 Per-model token stacked bar (input/cacheRead/cacheWrite/output)
 *   2 Tokens-by-model horizontal bars (total tokens per model)
 *   3 Cache-efficiency % pill per model
 *   4 Tokens-over-time mini bar chart across sessions
 *   5 Session header cards (id, datetime, path, totals, premium requests)
 */

import * as fs from "fs";
import { Report, ParsedSession, InProgressSession, TokenCounts } from "../types";
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

    const segments: Array<{ tokens: number; color: string }> = [
      { tokens: m.tokens.inputTokens, color: TOKEN_COLORS.input },
      { tokens: m.tokens.cacheReadTokens, color: TOKEN_COLORS.cacheRead },
      { tokens: m.tokens.cacheWriteTokens, color: TOKEN_COLORS.cacheWrite },
      { tokens: m.tokens.outputTokens, color: TOKEN_COLORS.output },
    ];

    const name = m.modelName.length > 28 ? m.modelName.slice(0, 26) + "\u2026" : m.modelName;
    bars += `<text x="${LABEL_W - 8}" y="${y + BAR_H / 2 + 5}" text-anchor="end" class="bar-label">${esc(name)}</text>`;

    let xOff = LABEL_W;
    for (const seg of segments) {
      if (seg.tokens <= 0) continue;
      const w = Math.max(1, seg.tokens * scale);
      bars += `<rect x="${xOff.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${BAR_H}" fill="${seg.color}" rx="2"/>`;
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
    .bar-label { font: 12px/1 'SF Mono', 'Consolas', monospace; fill: #8b949e; }
    .bar-count  { font: 11px/1 'SF Mono', 'Consolas', monospace; fill: #7d8590; }
    .legend-label { font: 11px/1 system-ui, sans-serif; fill: #8b949e; }
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
  <div class="token-bar-row">
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
  label: string;
  totalTokens: number;
  inProgress: boolean;
}

function buildTokensTimelineChart(summaries: SessionTokenSummary[]): string {
  if (summaries.length === 0) return `<p class="muted-note">No sessions to chart</p>`;

  const BAR_W = 40;
  const BAR_GAP = 8;
  const CHART_H = 80;
  const LABEL_H = 20;
  const SVG_H = CHART_H + LABEL_H + 4;
  const SVG_W = summaries.length * (BAR_W + BAR_GAP) + BAR_GAP;

  const maxTokens = Math.max(...summaries.map((s) => s.totalTokens), 1);

  let bars = "";
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const x = BAR_GAP + i * (BAR_W + BAR_GAP);
    const barH = Math.max(2, clamp01(s.totalTokens / maxTokens) * CHART_H);
    const y = CHART_H - barH;
    const color = s.inProgress ? "#484f58" : "#58a6ff";
    const labelText = s.label.length > 5 ? s.label.slice(-5) : s.label;
    bars += `<rect x="${x}" y="${y.toFixed(1)}" width="${BAR_W}" height="${barH.toFixed(1)}" fill="${color}" rx="3">
    <title>${esc(s.label)}: ${fmtNum(s.totalTokens)} tokens</title>
  </rect>`;
    bars += `<text x="${x + BAR_W / 2}" y="${SVG_H - 2}" text-anchor="middle" class="tl-label">${esc(labelText)}</text>`;
    if (!s.inProgress && s.totalTokens > 0) {
      bars += `<text x="${x + BAR_W / 2}" y="${Math.max(10, y - 3).toFixed(1)}" text-anchor="middle" class="tl-value">${fmtTokensCompact(s.totalTokens)}</text>`;
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
<article class="session-card">
  <div class="session-header">
    <div class="session-meta">
      <span class="session-id">${esc(session.sessionId)}</span>
      <span class="session-datetime">${dateStr}</span>
    </div>
    <div class="session-summary-chips">
      <span class="chip chip-tokens">${fmtNum(totalTokens)} tokens</span>
      ${session.totalPremiumRequests > 0 ? `<span class="chip chip-premium">${session.totalPremiumRequests} premium req</span>` : ""}
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
  <p class="muted-note in-progress-note">&#x23F3; Session is ongoing &#x2014; no token data yet</p>
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
.chip-premium   { background: rgba(63,185,80,.12);  color: var(--accent-green); border: 1px solid rgba(63,185,80,.25); }
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
    btn.textContent = '\u2600 Light';
  }
  btn.addEventListener('click', function() {
    var current = document.documentElement.getAttribute('data-theme');
    if (current === 'light') {
      document.documentElement.removeAttribute('data-theme');
      btn.textContent = '\u263E Dark';
      localStorage.setItem('tscope-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      btn.textContent = '\u2600 Light';
      localStorage.setItem('tscope-theme', 'light');
    }
  });
})();
`.trim();

// ---------------------------------------------------------------------------
// Full HTML assembly
// ---------------------------------------------------------------------------

function buildHtml(report: Report, generatedAt: string): string {
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
    <div class="stat-value accent-blue">${fmtTokensCompact(grandTotalTokens)}</div>
    <div class="stat-sub">${fmtNum(grandTotalTokens)} tokens</div>
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
</div>`;

  const allSummaries: SessionTokenSummary[] = [
    ...sessions.map((session) => {
      let total = 0;
      for (const tokens of Object.values(session.models)) {
        total += tokens.inputTokens + tokens.outputTokens +
          tokens.cacheReadTokens + tokens.cacheWriteTokens;
      }
      return { label: session.sessionId.slice(-8), totalTokens: total, inProgress: false };
    }),
    ...inProgressSessions.map((s) => ({
      label: s.sessionId.slice(-8),
      totalTokens: 0,
      inProgress: true,
    })),
  ];

  const timelineSection =
    totalSessions > 0
      ? `
<section class="timeline-section container">
  <h2 class="section-title">Tokens Over Time</h2>
  ${buildTokensTimelineChart(allSummaries)}
  <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">Each bar = one session &middot; hover for details</p>
</section>`
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
    sessionCardsHtml = `<div class="sessions-list container">${cards}</div>`;
  }

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
      <span class="filter-badge">&#x1F5D3; ${esc(filterDescription)}</span>
      <span style="font-size:12px;color:var(--text-muted)">Generated ${esc(generatedAt)}</span>
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle colour theme">&#x263E; Dark</button>
    </div>
  </div>
</header>

${statCards}
${timelineSection}
${sessionCardsHtml}

<footer class="site-footer">
  <p>tscope &middot; GitHub Copilot Token Usage Report</p>
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
