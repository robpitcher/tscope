import { TokenCounts } from "../types";
import {
  totalTokens,
  freshInputTokens,
  tokenPartition,
  emptyTokenCounts,
  addTokenCounts,
  hasTokenData,
} from "../tokens";

/** Build a TokenCounts with sensible zero defaults */
function tc(partial: Partial<TokenCounts>): TokenCounts {
  return { ...emptyTokenCounts(), ...partial };
}

describe("tokens", () => {
  // Real session values: inputTokens already includes cache read + write.
  const real = tc({
    inputTokens: 424135,
    outputTokens: 8365,
    cacheReadTokens: 371888,
    cacheWriteTokens: 51689,
    reasoningTokens: 1547,
  });

  describe("totalTokens", () => {
    test("is input + output (cache is NOT added on top)", () => {
      expect(totalTokens(real)).toBe(424135 + 8365);
    });

    test("zeroed counts total to 0", () => {
      expect(totalTokens(emptyTokenCounts())).toBe(0);
    });
  });

  describe("freshInputTokens", () => {
    test("is input minus cache read and write", () => {
      expect(freshInputTokens(real)).toBe(424135 - 371888 - 51689); // 558
    });

    test("clamps to 0 when cache exceeds input (anomalous schema)", () => {
      const weird = tc({ inputTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 50 });
      expect(freshInputTokens(weird)).toBe(0);
    });
  });

  describe("tokenPartition", () => {
    test("segments sum exactly to the total for normal data", () => {
      const p = tokenPartition(real);
      expect(p.freshInput + p.cacheRead + p.cacheWrite + p.output).toBe(p.total);
      expect(p.total).toBe(totalTokens(real));
      expect(p.anomalous).toBe(false);
    });

    test("flags anomalous when cache exceeds input beyond tolerance", () => {
      const weird = tc({ inputTokens: 100, cacheReadTokens: 5000, cacheWriteTokens: 0, outputTokens: 10 });
      const p = tokenPartition(weird);
      expect(p.freshInput).toBe(0);
      expect(p.anomalous).toBe(true);
      // total remains the canonical input + output
      expect(p.total).toBe(110);
    });

    test("treats tiny rounding mismatch as non-anomalous", () => {
      // inputTokens 4 short of cache sum — rounding noise, not a schema break
      const rounded = tc({ inputTokens: 996, cacheReadTokens: 900, cacheWriteTokens: 100, outputTokens: 5 });
      const p = tokenPartition(rounded);
      expect(p.freshInput).toBe(0);
      expect(p.anomalous).toBe(false);
    });
  });

  describe("addTokenCounts", () => {
    test("adds field-by-field", () => {
      const a = tc({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, reasoningTokens: 5 });
      const b = tc({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, reasoningTokens: 50 });
      expect(addTokenCounts(a, b)).toEqual({
        inputTokens: 11,
        outputTokens: 22,
        cacheReadTokens: 33,
        cacheWriteTokens: 44,
        reasoningTokens: 55,
      });
    });

    test("does not mutate its operands", () => {
      const a = tc({ inputTokens: 1 });
      const b = tc({ inputTokens: 2 });
      addTokenCounts(a, b);
      expect(a.inputTokens).toBe(1);
      expect(b.inputTokens).toBe(2);
    });
  });

  describe("hasTokenData", () => {
    test("returns false for an empty models map", () => {
      expect(hasTokenData({})).toBe(false);
    });

    test("returns false when every model has all-zero token counts", () => {
      expect(
        hasTokenData({
          "claude-opus": emptyTokenCounts(),
          "claude-haiku": emptyTokenCounts(),
        })
      ).toBe(false);
    });

    test("returns true when any model has non-zero input", () => {
      expect(hasTokenData({ "claude-opus": tc({ inputTokens: 1 }) })).toBe(true);
    });

    test("returns true when any model has non-zero output", () => {
      expect(hasTokenData({ "claude-opus": tc({ outputTokens: 1 }) })).toBe(true);
    });

    test("ignores reasoning-only models (not billable)", () => {
      expect(hasTokenData({ "claude-opus": tc({ reasoningTokens: 999 }) })).toBe(false);
    });

    test("returns true if at least one model among many has data", () => {
      expect(
        hasTokenData({
          empty: emptyTokenCounts(),
          real: tc({ inputTokens: 5, outputTokens: 3 }),
        })
      ).toBe(true);
    });
  });
});
