/**
 * Canonical token math for tscope.
 *
 * IMPORTANT semantics of Copilot's `session.shutdown` → `modelMetrics[model].usage`:
 *   `inputTokens` is the GRAND TOTAL of all input and ALREADY INCLUDES
 *   `cacheReadTokens` and `cacheWriteTokens`. They are *subsets* of input, not
 *   separate additive buckets. (Verified against real sessions: the identity
 *   `cacheRead + cacheWrite + freshInput === inputTokens` holds exactly.)
 *
 * Consequences used throughout the renderers:
 *   - True total tokens for a model is `inputTokens + outputTokens` — adding the
 *     cache buckets on top double-counts them.
 *   - Input can be split into a disjoint partition: `freshInput + cacheRead +
 *     cacheWrite`, where `freshInput = inputTokens - cacheRead - cacheWrite`.
 *   - The disjoint segments `[freshInput, cacheRead, cacheWrite, output]` sum to
 *     the total, so they can be drawn as a stacked bar without overcounting.
 */

import { TokenCounts } from "./types";

/**
 * Mismatch (in tokens) between `inputTokens` and `cacheRead + cacheWrite` that is
 * treated as benign rounding noise rather than a schema anomaly.
 */
const ROUNDING_TOLERANCE = 16;

/** Disjoint token segments whose sum equals `total` (= input + output). */
export interface TokenPartition {
  /** inputTokens minus cache read/write (clamped at 0) — genuinely new input */
  freshInput: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  /** inputTokens + outputTokens (the only non-overlapping grand total) */
  total: number;
  /** true if cacheRead + cacheWrite exceeds inputTokens beyond rounding tolerance */
  anomalous: boolean;
}

/** The single correct grand total for a model: input already includes cache. */
export function totalTokens(t: TokenCounts): number {
  return t.inputTokens + t.outputTokens;
}

/** Genuinely new (uncached) input tokens, clamped at 0. */
export function freshInputTokens(t: TokenCounts): number {
  return Math.max(0, t.inputTokens - t.cacheReadTokens - t.cacheWriteTokens);
}

/** Split a model's usage into disjoint segments that sum to the total. */
export function tokenPartition(t: TokenCounts): TokenPartition {
  const rawFresh = t.inputTokens - t.cacheReadTokens - t.cacheWriteTokens;
  return {
    freshInput: Math.max(0, rawFresh),
    cacheRead: t.cacheReadTokens,
    cacheWrite: t.cacheWriteTokens,
    output: t.outputTokens,
    total: t.inputTokens + t.outputTokens,
    anomalous: rawFresh < -ROUNDING_TOLERANCE,
  };
}

/** A zeroed TokenCounts, used as an accumulator seed. */
export function emptyTokenCounts(): TokenCounts {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };
}

/** Add two TokenCounts field-by-field, returning a new object. */
export function addTokenCounts(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  };
}
