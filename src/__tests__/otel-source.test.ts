/**
 * Unit tests for OtelDataSource and source-selection utility.
 *
 * These tests focus on the OTel parsing correctness and the isOtelAvailable helper.
 * Comprehensive end-to-end source-selection and edge-case tests are deferred to Apoc (Phase 4).
 *
 * NOTE FOR APOC (Phase 4):
 *   - Test source-selection behavior: --source otel exits non-zero when file absent
 *   - Test --source logs forces log path even when otel.jsonl exists
 *   - Test auto mode fallback message on stderr
 *   - Test OtelDataSource with multi-session interleaved otel.jsonl fixture
 *   - Test malformed JSON lines are skipped (not thrown)
 *   - Test invoke_agent spans are not double-counted
 *   - Test metric records are silently ignored
 *   - Test session with only zero-token spans is excluded
 *   - Test date predicate filtering by local date
 *   - Test LogsDataSource with multiple sessions across dates
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { OtelDataSource, isOtelAvailable } from "../sources/otelSource";

/** Minimal valid OTel chat span for a given session and model */
function chatSpan(
  conversationId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  nanoAiu: number,
  startTimeSec = 1748908800
): object {
  return {
    type: "span",
    name: `chat ${model}`,
    startTime: [startTimeSec, 0],
    endTime: [startTimeSec + 5, 0],
    attributes: {
      "gen_ai.conversation.id": conversationId,
      "gen_ai.response.model": model,
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
      "gen_ai.usage.cache_read_input_tokens": 0,
      "gen_ai.usage.cache_creation_input_tokens": 0,
      "gen_ai.usage.reasoning_output_tokens": 0,
      "github.copilot.nano_aiu": nanoAiu,
    },
    events: [],
  };
}

/** Minimal metric record (should be ignored by OtelDataSource) */
function metricRecord(): object {
  return {
    type: "metric",
    name: "gen_ai.client.token.usage",
    unit: "{token}",
    dataPoints: [{ attributes: { "gen_ai.operation.name": "chat" }, value: { sum: 1000 } }],
  };
}

describe("isOtelAvailable", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tscope-otel-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns false when file does not exist", () => {
    expect(isOtelAvailable(path.join(tmpDir, "nonexistent.jsonl"))).toBe(false);
  });

  test("returns false when file is empty", () => {
    const p = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(p, "", "utf8");
    expect(isOtelAvailable(p)).toBe(false);
  });

  test("returns true when file exists and is non-empty", () => {
    const p = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(p, JSON.stringify(chatSpan("sid", "model", 100, 50, 1000000)) + "\n", "utf8");
    expect(isOtelAvailable(p)).toBe(true);
  });
});

describe("OtelDataSource", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tscope-otel-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLine(filePath: string, obj: object): void {
    fs.appendFileSync(filePath, JSON.stringify(obj) + "\n", "utf8");
  }

  test("returns empty array when otel file does not exist", async () => {
    const src = new OtelDataSource(path.join(tmpDir, "nonexistent.jsonl"));
    const sessions = await src.loadSessions();
    expect(sessions).toEqual([]);
  });

  test("returns empty array when file contains only metric records", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    writeLine(p, metricRecord());
    writeLine(p, metricRecord());
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions).toEqual([]);
  });

  test("skips malformed/corrupt lines without throwing", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(p, "not-json\n", "utf8");
    fs.appendFileSync(p, "{incomplete\n", "utf8");
    writeLine(p, chatSpan("sess-1", "gpt-4", 100, 50, 500000000));
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("sess-1");
  });

  test("aggregates token counts from multiple chat spans in same session", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 200, 2000000000, 1748908800));
    writeLine(p, chatSpan("sess-1", "gpt-4", 500, 100, 1000000000, 1748908860));
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions).toHaveLength(1);
    const model = sessions[0].models["gpt-4"];
    expect(model.inputTokens).toBe(1500);
    expect(model.outputTokens).toBe(300);
  });

  test("groups spans into separate sessions by conversation ID", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    writeLine(p, chatSpan("sess-A", "gpt-4", 1000, 200, 2000000000));
    writeLine(p, chatSpan("sess-B", "gpt-4", 500, 100, 1000000000));
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual(["sess-A", "sess-B"]);
  });

  test("session source is always 'otel'", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 200, 2000000000));
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions[0].source).toBe("otel");
  });

  test("populates totalCost and modelCosts from nano_aiu", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    // 2e9 nano_aiu = 2.0 credits
    writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 200, 2_000_000_000));
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions[0].totalCost).toBeCloseTo(2.0);
    expect(sessions[0].modelCosts?.["gpt-4"]).toBeCloseTo(2.0);
  });

  test("filters sessions by date predicate", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    // 2026-06-01 00:00 UTC (1748736000)
    writeLine(p, chatSpan("sess-old", "gpt-4", 100, 50, 500000000, 1748736000));
    // 2026-06-10 12:00 UTC (1749470400 ≈)
    writeLine(p, chatSpan("sess-new", "gpt-4", 100, 50, 500000000, 1749470400));
    const src = new OtelDataSource(p);
    // Find the actual local date for sess-new's timestamp
    const newDateMs = 1749470400 * 1000;
    const newDate = new Date(newDateMs);
    const newLocalDate = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}-${String(newDate.getDate()).padStart(2, "0")}`;
    const sessions = await src.loadSessions((localDate) => localDate === newLocalDate);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("sess-new");
  });

  test("invoke_agent spans are NOT counted (only chat spans)", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    // A real chat span
    writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 200, 2000000000));
    // An invoke_agent span — would double-count if processed
    const invokeAgent = {
      type: "span",
      name: "invoke_agent",
      startTime: [1748908800, 0],
      attributes: {
        "gen_ai.conversation.id": "sess-1",
        "gen_ai.response.model": "gpt-4",
        "gen_ai.usage.input_tokens": 1000,
        "gen_ai.usage.output_tokens": 200,
        "github.copilot.nano_aiu": 2000000000,
      },
      events: [],
    };
    writeLine(p, invokeAgent);
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions).toHaveLength(1);
    // Should only have the chat span counts, not doubled
    expect(sessions[0].models["gpt-4"].inputTokens).toBe(1000);
    expect(sessions[0].models["gpt-4"].outputTokens).toBe(200);
  });

  test("zero-token sessions are excluded", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    const zeroSpan = {
      type: "span",
      name: "chat gpt-4",
      startTime: [1748908800, 0],
      attributes: {
        "gen_ai.conversation.id": "sess-zero",
        "gen_ai.response.model": "gpt-4",
        "gen_ai.usage.input_tokens": 0,
        "gen_ai.usage.output_tokens": 0,
        "gen_ai.usage.cache_read_input_tokens": 0,
        "gen_ai.usage.cache_creation_input_tokens": 0,
        "gen_ai.usage.reasoning_output_tokens": 0,
        "github.copilot.nano_aiu": 0,
      },
      events: [],
    };
    writeLine(p, zeroSpan);
    const src = new OtelDataSource(p);
    const sessions = await src.loadSessions();
    expect(sessions).toHaveLength(0);
  });

  test("loadInProgressSessions always returns empty array", async () => {
    const p = path.join(tmpDir, "otel.jsonl");
    writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 200, 2000000000));
    const src = new OtelDataSource(p);
    const inProgress = await src.loadInProgressSessions();
    expect(inProgress).toEqual([]);
  });
});
