/**
 * Tests for OTel file rotation/pruning (otelRotation.ts).
 *
 * Covers: size parsing, config resolution, file listing, rotation logic,
 * status retrieval, and edge cases (missing files, Windows errors, keep 0, etc.).
 */

import * as fs from "fs";
import * as path from "path";
import {
  parseSize,
  formatBytes,
  resolveRotationConfig,
  listOtelFiles,
  rotateOtelFile,
  getRotationStatus,
  RotationConfig,
} from "../otelRotation";
import { makeTmpDir } from "./helpers/fs";

// ============================================================================
// parseSize Tests
// ============================================================================

describe("parseSize", () => {
  test("parses bare bytes as-is", () => {
    expect(parseSize("0")).toBe(0);
    expect(parseSize("1024")).toBe(1024);
    expect(parseSize("1000000")).toBe(1000000);
  });

  test("parses unit suffixes (case-insensitive)", () => {
    expect(parseSize("1B")).toBe(1);
    expect(parseSize("1b")).toBe(1);
    expect(parseSize("1KB")).toBe(1024);
    expect(parseSize("1kb")).toBe(1024);
    expect(parseSize("1MB")).toBe(1024 * 1024);
    expect(parseSize("1mb")).toBe(1024 * 1024);
    expect(parseSize("1GB")).toBe(1024 * 1024 * 1024);
    expect(parseSize("1gb")).toBe(1024 * 1024 * 1024);
  });

  test("handles decimal values", () => {
    expect(parseSize("1.5MB")).toBe(Math.floor(1.5 * 1024 * 1024));
    expect(parseSize("0.5GB")).toBe(Math.floor(0.5 * 1024 * 1024 * 1024));
  });

  test("handles spaces around the value", () => {
    expect(parseSize("  20MB  ")).toBe(20 * 1024 * 1024);
    expect(parseSize("  1024  ")).toBe(1024);
  });

  test("returns null for invalid input", () => {
    expect(parseSize(undefined)).toBeNull();
    expect(parseSize("")).toBeNull();
    expect(parseSize("   ")).toBeNull();
    expect(parseSize("not-a-number")).toBeNull();
    expect(parseSize("-100MB")).toBeNull();
    expect(parseSize("10XB")).toBeNull();
    expect(parseSize("MB")).toBeNull();
  });
});

// ============================================================================
// formatBytes Tests
// ============================================================================

describe("formatBytes", () => {
  test("formats bytes < 1024 as B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  test("formats in KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(10 * 1024)).toBe("10.0 KB");
  });

  test("formats in MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20.0 MB");
  });

  test("formats in GB", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
});

// ============================================================================
// resolveRotationConfig Tests
// ============================================================================

