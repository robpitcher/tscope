/**
 * screenshot-dashboard.mjs
 *
 * Generates a self-contained dashboard HTML preview from synthetic sample data
 * for use in automated screenshot capture (see .github/workflows/update-docs.md).
 *
 * Usage:
 *   node scripts/screenshot-dashboard.mjs
 *
 * Output: dashboard-preview.html (in the repo root)
 *
 * Requires the project to be built first: npm run build
 *
 * This script bypasses the tscope CLI and constructs a synthetic Report directly,
 * so it works on any machine or CI runner without real Copilot session data.
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load the built HtmlRenderer from dist/
const { HtmlRenderer } = require(path.join(__dirname, '..', 'dist', 'render', 'HtmlRenderer.js'));

// ---------------------------------------------------------------------------
// Synthetic report data — realistic-looking sessions with token + cost data.
// Dates are intentionally in the past so they don't drift relative to "today".
// ---------------------------------------------------------------------------

/** @type {import('../src/types.js').Report} */
const syntheticReport = {
  reportDate: '2026-06-10',
  filterDescription: 'last 7 days',
  source: 'mixed',
  costAvailable: true,
  coverage: {
    otelCount: 3,
    logsCount: 2,
    costCoverage: 'partial',
  },
  inProgressSessions: [],
  sessions: [
    {
      sessionId: 'aaa00000-0000-0000-0000-000000000001',
      eventsPath: '/home/runner/.copilot/session-state/aaa00000-0000-0000-0000-000000000001/events.jsonl',
      startTime: '2026-06-10T14:30:00.000Z',
      source: 'otel',
      models: {
        'claude-sonnet-4-5': {
          inputTokens: 48200,
          outputTokens: 3100,
          cacheReadTokens: 32500,
          cacheWriteTokens: 1200,
          reasoningTokens: 0,
        },
        'gpt-4o': {
          inputTokens: 12000,
          outputTokens: 800,
          cacheReadTokens: 8000,
          cacheWriteTokens: 400,
          reasoningTokens: 0,
        },
      },
      apiDurationMs: 42000,
      chronicleTips: [],
      inProgress: false,
      totalCost: 0.0182,
      modelCosts: {
        'claude-sonnet-4-5': 0.0151,
        'gpt-4o': 0.0031,
      },
      extended: {
        reasoningTokens: 0,
        contextWindow: {
          usedTokens: 61300,
          limitTokens: 200000,
          utilizationRatio: 0.3065,
        },
      },
    },
    {
      sessionId: 'bbb00000-0000-0000-0000-000000000002',
      eventsPath: '/home/runner/.copilot/session-state/bbb00000-0000-0000-0000-000000000002/events.jsonl',
      startTime: '2026-06-09T10:15:00.000Z',
      source: 'otel',
      models: {
        'claude-sonnet-4-5': {
          inputTokens: 92400,
          outputTokens: 5800,
          cacheReadTokens: 71000,
          cacheWriteTokens: 2200,
          reasoningTokens: 1400,
        },
      },
      apiDurationMs: 78000,
      chronicleTips: [],
      inProgress: false,
      totalCost: 0.0341,
      modelCosts: { 'claude-sonnet-4-5': 0.0341 },
      extended: {
        reasoningTokens: 1400,
        contextWindow: {
          usedTokens: 98600,
          limitTokens: 200000,
          utilizationRatio: 0.493,
        },
      },
    },
    {
      sessionId: 'ccc00000-0000-0000-0000-000000000003',
      eventsPath: '/home/runner/.copilot/session-state/ccc00000-0000-0000-0000-000000000003/events.jsonl',
      startTime: '2026-06-08T16:45:00.000Z',
      source: 'otel',
      models: {
        'claude-opus-4-5': {
          inputTokens: 155000,
          outputTokens: 9200,
          cacheReadTokens: 128000,
          cacheWriteTokens: 3800,
          reasoningTokens: 4200,
        },
      },
      apiDurationMs: 134000,
      chronicleTips: [],
      inProgress: false,
      totalCost: 0.0887,
      modelCosts: { 'claude-opus-4-5': 0.0887 },
      extended: {
        reasoningTokens: 4200,
        contextWindow: {
          usedTokens: 168000,
          limitTokens: 200000,
          utilizationRatio: 0.84,
        },
      },
    },
    {
      sessionId: 'ddd00000-0000-0000-0000-000000000004',
      eventsPath: '/home/runner/.copilot/session-state/ddd00000-0000-0000-0000-000000000004/events.jsonl',
      startTime: '2026-06-07T09:00:00.000Z',
      source: 'logs',
      models: {
        'claude-sonnet-4-5': {
          inputTokens: 35600,
          outputTokens: 2400,
          cacheReadTokens: 27000,
          cacheWriteTokens: 900,
          reasoningTokens: 0,
        },
      },
      apiDurationMs: 31000,
      chronicleTips: [],
      inProgress: false,
    },
    {
      sessionId: 'eee00000-0000-0000-0000-000000000005',
      eventsPath: '/home/runner/.copilot/session-state/eee00000-0000-0000-0000-000000000005/events.jsonl',
      startTime: '2026-06-06T14:20:00.000Z',
      source: 'logs',
      models: {
        'gpt-4o': {
          inputTokens: 18900,
          outputTokens: 1600,
          cacheReadTokens: 14200,
          cacheWriteTokens: 600,
          reasoningTokens: 0,
        },
      },
      apiDurationMs: 24000,
      chronicleTips: [],
      inProgress: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// Render and write
// ---------------------------------------------------------------------------

const outputPath = path.join(__dirname, '..', 'dashboard-preview.html');
const renderer = new HtmlRenderer(outputPath);
renderer.render(syntheticReport);

console.log(`dashboard-preview.html written to: ${outputPath}`);
