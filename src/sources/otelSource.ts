/**
 * OtelDataSource — reads the Copilot CLI OTel file export.
 *
 * Parses ~/.copilot/tscope/otel.jsonl, extracts only "chat <model>" span
 * records, groups by gen_ai.conversation.id, and aggregates token counts and
 * cost per session+model. Returns NormalizedSession[] with source:"otel".
 *
 * Design rules:
 *   - NEVER uses metric records (no session scope on metric dataPoints).
 *   - NEVER double-counts invoke_agent spans (uses chat spans only).
 *   - Tolerates corrupt/partial lines (skip on JSON.parse failure).
 *   - No session-end marker in OTel; sessions with token data are "completed".
 *   - Token semantics identical to events.jsonl (inputTokens includes cache
 *     subsets); reuses addTokenCounts() from tokens.ts unchanged.
 */

import * as fs from "fs";
import * as readline from "readline";
import {
  DataSource,
  ExtendedMetrics,
  NormalizedSession,
  SessionDatePredicate,
  TokenCounts,
} from "../types";
import { getOtelExportPath } from "../otel";
import { addTokenCounts, hasTokenData } from "../tokens";
import { utcToLocalDateString } from "../filter";

// ---------------------------------------------------------------------------
// Raw OTel span types (minimally typed — attributes are mostly unknown)
// ---------------------------------------------------------------------------

interface OtelSpanAttributes {
  "gen_ai.conversation.id"?: string;
  "gen_ai.response.model"?: string;
  "gen_ai.request.model"?: string;
  "gen_ai.usage.input_tokens"?: number;
  "gen_ai.usage.output_tokens"?: number;
  "gen_ai.usage.cache_read_input_tokens"?: number;
  "gen_ai.usage.cache_creation_input_tokens"?: number;
  "gen_ai.usage.reasoning_output_tokens"?: number;
  "github.copilot.nano_aiu"?: number;
  [key: string]: unknown;
}

interface OtelSpanEvent {
  name?: string;
  attributes?: {
    "event.github.copilot.current_tokens"?: number;
    "token_limit"?: number;
    [key: string]: unknown;
  };
}

interface OtelSpanRecord {
  type: "span";
  name: string;
  startTime: [number, number];
  endTime?: [number, number];
  attributes?: OtelSpanAttributes;
  events?: OtelSpanEvent[];
}

// ---------------------------------------------------------------------------
// Per-session accumulator (internal)
// ---------------------------------------------------------------------------

interface SessionAccumulator {
  sessionId: string;
  models: Record<string, TokenCounts>;
  modelCosts: Record<string, number>;
  earliestStartTimeMs: number;
  lastContextWindowSample: { used: number; limit: number } | null;
}

/** Convert OTel [unixSeconds, nanoseconds] timestamp to milliseconds. */
function otelTimeToMs(t: [number, number]): number {
  return t[0] * 1000 + Math.floor(t[1] / 1_000_000);
}

/** Convert OTel [unixSeconds, nanoseconds] timestamp to ISO 8601 string. */
function otelTimeToISO(t: [number, number]): string {
  return new Date(otelTimeToMs(t)).toISOString();
}

/** Safe numeric attribute extraction — returns 0 on missing or non-number. */
function numAttr(attrs: OtelSpanAttributes, key: string): number {
  const v = attrs[key];
  return typeof v === "number" ? v : 0;
}

export class OtelDataSource implements DataSource {
  private otelPath: string;

  constructor(otelPath?: string) {
    this.otelPath = otelPath ?? getOtelExportPath();
  }

