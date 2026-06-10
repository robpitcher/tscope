/**
 * Source-selection integration tests — Apoc Phase 4.
 *
 * Spawns the built CLI as a subprocess to test end-to-end source-selection
 * behavior: exit codes, stderr messages, and JSON output source fields.
 *
 * Requires: `npm run build` (dist/index.js must exist).
 * A beforeAll guard builds the project if dist/index.js is absent.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync, execSync } from "child_process";

const DIST_INDEX = path.resolve(__dirname, "..", "..", "dist", "index.js");
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const FALLBACK_NOTICE = "No OpenTelemetry data found — falling back to log-file parsing.";
const FALLBACK_HOW_TO_FIX = "tscope otel enable";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tscope-cli-int-"));
}

/** Write a minimal valid OTel span to otelDir/otel.jsonl. */
function writeValidOtelSpan(otelDir: string): void {
  fs.mkdirSync(otelDir, { recursive: true });
  const span = {
    type: "span",
    name: "chat gpt-4",
    startTime: [1748908800, 0],
    attributes: {
      "gen_ai.conversation.id": "sess-integration-test",
      "gen_ai.response.model": "gpt-4",
      "gen_ai.usage.input_tokens": 100,
      "gen_ai.usage.output_tokens": 50,
      "gen_ai.usage.cache_read_input_tokens": 0,
      "gen_ai.usage.cache_creation_input_tokens": 0,
      "gen_ai.usage.reasoning_output_tokens": 0,
      "github.copilot.nano_aiu": 500_000_000,
    },
    events: [],
  };
  fs.writeFileSync(path.join(otelDir, "otel.jsonl"), JSON.stringify(span) + "\n", "utf8");
}

/**
 * Write a minimal completed events.jsonl log session.
 * The session will have 1 model ("gpt-4") with the given token counts.
 */
