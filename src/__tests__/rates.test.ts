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

  test("lookupRate for all claude-opus-4.7 extended variants", () => {
    const extendedVariants = [
      "claude-opus-4.7-1m-internal",
      "claude-opus-4.7-high",
      "claude-opus-4.7-xhigh",
    ];
    for (const model of extendedVariants) {
      const rate = lookupRate(model);
      expect(rate).toBeDefined();
      expect(rate!.input).toBe(5.0);
      expect(rate!.cacheRead).toBe(0.50);
      expect(rate!.cacheWrite).toBe(6.25);
      expect(rate!.output).toBe(25.0);
    }
  });

  test("lookupRate for claude-opus-4.8-1m", () => {
    const rate = lookupRate("claude-opus-4.8-1m");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(5.0);
    expect(rate!.output).toBe(25.0);
  });

  test("lookupRate for gpt-5.2-codex and gpt-5.3-codex", () => {
    const r52c = lookupRate("gpt-5.2-codex");
    expect(r52c).toBeDefined();
    expect(r52c!.input).toBe(1.75);
    expect(r52c!.output).toBe(14.0);

    const r53c = lookupRate("gpt-5.3-codex");
    expect(r53c).toBeDefined();
    expect(r53c!.input).toBe(2.00);
    expect(r53c!.output).toBe(14.0);
  });

  test("lookupRate for gpt-5.4-mini and gpt-5-mini", () => {
    const mini54 = lookupRate("gpt-5.4-mini");
    expect(mini54).toBeDefined();
    expect(mini54!.input).toBe(0.40);
    expect(mini54!.output).toBe(1.60);

    const mini5 = lookupRate("gpt-5-mini");
    expect(mini5).toBeDefined();
    expect(mini5!.input).toBe(0.40);
  });

  test("lookupRate for mai-code-1-flash-internal", () => {
    const rate = lookupRate("mai-code-1-flash-internal");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(1.0);
    expect(rate!.output).toBe(5.0);
  });

  test("lookupRate for gemini-3.5-flash", () => {
    const rate = lookupRate("gemini-3.5-flash");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(0.30);
    expect(rate!.output).toBe(1.50);
  });

  test("lookupRate for gemini-3.1-pro-preview", () => {
    const rate = lookupRate("gemini-3.1-pro-preview");
    expect(rate).toBeDefined();
    expect(rate!.input).toBe(2.0);
    expect(rate!.output).toBe(12.0);
  });

  test("all known models have positive input and output rates", () => {
    for (const modelName of knownModels()) {
      const rate = lookupRate(modelName);
      expect(rate).toBeDefined();
      expect(rate!.input).toBeGreaterThan(0);
      expect(rate!.output).toBeGreaterThan(0);
    }
  });

  test("all known models have non-negative cache rates", () => {
    for (const modelName of knownModels()) {
      const rate = lookupRate(modelName)!;
      expect(rate.cacheRead).toBeGreaterThanOrEqual(0);
      expect(rate.cacheWrite).toBeGreaterThanOrEqual(0);
    }
  });

  test("lookupRate is case-sensitive: uppercase model name returns undefined", () => {
    expect(lookupRate("Claude-Haiku-4.5")).toBeUndefined();
    expect(lookupRate("CLAUDE-OPUS-4.7")).toBeUndefined();
  });

  test("gpt models have zero cacheWrite rate", () => {
    const gptModels = knownModels().filter((m) => m.startsWith("gpt-"));
    expect(gptModels.length).toBeGreaterThan(0);
    for (const model of gptModels) {
      expect(lookupRate(model)!.cacheWrite).toBe(0);
    }
  });

  test("gemini models have zero cacheWrite rate", () => {
    const geminiModels = knownModels().filter((m) => m.startsWith("gemini-"));
    expect(geminiModels.length).toBeGreaterThan(0);
    for (const model of geminiModels) {
      expect(lookupRate(model)!.cacheWrite).toBe(0);
    }
  });
});
