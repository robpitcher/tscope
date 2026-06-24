/**
 * Canonical test fixtures shared across renderer test suites.
 *
 * Authoritative token values (reconcile any per-file drift against these):
 *   claude-sonnet-4-5 cacheReadTokens = 700
 *   claude-haiku-4-5  cacheReadTokens = 0
 */

import { Report, NormalizedSession, InProgressSession } from "../../types";

export const EMPTY_REPORT: Report = {
  sessions: [],
  inProgressSessions: [],
  reportDate: "2026-06-02",
  filterDescription: "today",
  source: "logs",
  costAvailable: false,
  coverage: { otelCount: 0, logsCount: 0, costCoverage: "none" },
};

export const OTEL_EMPTY_REPORT: Report = {
  ...EMPTY_REPORT,
  source: "otel",
  costAvailable: true,
};

export const SAMPLE_SESSION: NormalizedSession = {
  sessionId: "abc-00000000-1111-2222-3333-444444444444",
  eventsPath: "/home/user/.copilot/session-state/abc/events.jsonl",
  startTime: "2026-06-02T20:00:00.000Z",
  models: {
    "claude-sonnet-4-5": {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 700,
      cacheWriteTokens: 100,
      reasoningTokens: 50,
    },
    "claude-haiku-4-5": {
      inputTokens: 300,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    },
  },
  chronicleTips: [],
  inProgress: false,
  source: "logs",
};

/** OTel session with cost and extended metrics. */
export const OTEL_SESSION: NormalizedSession = {
  sessionId: "otel-00000000-aaaa-bbbb-cccc-dddddddddddd",
  eventsPath: "/home/user/.copilot/tscope/otel.jsonl",
  startTime: "2026-06-10T15:00:00.000Z",
  models: {
    "claude-sonnet-4-5": {
      inputTokens: 2000,
      outputTokens: 800,
      cacheReadTokens: 1200,
      cacheWriteTokens: 200,
      reasoningTokens: 150,
    },
  },
  chronicleTips: [],
  inProgress: false,
  source: "otel",
  totalCost: 2.34,
  modelCosts: { "claude-sonnet-4-5": 2.34 },
  extended: {
    reasoningTokens: 150,
    contextWindow: {
      usedTokens: 12500,
      limitTokens: 128000,
      utilizationRatio: 0.0977,
    },
  },
};

export const SAMPLE_IN_PROGRESS: InProgressSession = {
  sessionId: "xyz-99999999-8888-7777-6666-555555555555",
  eventsPath: "/home/user/.copilot/session-state/xyz/events.jsonl",
  startTime: "2026-06-02T21:00:00.000Z",
  chronicleTips: [],
  inProgress: true,
};