function writeLogsSession(
  sessionStateDir: string,
  sessionId: string,
  startTimeISO: string,
  inputTokens = 500,
  outputTokens = 200
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
              inputTokens,
              outputTokens,
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

/**
 * Spawn `node dist/index.js ...args` with HOME/USERPROFILE overridden to fakeHome.
 */
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

describe("source-selection integration (subprocess)", () => {
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

  // ---------------------------------------------------------------------------
  // --source otel
  // ---------------------------------------------------------------------------

  describe("--source otel", () => {
    test("exits non-zero when otel.jsonl is absent", () => {
      const { status } = runCli(["--source", "otel", "--all"], tmpHome);
      expect(status).not.toBe(0);
    });

    test("stderr contains error message and how-to-fix when otel.jsonl is absent", () => {
      const { stderr } = runCli(["--source", "otel", "--all"], tmpHome);
      expect(stderr).toContain("Error:");
      expect(stderr).toContain("otel enable");
    });

    test("exits non-zero when otel.jsonl exists but is empty", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      fs.mkdirSync(otelDir, { recursive: true });
      fs.writeFileSync(path.join(otelDir, "otel.jsonl"), "", "utf8");

      const { status } = runCli(["--source", "otel", "--all"], tmpHome);
      expect(status).not.toBe(0);
    });

    test("stderr contains how-to-fix notice when otel.jsonl is empty", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      fs.mkdirSync(otelDir, { recursive: true });
      fs.writeFileSync(path.join(otelDir, "otel.jsonl"), "", "utf8");

      const { stderr } = runCli(["--source", "otel", "--all"], tmpHome);
      expect(stderr).toContain("otel enable");
    });

    test("exits 0 when otel.jsonl is present and non-empty", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { status } = runCli(["--source", "otel", "--all", "--json"], tmpHome);
      expect(status).toBe(0);
    });

    test("JSON output has source: otel and costAvailable: true", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { stdout } = runCli(["--source", "otel", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("otel");
      expect(report.costAvailable).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // --source logs
  // ---------------------------------------------------------------------------

  describe("--source logs", () => {
    test("exits 0 even when otel.jsonl is present (logs is forced)", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { status } = runCli(["--source", "logs", "--all"], tmpHome);
      expect(status).toBe(0);
    });

    test("JSON output has source: logs even when otel.jsonl is present", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { stdout } = runCli(["--source", "logs", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("logs");
    });

    test("JSON output has costAvailable: false for logs source", () => {
      const { stdout } = runCli(["--source", "logs", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.costAvailable).toBe(false);
    });

    test("does not print fallback notice on stderr when --source logs is explicit", () => {
      const { stderr } = runCli(["--source", "logs", "--all"], tmpHome);
      expect(stderr).not.toContain(FALLBACK_NOTICE);
    });
  });

  // ---------------------------------------------------------------------------
  // --source auto (default)
  // ---------------------------------------------------------------------------

  describe("--source auto (default)", () => {
    test("uses OTel source when otel.jsonl is present — JSON has source: otel", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("otel");
    });

    test("falls back to logs when otel.jsonl is absent — JSON has source: logs", () => {
      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("logs");
    });

    test("prints exact fallback notice on stderr when otel.jsonl is absent", () => {
      const { stderr } = runCli(["--all", "--json"], tmpHome);
      expect(stderr).toContain(FALLBACK_NOTICE);
      expect(stderr).toContain(FALLBACK_HOW_TO_FIX);
    });

    test("fallback notice is printed exactly once per run", () => {
      const { stderr } = runCli(["--all", "--json"], tmpHome);
      const escaped = FALLBACK_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const occurrences = (stderr.match(new RegExp(escaped, "g")) ?? []).length;
      expect(occurrences).toBe(1);
    });

    test("no fallback notice on stderr when OTel is available (auto mode)", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { stderr } = runCli(["--all", "--json"], tmpHome);
      expect(stderr).not.toContain(FALLBACK_NOTICE);
    });

    test("auto + OTel: costAvailable is true", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.costAvailable).toBe(true);
    });

    test("auto + no OTel: costAvailable is false", () => {
      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.costAvailable).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // empty-result OTel hint
  // ---------------------------------------------------------------------------

  describe("empty-result OTel hint", () => {
    // The span written by writeValidOtelSpan has startTime [1748908800, 0]
    // (= 2025-06-03 UTC). A date of 2026-01-01 never matches it.
    const FUTURE_DATE = "2026-01-01";
    const OTEL_HINT = "Hint:";
    const OTEL_HINT_ENABLE = "otel enable";

    test("prints hint when --source otel finds no sessions for the date filter", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);
      const { stderr } = runCli(["--source", "otel", "--date", FUTURE_DATE], tmpHome);
      expect(stderr).toContain(OTEL_HINT);
      expect(stderr).toContain(OTEL_HINT_ENABLE);
    });

    test("hint mentions --all when non-all filter is active", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);
      const { stderr } = runCli(["--source", "otel", "--date", FUTURE_DATE], tmpHome);
      expect(stderr).toContain("--all");
    });

    test("hint does NOT mention --all when --all is already active", () => {
      // With --all there are sessions (span matches), so no hint fires.
      // This test verifies the --all path where OTel has no sessions at all by
      // writing an otel.jsonl that isOtelAvailable() passes but yields 0 sessions.
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      fs.mkdirSync(otelDir, { recursive: true });
      // Write a non-span line so the file is non-empty (passes isOtelAvailable)
      // but produces zero sessions.
      fs.writeFileSync(
        path.join(otelDir, "otel.jsonl"),
        JSON.stringify({ type: "metric", name: "gen_ai.client.token.usage" }) + "\n",
        "utf8"
      );
      const { stderr } = runCli(["--source", "otel", "--all"], tmpHome);
      expect(stderr).toContain(OTEL_HINT);
      expect(stderr).not.toContain("--all"); // --all is already in use; don't suggest it
    });

    test("exits 0 even when OTel finds no sessions (hint is advisory)", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);
      const { status } = runCli(["--source", "otel", "--date", FUTURE_DATE], tmpHome);
      expect(status).toBe(0);
    });

    test("no hint printed when --source logs finds no sessions", () => {
      // logs source should never print the OTel hint
      const { stderr } = runCli(["--source", "logs", "--date", FUTURE_DATE], tmpHome);
      expect(stderr).not.toContain(OTEL_HINT);
    });

    test("auto mode prints hint when OTel is active but no sessions in range", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);
      // auto selects OTel (file is present); specific date has no sessions → hint
      const { stderr } = runCli(["--date", FUTURE_DATE], tmpHome);
      expect(stderr).toContain(OTEL_HINT);
    });
  });

  // ---------------------------------------------------------------------------
  // --source <invalid>
  // ---------------------------------------------------------------------------

  describe("--source <invalid>", () => {
    test("exits non-zero for unknown source value 'bogus'", () => {
      const { status } = runCli(["--source", "bogus"], tmpHome);
      expect(status).not.toBe(0);
    });

    test("stderr contains Error and the invalid value for unknown source", () => {
      const { stderr } = runCli(["--source", "bogus"], tmpHome);
      expect(stderr).toContain("Error:");
      expect(stderr).toContain("bogus");
    });

    test("exits non-zero for empty string source value", () => {
      const { status } = runCli(["--source", ""], tmpHome);
      expect(status).not.toBe(0);
    });

    test("stderr describes valid values when source is invalid", () => {
      const { stderr } = runCli(["--source", "invalid-source"], tmpHome);
      expect(stderr).toContain("auto");
      expect(stderr).toContain("otel");
      expect(stderr).toContain("logs");
    });
  });

  // ---------------------------------------------------------------------------
  // --source auto merge (OTel + logs unified report)
  // ---------------------------------------------------------------------------

  describe("--source auto merge behavior", () => {
    // The OTel span's session ID (from writeValidOtelSpan):
    const OTEL_SESSION_ID = "sess-integration-test";
    // An ISO timestamp that maps to the same local date as the OTel span
    const OTEL_SPAN_ISO = "2025-06-03T00:00:00.000Z";

    test("auto + OTel + distinct logs session → source: mixed", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const sessionStateDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(sessionStateDir, "unique-logs-session", OTEL_SPAN_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("mixed");
      expect(report.costAvailable).toBe(true);
    });

    test("auto + OTel + distinct logs session → coverage counts (1 OTel, 1 logs)", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const sessionStateDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(sessionStateDir, "unique-logs-session", OTEL_SPAN_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.coverage.otelCount).toBe(1);
      expect(report.coverage.logsCount).toBe(1);
      expect(report.coverage.costCoverage).toBe("partial");
    });

    test("auto + OTel + distinct logs → session count is 2 (union, no dedup needed)", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const sessionStateDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(sessionStateDir, "unique-logs-session", OTEL_SPAN_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.summary.sessionCount).toBe(2);
    });

    test("auto + overlap: OTel wins, logs duplicate is dropped → session count is 1", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir); // session ID = OTEL_SESSION_ID

      const sessionStateDir = path.join(tmpHome, ".copilot", "session-state");
      // Same session ID in both sources → OTel wins
      writeLogsSession(sessionStateDir, OTEL_SESSION_ID, OTEL_SPAN_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.sessions).toHaveLength(1);
      expect(report.sessions[0].source).toBe("otel");
    });

    test("auto + overlap: after OTel wins, source is 'otel' (no logs remain)", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const sessionStateDir = path.join(tmpHome, ".copilot", "session-state");
      writeLogsSession(sessionStateDir, OTEL_SESSION_ID, OTEL_SPAN_ISO);

      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("otel");
      expect(report.coverage.otelCount).toBe(1);
      expect(report.coverage.logsCount).toBe(0);
      expect(report.coverage.costCoverage).toBe("all");
    });

    test("auto + no OTel file: source is 'logs', coverage.otelCount is 0", () => {
      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.source).toBe("logs");
      expect(report.coverage.otelCount).toBe(0);
      expect(report.coverage.costCoverage).toBe("none");
    });
  });

  // ---------------------------------------------------------------------------
  // coverage field in JSON output
  // ---------------------------------------------------------------------------

  describe("coverage field in JSON output", () => {
    test("JSON output always includes a coverage object", () => {
      const { stdout } = runCli(["--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.coverage).toBeDefined();
      expect(typeof report.coverage.otelCount).toBe("number");
      expect(typeof report.coverage.logsCount).toBe("number");
      expect(typeof report.coverage.costCoverage).toBe("string");
    });

    test("--source otel: coverage.logsCount is 0 and costCoverage is 'all'", () => {
      const otelDir = path.join(tmpHome, ".copilot", "tscope");
      writeValidOtelSpan(otelDir);

      const { stdout } = runCli(["--source", "otel", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.coverage.logsCount).toBe(0);
      expect(report.coverage.otelCount).toBeGreaterThan(0);
      expect(report.coverage.costCoverage).toBe("all");
    });

    test("--source logs: coverage.otelCount is 0 and costCoverage is 'none'", () => {
      const { stdout } = runCli(["--source", "logs", "--all", "--json"], tmpHome);
      const report = JSON.parse(stdout);
      expect(report.coverage.otelCount).toBe(0);
      expect(report.coverage.costCoverage).toBe("none");
    });
  });
});
