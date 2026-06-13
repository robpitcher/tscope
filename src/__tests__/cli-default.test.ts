import { buildFilterDescription, parseArgs } from "../index";

describe("CLI default filter behavior", () => {
  test("no args defaults to the 20 most recent sessions", () => {
    const args = parseArgs(["node", "tscope"]);

    expect(args.filterMode).toBe("all");
    expect(args.max).toBe("20");
    expect(args.defaultRecent).toBe(true);
    expect(args.maxProvided).toBe(false);
    expect(buildFilterDescription(args)).toBe("last 20 sessions");
  });

  test("explicit --max overrides the implicit default cap", () => {
    const args = parseArgs(["node", "tscope", "--max", "5"]);

    expect(args.filterMode).toBe("all");
    expect(args.max).toBe("5");
    expect(args.maxProvided).toBe(true);
    expect(args.defaultRecent).toBe(false);
    expect(buildFilterDescription(args)).toContain("top 5 most recent");
  });

  test("--all disables the implicit default cap", () => {
    const args = parseArgs(["node", "tscope", "--all"]);

    expect(args.filterMode).toBe("all");
    expect(args.max).toBeUndefined();
    expect(args.defaultRecent).toBe(false);
    expect(buildFilterDescription(args)).toBe("all time");
  });

  test("--all --max caps all sessions", () => {
    const args = parseArgs(["node", "tscope", "--all", "--max", "20"]);

    expect(args.filterMode).toBe("all");
    expect(args.max).toBe("20");
    expect(args.maxProvided).toBe(true);
    expect(args.defaultRecent).toBe(false);
    expect(buildFilterDescription(args)).toBe("all time (top 20 most recent sessions)");
  });

  test("--date applies a date filter without an implicit cap", () => {
    const args = parseArgs(["node", "tscope", "--date", "2026-06-12"]);

    expect(args.filterMode).toBe("date");
    expect(args.filterDate).toBe("2026-06-12");
    expect(args.max).toBeUndefined();
    expect(args.defaultRecent).toBe(false);
  });

  test("--lastdays applies a rolling date filter without an implicit cap", () => {
    const args = parseArgs(["node", "tscope", "--lastdays", "7"]);

    expect(args.filterMode).toBe("lastdays");
    expect(args.filterLastDays).toBe("7");
    expect(args.max).toBeUndefined();
    expect(args.defaultRecent).toBe(false);
  });
});
