import { buildFilterDescription, parseArgs } from "../index";

describe("parseArgs", () => {
  test("parses help/version/json flags", () => {
    const args = parseArgs(["node", "tscope", "--help", "--version", "--json"]);
    expect(args.help).toBe(true);
    expect(args.version).toBe(true);
    expect(args.json).toBe(true);
  });

  test("parses --html without explicit output path", () => {
    const args = parseArgs(["node", "tscope", "--html"]);
    expect(args.html).toBe(true);
    expect(args.htmlOutputPath).toBeUndefined();
  });

  test("parses --html with explicit output path", () => {
    const args = parseArgs(["node", "tscope", "--html", "custom-report.html"]);
    expect(args.html).toBe(true);
    expect(args.htmlOutputPath).toBe("custom-report.html");
  });

  test("does not treat next flag as --html output path", () => {
    const args = parseArgs(["node", "tscope", "--html", "--json"]);
    expect(args.html).toBe(true);
    expect(args.htmlOutputPath).toBeUndefined();
    expect(args.json).toBe(true);
  });

  test("parses --date mode", () => {
    const args = parseArgs(["node", "tscope", "--date", "2026-06-10"]);
    expect(args.filterMode).toBe("date");
    expect(args.filterDate).toBe("2026-06-10");
  });

  test("parses --range mode", () => {
    const args = parseArgs(["node", "tscope", "--range", "2026-06-01", "2026-06-10"]);
    expect(args.filterMode).toBe("range");
    expect(args.filterStart).toBe("2026-06-01");
    expect(args.filterEnd).toBe("2026-06-10");
  });

  test("parses --lastdays mode", () => {
    const args = parseArgs(["node", "tscope", "--lastdays", "14"]);
    expect(args.filterMode).toBe("lastdays");
    expect(args.filterLastDays).toBe("14");
  });

  test("uses --all when provided", () => {
    const args = parseArgs(["node", "tscope", "--all"]);
    expect(args.filterMode).toBe("all");
  });

  test("date-like flags take precedence in date > range > lastdays order", () => {
    const dateWins = parseArgs([
      "node",
      "tscope",
      "--lastdays",
      "7",
      "--range",
      "2026-06-01",
      "2026-06-10",
      "--date",
      "2026-06-05",
    ]);
    expect(dateWins.filterMode).toBe("date");
    expect(dateWins.filterDate).toBe("2026-06-05");

    const rangeWins = parseArgs([
      "node",
      "tscope",
      "--lastdays",
      "7",
      "--range",
      "2026-06-01",
      "2026-06-10",
    ]);
    expect(rangeWins.filterMode).toBe("range");
  });

  test("parses --max when explicit numeric value is present", () => {
    const args = parseArgs(["node", "tscope", "--all", "--max", "8"]);
    expect(args.maxProvided).toBe(true);
    expect(args.max).toBe("8");
  });

  test("keeps max undefined when --max has no value", () => {
    const args = parseArgs(["node", "tscope", "--all", "--max"]);
    expect(args.maxProvided).toBe(true);
    expect(args.max).toBeUndefined();
  });

  test("does not treat next flag as --max value", () => {
    const args = parseArgs(["node", "tscope", "--all", "--max", "--json"]);
    expect(args.maxProvided).toBe(true);
    expect(args.max).toBeUndefined();
  });

  test("parses valid --source values", () => {
    expect(parseArgs(["node", "tscope", "--source", "auto"]).sourceMode).toBe("auto");
    expect(parseArgs(["node", "tscope", "--source", "otel"]).sourceMode).toBe("otel");
    expect(parseArgs(["node", "tscope", "--source", "logs"]).sourceMode).toBe("logs");
  });

  test("retains invalid --source value for downstream validation", () => {
    const args = parseArgs(["node", "tscope", "--source", "invalid"]);
    expect(args.sourceMode).toBe("invalid");
  });

  test("uses implicit max=20 only when no date filter flags and no max flag are provided", () => {
    const defaulted = parseArgs(["node", "tscope"]);
    expect(defaulted.defaultRecent).toBe(true);
    expect(defaulted.max).toBe("20");

    const dateFiltered = parseArgs(["node", "tscope", "--date", "2026-06-10"]);
    expect(dateFiltered.defaultRecent).toBe(false);
    expect(dateFiltered.max).toBeUndefined();
  });
});

describe("buildFilterDescription", () => {
  test("returns expected descriptions for supported filter shapes", () => {
    expect(buildFilterDescription(parseArgs(["node", "tscope"]))).toBe("last 20 sessions");
    expect(buildFilterDescription(parseArgs(["node", "tscope", "--all"]))).toBe("all time");
    expect(buildFilterDescription(parseArgs(["node", "tscope", "--date", "2026-06-10"]))).toBe(
      "2026-06-10"
    );
    expect(
      buildFilterDescription(parseArgs(["node", "tscope", "--range", "2026-06-01", "2026-06-10"]))
    ).toBe("2026-06-01 to 2026-06-10");
    expect(buildFilterDescription(parseArgs(["node", "tscope", "--lastdays", "1"]))).toBe("today");
    expect(buildFilterDescription(parseArgs(["node", "tscope", "--lastdays", "7"]))).toBe(
      "last 7 days"
    );
  });

  test("adds top-N suffix when max is provided", () => {
    expect(buildFilterDescription(parseArgs(["node", "tscope", "--all", "--max", "1"]))).toBe(
      "all time (top 1 most recent session)"
    );
    expect(buildFilterDescription(parseArgs(["node", "tscope", "--all", "--max", "3"]))).toBe(
      "all time (top 3 most recent sessions)"
    );
  });
});
