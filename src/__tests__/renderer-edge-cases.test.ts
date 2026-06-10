/**
 * Renderer edge cases — Apoc Phase 4.
 *
 * Covers gaps in Switch's Phase 3 test suite identified in his handoff note:
 *   1. TextRenderer: empty OTel report shows "Source: OpenTelemetry"
 *   2. HtmlRenderer: source badge is in header-meta before session cards
 *   3. HtmlRenderer: credits chip shows totalCost to 2 decimal places
 *   4. HtmlRenderer: context window fill width clamped at 100% max (no >100% bug)
 *   5. HtmlRenderer: "Total Credits" stat = sum of all session.totalCost values
 *
 * Does NOT modify text-renderer.test.ts, html-renderer.test.ts, or
 * json-renderer.test.ts (Switch's committed suites).
 */

import * as fs from "fs";
import * as path from "path";
import { TextRenderer } from "../render/TextRenderer";
import { HtmlRenderer } from "../render/HtmlRenderer";
import { Report, NormalizedSession } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureText(report: Report): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    new TextRenderer().render(report);
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

function renderHtml(report: Report, filename: string): string {
  const outPath = path.join(process.cwd(), filename);
  new HtmlRenderer(outPath).render(report);
  const content = fs.readFileSync(outPath, "utf8");
  fs.unlinkSync(outPath);
  return content;
}

