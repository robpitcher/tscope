/**
 * Merge integration tests — Apoc Phase 4.
 *
 * Subprocess-level tests for merge behaviors NOT yet covered by Tank's
 * source-selection.test.ts. Specifically:
 *   1. --max applied after merge: coverage counts reflect the sliced set
 *   2. --source auto with OTel available but no session-state dir (OTel-only path)
 *   3. Empty result when both sources have no sessions for the date filter
 *   4. Single-source modes (--source otel / --source logs) do NOT merge
 *   5. JSON provenance propagation: per-session source + coverage in mixed reports
 *
 * Requires: `npm run build` (dist/index.js must exist).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync, execSync } from "child_process";

const DIST_INDEX = path.resolve(__dirname, "..", "..", "dist", "index.js");
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tscope-merge-int-"));
}

/**
 * Append a minimal OTel span to otelDir/otel.jsonl.
 * startTimeSec is a Unix epoch second; nanoCost is the nano-AIU value.
 */
function writeOtelSpan(
  otelDir: string,
  sessionId: string,
  startTimeSec: number,
  nanoCost: number
): void {
  fs.mkdirSync(otelDir, { recursive: true });
  const span = {
    type: "span",
    name: "chat gpt-4",
    startTime: [startTimeSec, 0],
    attributes: {
      "gen_ai.conversation.id": sessionId,
      "gen_ai.response.model": "gpt-4",
      "gen_ai.usage.input_tokens": 100,
      "gen_ai.usage.output_tokens": 50,
      "gen_ai.usage.cache_read_input_tokens": 0,
      "gen_ai.usage.cache_creation_input_tokens": 0,
      "gen_ai.usage.reasoning_output_tokens": 0,
      "github.copilot.nano_aiu": nanoCost,
    },
    events: [],
  };
  fs.appendFileSync(path.join(otelDir, "otel.jsonl"), JSON.stringify(span) + "\n", "utf8");
}

function writeLogsSession(
  sessionStateDir: string,
  sessionId: string,
  startTimeISO: string
): void {
  const sessionDir = path.join(sessionStateDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session.start",
      data: { sessionId, startTime: startTimeISO },
      timestamp: startTimeISO,
    }),
    JSON.stringify({
      type: "session.shutdown",
      data: {
        modelMetrics: {
          "gpt-4": {
            usage: {
              inputTokens: 500,
              outputTokens: 200,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
            },
          },
        },
        totalApiDurationMs: 1000,
      },
    }),
  ];
  fs.writeFileSync(
    path.join(sessionDir, "events.jsonl"),
    lines.join("\n") + "\n",
    "utf8"
  );
}

