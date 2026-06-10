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
});