/** Extract the numeric percentage value from a ctx-window-fill width style. */
function extractCtxFillPct(html: string): number {
  const m = html.match(/ctx-window-fill[^>]*style="width:([0-9.]+)%"/);
  if (!m) throw new Error("ctx-window-fill element not found in HTML");
  return parseFloat(m[1]);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OTEL_REPORT_EMPTY: Report = {
  sessions: [],
  inProgressSessions: [],
  reportDate: "2026-06-10",
  filterDescription: "today",
  source: "otel",
  costAvailable: true,
  coverage: { otelCount: 0, logsCount: 0, costCoverage: "none" },
};

const BASE_OTEL_SESSION: NormalizedSession = {
  sessionId: "edge-00000000-1111-2222-3333-444444444444",
  eventsPath: "/home/user/.copilot/tscope/otel.jsonl",
  startTime: "2026-06-10T15:00:00.000Z",
  models: {
    "claude-sonnet-4-5": {
      inputTokens: 2000,
      outputTokens: 800,
      cacheReadTokens: 1200,
      cacheWriteTokens: 200,
      reasoningTokens: 0,
    },
  },
  chronicleTips: [],
  inProgress: false,
  source: "otel",
  totalCost: 2.34,
  modelCosts: { "claude-sonnet-4-5": 2.34 },
};

// ---------------------------------------------------------------------------
// TextRenderer edge cases
// ---------------------------------------------------------------------------

describe("TextRenderer — renderer edge cases", () => {
  test("empty OTel report (no sessions) shows 'Source: OpenTelemetry'", () => {
    const out = captureText(OTEL_REPORT_EMPTY);
    expect(out).toContain("Source: OpenTelemetry");
  });

  test("empty OTel report does not show 'cost data unavailable'", () => {
    const out = captureText(OTEL_REPORT_EMPTY);
    expect(out).not.toContain("cost data unavailable");
  });
});

// ---------------------------------------------------------------------------
// HtmlRenderer edge cases
// ---------------------------------------------------------------------------

describe("HtmlRenderer — renderer edge cases", () => {
  describe("source badge position", () => {
    test("source badge element appears before the first session-card element in document order", () => {
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [BASE_OTEL_SESSION] },
        "rendedge-badge-pos.html"
      );
      // Search for the *element* occurrences (class attribute), not CSS rule names.
      const badgeIdx = html.indexOf('class="source-badge');
      const sessionCardIdx = html.indexOf('class="session-card"');
      expect(badgeIdx).toBeGreaterThan(-1);
      expect(sessionCardIdx).toBeGreaterThan(-1);
      // Badge element must precede the first session-card element.
      expect(badgeIdx).toBeLessThan(sessionCardIdx);
    });

    test("source badge element appears after header-meta and before first session-card element", () => {
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [BASE_OTEL_SESSION] },
        "rendedge-badge-container.html"
      );
      const headerMetaIdx = html.indexOf('class="header-meta"');
      const badgeIdx = html.indexOf('class="source-badge', headerMetaIdx);
      const firstSessionCardIdx = html.indexOf('class="session-card"');
      expect(headerMetaIdx).toBeGreaterThan(-1);
      expect(badgeIdx).toBeGreaterThan(headerMetaIdx);
      expect(badgeIdx).toBeLessThan(firstSessionCardIdx);
    });

    test("OTel badge element is present and no session-card elements exist in empty report", () => {
      const html = renderHtml(OTEL_REPORT_EMPTY, "rendedge-badge-empty.html");
      expect(html).toContain("source-badge--otel");
      // In an empty report there should be no session-card elements (CSS rule exists but no element).
      expect(html).not.toContain('class="session-card"');
    });
  });

  describe("credits chip decimal precision", () => {
    test("totalCost = 1.5 → chip shows '1.50 credits' (toFixed(2) applied)", () => {
      const session: NormalizedSession = { ...BASE_OTEL_SESSION, totalCost: 1.5 };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-chip-1.50.html"
      );
      expect(html).toContain("1.50 credits");
    });

    test("totalCost = 0.1 → chip shows '0.10 credits'", () => {
      const session: NormalizedSession = { ...BASE_OTEL_SESSION, totalCost: 0.1 };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-chip-0.10.html"
      );
      expect(html).toContain("0.10 credits");
    });

    test("totalCost = 10.0 → chip shows '10.00 credits'", () => {
      const session: NormalizedSession = { ...BASE_OTEL_SESSION, totalCost: 10.0 };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-chip-10.00.html"
      );
      expect(html).toContain("10.00 credits");
    });

    test("totalCost = 0.005 → chip shows 2 decimal places", () => {
      const session: NormalizedSession = { ...BASE_OTEL_SESSION, totalCost: 0.005 };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-chip-0.01.html"
      );
      // toFixed(2) of 0.005 → "0.01" (rounding) or "0.00" — either way: 2 dp
      expect(html).toMatch(/\d+\.\d{2} credits/);
    });
  });

  describe("context window fill width clamped at [0, 100%]", () => {
    test("utilizationRatio = 1.0 → fill width is exactly 100%", () => {
      const session: NormalizedSession = {
        ...BASE_OTEL_SESSION,
        extended: {
          contextWindow: { usedTokens: 128000, limitTokens: 128000, utilizationRatio: 1.0 },
        },
      };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-ctx-100.html"
      );
      const pct = extractCtxFillPct(html);
      expect(pct).toBeCloseTo(100);
    });

    test("utilizationRatio > 1.0 is clamped: fill width must not exceed 100%", () => {
      const session: NormalizedSession = {
        ...BASE_OTEL_SESSION,
        extended: {
          contextWindow: {
            usedTokens: 140000,
            limitTokens: 128000,
            utilizationRatio: 1.09375, // 140000 / 128000 ≈ over limit
          },
        },
      };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-ctx-clamp.html"
      );
      const pct = extractCtxFillPct(html);
      // Must be clamped to 100, never exceed it.
      expect(pct).toBeLessThanOrEqual(100);
      expect(pct).toBeCloseTo(100);
    });

    test("utilizationRatio = 0.0 → fill width is 0%", () => {
      const session: NormalizedSession = {
        ...BASE_OTEL_SESSION,
        extended: {
          contextWindow: { usedTokens: 0, limitTokens: 128000, utilizationRatio: 0 },
        },
      };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-ctx-zero.html"
      );
      const pct = extractCtxFillPct(html);
      expect(pct).toBeCloseTo(0);
    });

    test("negative utilizationRatio is clamped to 0% (defensive)", () => {
      const session: NormalizedSession = {
        ...BASE_OTEL_SESSION,
        extended: {
          contextWindow: { usedTokens: 0, limitTokens: 128000, utilizationRatio: -0.1 },
        },
      };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-ctx-neg.html"
      );
      const pct = extractCtxFillPct(html);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeCloseTo(0);
    });
  });

  describe("Total Credits stat card reconciliation", () => {
    test("Total Credits value = single session's totalCost (formatted to 2 dp)", () => {
      const session: NormalizedSession = { ...BASE_OTEL_SESSION, totalCost: 3.75 };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [session] },
        "rendedge-credits-single.html"
      );
      expect(html).toContain("3.75");
    });

    test("Total Credits value = sum of all session totalCosts (3 sessions)", () => {
      const s1: NormalizedSession = {
        ...BASE_OTEL_SESSION, sessionId: "edge-s1",
        totalCost: 1.5, modelCosts: { "claude-sonnet-4-5": 1.5 },
      };
      const s2: NormalizedSession = {
        ...BASE_OTEL_SESSION, sessionId: "edge-s2",
        startTime: "2026-06-10T16:00:00.000Z",
        totalCost: 2.75, modelCosts: { "claude-sonnet-4-5": 2.75 },
      };
      const s3: NormalizedSession = {
        ...BASE_OTEL_SESSION, sessionId: "edge-s3",
        startTime: "2026-06-10T17:00:00.000Z",
        totalCost: 0.25, modelCosts: { "claude-sonnet-4-5": 0.25 },
      };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [s1, s2, s3] },
        "rendedge-credits-sum.html"
      );
      // 1.5 + 2.75 + 0.25 = 4.50
      expect(html).toContain("4.50");
    });

    test("Total Credits stat card is absent for logs reports", () => {
      const logsSession: NormalizedSession = {
        ...BASE_OTEL_SESSION,
        source: "logs",
        totalCost: undefined,
        modelCosts: undefined,
      };
      const logsReport: Report = {
        sessions: [logsSession],
        inProgressSessions: [],
        reportDate: "2026-06-10",
        filterDescription: "today",
        source: "logs",
        costAvailable: false,
        coverage: { otelCount: 0, logsCount: 1, costCoverage: "none" },
      };
      const html = renderHtml(logsReport, "rendedge-credits-no-stat.html");
      expect(html).not.toContain("Total Credits");
    });

    test("two sessions: grandTotal in stat equals s1.totalCost + s2.totalCost", () => {
      const s1: NormalizedSession = {
        ...BASE_OTEL_SESSION, sessionId: "rec-s1",
        totalCost: 1.23, modelCosts: { "claude-sonnet-4-5": 1.23 },
      };
      const s2: NormalizedSession = {
        ...BASE_OTEL_SESSION, sessionId: "rec-s2",
        startTime: "2026-06-10T16:00:00.000Z",
        totalCost: 4.56, modelCosts: { "claude-sonnet-4-5": 4.56 },
      };
      const html = renderHtml(
        { ...OTEL_REPORT_EMPTY, sessions: [s1, s2] },
        "rendedge-credits-recon.html"
      );
      // 1.23 + 4.56 = 5.79
      expect(html).toContain("5.79");
    });
  });
});
