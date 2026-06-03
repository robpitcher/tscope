/**
 * Tests for HtmlRenderer — verifies self-contained output, content, escaping,
 * and edge-case handling.
 */

import * as fs from "fs";
import * as path from "path";
import { HtmlRenderer } from "../render/HtmlRenderer";
import {
  Report,
  ParsedSession,
  InProgressSession,
  SessionCredits,
} from "../types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const EMPTY_REPORT: Report = {
  sessions: [],
  inProgressSessions: [],
  totalCredits: 0,
  hasUnknownRates: false,
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
  totalPremiumRequests: 5,
  inProgress: false,
};

const SAMPLE_CREDITS: SessionCredits = {
  models: [
    {
      modelName: "claude-sonnet-4-5",
      tokens: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 700,
        cacheWriteTokens: 100,
        reasoningTokens: 50,
      },
      estimatedCredits: 2.5,
      unknownRate: false,
    },
    {
      modelName: "claude-haiku-4-5",
      tokens: {
        inputTokens: 300,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      },
      estimatedCredits: 0.3,
      unknownRate: false,
    },
  ],
  totalCredits: 2.8,
  hasUnknownRates: false,
};

const SAMPLE_IN_PROGRESS: InProgressSession = {
  sessionId: "xyz-99999999-8888-7777-6666-555555555555",
  eventsPath: "/home/user/.copilot/session-state/xyz/events.jsonl",
  startTime: "2026-06-02T21:00:00.000Z",
  inProgress: true,
};