describe("resolveRotationConfig", () => {
  test("uses hardcoded defaults when no env vars or overrides", () => {
    const config = resolveRotationConfig({});
    expect(config.maxSizeBytes).toBe(20 * 1024 * 1024);
    expect(config.keepArchives).toBe(5);
    expect(config.autoRotate).toBe(true);
  });

  test("env vars override defaults", () => {
    const config = resolveRotationConfig({
      TSCOPE_OTEL_MAX_SIZE: "50MB",
      TSCOPE_OTEL_KEEP: "10",
      TSCOPE_OTEL_AUTOROTATE: "false",
    });
    expect(config.maxSizeBytes).toBe(50 * 1024 * 1024);
    expect(config.keepArchives).toBe(10);
    expect(config.autoRotate).toBe(false);
  });

  test("env vars parse size units", () => {
    expect(resolveRotationConfig({ TSCOPE_OTEL_MAX_SIZE: "1GB" }).maxSizeBytes).toBe(
      1024 * 1024 * 1024
    );
    expect(resolveRotationConfig({ TSCOPE_OTEL_MAX_SIZE: "2048" }).maxSizeBytes).toBe(2048);
  });

  test("ignore invalid env var values (fall back to defaults)", () => {
    const config = resolveRotationConfig({
      TSCOPE_OTEL_MAX_SIZE: "invalid",
      TSCOPE_OTEL_KEEP: "-5",
    });
    expect(config.maxSizeBytes).toBe(20 * 1024 * 1024); // default
    expect(config.keepArchives).toBe(5); // default
  });

  test("TSCOPE_OTEL_AUTOROTATE accepts 0, false (case-insensitive)", () => {
    expect(resolveRotationConfig({ TSCOPE_OTEL_AUTOROTATE: "0" }).autoRotate).toBe(false);
    expect(resolveRotationConfig({ TSCOPE_OTEL_AUTOROTATE: "false" }).autoRotate).toBe(false);
    expect(resolveRotationConfig({ TSCOPE_OTEL_AUTOROTATE: "FALSE" }).autoRotate).toBe(false);
    expect(resolveRotationConfig({ TSCOPE_OTEL_AUTOROTATE: "true" }).autoRotate).toBe(true);
    expect(resolveRotationConfig({ TSCOPE_OTEL_AUTOROTATE: "1" }).autoRotate).toBe(true);
  });

  test("flag overrides win over env vars and defaults", () => {
    const config = resolveRotationConfig(
      {
        TSCOPE_OTEL_MAX_SIZE: "50MB",
        TSCOPE_OTEL_KEEP: "10",
        TSCOPE_OTEL_AUTOROTATE: "true",
      },
      {
        maxSize: "100MB",
        keep: "3",
        autoRotate: false,
      }
    );
    expect(config.maxSizeBytes).toBe(100 * 1024 * 1024);
    expect(config.keepArchives).toBe(3);
    expect(config.autoRotate).toBe(false);
  });
});

// ============================================================================
// listOtelFiles Tests
// ============================================================================

describe("listOtelFiles", () => {
  test("returns only current file if no archives exist", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(otelPath, "test", "utf8");

    const files = listOtelFiles(otelPath);
    expect(files).toEqual([otelPath]);
  });

  test("lists current + archives in order", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");

    fs.writeFileSync(otelPath, "current", "utf8");
    fs.writeFileSync(`${otelPath}.1`, "archive1", "utf8");
    fs.writeFileSync(`${otelPath}.2`, "archive2", "utf8");

    const files = listOtelFiles(otelPath);
    expect(files).toEqual([otelPath, `${otelPath}.1`, `${otelPath}.2`]);
  });

  test("stops at the first missing archive (no gaps)", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");

    fs.writeFileSync(otelPath, "current", "utf8");
    fs.writeFileSync(`${otelPath}.1`, "archive1", "utf8");
    // Skip .2
    fs.writeFileSync(`${otelPath}.3`, "archive3", "utf8");

    const files = listOtelFiles(otelPath);
    expect(files).toEqual([otelPath, `${otelPath}.1`]);
  });

  test("returns empty array if current file doesn't exist", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "nonexistent.jsonl");

    const files = listOtelFiles(otelPath);
    expect(files).toEqual([]);
  });
});

// ============================================================================
// rotateOtelFile Tests
// ============================================================================

