/**
 * Bundled model-rate lookup table.
 *
 * Rates are per-million tokens in USD.
 * Credit formula: credits = (sum of tokens × rates) / 1e6 × 100
 *
 * RATE_TABLE_VERSION: 2026-06-02
 * Source: GitHub Copilot published pricing, June 2026
 */

export interface Rate {
  /** USD per million input tokens */
  input: number;
  /** USD per million cache-read tokens */
  cacheRead: number;
  /** USD per million cache-write tokens (may be 0 if not applicable) */
  cacheWrite: number;
  /** USD per million output tokens */
  output: number;
}

export const RATE_TABLE_VERSION = "2026-06-02";

/**
 * Bundled rate table keyed by exact model name.
 * Add entries here when new models are released.
 */
const RATE_TABLE: Record<string, Rate> = {
  // Claude Haiku
  "claude-haiku-4.5": { input: 1.0, cacheRead: 0.10, cacheWrite: 1.25, output: 5.0 },

  // Claude Sonnet
  "claude-sonnet-4.5": { input: 3.0, cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 },
  "claude-sonnet-4.6": { input: 3.0, cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 },

  // Claude Opus (all variants share the same rate)
  "claude-opus-4.5":    { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.6":    { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.6-1m": { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.7":    { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.7-1m-internal": { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.7-high":  { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.7-xhigh": { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.8":    { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },
  "claude-opus-4.8-1m": { input: 5.0, cacheRead: 0.50, cacheWrite: 6.25, output: 25.0 },

  // GPT models
  "gpt-5.2":       { input: 1.75, cacheRead: 0.175, cacheWrite: 0, output: 14.0 },
  "gpt-5.2-codex": { input: 1.75, cacheRead: 0.175, cacheWrite: 0, output: 14.0 },
  "gpt-5.3-codex": { input: 2.00, cacheRead: 0.200, cacheWrite: 0, output: 14.0 },
  "gpt-5.4":       { input: 2.50, cacheRead: 0.25,  cacheWrite: 0, output: 15.0 },
  "gpt-5.4-mini":  { input: 0.40, cacheRead: 0.10,  cacheWrite: 0, output: 1.60 },
  "gpt-5.5":       { input: 5.00, cacheRead: 0.50,  cacheWrite: 0, output: 30.0 },
  "gpt-5-mini":    { input: 0.40, cacheRead: 0.10,  cacheWrite: 0, output: 1.60 },

  // Gemini models
  "gemini-3.1-pro":         { input: 2.0, cacheRead: 0.20, cacheWrite: 0, output: 12.0 },
  "gemini-3.1-pro-preview": { input: 2.0, cacheRead: 0.20, cacheWrite: 0, output: 12.0 },
  "gemini-3.5-flash":       { input: 0.30, cacheRead: 0.075, cacheWrite: 0, output: 1.50 },

  // MAI models
  "mai-code-1-flash-internal": { input: 1.0, cacheRead: 0.10, cacheWrite: 0, output: 5.0 },
};

/**
 * Look up the rate for a given model name.
 * Returns undefined for unknown models — callers must handle this case (warn + skip credits).
 */
export function lookupRate(model: string): Rate | undefined {
  return RATE_TABLE[model];
}

/** Returns all known model names (for testing / diagnostics) */
export function knownModels(): string[] {
  return Object.keys(RATE_TABLE);
}
