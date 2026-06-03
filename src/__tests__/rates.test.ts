import { lookupRate, RATE_TABLE_VERSION, knownModels } from "../rates";

describe("rates", () => {
  test("RATE_TABLE_VERSION is defined and non-empty", () => {
    expect(RATE_TABLE_VERSION).toBeTruthy();
    expect(typeof RATE_TABLE_VERSION).toBe("string");
  });

  test("lookupRate returns undefined for unknown model", () => {
    expect(lookupRate("unknown-model-xyz")).toBeUndefined();
    expect(lookupRate("")).toBeUndefined();
  });

  test("lookupRate returns correct rates for claude-haiku-4.5", () => {
    const rate = lookupRate("claude-haiku-4.5");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(1.0);
    expect(rate!.cacheRead).toBe(0.10);
    expect(rate!.cacheWrite).toBe(1.25);
    expect(rate!.output).toBe(5.0);
  });

  test("lookupRate returns correct rates for claude-sonnet-4.5", () => {
    const rate = lookupRate("claude-sonnet-4.5");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(3.0);
    expect(rate!.output).toBe(15.0);
  });

  test("lookupRate returns correct rates for claude-sonnet-4.6", () => {
    const rate = lookupRate("claude-sonnet-4.6");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(3.0);
  });

  test("lookupRate returns correct rates for claude-opus variants", () => {
    const opusVariants = [
      "claude-opus-4.5", "claude-opus-4.6", "claude-opus-4.6-1m",
      "claude-opus-4.7", "claude-opus-4.8",
    ];
    for (const model of opusVariants) {
      const rate = lookupRate(model);
      expect(rate).toBeDefined();
      expect(rate!.input).toBe(5.0);
      expect(rate!.cacheRead).toBe(0.50);
      expect(rate!.cacheWrite).toBe(6.25);
      expect(rate!.output).toBe(25.0);
    }
  });

  test("lookupRate returns correct rates for GPT models", () => {
    const gpt52 = lookupRate("gpt-5.2");
    expect(gpt52).toBeDefined();
    expect(gpt52!.input).toBe(1.75);

    const gpt54 = lookupRate("gpt-5.4");
    expect(gpt54).toBeDefined();
    expect(gpt54!.input).toBe(2.50);

    const gpt55 = lookupRate("gpt-5.5");
    expect(gpt55).toBeDefined();
    expect(gpt55!.input).toBe(5.0);
  });

  test("lookupRate returns correct rates for gemini", () => {
    const rate = lookupRate("gemini-3.1-pro");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(2.0);
    expect(rate!.output).toBe(12.0);
  });

  test("knownModels returns a non-empty array", () => {
    const models = knownModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });
});