describe("rotateOtelFile", () => {
  test("returns missing_file if current file doesn't exist", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "nonexistent.jsonl");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 100, keepArchives: 3, autoRotate: true },
    });

    expect(result.reason).toBe("missing_file");
    expect(result.rotated).toBe(false);
    expect(result.sizeBytes).toBe(0);
  });

  test("returns under_threshold if size < max", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(otelPath, "x".repeat(50), "utf8");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 100, keepArchives: 3, autoRotate: true },
    });

    expect(result.reason).toBe("under_threshold");
    expect(result.rotated).toBe(false);
    expect(result.sizeBytes).toBe(50);
  });

  test("rotates when size >= max (force=false)", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(otelPath, "x".repeat(100), "utf8");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 50, keepArchives: 3, autoRotate: true },
    });

    expect(result.reason).toBe("rotated");
    expect(result.rotated).toBe(true);
    expect(result.archivedTo).toBe(`${otelPath}.1`);
    expect(result.sizeBytes).toBe(100);
    expect(fs.existsSync(otelPath)).toBe(true);
    expect(fs.readFileSync(otelPath, "utf8")).toBe("");
    expect(fs.existsSync(`${otelPath}.1`)).toBe(true);
    expect(fs.readFileSync(`${otelPath}.1`, "utf8")).toBe("x".repeat(100));
  });

  test("rotates when force=true regardless of size", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(otelPath, "small", "utf8");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 1000, keepArchives: 3, autoRotate: true },
      force: true,
    });

    expect(result.reason).toBe("rotated");
    expect(result.rotated).toBe(true);
    expect(result.archivedTo).toBe(`${otelPath}.1`);
  });

  test("returns rotated_dry_run and doesn't modify files when dryRun=true", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    const original = "x".repeat(100);
    fs.writeFileSync(otelPath, original, "utf8");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 50, keepArchives: 3, autoRotate: true },
      dryRun: true,
    });

    expect(result.reason).toBe("rotated_dry_run");
    expect(result.rotated).toBe(true);
    expect(fs.readFileSync(otelPath, "utf8")).toBe(original); // unchanged
    expect(fs.existsSync(`${otelPath}.1`)).toBe(false);
  });

  test("dryRun reports archives that would be pruned", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(otelPath, "current", "utf8");
    fs.writeFileSync(`${otelPath}.1`, "archive1", "utf8");
    fs.writeFileSync(`${otelPath}.2`, "archive2", "utf8");
    fs.writeFileSync(`${otelPath}.3`, "archive3", "utf8");
    fs.writeFileSync(`${otelPath}.4`, "archive4", "utf8");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 1, keepArchives: 2, autoRotate: true },
      dryRun: true,
      force: true,
    });

    expect(result.reason).toBe("rotated_dry_run");
    expect(result.prunedArchives).toEqual([`${otelPath}.3`, `${otelPath}.4`, `${otelPath}.5`]);
    expect(fs.readFileSync(otelPath, "utf8")).toBe("current");
    expect(fs.readFileSync(`${otelPath}.4`, "utf8")).toBe("archive4");

    const underLimitDir = makeTmpDir();
    const underLimitPath = path.join(underLimitDir, "otel.jsonl");
    fs.writeFileSync(underLimitPath, "current", "utf8");
    fs.writeFileSync(`${underLimitPath}.1`, "archive1", "utf8");

    const underLimitResult = rotateOtelFile({
      otelPath: underLimitPath,
      config: { maxSizeBytes: 1, keepArchives: 3, autoRotate: true },
      dryRun: true,
      force: true,
    });

    expect(underLimitResult.reason).toBe("rotated_dry_run");
    expect(underLimitResult.prunedArchives).toEqual([]);
  });

  test("shifts existing archives correctly", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");

    fs.writeFileSync(otelPath, "current", "utf8");
    fs.writeFileSync(`${otelPath}.1`, "archive1", "utf8");
    fs.writeFileSync(`${otelPath}.2`, "archive2", "utf8");

    rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 1, keepArchives: 5, autoRotate: true }, // Force rotation
      force: true,
    });

    expect(fs.readFileSync(`${otelPath}.1`, "utf8")).toBe("current");
    expect(fs.readFileSync(`${otelPath}.2`, "utf8")).toBe("archive1");
    expect(fs.readFileSync(`${otelPath}.3`, "utf8")).toBe("archive2");
    expect(fs.existsSync(`${otelPath}.4`)).toBe(false);
  });

  test("prunes old archives when count exceeds keep", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");

    fs.writeFileSync(otelPath, "current", "utf8");
    fs.writeFileSync(`${otelPath}.1`, "archive1", "utf8");
    fs.writeFileSync(`${otelPath}.2`, "archive2", "utf8");
    fs.writeFileSync(`${otelPath}.3`, "archive3", "utf8");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 1, keepArchives: 2, autoRotate: true }, // Keep only 2
      force: true,
    });

    expect(result.prunedArchives).toContain(`${otelPath}.3`);
    expect(fs.existsSync(`${otelPath}.1`)).toBe(true); // current → .1
    expect(fs.existsSync(`${otelPath}.2`)).toBe(true); // old .1 → .2
    expect(fs.existsSync(`${otelPath}.3`)).toBe(false); // pruned
    expect(fs.existsSync(`${otelPath}.4`)).toBe(false);
  });

  test("handles keep=0 (rotate but don't keep archives)", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");

    fs.writeFileSync(otelPath, "current", "utf8");
    fs.writeFileSync(`${otelPath}.1`, "archive1", "utf8");

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 1, keepArchives: 0, autoRotate: true },
      force: true,
    });

    expect(result.prunedArchives).toContain(`${otelPath}.1`);
    expect(fs.existsSync(`${otelPath}.1`)).toBe(false);
  });

  test("does not shift archives when preflight current-file rename fails", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    const renameCalls: Array<[string, string]> = [];

    const fsImpl = {
      existsSync: (filePath: string) =>
        filePath === otelPath || filePath === `${otelPath}.1` || filePath === `${otelPath}.2`,
      statSync: () => ({ size: 100 }),
      renameSync: (from: string, to: string) => {
        renameCalls.push([from, to]);
        if (from === otelPath) {
          throw new Error("locked");
        }
      },
      writeFileSync: jest.fn(),
      unlinkSync: jest.fn(),
    } as unknown as typeof fs;

    const result = rotateOtelFile({
      otelPath,
      config: { maxSizeBytes: 1, keepArchives: 5, autoRotate: true },
      force: true,
      fsImpl,
    });

    const archiveRenameCalls = renameCalls.filter(
      ([from, to]) => /\.\d+$/.test(from) && /\.\d+$/.test(to)
    );
    expect(result.reason).toBe("error");
    expect(result.rotated).toBe(false);
    expect(renameCalls).toEqual([[otelPath, `${otelPath}.rotating`]]);
    expect(archiveRenameCalls).toEqual([]);
  });
});