/** Write to a temp file, read back contents, delete the file */
function renderToString(report: Report, filename = "test-report.html"): string {
  const outPath = path.join(process.cwd(), filename);
  const renderer = new HtmlRenderer(outPath);
  renderer.render(report);
  const content = fs.readFileSync(outPath, "utf8");
  fs.unlinkSync(outPath);
  return content;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HtmlRenderer", () => {
  describe("produces a non-empty self-contained HTML document", () => {
    test("output is non-empty", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-empty.html");
      expect(html.length).toBeGreaterThan(100);
    });

    test("contains <html opening tag", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-html-tag.html");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
    });

    test("contains inlined <style> block (no external CSS)", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-style.html");
      expect(html).toContain("<style>");
    });

    test("contains no http(s):// external resource links (CDN-free)", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [{ session: SAMPLE_SESSION, credits: SAMPLE_CREDITS }],
          totalCredits: 2.8,
        },
        "html-test-cdn.html"
      );
      // Must not reference any external resource in src/href/url()
      const externalPatterns = [
        /src=["']https?:\/\//i,
        /href=["']https?:\/\//i,
        /url\(https?:\/\//i,
        /\bimport\b.*https?:\/\//i,
      ];
      for (const re of externalPatterns) {
        expect(html).not.toMatch(re);
      }
    });

    test("contains closing </html> tag", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-close.html");
      expect(html).toContain("</html>");
    });
  });

  describe("includes session and model data", () => {
    test("includes session id in output", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [{ session: SAMPLE_SESSION, credits: SAMPLE_CREDITS }],
          totalCredits: 2.8,
        },
        "html-test-session-id.html"
      );
      expect(html).toContain(SAMPLE_SESSION.sessionId);
    });

    test("includes model names in output", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [{ session: SAMPLE_SESSION, credits: SAMPLE_CREDITS }],
          totalCredits: 2.8,
        },
        "html-test-model-names.html"
      );
      expect(html).toContain("claude-sonnet-4-5");
      expect(html).toContain("claude-haiku-4-5");
    });

    test("includes in-progress session id", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, inProgressSessions: [SAMPLE_IN_PROGRESS] },
        "html-test-in-progress.html"
      );
      expect(html).toContain(SAMPLE_IN_PROGRESS.sessionId);
    });

    test("includes filter description", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, filterDescription: "all time" },
        "html-test-filter.html"
      );
      expect(html).toContain("all time");
    });
  });

  describe("HTML-escapes dangerous strings", () => {
    test("escapes <script> in model name", () => {
      const maliciousModel = "<script>alert('xss')</script>";
      const evilCredits: SessionCredits = {
        models: [
          {
            modelName: maliciousModel,
            tokens: {
              inputTokens: 100,
              outputTokens: 50,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
            },
            estimatedCredits: 0.1,
            unknownRate: false,
          },
        ],
        totalCredits: 0.1,
        hasUnknownRates: false,
      };
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [{ session: SAMPLE_SESSION, credits: evilCredits }],
          totalCredits: 0.1,
        },
        "html-test-escape-model.html"
      );
      // Raw unescaped script tag must not appear
      expect(html).not.toContain("<script>alert(");
      // Escaped version should be present
      expect(html).toContain("&lt;script&gt;");
    });

    test("escapes <img onerror> in session path", () => {
      const evil: ParsedSession = {
        ...SAMPLE_SESSION,
        eventsPath: `"><img src=x onerror=alert(1)>`,
      };
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [{ session: evil, credits: SAMPLE_CREDITS }],
          totalCredits: 2.8,
        },
        "html-test-escape-path.html"
      );
      expect(html).not.toContain(`"><img src=x onerror=alert(1)>`);
      expect(html).toContain("&lt;img");
    });

    test("escapes ampersand in filter description", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, filterDescription: "a & b" },
        "html-test-escape-filter.html"
      );
      expect(html).toContain("a &amp; b");
      expect(html).not.toContain("a & b");
    });
  });

  describe("handles empty report gracefully", () => {
    test("does not throw on empty report", () => {
      expect(() => renderToString(EMPTY_REPORT, "html-test-no-crash.html")).not.toThrow();
    });

    test("shows no-sessions message for empty report", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-empty-state.html");
      expect(html.toLowerCase()).toMatch(/no sessions/i);
    });
  });

  describe("handles unknown-rate models", () => {
    test("does not crash when model has unknown rate", () => {
      const unknownCredits: SessionCredits = {
        models: [
          {
            modelName: "mystery-model-9000",
            tokens: {
              inputTokens: 500,
              outputTokens: 200,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
            },
            estimatedCredits: undefined,
            unknownRate: true,
          },
        ],
        totalCredits: 0,
        hasUnknownRates: true,
      };
      expect(() =>
        renderToString(
          {
            ...EMPTY_REPORT,
            sessions: [{ session: SAMPLE_SESSION, credits: unknownCredits }],
            hasUnknownRates: true,
          },
          "html-test-unknown-rate.html"
        )
      ).not.toThrow();

      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [{ session: SAMPLE_SESSION, credits: unknownCredits }],
          hasUnknownRates: true,
        },
        "html-test-unknown-rate2.html"
      );
      expect(html).toContain("mystery-model-9000");
    });
  });

  describe("writes file to specified path", () => {
    test("creates the output file at the given path", () => {
      const outPath = path.join(process.cwd(), "html-test-write-path.html");
      const renderer = new HtmlRenderer(outPath);
      renderer.render(EMPTY_REPORT);
      expect(fs.existsSync(outPath)).toBe(true);
      fs.unlinkSync(outPath);
    });

    test("overwrites existing file silently", () => {
      const outPath = path.join(process.cwd(), "html-test-overwrite.html");
      fs.writeFileSync(outPath, "old content", "utf8");
      const renderer = new HtmlRenderer(outPath);
      renderer.render(EMPTY_REPORT);
      const content = fs.readFileSync(outPath, "utf8");
      expect(content).not.toBe("old content");
      expect(content).toContain("<!DOCTYPE html>");
      fs.unlinkSync(outPath);
    });
  });

  describe("multiple sessions", () => {
    test("renders multiple completed sessions", () => {
      const session2: ParsedSession = {
        ...SAMPLE_SESSION,
        sessionId: "def-11111111-2222-3333-4444-555555555555",
        startTime: "2026-06-02T22:00:00.000Z",
      };
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [
            { session: SAMPLE_SESSION, credits: SAMPLE_CREDITS },
            { session: session2, credits: SAMPLE_CREDITS },
          ],
          totalCredits: 5.6,
        },
        "html-test-multi-session.html"
      );
      expect(html).toContain(SAMPLE_SESSION.sessionId);
      expect(html).toContain(session2.sessionId);
    });
  });
});
