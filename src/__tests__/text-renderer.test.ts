/**
 * Tests for TextRenderer — verifies plain-text output, summary counts, and
 * the silent exclusion of sessions with no billable token activity.
 */

import { TextRenderer } from "../render/TextRenderer";
import { Report, ParsedSession, InProgressSession } from "../types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const EMPTY_REPORT: Report = {
  sessions: [],
  inProgressSessions: [],
  reportDate: "2026-06-02",
  filterDescription: "today",
};

const SAMPLE_SESSION: ParsedSession = {
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
};

const SECOND_SESSION: ParsedSession = {
  ...SAMPLE_SESSION,
  sessionId: "def-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  startTime: "2026-06-02T21:00:00.000Z",
};

const EMPTY_MODELS_SESSION: ParsedSession = {
  sessionId: "zero-empty-models",
  eventsPath: "/home/user/.copilot/session-state/zero1/events.jsonl",
  startTime: "2026-06-02T19:00:00.000Z",
  models: {},
  chronicleTips: [],
  inProgress: false,
};

const ALL_ZERO_SESSION: ParsedSession = {
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
});
