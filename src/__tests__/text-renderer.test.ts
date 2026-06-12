/**
 * Tests for TextRenderer — verifies plain-text output, summary counts, and
 * the silent exclusion of sessions with no billable token activity.
 * Updated for Phase 3: source provenance footer, cost display, reasoning tokens,
 * and context-window extended metrics.
 */

import { TextRenderer } from "../render/TextRenderer";
import { Report, NormalizedSession, InProgressSession } from "../types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const EMPTY_REPORT: Report = {
  sessions: [],
  inProgressSessions: [],
  reportDate: "2026-06-02",
  filterDescription: "today",
  source: "logs",
  costAvailable: false,
  coverage: { otelCount: 0, logsCount: 0, costCoverage: "none" },
};

const OTEL_EMPTY_REPORT: Report = {
  ...EMPTY_REPORT,
  source: "otel",
  costAvailable: true,
};

const SAMPLE_SESSION: NormalizedSession = {
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
const OTEL_SESSION: NormalizedSession = {
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

const SECOND_SESSION: NormalizedSession = {
  ...SAMPLE_SESSION,
  sessionId: "def-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  startTime: "2026-06-02T21:00:00.000Z",
};

const EMPTY_MODELS_SESSION: NormalizedSession = {
  sessionId: "zero-empty-models",
  eventsPath: "/home/user/.copilot/session-state/zero1/events.jsonl",
  startTime: "2026-06-02T19:00:00.000Z",
  models: {},
  chronicleTips: [],
  inProgress: false,
  source: "logs",
};

const ALL_ZERO_SESSION: NormalizedSession = {
  sessionId: "zero-all-zero",
  eventsPath: "/home/user/.copilot/session-state/zero2/events.jsonl",
  startTime: "2026-06-02T19:30:00.000Z",
  models: {
    "claude-opus": {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    },
  },
  chronicleTips: [],
  inProgress: false,
  source: "logs",
};

const SAMPLE_IN_PROGRESS: InProgressSession = {
  sessionId: "xyz-99999999-8888-7777-6666-555555555555",
  eventsPath: "/home/user/.copilot/session-state/xyz/events.jsonl",
  startTime: "2026-06-02T21:00:00.000Z",
  chronicleTips: [],
  inProgress: true,
};

// ---------------------------------------------------------------------------
// stdout capture helper
// ---------------------------------------------------------------------------

function captureText(report: Report): string {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    new TextRenderer().render(report);
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join("");
}

/**
 * Run `fn` with a temporarily TTY-ified stdout and a controlled NO_COLOR env
 * var, then restore originals. Used to exercise the ANSI styling path.
 *
 * Restores `process.stdout.isTTY` via its original property descriptor — or
 * deletes it when no own property was defined — so we don't leak a permanent
 * data property where there was none (which could affect later tests across
 * Node/Jest versions).
 */
function withTTY<T>(opts: { isTTY: boolean; noColor?: string | undefined }, fn: () => T): T {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const originalNoColor = process.env.NO_COLOR;
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    get: () => opts.isTTY,
  });
  if (opts.noColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = opts.noColor;
  try {
    return fn();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process.stdout, "isTTY", originalDescriptor);
    } else {
      // No own property originally — remove the one we added.
      delete (process.stdout as unknown as { isTTY?: boolean }).isTTY;
    }
    if (originalNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = originalNoColor;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TextRenderer", () => {
  describe("empty report", () => {
    test("prints a 'No sessions found' message using the filter description", () => {
      const out = captureText(EMPTY_REPORT);
      expect(out).toContain("No sessions found for today.");
    });

    test("does not print a SUMMARY line when there are no sessions", () => {
      const out = captureText(EMPTY_REPORT);
      expect(out).not.toContain("SUMMARY:");
    });
  });

  describe("completed session rendering", () => {
    test("includes the session id, local date, path, and TOTALS block", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).toContain(`SESSION: ${SAMPLE_SESSION.sessionId}`);
      expect(out).toContain("Date:");
      expect(out).toContain(SAMPLE_SESSION.eventsPath);
      expect(out).toContain("TOTALS");
    });

    test("includes each model name", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).toContain("claude-sonnet-4-5");
      expect(out).toContain("claude-haiku-4-5");
    });

    test("includes formatted API time when apiDurationMs is set", () => {
      const out = captureText({
        ...EMPTY_REPORT,
        sessions: [{ ...SAMPLE_SESSION, apiDurationMs: 4669 }],
      });
      expect(out).toContain("API time: 4.7s");
    });

    test("omits the API time line when apiDurationMs is unset", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).not.toContain("API time:");
    });

    describe("API time formatting boundaries (no '1m 60s'-style artefacts)", () => {
      function apiLine(ms: number): string {
        const out = captureText({
          ...EMPTY_REPORT,
          sessions: [{ ...SAMPLE_SESSION, apiDurationMs: ms }],
        });
        const m = out.match(/API time: ([^\s]+(?: [^\s]+)?)/);
        return m ? m[1] : "";
      }

      test.each([
        [850, "850ms"],
        [4669, "4.7s"],
        [9949, "9.9s"],
        [9960, "10s"],     // 9.96 rounds up; must NOT print "9.96s" or "10.0s"
        [12000, "12s"],
        [59500, "1m"],     // 59.5s rounds to 60s → carries into "1m 0s"
        [59950, "1m"],     // 59.95s same carry
        [119900, "2m"],    // 119.9s → 120s → "2m 0s" (not "1m 60s")
        [134000, "2m"],
        [3599500, "1h"],   // 59m 59.5s → 3600s → "1h 0m" (not "59m 60s")
        [4980000, "1h"],   // 1h 23m exactly
      ])("apiDurationMs=%i renders without 60s/60m carry bug", (ms, prefix) => {
        const line = apiLine(ms);
        expect(line).toContain(prefix);
        // Explicit forbidden artefacts.
        expect(line).not.toMatch(/\b60s\b/);
        expect(line).not.toMatch(/\b60m\b/);
      });

      test("119900ms renders exactly as '2m 0s' (boundary carry)", () => {
        expect(apiLine(119900)).toBe("2m 0s");
      });

      test("3599500ms renders exactly as '1h 0m' (hour boundary carry)", () => {
        expect(apiLine(3599500)).toBe("1h 0m");
      });
    });

    test("uses singular 'session' for one session", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).toContain("SUMMARY: 1 session\n");
      expect(out).not.toContain("SUMMARY: 1 sessions");
    });

    test("uses plural 'sessions' for two or more sessions", () => {
      const out = captureText({
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION, SECOND_SESSION],
      });
      expect(out).toContain("SUMMARY: 2 sessions\n");
    });
  });

  describe("silent exclusion of sessions with no token data", () => {
    test("never emits the legacy '[IN PROGRESS' marker", () => {
      const out = captureText({
        ...EMPTY_REPORT,
        sessions: [EMPTY_MODELS_SESSION, ALL_ZERO_SESSION],
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      });
      expect(out).not.toContain("IN PROGRESS");
      expect(out).not.toContain("no token data");
    });

    test("in-progress sessions are excluded from output and from the summary count", () => {
      const out = captureText({
        ...EMPTY_REPORT,
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      });
      expect(out).not.toContain(SAMPLE_IN_PROGRESS.sessionId);
      expect(out).toContain("No sessions found for today.");
    });

    test("completed session with empty models map is excluded", () => {
      const out = captureText({
        ...EMPTY_REPORT,
        sessions: [EMPTY_MODELS_SESSION],
      });
      expect(out).not.toContain(EMPTY_MODELS_SESSION.sessionId);
      expect(out).toContain("No sessions found for today.");
    });

    test("completed session with all-zero token counts is excluded", () => {
      const out = captureText({
        ...EMPTY_REPORT,
        sessions: [ALL_ZERO_SESSION],
      });
      expect(out).not.toContain(ALL_ZERO_SESSION.sessionId);
      expect(out).toContain("No sessions found for today.");
    });

    test("mixed report keeps real sessions and drops empty + in-progress ones from the summary", () => {
      const out = captureText({
        ...EMPTY_REPORT,
        sessions: [SAMPLE_SESSION, EMPTY_MODELS_SESSION, ALL_ZERO_SESSION],
        inProgressSessions: [SAMPLE_IN_PROGRESS],
      });
      expect(out).toContain(SAMPLE_SESSION.sessionId);
      expect(out).not.toContain(EMPTY_MODELS_SESSION.sessionId);
      expect(out).not.toContain(ALL_ZERO_SESSION.sessionId);
      expect(out).not.toContain(SAMPLE_IN_PROGRESS.sessionId);
      expect(out).toContain("SUMMARY: 1 session\n");
    });
  });

  describe("ANSI styling (bold + dim, no accent colors)", () => {
    test("emits no ANSI escapes by default (non-TTY in jest)", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      // No ESC byte should appear when stdout isn't a TTY.
      // eslint-disable-next-line no-control-regex
      expect(out).not.toMatch(/\x1b\[/);
    });

    test("on a TTY, bolds session boundaries / headings and dims the path", () => {
      const out = withTTY({ isTTY: true, noColor: undefined }, () =>
        captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] })
      );
      // Heavy divider, SESSION line, model names, TOTALS and SUMMARY are bold.
      expect(out).toContain("\x1b[1m");
      expect(out).toContain(`\x1b[1mSESSION: ${SAMPLE_SESSION.sessionId}\x1b[0m`);
      expect(out).toContain(`\x1b[1mclaude-sonnet-4-5\x1b[0m`);
      expect(out).toContain(`\x1b[1mTOTALS\x1b[0m`);
      expect(out).toContain(`\x1b[1mSUMMARY: 1 session\x1b[0m`);
      // Path is dimmed.
      expect(out).toContain(`\x1b[2mPath:    ${SAMPLE_SESSION.eventsPath}\x1b[0m`);
      // No colour SGR codes (30-37 foreground / 90-97 bright). Only 1 (bold)
      // and 2 (dim) should appear.
      // eslint-disable-next-line no-control-regex
      const sgrs = Array.from(out.matchAll(/\x1b\[(\d+)m/g)).map((m) => m[1]);
      const distinctSgrs = Array.from(new Set(sgrs)).sort();
      expect(distinctSgrs).toEqual(["0", "1", "2"]);
    });

    test("NO_COLOR=1 suppresses all styling even on a TTY", () => {
      const out = withTTY({ isTTY: true, noColor: "1" }, () =>
        captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] })
      );
      // eslint-disable-next-line no-control-regex
      expect(out).not.toMatch(/\x1b\[/);
      // The plain-text content is still all there.
      expect(out).toContain(`SESSION: ${SAMPLE_SESSION.sessionId}`);
      expect(out).toContain("TOTALS");
      expect(out).toContain(`Path:    ${SAMPLE_SESSION.eventsPath}`);
    });
  });

  describe("source provenance footer", () => {
    test("logs report footer says 'Source: event logs (historical)'", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).toContain("Source: event logs (historical)");
    });

    test("otel report footer says 'Source: OpenTelemetry'", () => {
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [OTEL_SESSION] });
      expect(out).toContain("Source: OpenTelemetry");
    });

    test("logs footer includes cost unavailable note", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).toContain("cost data unavailable");
    });

    test("otel footer does not include cost unavailable note", () => {
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [OTEL_SESSION] });
      expect(out).not.toContain("cost data unavailable");
    });

    test("source footer appears even on empty reports (no sessions)", () => {
      const out = captureText(EMPTY_REPORT);
      expect(out).toContain("Source: event logs (historical)");
    });

    test("source footer appears after SUMMARY for non-empty report", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      const summaryIdx = out.indexOf("SUMMARY:");
      // Use lastIndexOf: the footer is always the last "Source:" occurrence
      // (per-session "Source:" lines appear inside session blocks before SUMMARY).
      const sourceFooterIdx = out.lastIndexOf("Source:");
      expect(summaryIdx).toBeGreaterThan(-1);
      expect(sourceFooterIdx).toBeGreaterThan(summaryIdx);
    });
  });

  describe("cost display", () => {
    test("shows cost line for OTel sessions with totalCost", () => {
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [OTEL_SESSION] });
      expect(out).toContain("Cost:");
      expect(out).toContain("2.34");
      expect(out).toContain("credits");
    });

    test("does not show cost line for logs sessions (no totalCost)", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).not.toContain("Cost:");
    });

    test("cost value is formatted to 2 decimal places", () => {
      const session: NormalizedSession = { ...OTEL_SESSION, totalCost: 1.5 };
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [session] });
      expect(out).toContain("1.50");
    });
  });

  describe("extended metrics — reasoning tokens", () => {
    test("shows Reasoning row in model block when tokens.reasoningTokens > 0", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      // claude-sonnet-4-5 has reasoningTokens: 50
      expect(out).toContain("Reasoning:");
      expect(out).toContain("50");
    });

    test("does not show Reasoning row when all models have zero reasoningTokens", () => {
      const noReasoningSession: NormalizedSession = {
        ...SAMPLE_SESSION,
        models: {
          "claude-haiku-4-5": {
            inputTokens: 300,
            outputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
          },
        },
      };
      const out = captureText({ ...EMPTY_REPORT, sessions: [noReasoningSession] });
      expect(out).not.toContain("Reasoning:");
    });

    test("shows Reasoning in TOTALS block when any model has reasoning tokens", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      // Totals section should also show reasoning (50 from sonnet-4-5 only)
      const totalsIdx = out.indexOf("TOTALS");
      const reasoningIdx = out.indexOf("Reasoning:", totalsIdx);
      expect(totalsIdx).toBeGreaterThan(-1);
      expect(reasoningIdx).toBeGreaterThan(totalsIdx);
    });
  });

  describe("extended metrics — context window", () => {
    test("shows Context line when session.extended.contextWindow is set", () => {
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [OTEL_SESSION] });
      expect(out).toContain("Context:");
      expect(out).toContain("12,500");
      expect(out).toContain("128,000");
      expect(out).toContain("% used");
    });

    test("does not show Context line when extended.contextWindow is absent", () => {
      const noCtx: NormalizedSession = { ...OTEL_SESSION, extended: { reasoningTokens: 50 } };
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [noCtx] });
      expect(out).not.toContain("Context:");
    });

    test("does not show Context line for logs sessions", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      expect(out).not.toContain("Context:");
    });

    test("clamps utilizationRatio > 1 to 100% (OTel anomaly: used > limit)", () => {
      const overflowSession: NormalizedSession = {
        ...OTEL_SESSION,
        extended: {
          contextWindow: {
            usedTokens: 150_000,
            limitTokens: 128_000,
            utilizationRatio: 150_000 / 128_000, // ~1.172
          },
        },
      };
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [overflowSession] });
      // Extract the rendered percentage value and confirm it is exactly 100.
      const match = out.match(/Context:\s+[\d,]+ \/ [\d,]+ tokens \((\d+)% used\)/);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(100);
    });

    test("clamps utilizationRatio < 0 to 0% (OTel anomaly: negative)", () => {
      const negativeSession: NormalizedSession = {
        ...OTEL_SESSION,
        extended: {
          contextWindow: {
            usedTokens: -500,
            limitTokens: 128_000,
            utilizationRatio: -0.004,
          },
        },
      };
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [negativeSession] });
      expect(out).toContain("0% used");
    });
  });

  describe("per-session source tag", () => {
    test("logs session block contains 'Source:  log parser'", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      const sessionStart = out.indexOf(`SESSION: ${SAMPLE_SESSION.sessionId}`);
      expect(sessionStart).toBeGreaterThan(-1);
      // Grab from the session header to the next heavy divider (end of block)
      const blockEnd = out.indexOf("═", sessionStart + 40);
      const sessionBlock = out.slice(sessionStart, blockEnd);
      expect(sessionBlock).toContain("Source:");
      expect(sessionBlock).toContain("log parser");
    });

    test("OTel session block contains 'Source:  OTel'", () => {
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [OTEL_SESSION] });
      const sessionStart = out.indexOf(`SESSION: ${OTEL_SESSION.sessionId}`);
      expect(sessionStart).toBeGreaterThan(-1);
      const blockEnd = out.indexOf("═", sessionStart + 40);
      const sessionBlock = out.slice(sessionStart, blockEnd);
      expect(sessionBlock).toContain("Source:");
      expect(sessionBlock).toContain("OTel");
    });

    test("OTel session block does not say 'log parser'", () => {
      const out = captureText({ ...OTEL_EMPTY_REPORT, sessions: [OTEL_SESSION] });
      const sessionStart = out.indexOf(`SESSION: ${OTEL_SESSION.sessionId}`);
      const blockEnd = out.indexOf("═", sessionStart + 40);
      const sessionBlock = out.slice(sessionStart, blockEnd);
      expect(sessionBlock).not.toContain("log parser");
    });

    test("logs session block does not say 'OTel'", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      const sessionStart = out.indexOf(`SESSION: ${SAMPLE_SESSION.sessionId}`);
      const blockEnd = out.indexOf("═", sessionStart + 40);
      const sessionBlock = out.slice(sessionStart, blockEnd);
      expect(sessionBlock).not.toContain("OTel");
    });

    test("per-session source tag appears between the session header and the LIGHT divider", () => {
      const out = captureText({ ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] });
      const sessionStart = out.indexOf(`SESSION: ${SAMPLE_SESSION.sessionId}`);
      const lightIdx = out.indexOf("─", sessionStart);
      const headerSection = out.slice(sessionStart, lightIdx);
      expect(headerSection).toContain("Source:");
    });
  });

  describe("mixed report coverage footer", () => {
    const MIXED_REPORT: Report = {
      ...EMPTY_REPORT,
      source: "mixed",
      costAvailable: true,
      coverage: { otelCount: 2, logsCount: 3, costCoverage: "partial" },
      sessions: [OTEL_SESSION, SAMPLE_SESSION],
    };

    test("mixed report footer shows 'Sources: N OTel, M logs'", () => {
      const out = captureText(MIXED_REPORT);
      expect(out).toContain("Sources: 2 OTel, 3 logs");
    });

    test("mixed report footer mentions OTel sessions only for cost", () => {
      const out = captureText(MIXED_REPORT);
      expect(out).toContain("OTel sessions only");
    });

    test("mixed report footer does not say 'Source: mixed' (old label gone)", () => {
      const out = captureText(MIXED_REPORT);
      expect(out).not.toContain("Source: mixed");
    });

    test("mixed report footer does not say 'cost data unavailable' (partial, not none)", () => {
      const out = captureText(MIXED_REPORT);
      expect(out).not.toContain("cost data unavailable");
    });

    test("mixed report footer starts with 'Sources:' not 'Source:'", () => {
      const out = captureText(MIXED_REPORT);
      // Footer is the last line; check it starts with 'Sources:'
      const lines = out.trimEnd().split("\n");
      const footerLine = lines[lines.length - 1];
      expect(footerLine).toMatch(/^Sources:/);
    });
  });
});
