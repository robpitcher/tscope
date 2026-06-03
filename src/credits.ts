import { TokenCounts, ModelCredits, SessionCredits, ParsedSession } from "./types";
import { lookupRate } from "./rates";

/**
 * Compute estimated AI credits for a single model.
 * Formula: credits = ((input×inputRate) + (cacheRead×cacheReadRate) +
 *                     (cacheWrite×cacheWriteRate) + (output×outputRate)) / 1e6 × 100
 *
 * If the model is not in the rate table, returns undefined for estimatedCredits
 * and sets unknownRate=true. Callers are responsible for emitting warnings.
 */
export function calcModelCredits(
  modelName: string,
  tokens: TokenCounts
): ModelCredits {
  const rate = lookupRate(modelName);

  if (rate === undefined) {
    return {
      modelName,
      tokens,
      estimatedCredits: undefined,
      unknownRate: true,
    };
  }

  const credits =
    ((tokens.inputTokens * rate.input) +
      (tokens.cacheReadTokens * rate.cacheRead) +
      (tokens.cacheWriteTokens * rate.cacheWrite) +
      (tokens.outputTokens * rate.output)) /
    1e6 *
    100;

  return {
    modelName,
    tokens,
    estimatedCredits: credits,
    unknownRate: false,
  };
}

/**
 * Compute credits for all models in a parsed session.
 * Emits a warning to stderr for each unknown model.
 */
export function calcSessionCredits(session: ParsedSession): SessionCredits {
  const modelResults: ModelCredits[] = [];
  let totalCredits = 0;
  let hasUnknownRates = false;

  for (const [modelName, tokens] of Object.entries(session.models)) {
    const result = calcModelCredits(modelName, tokens);
    modelResults.push(result);

    if (result.unknownRate) {
      hasUnknownRates = true;
      process.stderr.write(
        `Warning: unknown model "${modelName}" — tokens shown but credits skipped\n`
      );
    } else if (result.estimatedCredits !== undefined) {
      totalCredits += result.estimatedCredits;
    }
  }

  return {
    models: modelResults,
    totalCredits,
    hasUnknownRates,
  };
}
