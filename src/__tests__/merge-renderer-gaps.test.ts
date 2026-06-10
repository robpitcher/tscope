/**
 * Merge renderer gaps — Apoc Phase 4.
 *
 * Covers renderer edge cases from Switch's not-covered list:
 *   1. HTML: coverage.otelCount=0 but source="mixed" → "0 OTel" renders, no crash
 *   2. Text: logsCount=0 in mixed report → "Sources: N OTel, 0 logs", no crash
 *   3. HTML: per-session source badge on a logs card has title mentioning cost
 *   4. JSON: mixed report shape — per-session source + coverage invariants
 *   5. HTML: coverage counts match the post-slice session array (--max simulation)
 *   6. Text: per-session source tags correct in a mixed report
 *
 * None of these duplicate Switch's html-renderer.test.ts, text-renderer.test.ts,
 * or json-renderer.test.ts describe blocks.
 */

import * as fs from "fs";
import * as path from "path";
import { TextRenderer } from "../render/TextRenderer";
import { HtmlRenderer } from "../render/HtmlRenderer";
import { JsonRenderer } from "../render/JsonRenderer";
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

function captureJson(report: Report): ReturnType<typeof JSON.parse> {
  const chunks: string[] = [];
  jest.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  new JsonRenderer().render(report);
  (process.stdout.write as jest.Mock).mockRestore();
  return JSON.parse(chunks.join(""));
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_LOGS_SESSION: NormalizedSession = {
  sessionId: "logs-rg-aaaa-bbbb-cccc-ddddeeee1111",
  eventsPath: "/fake/logs/events.jsonl",
  startTime: "2026-06-10T10:00:00.000Z",
  models: {
    "gpt-4": {
      inputTokens: 500,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    },
  },
  chronicleTips: [],
  inProgress: false,
  source: "logs",
};

const BASE_OTEL_SESSION: NormalizedSession = {
  sessionId: "otel-rg-aaaa-bbbb-cccc-ddddeeee2222",
  eventsPath: "/fake/otel/otel.jsonl",
  startTime: "2026-06-10T11:00:00.000Z",
  models: {
    "gpt-4": {
      inputTokens: 800,
      outputTokens: 300,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    },
  },
  chronicleTips: [],
  inProgress: false,
  source: "otel",
  totalCost: 1.50,
  modelCosts: { "gpt-4": 1.50 },
};

// ---------------------------------------------------------------------------
// 1. HTML: coverage.otelCount === 0 with source === "mixed" (graceful edge case)
// ---------------------------------------------------------------------------

describe("HTML: coverage.otelCount=0 with source='mixed' (edge case — no crash)", () => {
  const ZERO_OTEL_MIXED: Report = {
    sessions: [BASE_LOGS_SESSION],
    inProgressSessions: [],
    reportDate: "2026-06-10",
    filterDescription: "all time",
    source: "mixed",
    costAvailable: false,
    coverage: { otelCount: 0, logsCount: 5, costCoverage: "none" },
  };

  test("renders without throwing when otelCount=0 and source='mixed'", () => {
    expect(() => renderHtml(ZERO_OTEL_MIXED, "rg-html-zero-otel-crash.html")).not.toThrow();
  });

  test("coverage-summary element is present in output", () => {
    const html = renderHtml(ZERO_OTEL_MIXED, "rg-html-zero-otel-summary.html");
    expect(html).toContain("coverage-summary");
  });

  test("shows '0 OTel' in coverage summary (zero is a valid count)", () => {
    const html = renderHtml(ZERO_OTEL_MIXED, "rg-html-zero-otel-count.html");
    expect(html).toContain("0 OTel");
  });

  test("shows correct logsCount (5 logs) in coverage summary", () => {
    const html = renderHtml(ZERO_OTEL_MIXED, "rg-html-zero-otel-logscount.html");
    expect(html).toContain("5 logs");
  });
});

// ---------------------------------------------------------------------------
// 2. Text: logsCount === 0 in mixed report (cosmetically odd but must not crash)
// ---------------------------------------------------------------------------

describe("Text: mixed report where logsCount=0", () => {
  const ZERO_LOGS_MIXED: Report = {
    sessions: [BASE_OTEL_SESSION],
    inProgressSessions: [],
    reportDate: "2026-06-10",
    filterDescription: "all time",
    source: "mixed",
    costAvailable: true,
    coverage: { otelCount: 3, logsCount: 0, costCoverage: "partial" },
  };

  test("renders without throwing when logsCount=0 and source='mixed'", () => {
    expect(() => captureText(ZERO_LOGS_MIXED)).not.toThrow();
  });

  test("footer shows 'Sources: 3 OTel, 0 logs'", () => {
    const out = captureText(ZERO_LOGS_MIXED);
    expect(out).toContain("Sources: 3 OTel, 0 logs");
  });

  test("footer still mentions OTel sessions only for cost when logsCount=0", () => {
    const out = captureText(ZERO_LOGS_MIXED);
    expect(out).toContain("OTel sessions only");
  });
});

// ---------------------------------------------------------------------------
// 3. HTML: per-session source badge tooltip on logs card
// ---------------------------------------------------------------------------

describe("HTML: per-session source badge tooltip on logs card", () => {
  const LOGS_REPORT: Report = {
    sessions: [BASE_LOGS_SESSION],
    inProgressSessions: [],
    reportDate: "2026-06-10",
    filterDescription: "all time",
    source: "logs",
    costAvailable: false,
    coverage: { otelCount: 0, logsCount: 1, costCoverage: "none" },
  };

  test("logs session card: source-badge--logs element has a title attribute", () => {
    const html = renderHtml(LOGS_REPORT, "rg-html-badge-tooltip-title.html");
    const cardIdx = html.indexOf(
      `class="session-card" data-session-id="${BASE_LOGS_SESSION.sessionId}"`
    );
    expect(cardIdx).toBeGreaterThan(-1);
    const cardSlice = html.slice(cardIdx, cardIdx + 1000);
    expect(cardSlice).toMatch(/source-badge--logs[^>]*title=/);
  });

  test("logs session card: badge title attribute mentions cost unavailability", () => {
    const html = renderHtml(LOGS_REPORT, "rg-html-badge-tooltip-cost.html");
    const cardIdx = html.indexOf(
      `class="session-card" data-session-id="${BASE_LOGS_SESSION.sessionId}"`
    );
    const cardSlice = html.slice(cardIdx, cardIdx + 1000);
    // The title text includes "cost data unavailable"
    expect(cardSlice.toLowerCase()).toContain("cost data unavailable");
  });
});

// ---------------------------------------------------------------------------
// 4. JSON: mixed report shape — per-session source + coverage invariants
// ---------------------------------------------------------------------------

describe("JSON: mixed report provenance and coverage shape", () => {
  const MIXED_REPORT: Report = {
    sessions: [BASE_OTEL_SESSION, BASE_LOGS_SESSION],
    inProgressSessions: [],
    reportDate: "2026-06-10",
    filterDescription: "all time",
    source: "mixed",
    costAvailable: true,
    coverage: { otelCount: 1, logsCount: 1, costCoverage: "partial" },
  };

  test("every serialized session has a 'source' field", () => {
    const json = captureJson(MIXED_REPORT);
    for (const s of json.sessions) {
      expect(s).toHaveProperty("source");
      expect(["otel", "logs"]).toContain(s.source);
    }
  });

  test("OTel session serializes with source='otel'", () => {
    const json = captureJson(MIXED_REPORT);
    const entry = json.sessions.find(
      (s: { sessionId: string }) => s.sessionId === BASE_OTEL_SESSION.sessionId
    );
    expect(entry).toBeDefined();
    expect(entry.source).toBe("otel");
  });

  test("logs session serializes with source='logs'", () => {
    const json = captureJson(MIXED_REPORT);
    const entry = json.sessions.find(
      (s: { sessionId: string }) => s.sessionId === BASE_LOGS_SESSION.sessionId
    );
    expect(entry).toBeDefined();
    expect(entry.source).toBe("logs");
  });

  test("top-level coverage object has otelCount, logsCount, costCoverage", () => {
    const json = captureJson(MIXED_REPORT);
    expect(json.coverage).toBeDefined();
    expect(typeof json.coverage.otelCount).toBe("number");
    expect(typeof json.coverage.logsCount).toBe("number");
    expect(["all", "partial", "none"]).toContain(json.coverage.costCoverage);
  });

  test("coverage.otelCount matches actual OTel sessions in sessions[]", () => {
    const json = captureJson(MIXED_REPORT);
    const actualOtelCount = json.sessions.filter(
      (s: { source: string }) => s.source === "otel"
    ).length;
    expect(json.coverage.otelCount).toBe(actualOtelCount);
  });

  test("coverage.logsCount matches actual logs sessions in sessions[]", () => {
    const json = captureJson(MIXED_REPORT);
    const actualLogsCount = json.sessions.filter(
      (s: { source: string }) => s.source === "logs"
    ).length;
    expect(json.coverage.logsCount).toBe(actualLogsCount);
  });

  test("OTel session has totalCost in JSON; logs session does not", () => {
    const json = captureJson(MIXED_REPORT);
    const otelEntry = json.sessions.find(
      (s: { sessionId: string }) => s.sessionId === BASE_OTEL_SESSION.sessionId
    );
    const logsEntry = json.sessions.find(
      (s: { sessionId: string }) => s.sessionId === BASE_LOGS_SESSION.sessionId
    );
    expect(typeof otelEntry.totalCost).toBe("number");
    expect(logsEntry.totalCost).toBeUndefined();
  });

  test("costAvailable is true for mixed report (otelCount > 0)", () => {
    const json = captureJson(MIXED_REPORT);
    expect(json.costAvailable).toBe(true);
    expect(json.coverage.otelCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. HTML: coverage counts match post-slice session array (--max simulation)
// ---------------------------------------------------------------------------

describe("HTML: coverage counts reflect the post---max session set", () => {
  test("sliced to OTel-only: no coverage-summary, shows OpenTelemetry badge", () => {
    // After --max, if only OTel sessions survive, source becomes "otel"
    const slicedOtelOnly: Report = {
      sessions: [BASE_OTEL_SESSION],
      inProgressSessions: [],
      reportDate: "2026-06-10",
      filterDescription: "all time (top 1 most recent session)",
      source: "otel",
      costAvailable: true,
      coverage: { otelCount: 1, logsCount: 0, costCoverage: "all" },
    };
    const html = renderHtml(slicedOtelOnly, "rg-html-sliced-otel.html");
    expect(html).toContain("OpenTelemetry");
    // Pure otel → no coverage-summary element
    const headerArea = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(headerArea).not.toContain("coverage-summary");
  });

  test("sliced mixed set: coverage-summary shows correct OTel and logs counts", () => {
    const secondLogsSession: NormalizedSession = {
      ...BASE_LOGS_SESSION,
      sessionId: "logs-rg-slice-bbbb-cccc-dddd-eeeeffff3333",
    };
    const slicedMixed: Report = {
      sessions: [BASE_OTEL_SESSION, secondLogsSession],
      inProgressSessions: [],
      reportDate: "2026-06-10",
      filterDescription: "all time (top 2 most recent sessions)",
      source: "mixed",
      costAvailable: true,
      coverage: { otelCount: 1, logsCount: 1, costCoverage: "partial" },
    };
    const html = renderHtml(slicedMixed, "rg-html-sliced-mixed.html");
    expect(html).toContain("coverage-summary");
    expect(html).toContain("1 OTel");
    expect(html).toContain("1 logs");
  });
});

// ---------------------------------------------------------------------------
// 6. Text: per-session source tags in a mixed report
// ---------------------------------------------------------------------------

describe("Text: per-session source tags in mixed report", () => {
  const MIXED_REPORT: Report = {
    sessions: [BASE_OTEL_SESSION, BASE_LOGS_SESSION],
    inProgressSessions: [],
    reportDate: "2026-06-10",
    filterDescription: "all time",
    source: "mixed",
    costAvailable: true,
    coverage: { otelCount: 1, logsCount: 1, costCoverage: "partial" },
  };

  test("OTel session block shows 'OTel' source tag", () => {
    const out = captureText(MIXED_REPORT);
    const otelStart = out.indexOf(`SESSION: ${BASE_OTEL_SESSION.sessionId}`);
    expect(otelStart).toBeGreaterThan(-1);
    const blockEnd = out.indexOf("═", otelStart + 40);
    const block = out.slice(otelStart, blockEnd);
    expect(block).toContain("OTel");
  });

  test("logs session block shows 'log parser' source tag", () => {
    const out = captureText(MIXED_REPORT);
    const logsStart = out.indexOf(`SESSION: ${BASE_LOGS_SESSION.sessionId}`);
    expect(logsStart).toBeGreaterThan(-1);
    const blockEnd = out.indexOf("═", logsStart + 40);
    const block = out.slice(logsStart, blockEnd);
    expect(block).toContain("log parser");
  });

  test("both source labels appear somewhere in the output for a mixed report", () => {
    const out = captureText(MIXED_REPORT);
    expect(out).toContain("OTel");
    expect(out).toContain("log parser");
  });

  test("per-session 'Source:' tags come before the 'Sources:' footer line", () => {
    const out = captureText(MIXED_REPORT);
    const firstSourceTag = out.indexOf("Source:");
    const sourcesFooter = out.lastIndexOf("Sources:");
    expect(firstSourceTag).toBeGreaterThan(-1);
    expect(sourcesFooter).toBeGreaterThan(firstSourceTag);
  });
});
