import { selectMostRecentSessions, sortSessionsByRecency } from "../filter";

type S = { sessionId: string; startTime: string };

function s(sessionId: string, startTime: string): S {
  return { sessionId, startTime };
}

describe("selectMostRecentSessions", () => {
  test("returns empty array for empty input", () => {
    expect(selectMostRecentSessions([], 5)).toEqual([]);
  });

  test("returns empty array when max is 0", () => {
    expect(selectMostRecentSessions([s("a", "2026-06-01T10:00:00.000Z")], 0)).toEqual([]);
  });

  test("returns empty array when max is negative", () => {
    expect(selectMostRecentSessions([s("a", "2026-06-01T10:00:00.000Z")], -3)).toEqual([]);
  });

  test("returns all sessions sorted desc when fewer than max", () => {
    const input = [
      s("a", "2026-06-01T10:00:00.000Z"),
      s("b", "2026-06-03T10:00:00.000Z"),
      s("c", "2026-06-02T10:00:00.000Z"),
    ];
    expect(selectMostRecentSessions(input, 10).map((x) => x.sessionId)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  test("returns only the N most recent when more than max", () => {
    const input = [
      s("old", "2026-05-01T10:00:00.000Z"),
      s("new", "2026-06-03T10:00:00.000Z"),
      s("mid", "2026-06-01T10:00:00.000Z"),
      s("older", "2026-04-01T10:00:00.000Z"),
    ];
    expect(selectMostRecentSessions(input, 2).map((x) => x.sessionId)).toEqual([
      "new",
      "mid",
    ]);
  });

  test("breaks ties by sessionId ascending for deterministic ordering", () => {
    const t = "2026-06-02T12:00:00.000Z";
    const input = [s("zeta", t), s("alpha", t), s("mu", t)];
    expect(selectMostRecentSessions(input, 3).map((x) => x.sessionId)).toEqual([
      "alpha",
      "mu",
      "zeta",
    ]);
  });

  test("sessions with unparseable startTime sort to the end", () => {
    const input = [
      s("bad", "not-a-date"),
      s("real", "2026-06-01T10:00:00.000Z"),
    ];
    expect(selectMostRecentSessions(input, 2).map((x) => x.sessionId)).toEqual([
      "real",
      "bad",
    ]);
  });

  test("unparseable sessions are excluded when valid ones fill the cap", () => {
    const input = [
      s("bad", "not-a-date"),
      s("a", "2026-06-01T10:00:00.000Z"),
      s("b", "2026-06-02T10:00:00.000Z"),
    ];
    expect(selectMostRecentSessions(input, 2).map((x) => x.sessionId)).toEqual([
      "b",
      "a",
    ]);
  });

  test("does not mutate the input array", () => {
    const input = [
      s("a", "2026-06-01T10:00:00.000Z"),
      s("b", "2026-06-03T10:00:00.000Z"),
    ];
    const snapshot = input.map((x) => x.sessionId);
    selectMostRecentSessions(input, 1);
    expect(input.map((x) => x.sessionId)).toEqual(snapshot);
  });
});

describe("sortSessionsByRecency", () => {
  test("sorts valid timestamps newest-first", () => {
    const input = [
      s("a", "2026-06-01T10:00:00.000Z"),
      s("b", "2026-06-03T10:00:00.000Z"),
      s("c", "2026-06-02T10:00:00.000Z"),
    ];
    expect(sortSessionsByRecency(input).map((x) => x.sessionId)).toEqual(["b", "c", "a"]);
  });

  test("sorts unparseable startTime values to the end", () => {
    const input = [
      s("bad", "not-a-date"),
      s("real", "2026-06-01T10:00:00.000Z"),
    ];
    expect(sortSessionsByRecency(input).map((x) => x.sessionId)).toEqual(["real", "bad"]);
  });

  test("breaks ties by sessionId ascending", () => {
    const t = "2026-06-02T12:00:00.000Z";
    const input = [s("zeta", t), s("alpha", t), s("mu", t)];
    expect(sortSessionsByRecency(input).map((x) => x.sessionId)).toEqual([
      "alpha",
      "mu",
      "zeta",
    ]);
  });

  test("uses locale-independent code-unit ordering for sessionId tie-breaks", () => {
    const t = "2026-06-02T12:00:00.000Z";
    const input = [s("a", t), s("B", t), s("á", t)];
    expect(sortSessionsByRecency(input).map((x) => x.sessionId)).toEqual([
      "B",
      "a",
      "á",
    ]);
  });

  test("returns a new array without mutating input", () => {
    const input = [
      s("a", "2026-06-01T10:00:00.000Z"),
      s("b", "2026-06-03T10:00:00.000Z"),
    ];
    const snapshot = [...input];
    const out = sortSessionsByRecency(input);
    expect(out).not.toBe(input);
    expect(input).toEqual(snapshot);
  });
});