function runCli(
  args: string[],
  fakeHome: string
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [DIST_INDEX, ...args], {
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
    encoding: "utf8",
    timeout: 15_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

describe("merge integration (subprocess)", () => {
  beforeAll(() => {
    if (!fs.existsSync(DIST_INDEX)) {
      execSync("npm run build", { cwd: REPO_ROOT, stdio: "pipe" });
    }
  }, 120_000);

  let tmpHome: string;

  beforeEach(() => {
    tmpHome = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  // Unix seconds for 2025-06-03T00:00:00Z (same date as Tank's OTEL_SPAN_ISO)
  const OTEL_DATE_SEC = 1748908800;
  const SHARED_ISO = "2025-06-03T00:00:00.000Z";

  // ---------------------------------------------------------------------------
  // --max applied after merge
  // ---------------------------------------------------------------------------

  describe("--max applied after merge (coverage reflects sliced set)", () => {
    test("--max 1 on 2-session mixed report: exactly 1 session, coverage sums to 1", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-maxtest-a", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-maxtest-a", SHARED_ISO);

      const { stdout } = runCli(["--all", "--max", "1", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.sessions).toHaveLength(1);
      expect(report.coverage.otelCount + report.coverage.logsCount).toBe(1);
    });

    test("--max 2 on 3-session mixed report: coverage sums to 2", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      // Two OTel sessions: otel-maxtest-b1 at T, otel-maxtest-b2 at T+3600
      writeOtelSpan(otelDir, "otel-maxtest-b1", OTEL_DATE_SEC, 500_000_000);
      writeOtelSpan(otelDir, "otel-maxtest-b2", OTEL_DATE_SEC + 3600, 500_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-maxtest-b", SHARED_ISO);

      const { stdout } = runCli(["--all", "--max", "2", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.sessions).toHaveLength(2);
      expect(report.coverage.otelCount + report.coverage.logsCount).toBe(2);
    });

    test("--max on pure OTel report: coverage.logsCount stays 0", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-slice-c1", OTEL_DATE_SEC, 1_000_000_000);
      writeOtelSpan(otelDir, "otel-slice-c2", OTEL_DATE_SEC + 3600, 2_000_000_000);
      writeOtelSpan(otelDir, "otel-slice-c3", OTEL_DATE_SEC + 7200, 3_000_000_000);

      const { stdout } = runCli(["--source", "otel", "--all", "--max", "2", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.sessions).toHaveLength(2);
      expect(report.coverage.logsCount).toBe(0);
      expect(report.coverage.costCoverage).toBe("all");
    });
  });

  // ---------------------------------------------------------------------------
  // --source auto when OTel available but session-state dir is missing
  // ---------------------------------------------------------------------------

  describe("auto mode — OTel available, session-state dir absent", () => {
    test("exits 0 when session-state dir is missing (OTel still loads)", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-nostate-d", OTEL_DATE_SEC, 1_000_000_000);
      // Deliberately do NOT create .copilot/session-state

      const { status } = runCli(["--all", "--json"], tmpHome);
      expect(status).toBe(0);
    });

    test("source is 'otel' when only OTel data is available", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-nostate-e", OTEL_DATE_SEC, 1_000_000_000);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("otel");
    });

    test("coverage.logsCount is 0 and costCoverage is 'all' when no session-state dir", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-nostate-f", OTEL_DATE_SEC, 1_000_000_000);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.coverage.logsCount).toBe(0);
      expect(report.coverage.costCoverage).toBe("all");
    });
  });

  // ---------------------------------------------------------------------------
  // Both sources produce zero sessions after date filter
  // ---------------------------------------------------------------------------

  describe("empty result when both sources yield nothing for the date filter", () => {
    const FAR_FUTURE = "2099-01-01";

    test("exits 0 when both sources are empty for the requested date", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "old-otel-g", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "old-logs-g", SHARED_ISO);

      const { status } = runCli(["--date", FAR_FUTURE, "--json"], tmpHome);
      expect(status).toBe(0);
    });

    test("sessions array is empty when both sources have nothing for the date", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "old-otel-h", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "old-logs-h", SHARED_ISO);

      const { stdout } = runCli(["--date", FAR_FUTURE, "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.sessions).toHaveLength(0);
    });

    test("coverage is all-zero when both sources filtered to empty", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "old-otel-i", OTEL_DATE_SEC, 1_000_000_000);

      const { stdout } = runCli(["--date", FAR_FUTURE, "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.coverage.otelCount).toBe(0);
      expect(report.coverage.logsCount).toBe(0);
      expect(report.coverage.costCoverage).toBe("none");
    });
  });

  // ---------------------------------------------------------------------------
  // Single-source modes do NOT merge
  // ---------------------------------------------------------------------------

  describe("single-source modes: --source otel / --source logs do not merge", () => {
    test("--source otel with logs sessions present: source is 'otel', not 'mixed'", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-single-j", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-ignored-j", SHARED_ISO);

      const { stdout } = runCli(["--source", "otel", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("otel");
      expect(report.source).not.toBe("mixed");
    });

    test("--source logs with OTel present: source is 'logs', not 'mixed'", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-ignored-k", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-single-k", SHARED_ISO);

      const { stdout } = runCli(["--source", "logs", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("logs");
      expect(report.source).not.toBe("mixed");
    });

    test("--source otel: every session in output has source='otel'", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-excl-l", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-dropped-l", SHARED_ISO);

      const { stdout } = runCli(["--source", "otel", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.sessions.every((s: { source: string }) => s.source === "otel")).toBe(true);
    });

    test("--source logs: every session in output has source='logs'", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-dropped-m", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-excl-m", SHARED_ISO);

      const { stdout } = runCli(["--source", "logs", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.sessions.every((s: { source: string }) => s.source === "logs")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // JSON provenance propagation in mixed reports
  // ---------------------------------------------------------------------------

  describe("JSON provenance propagation", () => {
    test("mixed report: every session has a 'source' field ('otel' or 'logs')", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-prov-n", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-prov-n", SHARED_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("mixed");
      for (const s of report.sessions) {
        expect(["otel", "logs"]).toContain(s.source);
      }
    });

    test("mixed report: OTel session has source='otel', logs session has source='logs'", () => {
      const OTEL_ID = "otel-prov-p1";
      const LOGS_ID = "logs-prov-p1";
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, OTEL_ID, OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, LOGS_ID, SHARED_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      const otelEntry = report.sessions.find((s: { sessionId: string }) => s.sessionId === OTEL_ID);
      const logsEntry = report.sessions.find((s: { sessionId: string }) => s.sessionId === LOGS_ID);
      expect(otelEntry).toBeDefined();
      expect(logsEntry).toBeDefined();
      expect(otelEntry.source).toBe("otel");
      expect(logsEntry.source).toBe("logs");
    });

    test("mixed report: coverage object correctly counts 1 OTel + 2 logs", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-cov-q", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-cov-q1", SHARED_ISO);
      writeLogsSession(ssDir, "logs-cov-q2", SHARED_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.coverage.otelCount).toBe(1);
      expect(report.coverage.logsCount).toBe(2);
      expect(report.coverage.costCoverage).toBe("partial");
    });

    test("overlap: exactly one session with that ID, source='otel' (no logs clone)", () => {
      const SHARED_ID = "shared-sess-overlap-r";
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, SHARED_ID, OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, SHARED_ID, SHARED_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      const matching = report.sessions.filter(
        (s: { sessionId: string }) => s.sessionId === SHARED_ID
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].source).toBe("otel");
    });

    test("OTel session has totalCost in JSON; logs session does not", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeOtelSpan(otelDir, "otel-cost-s", OTEL_DATE_SEC, 1_000_000_000);

      const ssDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(ssDir, "logs-cost-s", SHARED_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      const otelEntry = report.sessions.find(
        (s: { sessionId: string }) => s.sessionId === "otel-cost-s"
      );
      const logsEntry = report.sessions.find(
        (s: { sessionId: string }) => s.sessionId === "logs-cost-s"
      );
      expect(otelEntry).toBeDefined();
      expect(logsEntry).toBeDefined();
      expect(typeof otelEntry.totalCost).toBe("number");
      expect(logsEntry.totalCost).toBeUndefined();
    });
  });
});