  async loadSessions(predicate?: SessionDatePredicate): Promise<NormalizedSession[]> {
    if (!fs.existsSync(this.otelPath)) {
      return [];
    }

    const sessionMap = new Map<string, SessionAccumulator>();

    await new Promise<void>((resolve, reject) => {
      let stream: fs.ReadStream;
      try {
        stream = fs.createReadStream(this.otelPath, { encoding: "utf8" });
      } catch (err) {
        reject(err);
        return;
      }

      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let record: unknown;
        try {
          record = JSON.parse(trimmed);
        } catch {
          return; // skip malformed lines silently
        }

        if (
          typeof record !== "object" ||
          record === null ||
          (record as { type?: string }).type !== "span"
        ) {
          return;
        }

        const span = record as OtelSpanRecord;

        // Only process "chat <model>" spans — these are the authoritative per-request
        // token source. invoke_agent spans duplicate their child chat spans; skip them.
        if (typeof span.name !== "string" || !span.name.startsWith("chat ")) return;
        if (!Array.isArray(span.startTime) || span.startTime.length < 2) return;

        const attrs = span.attributes ?? {};
        const conversationId = attrs["gen_ai.conversation.id"];
        if (typeof conversationId !== "string" || !conversationId) return;

        // Get or create accumulator for this session
        let acc = sessionMap.get(conversationId);
        if (!acc) {
          acc = {
            sessionId: conversationId,
            models: {},
            modelCosts: {},
            earliestStartTimeMs: Infinity,
            lastContextWindowSample: null,
          };
          sessionMap.set(conversationId, acc);
        }

        // Track earliest span start time as the session start time
        const spanMs = otelTimeToMs(span.startTime as [number, number]);
        if (spanMs < acc.earliestStartTimeMs) {
          acc.earliestStartTimeMs = spanMs;
        }

        // Model name: prefer response model (set after the call completes) over request model
        const model =
          (typeof attrs["gen_ai.response.model"] === "string" && attrs["gen_ai.response.model"]) ||
          (typeof attrs["gen_ai.request.model"] === "string" && attrs["gen_ai.request.model"]) ||
          "unknown";

        // Accumulate token counts (same semantics as events.jsonl: input includes cache subsets)
        const counts: TokenCounts = {
          inputTokens: numAttr(attrs, "gen_ai.usage.input_tokens"),
          outputTokens: numAttr(attrs, "gen_ai.usage.output_tokens"),
          cacheReadTokens: numAttr(attrs, "gen_ai.usage.cache_read_input_tokens"),
          cacheWriteTokens: numAttr(attrs, "gen_ai.usage.cache_creation_input_tokens"),
          reasoningTokens: numAttr(attrs, "gen_ai.usage.reasoning_output_tokens"),
        };
        acc.models[model] = acc.models[model]
          ? addTokenCounts(acc.models[model], counts)
          : counts;

        // Accumulate server-side cost in credits (nano_aiu ÷ 1e9)
        const nanoAiu = attrs["github.copilot.nano_aiu"];
        if (typeof nanoAiu === "number" && nanoAiu > 0) {
          acc.modelCosts[model] = (acc.modelCosts[model] ?? 0) + nanoAiu / 1e9;
        }

        // Context window utilization from span events (bonus signal).
        // Keep only the most recent sample — earlier samples are stale and
        // retaining all of them wastes memory for large otel.jsonl files.
        if (Array.isArray(span.events)) {
          for (const evt of span.events) {
            const ea = evt.attributes ?? {};
            const used = ea["event.github.copilot.current_tokens"];
            const limit = ea["token_limit"];
            if (typeof used === "number" && typeof limit === "number" && limit > 0) {
              acc.lastContextWindowSample = { used, limit };
            }
          }
        }
      });

      rl.on("close", resolve);
      rl.on("error", reject);
      stream.on("error", reject);
    });

    // Build NormalizedSessions, applying the date predicate and filtering zero-token sessions
    const sessions: NormalizedSession[] = [];

    for (const acc of sessionMap.values()) {
      if (!hasTokenData(acc.models)) continue;
      if (!isFinite(acc.earliestStartTimeMs)) continue;

      const startTimeISO = otelTimeToISO(
        [Math.floor(acc.earliestStartTimeMs / 1000), (acc.earliestStartTimeMs % 1000) * 1_000_000]
      );
      const localDate = utcToLocalDateString(startTimeISO);

      if (predicate && !predicate(localDate, acc.sessionId)) continue;

      // Build extended metrics (v1: reasoning tokens + context window)
      const extended: ExtendedMetrics = {};
      let totalReasoning = 0;
      for (const t of Object.values(acc.models)) {
        totalReasoning += t.reasoningTokens;
      }
      if (totalReasoning > 0) {
        extended.reasoningTokens = totalReasoning;
      }
      if (acc.lastContextWindowSample !== null) {
        const sample = acc.lastContextWindowSample;
        extended.contextWindow = {
          usedTokens: sample.used,
          limitTokens: sample.limit,
          utilizationRatio: sample.used / sample.limit,
        };
      }
      const hasExtended = extended.reasoningTokens !== undefined || extended.contextWindow !== undefined;

      // Total cost across all models
      const totalCost = Object.values(acc.modelCosts).reduce((sum, c) => sum + c, 0);
      const hasCost = Object.keys(acc.modelCosts).length > 0;

      sessions.push({
        sessionId: acc.sessionId,
        // OTel sessions share a single file; eventsPath points to the otel export
        eventsPath: this.otelPath,
        startTime: startTimeISO,
        models: acc.models,
        chronicleTips: [],
        inProgress: false,
        source: "otel",
        modelCosts: hasCost ? { ...acc.modelCosts } : undefined,
        totalCost: hasCost ? totalCost : undefined,
        extended: hasExtended ? extended : undefined,
      });
    }

    return sessions;
  }

  /** OTel has no in-progress concept — always returns empty array. */
  async loadInProgressSessions(): Promise<[]> {
    return [];
  }
}

/**
 * Returns true if the OTel export file exists and is non-empty.
 * Used by the auto source-selection logic in index.ts.
 */
export function isOtelAvailable(otelPath?: string): boolean {
  const filePath = otelPath ?? getOtelExportPath();
  try {
    const stat = fs.statSync(filePath);
    return stat.size > 0;
  } catch {
    return false;
  }
}
