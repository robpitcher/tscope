/**
 * Tests for HtmlRenderer — verifies self-contained output, content, escaping,
 * and edge-case handling.
 * Updated for tscope/report/v3: no credit fields.
 */

import * as fs from "fs";
import * as path from "path";
import { HtmlRenderer } from "../render/HtmlRenderer";
import {
  Report,
  ParsedSession,
  InProgressSession,
} from "../types";

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

const SAMPLE_IN_PROGRESS: InProgressSession = {
  sessionId: "xyz-99999999-8888-7777-6666-555555555555",
  eventsPath: "/home/user/.copilot/session-state/xyz/events.jsonl",
  startTime: "2026-06-02T21:00:00.000Z",
  chronicleTips: [],
  inProgress: true,
};

/** Write to a file path in cwd, read back contents, delete the file */
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

    test("contains <!DOCTYPE html> and <html opening tag", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-html-tag.html");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
    });

    test("contains inlined <style> block (no external CSS)", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-style.html");
      expect(html).toContain("<style>");
    });

    test("contains no external resource links (CDN-free)", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [SAMPLE_SESSION],
        },
        "html-test-cdn.html"
      );
      // No externally-loaded resources (scripts, stylesheets, fonts, images).
      // Navigation anchors (e.g. the GitHub repo link) are allowed.
      const externalResourcePatterns = [
        /src=["']https?:\/\//i,
        /<link[^>]+href=["']https?:\/\//i,
        /url\(\s*["']?https?:\/\//i,
        /\bimport\b[^;]*["']https?:\/\//i,
      ];
      for (const re of externalResourcePatterns) {
        expect(html).not.toMatch(re);
      }
    });

    test("only external links point to the project repository", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-ext-links.html"
      );
      const hrefs = (html.match(/href=["']https?:\/\/[^"']+["']/gi) || []).map((h) =>
        h.replace(/^href=["']|["']$/g, "")
      );
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href).toContain("github.com/devjoy-pub/tscope");
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
          sessions: [SAMPLE_SESSION],
        },
        "html-test-session-id.html"
      );
      expect(html).toContain(SAMPLE_SESSION.sessionId);
    });

    test("includes model names in output", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [SAMPLE_SESSION],
        },
        "html-test-model-names.html"
      );
      expect(html).toContain("claude-sonnet-4-5");
      expect(html).toContain("claude-haiku-4-5");
    });

    test("excludes in-progress session id (silently dropped)", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, inProgressSessions: [SAMPLE_IN_PROGRESS] },
        "html-test-in-progress.html"
      );
      expect(html).not.toContain(SAMPLE_IN_PROGRESS.sessionId);
    });

    test("includes filter description", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, filterDescription: "all time" },
        "html-test-filter.html"
      );
      expect(html).toContain("all time");
    });

    test("shows tokens chip", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-tokens-chip.html"
      );
      expect(html).toContain("tokens");
    });
  });

  describe("no credit references in output", () => {
    test("does not contain credit-related text", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-no-credits.html"
      );
      expect(html.toLowerCase()).not.toContain("estimated credits");
      expect(html.toLowerCase()).not.toContain("rate table");
      expect(html).not.toContain("Est. Credits");
    });

    test("contains tokens-over-time section title", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-timeline-title.html"
      );
      expect(html.toLowerCase()).toContain("tokens over time");
    });

    test("contains tokens by model section title", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-tokens-by-model.html"
      );
      expect(html.toLowerCase()).toContain("tokens by model");
    });
  });

  describe("HTML-escapes dangerous strings", () => {
    test("escapes <script> in model name", () => {
      const maliciousModel = "<script>alert('xss')</script>";
      const evilSession: ParsedSession = {
        ...SAMPLE_SESSION,
        models: {
          [maliciousModel]: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
          },
        },
      };
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [evilSession] },
        "html-test-escape-model.html"
      );
      expect(html).not.toContain("<script>alert(");
      expect(html).toContain("&lt;script&gt;");
    });

    test("escapes <img onerror> in session path", () => {
      const evil: ParsedSession = {
        ...SAMPLE_SESSION,
        eventsPath: `"><img src=x onerror=alert(1)>`,
      };
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [evil] },
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
          sessions: [SAMPLE_SESSION, session2],
        },
        "html-test-multi-session.html"
      );
      expect(html).toContain(SAMPLE_SESSION.sessionId);
      expect(html).toContain(session2.sessionId);
    });
  });

  describe("theme handling", () => {
    test("follows system preference via prefers-color-scheme", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-theme-system.html");
      expect(html).toContain("prefers-color-scheme: light");
      expect(html).toContain(":root:not([data-theme])");
    });

    test("retains an explicit light/dark override toggle", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-theme-toggle.html");
      expect(html).toContain('id="theme-toggle"');
      expect(html).toContain('[data-theme="light"]');
      expect(html).toContain('[data-theme="dark"]');
    });
  });

  describe("GitHub repo links", () => {
    test("header contains a GitHub logo link to the repo", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-gh-header.html");
      expect(html).toContain('href="https://github.com/devjoy-pub/tscope"');
      expect(html).toContain("View tscope on GitHub");
      expect(html).toContain("gh-link");
    });

    test("footer invites contributions and links the repo", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-footer-contribute.html");
      expect(html.toLowerCase()).toContain("contribute or report issues");
      expect(html).toContain("https://github.com/devjoy-pub/tscope");
    });
  });

  describe("chart hover details", () => {
    test("timeline replaces the old footer text with axis labels", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-timeline-axes.html"
      );
      expect(html).not.toContain("Each bar = one session");
      expect(html).toContain("Session Id (truncated)");
      expect(html).toContain("Token count");
    });

    test("timeline bars carry per-token-type hover data (no session id)", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-timeline-tip.html"
      );
      expect(html).toContain("chart-tooltip");
      expect(html).toContain('class="tl-bar has-tip"');
      expect(html).toContain('data-cacheread=');
      expect(html).toContain('data-cachewrite=');
      // The bar tooltips must not embed the session id as a title attribute
      expect(html).not.toMatch(/<rect[^>]*data-input[^>]*data-title/);
    });

    test("horizontal model bars carry per-token-type hover data", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-hbar-tip.html"
      );
      expect(html).toContain('token-bar-row has-tip');
      expect(html).toContain('data-title="claude-sonnet-4-5"');
      expect(html).toContain('data-output=');
    });
  });

  describe("chronicle tips rendering", () => {
    const tipSession = (
      markdown: string,
      variant: "tips" | "cost-tips" = "cost-tips",
      timestamp = "2026-06-02T23:00:00.000Z",
      sessionId = SAMPLE_SESSION.sessionId
    ): ParsedSession => ({
      ...SAMPLE_SESSION,
      sessionId,
      chronicleTips: [{ variant, timestamp, markdown }],
    });

    test("renders a standalone, collapsible Chronicle Insights box (closed by default)", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession("## Where your tokens go\n\nUse **/compact** more.")] },
        "html-test-chronicle.html"
      );
      expect(html).toContain("Chronicle Insights");
      expect(html).toContain('<section class="timeline-section chronicle-box">');
      // Collapsible via a <details>/<summary>, closed by default (no `open`).
      expect(html).toContain('<details class="chronicle-details">');
      expect(html).not.toContain('<details class="chronicle-details" open>');
      expect(html).toContain('class="chronicle-summary"');
    });

    test("summary carries a detection note referencing the variant", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession("## Tips\n\nbody", "cost-tips")] },
        "html-test-chronicle-note.html"
      );
      expect(html).toContain("was detected within the session scope of this report");
      expect(html).toContain("<code>/chronicle cost-tips</code>");
    });

    test("places the chronicle box after the timeline and before the session list", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession("## Tips\n\nbody")] },
        "html-test-chronicle-order.html"
      );
      const timelineIdx = html.indexOf("Tokens Over Time");
      const chronicleIdx = html.indexOf('<section class="timeline-section chronicle-box">');
      const sessionsIdx = html.indexOf('id="sessions-host"');
      expect(timelineIdx).toBeGreaterThan(-1);
      expect(chronicleIdx).toBeGreaterThan(timelineIdx);
      expect(sessionsIdx).toBeGreaterThan(chronicleIdx);
    });

    test("is not nested inside a session card", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession("## Tips\n\nbody")] },
        "html-test-chronicle-outside.html"
      );
      // The chronicle box must appear before the sessions list container, i.e.
      // it is not rendered within any session card.
      const chronicleIdx = html.indexOf("chronicle-box");
      const sessionsIdx = html.indexOf('id="sessions-host"');
      expect(chronicleIdx).toBeLessThan(sessionsIdx);
    });

    test("shows only the most recent tip when multiple sessions have tips", () => {
      const older = tipSession("OLD INSIGHT", "tips", "2026-06-01T10:00:00.000Z", "old-session-1234");
      const newer = tipSession("NEW INSIGHT", "cost-tips", "2026-06-02T22:00:00.000Z", "new-session-5678");
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [older, newer] },
        "html-test-chronicle-recent.html"
      );
      expect(html).toContain("NEW INSIGHT");
      expect(html).not.toContain("OLD INSIGHT");
      // Exactly one chronicle box is rendered.
      expect(html.split('class="timeline-section chronicle-box"').length - 1).toBe(1);
      // Provenance points at the most recent session.
      expect(html).toContain("new-session");
    });

    test("converts markdown headings, bold and lists to HTML", () => {
      const md = "## Tips\n\n- First **bold** item\n- Second `code` item";
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession(md)] },
        "html-test-chronicle-md.html"
      );
      expect(html).toContain("<h4 class=\"ct-h\">Tips</h4>");
      expect(html).toContain("<ul>");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<code>code</code>");
    });

    test("does not render a box when there are no tips", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-chronicle-none.html"
      );
      expect(html).not.toContain('class="timeline-section chronicle-box"');
    });

    test("HTML-escapes dangerous markdown content", () => {
      const md = "## <script>alert('xss')</script>\n\n- <img src=x onerror=alert(1)>";
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession(md)] },
        "html-test-chronicle-xss.html"
      );
      expect(html).not.toContain("<script>alert(");
      expect(html).not.toContain("<img src=x onerror=alert(1)>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;img");
    });

    test("does not apply bold/italic inside inline code spans", () => {
      const md = "Run `npm run **build**` first.";
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession(md)] },
        "html-test-chronicle-code.html"
      );
      expect(html).toContain("<code>npm run **build**</code>");
      expect(html).not.toContain("<code>npm run <strong>build</strong></code>");
    });

    test("renders markdown links as plain text (no external anchors)", () => {
      const md = "See [the docs](https://example.com/evil) for details.";
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [tipSession(md)] },
        "html-test-chronicle-link.html"
      );
      expect(html).toContain("the docs (https://example.com/evil)");
      expect(html).not.toContain('href="https://example.com/evil"');
    });
  });

  describe("dynamic date-range filtering", () => {
    interface HtmlPayloadSession {
      id: string;
      start: string | null;
      inProgress: boolean;
      totalTokens: number;
      input: number;
      cacheRead: number;
    }

    interface HtmlPayload {
      reportDate: string;
      generatedAtIso: string;
      sessions: HtmlPayloadSession[];
    }

    function extractPayload(html: string): HtmlPayload {
      const m = html.match(
        /<script id="tscope-data" type="application\/json">([\s\S]*?)<\/script>/
      );
      if (!m) throw new Error("data payload script not found");
      return JSON.parse(m[1]) as HtmlPayload;
    }

    test("embeds a JSON payload with per-session token data (in-progress excluded)", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [SAMPLE_SESSION],
          inProgressSessions: [SAMPLE_IN_PROGRESS],
        },
        "html-test-payload.html"
      );
      const data = extractPayload(html);
      expect(data.reportDate).toBe("2026-06-02");
      expect(typeof data.generatedAtIso).toBe("string");
      expect(Array.isArray(data.sessions)).toBe(true);
      // In-progress sessions are silently excluded — only the completed one remains.
      expect(data.sessions).toHaveLength(1);

      const done = data.sessions.find((s) => !s.inProgress);
      if (!done) throw new Error("completed session not found");
      expect(done.id).toBe(SAMPLE_SESSION.sessionId);
      expect(done.start).toBe(SAMPLE_SESSION.startTime);
      // total = input + output (cache is part of input): (1000+500)+(300+100) = 1900
      expect(done.totalTokens).toBe(1900);
      // input column is fresh (uncached) input: (1000-700-100)+(300-0-0) = 200+300 = 500
      expect(done.input).toBe(500);
      expect(done.cacheRead).toBe(700);

      // The in-progress session must not appear anywhere in the payload.
      expect(data.sessions.find((s) => s.inProgress)).toBeUndefined();
      expect(data.sessions.find((s) => s.id === SAMPLE_IN_PROGRESS.sessionId)).toBeUndefined();
    });

    test("renders an interactive date-range picker in the header", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-picker.html"
      );
      expect(html).toContain('id="filter-pill"');
      expect(html).toContain('id="filter-popover"');
      expect(html).toContain('data-preset="all"');
      expect(html).toContain('data-preset="today"');
      expect(html).toContain('data-preset="7d"');
      expect(html).toContain('data-preset="30d"');
      expect(html).toContain('id="range-from"');
      expect(html).toContain('id="range-to"');
      expect(html).toContain('id="range-apply"');
    });

    test("renders an Export CSV button in the header with client-side wiring", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-export-csv.html"
      );
      // Button is present, properly typed, and labelled.
      expect(html).toContain('id="export-csv"');
      expect(html).toMatch(/<button[^>]*id="export-csv"[^>]*type="button"/);
      expect(html).toContain("Export CSV");
      // The .export-btn stylesheet rule is included.
      expect(html).toContain(".export-btn");
      // The inline JS defines the CSV builder, downloader, and the
      // expected column headers (matches the SessionTokenSummary shape).
      expect(html).toContain("function buildCsv");
      expect(html).toContain("function downloadCsv");
      expect(html).toContain("'sessionId'");
      expect(html).toContain("'startTime'");
      expect(html).toContain("'totalTokens'");
      expect(html).toContain("'freshInputTokens'");
      expect(html).toContain("'cacheReadTokens'");
      expect(html).toContain("'cacheWriteTokens'");
      expect(html).toContain("'outputTokens'");
      expect(html).toContain("'apiDurationMs'");
      // Filename incorporates the report date so multi-day exports are distinct.
      expect(html).toContain("'tscope-sessions-'");
    });

    test("cached-input pill is neutrally labelled (no green/amber/red grading)", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-cache-label.html"
      );
      // Relabelled away from "cache hit" since we're measuring tokens, not requests.
      expect(html).toContain("cached input");
      expect(html).toContain("Cached Input %");
      expect(html).not.toContain("cache hit");
      expect(html).not.toContain("Cache Efficiency");
      // Colour-coded pass/fail pills removed; a single neutral pill is used instead.
      expect(html).toContain("pill-neutral");
      expect(html).not.toContain("pill-green");
      expect(html).not.toContain("pill-amber");
      expect(html).not.toContain("pill-red");
    });

    test("renders the API time chip on the session card when duration is known", () => {
      const sessionWithDuration: ParsedSession = {
        ...SAMPLE_SESSION,
        apiDurationMs: 4669,
      };
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [sessionWithDuration] },
        "html-test-api-chip.html"
      );
      // Chip is present with formatted duration and an explanatory tooltip.
      expect(html).toMatch(/<span class="chip chip-duration"[^>]*>4\.7s API<\/span>/);
      expect(html).toContain("Cumulative model API time");
      // CSS rule for the chip exists.
      expect(html).toContain(".chip-duration");
    });

    test("omits the API time chip when duration is unknown", () => {
      // SAMPLE_SESSION has no apiDurationMs set.
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-no-api-chip.html"
      );
      expect(html).not.toContain("chip chip-duration");
      expect(html).not.toContain(" API</span>");
    });

    test.each([
      [9960, ">10s API<"],     // 9.96s rounds up — must not produce "9.96s" / "10.0s"
      [59500, ">1m 0s API<"],  // 59.5s → 60s → carries into 1m 0s (not "60s")
      [119900, ">2m 0s API<"], // 119.9s → 120s → "2m 0s" (not "1m 60s")
      [3599500, ">1h 0m API<"],// 59m 59.5s → 3600s → "1h 0m" (not "59m 60s")
    ])("API chip handles rounding-boundary durations cleanly (%i ms)", (ms, expected) => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [{ ...SAMPLE_SESSION, apiDurationMs: ms }] },
        `html-test-chip-${ms}.html`
      );
      expect(html).toContain(expected);
      // Must never produce non-canonical 60s/60m output.
      expect(html).not.toMatch(/>\s*\d+m 60s\b/);
      expect(html).not.toMatch(/>\s*\d+h 60m\b/);
    });

    test("CSV export neutralises spreadsheet formula-injection (=,+,-,@,TAB,CR)", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-csv-injection.html"
      );
      // The embedded csvCell() helper must guard against formula-leading
      // characters by prepending a quote before the surrounding quote logic
      // runs. We verify both the regex and the prefix string exist in the
      // emitted JS (the live behaviour is exercised in-browser).
      expect(html).toMatch(/\/\^\[=\+\\-@\\t\\r\]\//);
      expect(html).toContain('"\'" + s');
    });

    test("tags each session card with its session id (in-progress excluded)", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [SAMPLE_SESSION],
          inProgressSessions: [SAMPLE_IN_PROGRESS],
        },
        "html-test-card-ids.html"
      );
      expect(html).toContain(`data-session-id="${SAMPLE_SESSION.sessionId}"`);
      // In-progress sessions are silently excluded from the HTML.
      expect(html).not.toContain(`data-session-id="${SAMPLE_IN_PROGRESS.sessionId}"`);
    });

    test("wraps the timeline in a host element for re-rendering", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-timeline-host.html"
      );
      expect(html).toContain('id="timeline-host"');
    });

    test("timeline bars link to their session via data-session-id and are activatable", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          sessions: [SAMPLE_SESSION],
          inProgressSessions: [SAMPLE_IN_PROGRESS],
        },
        "html-test-timeline-link.html"
      );
      // Each bar carries the session id (matching the card) plus button semantics.
      const barRe = new RegExp(
        `<rect[^>]*class="tl-bar[^"]*"[^>]*data-session-id="${SAMPLE_SESSION.sessionId}"`
      );
      expect(html).toMatch(barRe);
      expect(html).toContain('role="button"');
      expect(html).toContain('tabindex="0"');
      // The flash highlight animation must be defined for the target card.
      expect(html).toContain("session-card--flash");
      expect(html).toContain("@keyframes card-flash");
    });

    test("payload escapes < so it cannot break out of the script tag", () => {
      const evil: ParsedSession = {
        ...SAMPLE_SESSION,
        sessionId: "a</script><b",
      };
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [evil] },
        "html-test-payload-escape.html"
      );
      // No raw closing tag injected by the payload.
      expect(html).toContain("\\u003c/script>");
      // Parsing still recovers the original id.
      const data = extractPayload(html);
      expect(data.sessions[0].id).toBe("a</script><b");
    });
  });

  describe("zero-token completed sessions are silently excluded", () => {
    const EMPTY_MODELS_SESSION: ParsedSession = {
      sessionId: "zero-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      eventsPath: "/home/user/.copilot/session-state/zero/events.jsonl",
      startTime: "2026-06-02T19:00:00.000Z",
      models: {},
      chronicleTips: [],
      inProgress: false,
    };

    const ALL_ZERO_SESSION: ParsedSession = {
      sessionId: "zzz-11111111-2222-3333-4444-555555555555",
      eventsPath: "/home/user/.copilot/session-state/zzz/events.jsonl",
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

    function extractPayload(html: string): { sessions: Array<{ id: string }> } {
      const m = html.match(
        /<script id="tscope-data" type="application\/json">([\s\S]*?)<\/script>/
      );
      if (!m) throw new Error("data payload script not found");
      return JSON.parse(m[1]);
    }

    test("session with empty models map has no card or bar in the HTML", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [EMPTY_MODELS_SESSION] },
        "html-test-zero-empty-models.html"
      );
      expect(html).not.toContain(EMPTY_MODELS_SESSION.sessionId);
    });

    test("session with all-zero token counts has no card or bar in the HTML", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [ALL_ZERO_SESSION] },
        "html-test-zero-all-zero.html"
      );
      expect(html).not.toContain(ALL_ZERO_SESSION.sessionId);
    });

    test("mixed report keeps the real session and drops the zero-token one", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION, EMPTY_MODELS_SESSION] },
        "html-test-zero-mixed.html"
      );
      expect(html).toContain(SAMPLE_SESSION.sessionId);
      expect(html).not.toContain(EMPTY_MODELS_SESSION.sessionId);
      const data = extractPayload(html);
      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0].id).toBe(SAMPLE_SESSION.sessionId);
    });
  });

  describe("timeline bar click highlights the target card persistently", () => {
    test("emits a persistent .session-card--selected CSS rule", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-selected-css.html"
      );
      expect(html).toContain(".session-card--selected");
    });

    test("the bar-click script adds session-card--selected to the target card", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-selected-js.html"
      );
      // The script applies the class on click.
      expect(html).toContain("classList.add('session-card--selected')");
      // And clears it when the user clicks outside the selected card.
      expect(html).toContain("clearSelection");
    });
  });
});
