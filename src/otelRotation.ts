/**
 * tscope otel rotation/pruning — manage unbounded growth of ~/.copilot/tscope/otel.jsonl
 *
 * When the live OTel file exceeds a size threshold, rotate it to a numbered archive
 * (otel.jsonl.1, .2, …, shifting older ones up) and create a fresh empty file. Prune
 * archives beyond a retention count to bound total disk usage.
 *
 * Design:
 * - Size-based (no age-based pruning).
 * - Archive-and-preserve: rotated data is archived for historical reports, not discarded.
 * - Safe with concurrent Copilot CLI writes: rename is atomic on POSIX; Windows file-in-use
 *   errors are caught and reported (no copytruncate).
 * - Configurable via env vars + CLI flag overrides; safe defaults (20 MB / keep 5).
 */

import * as fs from "fs";

/**
 * Parse a human-readable size string: "10MB", "1GB", "1024" (bare bytes),
 * case-insensitive. Returns null for invalid input.
 *
 * @example parseSize("20MB") // 20971520
 * @example parseSize("1024") // 1024
 */
export function parseSize(input: string | undefined): number | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try parsing as bare number (bytes).
  const bareNum = Number(trimmed);
  if (!Number.isNaN(bareNum) && bareNum >= 0 && Number.isInteger(bareNum)) {
    return bareNum;
  }

  // Parse unit suffix (case-insensitive).
  const match = trimmed.match(/^([\d.]+)\s*([a-z]+)$/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (Number.isNaN(value) || value < 0) return null;

  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const multiplier = multipliers[unit];
  if (multiplier === undefined) return null;

  return Math.floor(value * multiplier);
}

/**
 * Format a byte count as a human-readable string.
 * @example formatBytes(20971520) // "20.0 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * Configuration for OTel file rotation: size threshold, archive retention,
 * and whether auto-rotation is enabled.
 */
export interface RotationConfig {
  maxSizeBytes: number;
  keepArchives: number;
  autoRotate: boolean;
}

/**
 * Resolve rotation config from defaults, environment variables, and explicit
 * flag overrides. Precedence: defaults → env vars → flag overrides.
 *
 * Environment variables:
 *   - TSCOPE_OTEL_MAX_SIZE (e.g. "20MB", "20971520")
 *   - TSCOPE_OTEL_KEEP (positive integer, archive count to retain)
 *   - TSCOPE_OTEL_AUTOROTATE ("0"/"false" disables; anything else enables)
 *
 * @param env Environment variables (injected for testing).
 * @param overrides Explicit flag values to override env/defaults.
 */
export function resolveRotationConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: { maxSize?: string; keep?: string; autoRotate?: boolean }
): RotationConfig {
  // Defaults
  let maxSizeBytes = 20 * 1024 * 1024; // 20 MB
  let keepArchives = 5;
  let autoRotate = true;

  // Environment variables override defaults
  if (env.TSCOPE_OTEL_MAX_SIZE) {
    const parsed = parseSize(env.TSCOPE_OTEL_MAX_SIZE);
    if (parsed !== null) {
      maxSizeBytes = parsed;
    }
  }
  if (env.TSCOPE_OTEL_KEEP) {
    const keep = Number(env.TSCOPE_OTEL_KEEP);
    if (!Number.isNaN(keep) && keep >= 0 && Number.isInteger(keep)) {
      keepArchives = keep;
    }
  }
  if (env.TSCOPE_OTEL_AUTOROTATE) {
    const val = env.TSCOPE_OTEL_AUTOROTATE.toLowerCase();
    if (val === "0" || val === "false") {
      autoRotate = false;
    }
  }

  // Flag overrides win
  if (overrides) {
    if (overrides.maxSize) {
      const parsed = parseSize(overrides.maxSize);
      if (parsed !== null) {
        maxSizeBytes = parsed;
      }
    }
    if (overrides.keep !== undefined) {
      const keep = Number(overrides.keep);
      if (!Number.isNaN(keep) && keep >= 0 && Number.isInteger(keep)) {
        keepArchives = keep;
      }
    }
    if (overrides.autoRotate !== undefined) {
      autoRotate = overrides.autoRotate;
    }
  }

  return { maxSizeBytes, keepArchives, autoRotate };
}

/**
 * List OTel files in rotation order: current file first, then archives .1, .2, … in order.
 * Returns only files that actually exist.
 */
