/**
 * OTel parser edge cases — Apoc Phase 4.
 *
 * Covers gaps NOT in otel-source.test.ts:
 *   - Multi-session interleaved (3+ sessions mixed line-by-line)
 *   - Multiple models per session with per-model cost accumulation
 *   - Reasoning tokens → extended.reasoningTokens
 *   - Context window utilization from span events
 *   - predicate = undefined returns all sessions
 *   - Cost/token reconciliation invariants
 *   - Mixed valid/invalid/metric/invoke_agent content (comprehensive)
 */

import * as fs from "fs";
import * as path from "path";
import { OtelDataSource } from "../sources/otelSource";
import { makeTmpDir, writeLine } from "./helpers/fs";

function chatSpan(
  conversationId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  nanoAiu: number,
  opts: {
    cacheRead?: number;
    cacheWrite?: number;
    reasoningTokens?: number;
    startTimeSec?: number;
    events?: object[];
  } = {}
): object {
  return {
    type: "span",
    name: `chat ${model}`,
    startTime: [opts.startTimeSec ?? 1748908800, 0],
    endTime: [(opts.startTimeSec ?? 1748908800) + 5, 0],
    attributes: {
      "gen_ai.conversation.id": conversationId,
      "gen_ai.response.model": model,
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
      "gen_ai.usage.cache_read_input_tokens": opts.cacheRead ?? 0,
      "gen_ai.usage.cache_creation_input_tokens": opts.cacheWrite ?? 0,
      "gen_ai.usage.reasoning_output_tokens": opts.reasoningTokens ?? 0,
      "github.copilot.nano_aiu": nanoAiu,
    },
    events: opts.events ?? [],
  };
}

function contextWindowEvent(usedTokens: number, limitTokens: number): object {
  return {
    name: "github.copilot.session.usage_info",
    attributes: {
      "github.copilot.current_tokens": usedTokens,
      "github.copilot.token_limit": limitTokens,
    },
  };
}

