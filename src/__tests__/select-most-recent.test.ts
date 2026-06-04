import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { selectMostRecentRefs } from "../filter";
import { SessionRef } from "../types";

/** Write a minimal events.jsonl with a session.start at the given ISO timestamp */
function writeStart(dir: string, sessionId: string, startTime: string): SessionRef {
  const folder = path.join(dir, sessionId);
  fs.mkdirSync(folder, { recursive: true });
  const eventsPath = path.join(folder, "events.jsonl");
  const event = {
    type: "session.start",
    data: { sessionId, startTime },
    timestamp: startTime,
  };
  fs.writeFileSync(eventsPath, JSON.stringify(event) + "\n", "utf8");
  return { sessionId, eventsPath };
}

/** Write an events.jsonl with no timestamp anywhere — forces mtime fallback */
function writeNoTimestamp(dir: string, sessionId: string): SessionRef {
  const folder = path.join(dir, sessionId);
  fs.mkdirSync(folder, { recursive: true });
  const eventsPath = path.join(folder, "events.jsonl");
  const event = { type: "tool.execution_complete", data: { toolName: "bash" } };
  fs.writeFileSync(eventsPath, JSON.stringify(event) + "\n", "utf8");
  return { sessionId, eventsPath };
}

describe("selectMostRecentRefs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tscope-max-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns empty array for empty input", async () => {
    await expect(selectMostRecentRefs([], 5)).resolves.toEqual([]);
  });

  test("returns empty array when max is 0", async () => {
    const refs = [writeStart(tmpDir, "a", "2026-06-01T12:00:00.000Z")];
    await expect(selectMostRecentRefs(refs, 0)).resolves.toEqual([]);
  });

  test("returns all refs sorted desc when fewer than max", async () => {
    const refs = [
      writeStart(tmpDir, "a", "2026-06-01T10:00:00.000Z"),
      writeStart(tmpDir, "b", "2026-06-03T10:00:00.000Z"),
      writeStart(tmpDir, "c", "2026-06-02T10:00:00.000Z"),
    ];
    const result = await selectMostRecentRefs(refs, 10);
    expect(result.map((r) => r.sessionId)).toEqual(["b", "c", "a"]);
  });

  test("returns only the N most recent when more than max", async () => {
    const refs = [
      writeStart(tmpDir, "old", "2026-05-01T10:00:00.000Z"),
      writeStart(tmpDir, "new", "2026-06-03T10:00:00.000Z"),
      writeStart(tmpDir, "mid", "2026-06-01T10:00:00.000Z"),
      writeStart(tmpDir, "older", "2026-04-01T10:00:00.000Z"),
    ];
    const result = await selectMostRecentRefs(refs, 2);
    expect(result.map((r) => r.sessionId)).toEqual(["new", "mid"]);
  });

  test("breaks ties by sessionId ascending for deterministic ordering", async () => {
    const sameTime = "2026-06-02T12:00:00.000Z";
    const refs = [
      writeStart(tmpDir, "zeta", sameTime),
      writeStart(tmpDir, "alpha", sameTime),
      writeStart(tmpDir, "mu", sameTime),
    ];
    const result = await selectMostRecentRefs(refs, 3);
    expect(result.map((r) => r.sessionId)).toEqual(["alpha", "mu", "zeta"]);
  });

  test("refs with no event timestamp use mtime fallback and still sort correctly", async () => {
    // mtime-fallback ref is created "now", so it should outrank an older event
    const refs = [
      writeStart(tmpDir, "ancient", "2020-01-01T00:00:00.000Z"),
      writeNoTimestamp(tmpDir, "recent-mtime"),
    ];
    const result = await selectMostRecentRefs(refs, 1);
    expect(result.map((r) => r.sessionId)).toEqual(["recent-mtime"]);
  });

  test("refs with no usable timestamp at all sort to the end", async () => {
    // Build a ref whose file does not exist — both event scan and mtime fail
    const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const refs: SessionRef[] = [
        { sessionId: "ghost", eventsPath: path.join(tmpDir, "nope", "events.jsonl") },
        writeStart(tmpDir, "real", "2026-06-01T10:00:00.000Z"),
      ];
      const result = await selectMostRecentRefs(refs, 2);
      expect(result.map((r) => r.sessionId)).toEqual(["real", "ghost"]);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  test("ghost refs are not included when max is smaller than the count of valid refs", async () => {
    const stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const refs: SessionRef[] = [
        { sessionId: "ghost", eventsPath: path.join(tmpDir, "nope", "events.jsonl") },
        writeStart(tmpDir, "a", "2026-06-01T10:00:00.000Z"),
        writeStart(tmpDir, "b", "2026-06-02T10:00:00.000Z"),
      ];
      const result = await selectMostRecentRefs(refs, 2);
      expect(result.map((r) => r.sessionId)).toEqual(["b", "a"]);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