export function listOtelFiles(otelPath: string, fsImpl = fs): string[] {
  const result: string[] = [];

  // Current file
  if (fsImpl.existsSync(otelPath)) {
    result.push(otelPath);
  }

  // Archives .1, .2, …
  let archiveNum = 1;
  while (archiveNum <= 999) {
    const archivePath = `${otelPath}.${archiveNum}`;
    if (fsImpl.existsSync(archivePath)) {
      result.push(archivePath);
      archiveNum += 1;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Outcome of a rotation attempt.
 */
export interface RotationResult {
  /**
   * true if a rotation occurred (or was dry-run simulated).
   */
  rotated: boolean;
  /**
   * Why rotation did or didn't happen.
   * - "under_threshold" → current file size < threshold; no rotation needed.
   * - "rotated" → file was rotated successfully.
   * - "rotated_dry_run" → rotation was simulated (--dry-run flag).
   * - "error" → rotation failed (see `error` field for details).
   * - "missing_file" → current otel.jsonl does not exist (nothing to rotate).
   */
  reason:
    | "under_threshold"
    | "rotated"
    | "rotated_dry_run"
    | "error"
    | "missing_file";
  /**
   * Detailed error message if reason === "error".
   */
  error?: string;
  /**
   * Path that the current file was renamed to (if rotated).
   */
  archivedTo?: string;
  /**
   * Paths of archive files that were pruned (deleted) because they exceeded retention.
   */
  prunedArchives: string[];
  /**
   * Size of the current file before rotation (bytes).
   */
  sizeBytes: number;
}

/**
 * Options for rotateOtelFile.
 */
export interface RotateOptions {
  otelPath: string;
  config: RotationConfig;
  /**
   * Force rotation regardless of size.
   */
  force?: boolean;
  /**
   * Simulate rotation without writing to disk.
   */
  dryRun?: boolean;
  /**
   * Injected fs module for testing.
   */
  fsImpl?: typeof fs;
}

/**
 * Rotate the OTel export file if it exceeds the size threshold (or forced).
 *
 * Steps:
 * 1. Check if the current file exists and its size.
 * 2. If size < threshold (and not forced), return "under_threshold".
 * 3. Prune archives > keep count (delete oldest ones).
 * 4. Shift existing archives: .2 → .3, .1 → .2, etc.
 * 5. Rename current → .1.
 * 6. Create a fresh empty current file.
 *
 * All operations are safe with concurrent CLI writes:
 * - POSIX: rename is atomic; the CLI's fd keeps writing to the renamed inode.
 * - Windows: if rename fails (file in use), the entire operation is aborted and
 *   the error is reported (no partial state corruption).
 *
 * @returns RotationResult describing what happened.
 */
export function rotateOtelFile(opts: RotateOptions): RotationResult {
  const { otelPath, config, force = false, dryRun = false, fsImpl = fs } = opts;

  // Step 1: Check if current file exists and get its size.
  let currentSize = 0;
  if (!fsImpl.existsSync(otelPath)) {
    return {
      rotated: false,
      reason: "missing_file",
      prunedArchives: [],
      sizeBytes: 0,
    };
  }

  try {
    currentSize = fsImpl.statSync(otelPath).size;
  } catch (err) {
    return {
      rotated: false,
      reason: "error",
      error: `Failed to stat ${otelPath}: ${String(err)}`,
      prunedArchives: [],
      sizeBytes: 0,
    };
  }

  // Step 2: Check threshold.
  if (!force && currentSize < config.maxSizeBytes) {
    return {
      rotated: false,
      reason: "under_threshold",
      prunedArchives: [],
      sizeBytes: currentSize,
    };
  }

  if (dryRun) {
    return {
      rotated: true,
      reason: "rotated_dry_run",
      archivedTo: `${otelPath}.1`,
      prunedArchives: [], // Would be calculated but we're simulating.
      sizeBytes: currentSize,
    };
  }

  try {
    // Step 3: Collect existing archives.
    const archivesBeforeRotation = listOtelFiles(otelPath, fsImpl).slice(1); // Exclude current

    // Step 4: Shift existing archives (.k → .k+1).
    // Work backwards so we don't overwrite anything.
    for (let i = archivesBeforeRotation.length - 1; i >= 0; i--) {
      const oldPath = archivesBeforeRotation[i];
      const match = oldPath.match(/\.(\d+)$/);
      if (match) {
        const oldNum = Number(match[1]);
        const newNum = oldNum + 1;
        const newPath = `${otelPath}.${newNum}`;
        fsImpl.renameSync(oldPath, newPath);
      }
    }

    // Step 5: Rename current → .1.
    fsImpl.renameSync(otelPath, `${otelPath}.1`);

    // Step 6: Create a fresh empty file.
    fsImpl.writeFileSync(otelPath, "", "utf8");

    // Step 7: Prune archives that exceed the keep constraint.
    // After rotation, we now have archivesBeforeRotation.length + 1 archives.
    // We want to keep at most keepArchives archives.
    const prunedArchives: string[] = [];
    const archivesAfterRotation = listOtelFiles(otelPath, fsImpl).slice(1);
    if (archivesAfterRotation.length > config.keepArchives) {
      const toDelete = archivesAfterRotation.slice(config.keepArchives);
      for (const archivePath of toDelete) {
        fsImpl.unlinkSync(archivePath);
        prunedArchives.push(archivePath);
      }
    }

    return {
      rotated: true,
      reason: "rotated",
      archivedTo: `${otelPath}.1`,
      prunedArchives,
      sizeBytes: currentSize,
    };
  } catch (err) {
    return {
      rotated: false,
      reason: "error",
      error: `Rotation failed: ${String(err)}`,
      prunedArchives: [],
      sizeBytes: currentSize,
    };
  }
}

/**
 * Status of the OTel file and its archives: current size, per-archive sizes,
 * total disk usage, and the effective rotation configuration.
 */
export interface RotationStatus {
  currentSizeBytes: number;
  currentSizeFormatted: string;
  archiveCount: number;
  archiveSizes: Array<{ path: string; sizeBytes: number; formatted: string }>;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  lastRotatedTime?: Date;
  effectiveConfig: RotationConfig;
  effectiveConfigSources: {
    maxSize: "default" | "env" | "override";
    keep: "default" | "env" | "override";
    autoRotate: "default" | "env" | "override";
  };
}

/**
 * Get comprehensive rotation status: sizes, effective config, last-rotated time.
 */
export function getRotationStatus(
  otelPath: string,
  config: RotationConfig,
  configSources?: RotationStatus["effectiveConfigSources"],
  fsImpl = fs
): RotationStatus {
  const files = listOtelFiles(otelPath, fsImpl);
  const archiveSizes: Array<{
    path: string;
    sizeBytes: number;
    formatted: string;
  }> = [];
  let currentSizeBytes = 0;

  for (const filePath of files) {
    try {
      const stat = fsImpl.statSync(filePath);
      if (filePath === otelPath) {
        currentSizeBytes = stat.size;
      } else {
        archiveSizes.push({
          path: filePath,
          sizeBytes: stat.size,
          formatted: formatBytes(stat.size),
        });
      }
    } catch {
      // Ignore stat errors; file may have been deleted concurrently.
    }
  }

  const totalSizeBytes =
    currentSizeBytes + archiveSizes.reduce((sum, a) => sum + a.sizeBytes, 0);

  // Last-rotated time is the mtime of the most recent archive (.1).
  let lastRotatedTime: Date | undefined;
  const firstArchive = archiveSizes[0];
  if (firstArchive) {
    try {
      const stat = fsImpl.statSync(firstArchive.path);
      lastRotatedTime = stat.mtime;
    } catch {
      // Ignore
    }
  }

  return {
    currentSizeBytes,
    currentSizeFormatted: formatBytes(currentSizeBytes),
    archiveCount: archiveSizes.length,
    archiveSizes,
    totalSizeBytes,
    totalSizeFormatted: formatBytes(totalSizeBytes),
    lastRotatedTime,
    effectiveConfig: config,
    effectiveConfigSources: configSources ?? {
      maxSize: "default",
      keep: "default",
      autoRotate: "default",
    },
  };
}

/**
 * Opportunistically rotate the OTel file if it exceeds the size threshold
 * and auto-rotation is enabled. Best-effort: never throws, logs to stderr on rotation.
 * Called before OTel reads in index.ts to rotate while Copilot CLI has the old file open.
 *
 * @param otelPath path to otel.jsonl (defaults to ~/.copilot/tscope/otel.jsonl)
 */
export function maybeAutoRotate(otelPath?: string): void {
  try {
    // Lazy-load getOtelExportPath to avoid circular dependency at module load time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getOtelExportPath } = require("./otel");

    // Get the OTel export path (defaults to ~/.copilot/tscope/otel.jsonl)
    const filePath = otelPath ?? getOtelExportPath();

    // Resolve config from env vars + defaults; no CLI flag overrides here.
    const config = resolveRotationConfig(process.env);

    // Skip if auto-rotation is disabled.
    if (!config.autoRotate) {
      return;
    }

    // Attempt rotation.
    const result = rotateOtelFile({ otelPath: filePath, config });

    // Emit a brief stderr notice only on successful rotation.
    if (result.reason === "rotated" || result.reason === "rotated_dry_run") {
      const archived = result.archivedTo
        ? ` (archived to ${result.archivedTo})`
        : "";
      process.stderr.write(
        `[tscope] OTel file rotated${archived}; ${result.sizeBytes} bytes archived.\n`
      );
    }
  } catch {
    // Silently ignore any errors; auto-rotation failures should not break the read.
  }
}