// ============================================================================
// getRotationStatus Tests
// ============================================================================

describe("getRotationStatus", () => {
  test("reports sizes and archive info correctly", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");

    fs.writeFileSync(otelPath, "x".repeat(100), "utf8");
    fs.writeFileSync(`${otelPath}.1`, "y".repeat(200), "utf8");
    fs.writeFileSync(`${otelPath}.2`, "z".repeat(50), "utf8");

    const config: RotationConfig = {
      maxSizeBytes: 1024,
      keepArchives: 5,
      autoRotate: true,
    };
    const status = getRotationStatus(otelPath, config);

    expect(status.currentSizeBytes).toBe(100);
    expect(status.archiveCount).toBe(2);
    expect(status.archiveSizes[0].sizeBytes).toBe(200);
    expect(status.archiveSizes[1].sizeBytes).toBe(50);
    expect(status.totalSizeBytes).toBe(350);
  });

  test("reports lastRotatedTime from .1 archive mtime", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");

    fs.writeFileSync(otelPath, "current", "utf8");
    fs.writeFileSync(`${otelPath}.1`, "archive1", "utf8");

    const config: RotationConfig = {
      maxSizeBytes: 100,
      keepArchives: 5,
      autoRotate: true,
    };
    const status = getRotationStatus(otelPath, config);

    expect(status.lastRotatedTime).toBeDefined();
    // Check if it's a valid Date-like object
    if (status.lastRotatedTime) {
      expect(typeof status.lastRotatedTime.getTime).toBe("function");
    }
  });

  test("returns undefined lastRotatedTime when no archives", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(otelPath, "current", "utf8");

    const config: RotationConfig = {
      maxSizeBytes: 100,
      keepArchives: 5,
      autoRotate: true,
    };
    const status = getRotationStatus(otelPath, config);

    expect(status.lastRotatedTime).toBeUndefined();
  });

  test("uses effectiveConfigSources to track origin of config values", () => {
    const tmpDir = makeTmpDir();
    const otelPath = path.join(tmpDir, "otel.jsonl");
    fs.writeFileSync(otelPath, "current", "utf8");

    const config: RotationConfig = {
      maxSizeBytes: 100,
      keepArchives: 5,
      autoRotate: true,
    };
    const sources = { maxSize: "env" as const, keep: "override" as const, autoRotate: "default" as const };
    const status = getRotationStatus(otelPath, config, sources);

    expect(status.effectiveConfigSources).toEqual(sources);
  });
});