describe("OtelDataSource — edge cases (Phase 4)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Multi-session interleaving
  // ---------------------------------------------------------------------------

  describe("multi-session interleaved otel.jsonl (3+ sessions)", () => {
    test("correctly separates 3 sessions mixed line-by-line", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      // Round-robin interleaving: A, B, C, A, B, C
      writeLine(p, chatSpan("sessA", "gpt-4", 100, 50, 1_000_000_000, { startTimeSec: 1748908800 }));
      writeLine(p, chatSpan("sessB", "gpt-4", 200, 80, 2_000_000_000, { startTimeSec: 1748908800 }));
      writeLine(p, chatSpan("sessC", "gpt-4", 300, 120, 3_000_000_000, { startTimeSec: 1748908800 }));
      writeLine(p, chatSpan("sessA", "gpt-4", 150, 60, 1_500_000_000, { startTimeSec: 1748908860 }));
      writeLine(p, chatSpan("sessB", "gpt-4", 250, 90, 2_500_000_000, { startTimeSec: 1748908860 }));
      writeLine(p, chatSpan("sessC", "gpt-4", 350, 130, 3_500_000_000, { startTimeSec: 1748908860 }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions).toHaveLength(3);
      const byId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));

      expect(byId["sessA"].models["gpt-4"].inputTokens).toBe(250);   // 100+150
      expect(byId["sessA"].models["gpt-4"].outputTokens).toBe(110);  // 50+60
      expect(byId["sessB"].models["gpt-4"].inputTokens).toBe(450);   // 200+250
      expect(byId["sessB"].models["gpt-4"].outputTokens).toBe(170);  // 80+90
      expect(byId["sessC"].models["gpt-4"].inputTokens).toBe(650);   // 300+350
      expect(byId["sessC"].models["gpt-4"].outputTokens).toBe(250);  // 120+130
    });

    test("session IDs are preserved after 3-round interleaved parsing", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      const ids = ["sess-alpha", "sess-beta", "sess-gamma"];
      for (let round = 0; round < 3; round++) {
        for (const id of ids) {
          writeLine(p, chatSpan(id, "claude-3", 100, 50, 500_000_000, { startTimeSec: 1748908800 + round * 60 }));
        }
      }
      const sessions = await new OtelDataSource(p).loadSessions();
      expect(sessions.map((s) => s.sessionId).sort()).toEqual(ids.slice().sort());
    });

    test("token totals are correct after 4-session interleaving", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      // 4 sessions, each with 2 spans
      for (let span = 0; span < 2; span++) {
        for (let sess = 0; sess < 4; sess++) {
          writeLine(
            p,
            chatSpan(
              `sess-${sess}`,
              "gpt-4",
              (sess + 1) * 100,
              (sess + 1) * 40,
              (sess + 1) * 500_000_000,
              { startTimeSec: 1748908800 + span * 60 + sess }
            )
          );
        }
      }
      const sessions = await new OtelDataSource(p).loadSessions();
      expect(sessions).toHaveLength(4);
      const byId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));
      // sess-2: 3*100 tokens × 2 spans = 600
      expect(byId["sess-2"].models["gpt-4"].inputTokens).toBe(600);
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple models per session
  // ---------------------------------------------------------------------------

  describe("multiple models in one session", () => {
    test("accumulates tokens separately per model", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 400, 2_000_000_000, { startTimeSec: 1748908800 }));
      writeLine(p, chatSpan("sess-1", "claude-opus", 500, 200, 1_000_000_000, { startTimeSec: 1748908860 }));
      writeLine(p, chatSpan("sess-1", "gpt-4", 200, 80, 400_000_000, { startTimeSec: 1748908920 }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions).toHaveLength(1);
      const { models } = sessions[0];
      expect(models["gpt-4"].inputTokens).toBe(1200);     // 1000+200
      expect(models["gpt-4"].outputTokens).toBe(480);     // 400+80
      expect(models["claude-opus"].inputTokens).toBe(500);
      expect(models["claude-opus"].outputTokens).toBe(200);
    });

    test("per-model cost accumulation correct across 3 spans per model", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      // model-A: 1.0 + 1.5 + 0.5 = 3.0 credits
      writeLine(p, chatSpan("sess-1", "model-A", 100, 50, 1_000_000_000));
      writeLine(p, chatSpan("sess-1", "model-A", 200, 100, 1_500_000_000));
      writeLine(p, chatSpan("sess-1", "model-A", 50, 25, 500_000_000));
      // model-B: 0.75 + 0.25 = 1.0 credit
      writeLine(p, chatSpan("sess-1", "model-B", 500, 200, 750_000_000));
      writeLine(p, chatSpan("sess-1", "model-B", 100, 50, 250_000_000));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].modelCosts?.["model-A"]).toBeCloseTo(3.0);
      expect(sessions[0].modelCosts?.["model-B"]).toBeCloseTo(1.0);
    });

    test("three models in one session → totalCost = sum of all modelCosts", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "model-X", 100, 50, 1_000_000_000)); // 1.0
      writeLine(p, chatSpan("sess-1", "model-Y", 200, 100, 2_000_000_000)); // 2.0
      writeLine(p, chatSpan("sess-1", "model-Z", 300, 150, 3_000_000_000)); // 3.0

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions).toHaveLength(1);
      const sess = sessions[0];
      const modelCostSum = Object.values(sess.modelCosts ?? {}).reduce((a, b) => a + b, 0);
      expect(sess.totalCost).toBeCloseTo(6.0);
      expect(sess.totalCost).toBeCloseTo(modelCostSum);
    });
  });

  // ---------------------------------------------------------------------------
  // Reasoning tokens → extended.reasoningTokens
  // ---------------------------------------------------------------------------

  describe("reasoning tokens in extended metrics", () => {
    test("populates extended.reasoningTokens when reasoning tokens are non-zero", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "o1", 2000, 500, 5_000_000_000, { reasoningTokens: 300 }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].extended?.reasoningTokens).toBe(300);
    });

    test("sums reasoning tokens across spans for extended.reasoningTokens", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "o1", 1000, 300, 3_000_000_000, { reasoningTokens: 120 }));
      writeLine(p, chatSpan("sess-1", "o1", 800, 200, 2_000_000_000, { reasoningTokens: 80 }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].extended?.reasoningTokens).toBe(200); // 120+80
    });

    test("extended.reasoningTokens sums across multiple models with reasoning", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "model-A", 500, 200, 1_000_000_000, { reasoningTokens: 50 }));
      writeLine(p, chatSpan("sess-1", "model-B", 300, 100, 800_000_000, { reasoningTokens: 75 }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].extended?.reasoningTokens).toBe(125); // 50+75
    });

    test("extended.reasoningTokens is undefined when all models have zero reasoning", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 400, 2_000_000_000, { reasoningTokens: 0 }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].extended?.reasoningTokens).toBeUndefined();
    });

    test("reasoning tokens are accumulated in model.reasoningTokens correctly", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "o1", 1000, 300, 3_000_000_000, { reasoningTokens: 200 }));
      writeLine(p, chatSpan("sess-1", "o1", 800, 200, 2_000_000_000, { reasoningTokens: 150 }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].models["o1"].reasoningTokens).toBe(350); // 200+150
    });
  });

  // ---------------------------------------------------------------------------
  // Context window utilization from span events
  // ---------------------------------------------------------------------------

  describe("context window utilization", () => {
    test("populates extended.contextWindow from span events", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(
        p,
        chatSpan("sess-1", "claude-3", 8000, 500, 3_000_000_000, {
          events: [contextWindowEvent(8000, 128000)],
        })
      );

      const sessions = await new OtelDataSource(p).loadSessions();

      const cw = sessions[0].extended?.contextWindow;
      expect(cw).toBeDefined();
      expect(cw?.usedTokens).toBe(8000);
      expect(cw?.limitTokens).toBe(128000);
    });

    test("utilizationRatio is a number, computed as usedTokens / limitTokens", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(
        p,
        chatSpan("sess-1", "claude-3", 16000, 500, 3_000_000_000, {
          events: [contextWindowEvent(16000, 128000)],
        })
      );

      const sessions = await new OtelDataSource(p).loadSessions();

      const cw = sessions[0].extended?.contextWindow;
      expect(typeof cw?.utilizationRatio).toBe("number");
      expect(cw?.utilizationRatio).toBeCloseTo(16000 / 128000);
    });

    test("uses the last context window sample when a span has multiple events", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(
        p,
        chatSpan("sess-1", "claude-3", 12500, 500, 3_000_000_000, {
          events: [
            contextWindowEvent(5000, 128000),  // earlier sample
            contextWindowEvent(12500, 128000), // later sample — should win
          ],
        })
      );

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].extended?.contextWindow?.usedTokens).toBe(12500);
    });

    test("ignores span events that are missing github.copilot.token_limit", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(
        p,
        chatSpan("sess-1", "claude-3", 8000, 500, 3_000_000_000, {
          events: [
            {
              name: "some_event",
              attributes: { "github.copilot.current_tokens": 8000 },
              // No "github.copilot.token_limit"
            },
          ],
        })
      );

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].extended?.contextWindow).toBeUndefined();
    });

    test("contextWindow is absent when no span events carry window data", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 400, 2_000_000_000, { events: [] }));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].extended?.contextWindow).toBeUndefined();
    });

    test("context window from later span overwrites earlier span's sample", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      // First span with context window sample
      writeLine(
        p,
        chatSpan("sess-1", "claude-3", 5000, 200, 1_000_000_000, {
          startTimeSec: 1748908800,
          events: [contextWindowEvent(5000, 128000)],
        })
      );
      // Second span with a larger context window sample
      writeLine(
        p,
        chatSpan("sess-1", "claude-3", 8000, 300, 2_000_000_000, {
          startTimeSec: 1748908860,
          events: [contextWindowEvent(13000, 128000)],
        })
      );

      const sessions = await new OtelDataSource(p).loadSessions();

      // The last sample across all spans should be used (13000)
      expect(sessions[0].extended?.contextWindow?.usedTokens).toBe(13000);
    });
  });

  // ---------------------------------------------------------------------------
  // predicate = undefined returns all sessions
  // ---------------------------------------------------------------------------

  describe("predicate = undefined", () => {
    test("returns all sessions when predicate argument is omitted", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-old", "gpt-4", 100, 50, 500_000_000, { startTimeSec: 1748736000 }));
      writeLine(p, chatSpan("sess-new", "gpt-4", 100, 50, 500_000_000, { startTimeSec: 1749470400 }));
      writeLine(p, chatSpan("sess-mid", "gpt-4", 100, 50, 500_000_000, { startTimeSec: 1748908800 }));

      const sessions = await new OtelDataSource(p).loadSessions(/* no predicate */);

      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionId).sort()).toEqual(
        ["sess-mid", "sess-new", "sess-old"]
      );
    });

    test("explicit undefined predicate also returns all sessions", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      for (let i = 0; i < 5; i++) {
        writeLine(
          p,
          chatSpan(`sess-${i}`, "gpt-4", 100, 50, 500_000_000, {
            startTimeSec: 1748736000 + i * 86400,
          })
        );
      }

      const sessions = await new OtelDataSource(p).loadSessions(undefined);

      expect(sessions).toHaveLength(5);
    });

    test("predicate returning false for all excludes all sessions", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "gpt-4", 100, 50, 500_000_000));
      writeLine(p, chatSpan("sess-2", "gpt-4", 200, 80, 1_000_000_000));

      const sessions = await new OtelDataSource(p).loadSessions(() => false);

      expect(sessions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Cost / token reconciliation invariants
  // ---------------------------------------------------------------------------

  describe("reconciliation invariants", () => {
    test("totalCost exactly equals sum of modelCosts values (4 models)", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      const spans = [
        { model: "gpt-4", cost: 1_000_000_000 },
        { model: "claude-opus", cost: 2_500_000_000 },
        { model: "gpt-3.5", cost: 500_000_000 },
        { model: "o1", cost: 3_000_000_000 },
      ];
      for (const { model, cost } of spans) {
        writeLine(p, chatSpan("sess-reconcile", model, 100, 50, cost));
      }

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions).toHaveLength(1);
      const sess = sessions[0];
      const modelCostSum = Object.values(sess.modelCosts ?? {}).reduce((a, b) => a + b, 0);
      // 1.0 + 2.5 + 0.5 + 3.0 = 7.0 credits
      expect(sess.totalCost).toBeCloseTo(7.0);
      expect(sess.totalCost).toBeCloseTo(modelCostSum, 9);
    });

    test("token counts per model match the sum of individual span values", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      const spans = [
        { input: 1000, output: 400, cost: 2_000_000_000 },
        { input: 750, output: 300, cost: 1_500_000_000 },
        { input: 500, output: 200, cost: 1_000_000_000 },
      ];
      const expectedInput = spans.reduce((s, x) => s + x.input, 0);
      const expectedOutput = spans.reduce((s, x) => s + x.output, 0);
      const expectedCost = spans.reduce((s, x) => s + x.cost, 0) / 1e9;

      for (const sp of spans) {
        writeLine(p, chatSpan("sess-recon", "gpt-4", sp.input, sp.output, sp.cost));
      }

      const sessions = await new OtelDataSource(p).loadSessions();
      const model = sessions[0].models["gpt-4"];
      expect(model.inputTokens).toBe(expectedInput);
      expect(model.outputTokens).toBe(expectedOutput);
      expect(sessions[0].modelCosts?.["gpt-4"]).toBeCloseTo(expectedCost);
    });

    test("cacheRead and cacheWrite accumulate correctly per model", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(
        p,
        chatSpan("sess-1", "gpt-4", 1000, 400, 2_000_000_000, { cacheRead: 700, cacheWrite: 100 })
      );
      writeLine(
        p,
        chatSpan("sess-1", "gpt-4", 500, 200, 1_000_000_000, { cacheRead: 300, cacheWrite: 50 })
      );

      const sessions = await new OtelDataSource(p).loadSessions();
      const model = sessions[0].models["gpt-4"];
      expect(model.cacheReadTokens).toBe(1000);  // 700+300
      expect(model.cacheWriteTokens).toBe(150);  // 100+50
    });

    test("OTel source tag is 'otel' regardless of model count", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "model-A", 100, 50, 500_000_000));
      writeLine(p, chatSpan("sess-1", "model-B", 200, 100, 1_000_000_000));
      writeLine(p, chatSpan("sess-1", "model-C", 300, 150, 1_500_000_000));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions[0].source).toBe("otel");
    });

    test("totalCost reconciles across interleaved multi-session file", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      // sessX: 2 spans totalling 3.0 credits; sessY: 2 spans totalling 1.5 credits
      writeLine(p, chatSpan("sessX", "gpt-4", 200, 100, 2_000_000_000));
      writeLine(p, chatSpan("sessY", "claude-3", 100, 50, 1_000_000_000));
      writeLine(p, chatSpan("sessX", "gpt-4", 100, 50, 1_000_000_000));
      writeLine(p, chatSpan("sessY", "claude-3", 50, 25, 500_000_000));

      const sessions = await new OtelDataSource(p).loadSessions();
      const byId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));

      expect(byId["sessX"].totalCost).toBeCloseTo(3.0);
      expect(byId["sessY"].totalCost).toBeCloseTo(1.5);
    });
  });

  // ---------------------------------------------------------------------------
  // Comprehensive resilience to mixed-content files
  // ---------------------------------------------------------------------------

  describe("resilience to mixed valid/invalid/metric/invoke_agent content", () => {
    test("file mixing valid spans, metric records, malformed JSON, and empty lines", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-A", "gpt-4", 500, 200, 1_000_000_000));
      fs.appendFileSync(p, "not-json\n", "utf8");
      writeLine(p, {
        type: "metric",
        name: "gen_ai.client.token.usage",
        unit: "{token}",
        dataPoints: [],
      });
      fs.appendFileSync(p, "\n", "utf8");
      fs.appendFileSync(p, "{incomplete\n", "utf8");
      writeLine(p, chatSpan("sess-A", "gpt-4", 300, 100, 600_000_000));
      fs.appendFileSync(p, "   \n", "utf8");
      writeLine(p, chatSpan("sess-B", "claude-3", 200, 80, 400_000_000));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions).toHaveLength(2);
      const byId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]));
      expect(byId["sess-A"].models["gpt-4"].inputTokens).toBe(800); // 500+300
      expect(byId["sess-B"]).toBeDefined();
    });

    test("invoke_agent spans interleaved with chat spans are never counted", async () => {
      const p = path.join(tmpDir, "otel.jsonl");
      writeLine(p, chatSpan("sess-1", "gpt-4", 1000, 200, 2_000_000_000));
      writeLine(p, {
        type: "span",
        name: "invoke_agent",
        startTime: [1748908800, 0],
        attributes: {
          "gen_ai.conversation.id": "sess-1",
          "gen_ai.response.model": "gpt-4",
          "gen_ai.usage.input_tokens": 9999,
          "gen_ai.usage.output_tokens": 9999,
          "github.copilot.nano_aiu": 99_000_000_000,
        },
        events: [],
      });
      writeLine(p, chatSpan("sess-1", "gpt-4", 500, 100, 1_000_000_000));

      const sessions = await new OtelDataSource(p).loadSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].models["gpt-4"].inputTokens).toBe(1500);  // 1000+500 only
      expect(sessions[0].models["gpt-4"].outputTokens).toBe(300);  // 200+100 only
      expect(sessions[0].totalCost).toBeCloseTo(3.0);              // 2.0+1.0 only
    });
  });
});
