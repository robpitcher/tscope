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
  NormalizedSession,
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
  source: "logs",
  costAvailable: false,
  coverage: { otelCount: 0, logsCount: 0, costCoverage: "none" },
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
        expect(href).toContain("github.com/robpitcher/tscope");
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
      const evilSession: NormalizedSession = {
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
      const evil: NormalizedSession = {
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
      const session2: NormalizedSession = {
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
      expect(html).toContain('href="https://github.com/robpitcher/tscope"');
      expect(html).toContain("View tscope on GitHub");
      expect(html).toContain("gh-link");
    });

    test("footer invites contributions and links the repo", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-footer-contribute.html");
      expect(html.toLowerCase()).toContain("contribute or report issues");
      expect(html).toContain("https://github.com/robpitcher/tscope");
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
    ): NormalizedSession => ({
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
      source: "otel" | "logs" | null;
      totalCost: number | null;
      models: string[];
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
      expect(done.source).toBe("logs");
      expect(done.totalCost).toBeNull();
      expect(done.models).toEqual(["claude-sonnet-4-5", "claude-haiku-4-5"]);
      // total = input + output (cache is part of input): (1000+500)+(300+100) = 1900
      expect(done.totalTokens).toBe(1900);
      // input column is fresh (uncached) input: (1000-700-100)+(300-0-0) = 200+300 = 500
      expect(done.input).toBe(500);
      expect(done.cacheRead).toBe(700);

      // The in-progress session must not appear anywhere in the payload.
      expect(data.sessions.find((s) => s.inProgress)).toBeUndefined();
      expect(data.sessions.find((s) => s.id === SAMPLE_IN_PROGRESS.sessionId)).toBeUndefined();
    });

    test("renders an Export CSV button in the header with client-side wiring", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-export-csv.html"
      );
      // Button is present, properly typed, and labelled.
      expect(html).toContain('id="export-csv"');
      expect(html).toMatch(/<button[^>]*id="export-csv"[^>]*type="button"/);
      expect(html).toContain("CSV");
      // The .export-btn stylesheet rule is included.
      expect(html).toContain(".export-btn");
      // The inline JS defines the CSV builder, downloader, and the
      // expected column headers (matches the SessionTokenSummary shape).
      expect(html).toContain("function buildCsv");
      expect(html).toContain("URL.createObjectURL(blob);");
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

    test("renders a sort dropdown to the left of the CSV button", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-sort-dropdown.html"
      );
      // Dropdown is present with correct id and accessible label.
      expect(html).toContain('id="sort-sessions"');
      expect(html).toMatch(/<select[^>]*id="sort-sessions"[^>]*aria-label="Sort sessions by"/);
      // All three sort options are present (option text matches spec).
      expect(html).toContain('>Session date<');
      expect(html).toContain('>Token count<');
      expect(html).toContain('>AI credits<');
      expect(html).not.toContain('>AI credits consumed<');
      // Visible "Sort:" label is present.
      expect(html).toMatch(/<label[^>]*for="sort-sessions"[^>]*>Sort:/);
      // The sort dropdown appears BEFORE the CSV button in the markup.
      const sortPos = html.indexOf('id="sort-sessions"');
      const csvPos = html.indexOf('id="export-csv"');
      expect(sortPos).toBeGreaterThan(-1);
      expect(csvPos).toBeGreaterThan(-1);
      expect(sortPos).toBeLessThan(csvPos);
      // CSS rule for the select is included.
      expect(html).toContain(".sort-select");
      // Sort JS is wired: applySort function is present.
      expect(html).toContain("function applySort");
      // Session cards carry sort data-attributes.
      expect(html).toMatch(/class="session-card"[^>]*data-sort-start=/);
      expect(html).toMatch(/data-sort-tokens="\d+"/);
    });

    test("inline <script> body parses as valid JavaScript (regression: no raw LF/CR in string literals)", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-script-parse.html"
      );
      // Extract the executable <script> block (last script before </body>).
      const m = html.match(/<script>([\s\S]+?)<\/script>\s*<\/body>/);
      expect(m).not.toBeNull();
      const scriptBody = m![1];
      // new Function() parses the body as a function body — throws on SyntaxError.
      // Raw LF/CR inside single-quoted string literals would cause a SyntaxError here.
      expect(() => new Function(scriptBody)).not.toThrow();
    });

    test("sort direction toggle button is present and wired", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-sort-dir.html"
      );
      // Direction button is present with correct id and initial aria-label.
      expect(html).toContain('id="sort-direction"');
      expect(html).toMatch(/<button[^>]*id="sort-direction"[^>]*type="button"/);
      expect(html).toContain('aria-label="Sort descending"');
      // Direction button appears AFTER the sort select and BEFORE the CSV button.
      const selectPos = html.indexOf('id="sort-sessions"');
      const dirPos = html.indexOf('id="sort-direction"');
      const csvPos = html.indexOf('id="export-csv"');
      expect(selectPos).toBeLessThan(dirPos);
      expect(dirPos).toBeLessThan(csvPos);
      // JS wiring: direction state variable and toggle logic are present.
      expect(html).toContain("sortDir");
      expect(html).toContain("updateDirBtn");
      // CSS rule for the direction button exists.
      expect(html).toContain(".sort-dir-btn");
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
      const sessionWithDuration: NormalizedSession = {
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
      const evil: NormalizedSession = {
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
    const EMPTY_MODELS_SESSION: NormalizedSession = {
      sessionId: "zero-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      eventsPath: "/home/user/.copilot/session-state/zero/events.jsonl",
      startTime: "2026-06-02T19:00:00.000Z",
      models: {},
      chronicleTips: [],
      inProgress: false,
      source: "logs",
    };

    const ALL_ZERO_SESSION: NormalizedSession = {
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
      source: "logs",
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

  describe("per-session source badge on session cards", () => {
    const OTEL_SESSION: NormalizedSession = {
      ...SAMPLE_SESSION,
      sessionId: "otel-per-card-0000-1111-2222-333344445555",
      source: "otel",
      totalCost: 1.5,
      modelCosts: { "claude-sonnet-4-5": 1.5 },
    };

    test("each OTel session card carries source-badge--otel and 'OTel' label", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", sessions: [OTEL_SESSION] },
        "html-test-per-session-otel-badge.html"
      );
      // Find the article element, not the SVG timeline bar (which also carries data-session-id)
      const cardStart = html.indexOf(`class="session-card" data-session-id="${OTEL_SESSION.sessionId}"`);
      expect(cardStart).toBeGreaterThan(-1);
      const cardChips = html.slice(cardStart, cardStart + 800);
      expect(cardChips).toContain("source-badge--otel");
      expect(cardChips).toContain(">OTel<");
    });

    test("each logs session card carries source-badge--logs and 'log parser' label", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-per-session-logs-badge.html"
      );
      const cardStart = html.indexOf(`class="session-card" data-session-id="${SAMPLE_SESSION.sessionId}"`);
      expect(cardStart).toBeGreaterThan(-1);
      const cardChips = html.slice(cardStart, cardStart + 800);
      expect(cardChips).toContain("source-badge--logs");
      expect(cardChips).toContain("log parser");
    });

    test("in a mixed report, each card shows its own badge independent of report.source", () => {
      const logsSession: NormalizedSession = {
        ...SAMPLE_SESSION,
        sessionId: "logs-per-card-aaaa-bbbb-cccc-ddddeeeeffff",
        source: "logs",
      };
      const mixedReport: Report = {
        ...EMPTY_REPORT,
        source: "mixed",
        costAvailable: true,
        coverage: { otelCount: 1, logsCount: 1, costCoverage: "partial" },
        sessions: [OTEL_SESSION, logsSession],
      };
      const html = renderToString(mixedReport, "html-test-mixed-per-session-badges.html");

      const otelCardIdx = html.indexOf(`class="session-card" data-session-id="${OTEL_SESSION.sessionId}"`);
      const logsCardIdx = html.indexOf(`class="session-card" data-session-id="${logsSession.sessionId}"`);
      expect(otelCardIdx).toBeGreaterThan(-1);
      expect(logsCardIdx).toBeGreaterThan(-1);

      const otelChips = html.slice(otelCardIdx, otelCardIdx + 800);
      expect(otelChips).toContain("source-badge--otel");
      expect(otelChips).not.toContain("source-badge--logs");

      const logsChips = html.slice(logsCardIdx, logsCardIdx + 800);
      expect(logsChips).toContain("source-badge--logs");
      expect(logsChips).not.toContain("source-badge--otel");
    });

    test("per-session badge appears before the tokens chip in the chips row", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-badge-before-tokens.html"
      );
      const cardStart = html.indexOf(`class="session-card" data-session-id="${SAMPLE_SESSION.sessionId}"`);
      const chipsHtml = html.slice(cardStart, cardStart + 800);
      const badgeIdx = chipsHtml.indexOf("source-badge--logs");
      const tokensIdx = chipsHtml.indexOf("chip-tokens");
      expect(badgeIdx).toBeGreaterThan(-1);
      expect(tokensIdx).toBeGreaterThan(-1);
      expect(badgeIdx).toBeLessThan(tokensIdx);
    });
  });

  describe("cost unavailable chip on logs session cards", () => {
    test("logs session card shows chip-cost-unavail chip", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-cost-unavail-chip.html"
      );
      expect(html).toContain("chip-cost-unavail");
      expect(html).toContain("no cost data");
    });

    test("OTel session with totalCost does not show chip-cost-unavail", () => {
      const otelSession: NormalizedSession = {
        ...SAMPLE_SESSION,
        source: "otel",
        totalCost: 2.34,
        modelCosts: { "claude-sonnet-4-5": 2.34 },
      };
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [otelSession] },
        "html-test-no-cost-unavail-otel.html"
      );
      expect(html).not.toMatch(/class="[^"]*chip-cost-unavail/);
    });

    test("chip-cost-unavail CSS class is defined in the style block", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-cost-unavail-css.html");
      expect(html).toContain(".chip-cost-unavail");
    });

    test("in a mixed report, logs card shows cost-unavail and OTel card shows credits chip", () => {
      const otelSession: NormalizedSession = {
        ...SAMPLE_SESSION,
        sessionId: "otel-cost-mix-0000-aaaa-bbbb-ccccddddeeee",
        source: "otel",
        totalCost: 1.5,
        modelCosts: { "claude-sonnet-4-5": 1.5 },
      };
      const logsSession: NormalizedSession = {
        ...SAMPLE_SESSION,
        sessionId: "logs-cost-mix-1111-aaaa-bbbb-ccccddddeeee",
        source: "logs",
      };
      const mixedReport: Report = {
        ...EMPTY_REPORT,
        source: "mixed",
        costAvailable: true,
        coverage: { otelCount: 1, logsCount: 1, costCoverage: "partial" },
        sessions: [otelSession, logsSession],
      };
      const html = renderToString(mixedReport, "html-test-mixed-cost-chips.html");

      const otelCardIdx = html.indexOf(`class="session-card" data-session-id="${otelSession.sessionId}"`);
      const logsCardIdx = html.indexOf(`class="session-card" data-session-id="${logsSession.sessionId}"`);

      const otelChips = html.slice(otelCardIdx, otelCardIdx + 800);
      expect(otelChips).toContain("chip-credits");
      expect(otelChips).not.toContain("chip-cost-unavail");

      const logsChips = html.slice(logsCardIdx, logsCardIdx + 800);
      expect(logsChips).toContain("chip-cost-unavail");
      expect(logsChips).not.toContain("chip-credits");
    });
  });

  describe("Total Credits stat card subtitle in mixed reports", () => {
    const OTEL_SESSION: NormalizedSession = {
      ...SAMPLE_SESSION,
      source: "otel",
      totalCost: 3.14,
      modelCosts: { "claude-sonnet-4-5": 3.14 },
    };

    test("pure OTel report still shows 'AI billing credits' subtitle", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION] },
        "html-test-otel-credits-subtitle.html"
      );
      expect(html).toContain("AI billing credits");
      expect(html).not.toContain("OTel sessions only");
    });

    test("mixed report shows 'OTel sessions only' subtitle on Total Credits card", () => {
      const html = renderToString(
        {
          ...EMPTY_REPORT,
          source: "mixed",
          costAvailable: true,
          coverage: { otelCount: 1, logsCount: 2, costCoverage: "partial" },
          sessions: [OTEL_SESSION],
        },
        "html-test-mixed-credits-subtitle.html"
      );
      expect(html).toContain("OTel sessions only");
      expect(html).not.toContain("AI billing credits");
    });
  });

  describe("cost display (OTel reports)", () => {
    const OTEL_SESSION: NormalizedSession = {
      ...SAMPLE_SESSION,
      source: "otel",
      totalCost: 2.34,
      modelCosts: { "claude-sonnet-4-5": 1.5, "claude-haiku-4-5": 0.84 },
    };

    test("shows credits chip in session card header for OTel session with totalCost", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION] },
        "html-test-credits-chip.html"
      );
      expect(html).toContain("chip-credits");
      expect(html).toContain("2.34 credits");
    });

    test("does not show credits chip for logs sessions", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-no-credits-chip.html"
      );
      // CSS defines .chip-credits, but no element should have that class for logs
      expect(html).not.toMatch(/class="[^"]*chip-credits/);
    });

    test("shows 'Total Credits' stat card in summary strip for OTel report", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION] },
        "html-test-credits-stat-card.html"
      );
      expect(html).toContain("Total Credits");
      expect(html).toContain("AI billing credits");
    });

    test("does not show 'Total Credits' stat card for logs report", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-no-credits-stat.html"
      );
      expect(html).not.toContain("Total Credits");
      expect(html).not.toContain("AI billing credits");
    });

    test("shows Credits by Model section when modelCosts is present", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION] },
        "html-test-credits-by-model.html"
      );
      expect(html).toContain("Credits by Model");
      expect(html).toContain("credits-list");
    });

    test("does not show Credits by Model for logs sessions (no modelCosts)", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-no-credits-by-model.html"
      );
      expect(html).not.toContain("Credits by Model");
    });

    test("chip-credits CSS class is defined in the style block", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-credits-css.html");
      expect(html).toContain(".chip-credits");
    });
  });

  describe("extended metrics — context window utilization bar", () => {
    const OTEL_SESSION_WITH_CTX: NormalizedSession = {
      ...SAMPLE_SESSION,
      source: "otel",
      totalCost: 1.0,
      extended: {
        contextWindow: {
          usedTokens: 12500,
          limitTokens: 128000,
          utilizationRatio: 0.0977,
        },
      },
    };

    test("renders context window bar section when extended.contextWindow is present", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION_WITH_CTX] },
        "html-test-ctx-window-bar.html"
      );
      expect(html).toContain("Context Window");
      expect(html).toContain("ctx-window-wrap");
      expect(html).toContain("ctx-window-fill");
    });

    test("context window label shows used/limit token counts", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION_WITH_CTX] },
        "html-test-ctx-window-label.html"
      );
      expect(html).toContain("ctx-window-label");
      expect(html).toContain("12,500");
      expect(html).toContain("128,000");
      expect(html).toContain("% used");
    });

    test("context window fill width reflects utilization ratio", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION_WITH_CTX] },
        "html-test-ctx-window-width.html"
      );
      // 9.77% utilization
      expect(html).toMatch(/ctx-window-fill[^>]*style="width:9\.\d+%"/);
    });

    test("high-utilization bar (>=80%) uses ctx-window-high class", () => {
      const highCtxSession: NormalizedSession = {
        ...OTEL_SESSION_WITH_CTX,
        extended: {
          contextWindow: {
            usedTokens: 108000,
            limitTokens: 128000,
            utilizationRatio: 0.844,
          },
        },
      };
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [highCtxSession] },
        "html-test-ctx-window-high.html"
      );
      expect(html).toContain("ctx-window-high");
    });

    test("low-utilization bar does not use ctx-window-high class", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, source: "otel", costAvailable: true, sessions: [OTEL_SESSION_WITH_CTX] },
        "html-test-ctx-window-low.html"
      );
      // CSS defines .ctx-window-high, but the element should not carry it at low utilization
      expect(html).not.toMatch(/class="[^"]*ctx-window-high/);
    });

    test("does not render context window section when extended is absent", () => {
      const html = renderToString(
        { ...EMPTY_REPORT, sessions: [SAMPLE_SESSION] },
        "html-test-no-ctx-window.html"
      );
      // "Context Window" heading only appears inside the rendered section element
      expect(html).not.toContain("Context Window");
      // No ctx-window element (CSS class exists but no element with it)
      expect(html).not.toMatch(/class="[^"]*ctx-window-wrap/);
    });

    test("context window CSS classes are defined in the style block", () => {
      const html = renderToString(EMPTY_REPORT, "html-test-ctx-css.html");
      expect(html).toContain(".ctx-window-wrap");
      expect(html).toContain(".ctx-window-fill");
    });
  });
});
