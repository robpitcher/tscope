/**
 * tscope otel — opt-in setup for GitHub Copilot CLI OpenTelemetry export.
 *
 * Copilot CLI reads its OTel configuration from environment variables at
 * process launch. Setting COPILOT_OTEL_FILE_EXPORTER_PATH alone both enables
 * OTel and selects the local file exporter (no collector, endpoint, or auth
 * required). To make every future `copilot` session export automatically, we
 * persist that single variable into the user's shell startup file inside a
 * clearly delimited "managed block" that `disable` can remove surgically.
 *
 * All mutating commands preview the change, then ask for a Y/N confirmation
 * before writing. Anything other than "y"/"yes" cancels.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { execFileSync } from "child_process";

/** Function that asks the user a yes/no question; resolves true only on yes. */
export type Confirm = (question: string) => Promise<boolean>;

/** Default confirm: reads a single line from stdin, true only for y/yes. */
function defaultConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

/** The one env var that enables Copilot CLI's OTel file exporter. */
export const OTEL_ENV_VAR = "COPILOT_OTEL_FILE_EXPORTER_PATH";

/** Delimiters for the tscope-managed region of a shell profile. */
const BLOCK_START = "# >>> tscope otel (managed) >>>";
const BLOCK_END = "# <<< tscope otel (managed) <<<";
const BLOCK_NOTE = "# Enables GitHub Copilot CLI OpenTelemetry file export for tscope.";

/** Shells we know how to write an env-var export for. */
export type ShellKind = "powershell" | "bash" | "zsh" | "fish";

export interface ProfileTarget {
  shell: ShellKind;
  profilePath: string;
}

/** Absolute path to the telemetry file tscope owns (for reads/status). */
export function getOtelExportPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".copilot", "tscope", "otel.jsonl");
}

/** Directory that holds the telemetry file; created on `enable`. */
export function getOtelExportDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".copilot", "tscope");
}

/**
 * The portable literal written into the profile. We emit `$HOME/...` so the
 * shell expands it at runtime rather than baking in an absolute path.
 */
function exportPathLiteral(shell: ShellKind): string {
  return shell === "powershell"
    ? "$HOME\\.copilot\\tscope\\otel.jsonl"
    : "$HOME/.copilot/tscope/otel.jsonl";
}

/** Ask PowerShell for its CurrentUserAllHosts profile path (handles OneDrive redirection). */
function resolvePowerShellProfile(): string | null {
  for (const exe of ["pwsh", "powershell"]) {
    try {
      const out = execFileSync(
        exe,
        ["-NoProfile", "-NoLogo", "-Command", "$PROFILE.CurrentUserAllHosts"],
        { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      if (out) return out;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Determine which shell startup file to edit and how to render the export.
 * Parameters are injectable for testing.
 */
export function resolveProfileTarget(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir(),
  resolvePowerShellProfilePath: () => string | null = resolvePowerShellProfile
): ProfileTarget {
  if (platform === "win32") {
    const profilePath =
      resolvePowerShellProfilePath() ?? path.join(homeDir, "Documents", "PowerShell", "profile.ps1");
    return { shell: "powershell", profilePath };
  }

  const shellPath = env.SHELL ?? "";
  if (shellPath.includes("zsh")) {
    return { shell: "zsh", profilePath: path.join(homeDir, ".zshrc") };
  }
  if (shellPath.includes("fish")) {
    return { shell: "fish", profilePath: path.join(homeDir, ".config", "fish", "config.fish") };
  }
  return { shell: "bash", profilePath: path.join(homeDir, ".bashrc") };
}

/** Render the full managed block for a given shell. */
export function renderBlock(shell: ShellKind): string {
  const literal = exportPathLiteral(shell);
  let assignment: string;
  if (shell === "powershell") {
    assignment = `$env:${OTEL_ENV_VAR} = "${literal}"`;
  } else if (shell === "fish") {
    assignment = `set -gx ${OTEL_ENV_VAR} "${literal}"`;
  } else {
    assignment = `export ${OTEL_ENV_VAR}="${literal}"`;
  }
  return [BLOCK_START, BLOCK_NOTE, assignment, BLOCK_END].join("\n");
}

/** True if `content` already contains a tscope-managed block. */
export function hasBlock(content: string): boolean {
  return content.includes(BLOCK_START) && content.includes(BLOCK_END);
}

/**
 * Insert `block` into `content`, replacing any existing managed block.
 * Pure string transform (no IO) for easy testing.
 */
export function upsertBlock(content: string, block: string): string {
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + BLOCK_END.length);
    return before + block + after;
  }

  // Append, ensuring exactly one blank line of separation.
  if (content.trim() === "") {
    return block + "\n";
  }
  const trimmedEnd = content.replace(/\s+$/, "");
  return `${trimmedEnd}\n\n${block}\n`;
}

/**
 * Remove the managed block (and the blank line it introduced) from `content`.
 * Pure string transform (no IO) for easy testing.
 */
export function removeBlock(content: string): string {
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return content;
  }
  const before = content.slice(0, startIdx).replace(/\n+$/, "");
  const after = content.slice(endIdx + BLOCK_END.length).replace(/^\n+/, "");
  if (before === "") {
    return after === "" ? "" : after + (after.endsWith("\n") ? "" : "\n");
  }
  if (after === "") {
    return before + "\n";
  }
  return `${before}\n\n${after}` + (after.endsWith("\n") ? "" : "\n");
}

/** Read a profile file, treating a missing file as empty content. */
function readProfile(profilePath: string): string {
  try {
    return fs.readFileSync(profilePath, "utf8");
  } catch {
    return "";
  }
}

/** Human-readable byte size. */
function formatBytes(bytes: number): string {
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

/** Indent each line of a block for display. */
function indent(text: string, pad = "  "): string {
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function out(line = ""): void {
  process.stdout.write(line + "\n");
}

/** `tscope otel status` — read-only inspection. */
export function otelStatus(): number {
  const { shell, profilePath } = resolveProfileTarget();
  const content = readProfile(profilePath);
  const present = hasBlock(content);
  const envValue = process.env[OTEL_ENV_VAR];
  const exportPath = getOtelExportPath();

  out("tscope otel status");
  out();
  out(`Shell:           ${shell}`);
  out(`Profile:         ${profilePath}`);
  out(`  managed block: ${present ? "present" : "absent"}`);
  out(`Current shell:   ${envValue ? `${OTEL_ENV_VAR}=${envValue}` : `${OTEL_ENV_VAR} not set`}`);

  try {
    const stat = fs.statSync(exportPath);
    out(`Export file:     ${exportPath}`);
    out(`  exists:        yes (${formatBytes(stat.size)}, modified ${stat.mtime.toISOString()})`);

    // Show rotation status if rotation module is available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRotationStatus, resolveRotationConfig } = require("./otelRotation");
      const config = resolveRotationConfig(process.env);
      const status = getRotationStatus(exportPath, config);

      out();
      out("Rotation/Pruning:");
      out(`  threshold:     ${formatBytes(config.maxSizeBytes)}`);
      out(`  archives:      ${status.archiveCount} file(s)`);
      if (status.archiveSizes.length > 0) {
        const archiveInfo = status.archiveSizes
          .map((a: { path: string; sizeBytes: number; formatted: string }) =>
            `${path.basename(a.path)} (${a.formatted})`
          )
          .join(", ");
        out(`  archive sizes: ${archiveInfo}`);
        out(`  total size:    ${status.totalSizeFormatted}`);
      }
      out(`  keep archives: ${config.keepArchives}`);
      if (status.lastRotatedTime) {
        out(`  last rotated:  ${status.lastRotatedTime.toISOString()}`);
      }
      out(`  auto-rotate:   ${config.autoRotate ? "enabled" : "disabled"}`);
    } catch {
      // Rotation module not available or error reading status — silently skip
    }
  } catch {
    out(`Export file:     ${exportPath}`);
    out(`  exists:        no`);
  }

  out();
  if (!present) {
    out("OTel export is not configured. Run 'tscope otel enable' to set it up.");
  } else if (!envValue) {
    out("Configured in your profile, but not active in this shell yet —");
    out("open a new terminal (or restart your shell) to start exporting.");
  } else {
    out("OTel export is configured and active in this shell.");
  }
  return 0;
}

/** `tscope otel enable` — preview, confirm, then add the managed block. */
export async function otelEnable(confirm: Confirm = defaultConfirm): Promise<number> {
  const { shell, profilePath } = resolveProfileTarget();
  const block = renderBlock(shell);
  const content = readProfile(profilePath);
  const exportDir = getOtelExportDir();

  if (hasBlock(content) && content.includes(block)) {
    out("tscope otel enable");
    out();
    out(`OTel export is already configured in:`);
    out(`  ${profilePath}`);
    out();
    out("Nothing to do. Run 'tscope otel status' to verify.");
    return 0;
  }

  out("tscope otel enable");
  out();
  out(`Shell profile:  ${profilePath}`);
  out(`Export file:    ${getOtelExportPath()}`);
  out();
  out(hasBlock(content) ? "The managed block will be UPDATED to:" : "The following managed block will be ADDED:");
  out();
  out(indent(block));
  out();

  const confirmed = await confirm("Apply this change? [y/N] ");
  if (!confirmed) {
    out();
    out("Cancelled. No changes written.");
    return 0;
  }

  try {
    fs.mkdirSync(exportDir, { recursive: true });
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, upsertBlock(content, block), "utf8");
  } catch (err) {
    process.stderr.write(`Error: failed to update profile ${profilePath}: ${String(err)}\n`);
    return 1;
  }

  out();
  out("tscope otel enable — applied");
  out();
  out(`Wrote managed block to:`);
  out(`  ${profilePath}`);
  out(`Created export directory:`);
  out(`  ${exportDir}`);
  out();
  out("Open a new terminal (or restart your shell) so new copilot sessions");
  out("start exporting telemetry, then check 'tscope otel status'.");
  return 0;
}

/** `tscope otel disable` — preview, confirm, then remove the managed block. */
export async function otelDisable(confirm: Confirm = defaultConfirm): Promise<number> {
  const { profilePath } = resolveProfileTarget();
  const content = readProfile(profilePath);

  if (!hasBlock(content)) {
    out("tscope otel disable");
    out();
    out(`No tscope-managed OTel block found in:`);
    out(`  ${profilePath}`);
    out();
    out("Nothing to remove.");
    return 0;
  }

  out("tscope otel disable");
  out();
  out(`Shell profile:  ${profilePath}`);
  out();
  out("The tscope-managed block will be REMOVED.");
  out();

  const confirmed = await confirm("Remove it? [y/N] ");
  if (!confirmed) {
    out();
    out("Cancelled. No changes written.");
    return 0;
  }

  try {
    fs.writeFileSync(profilePath, removeBlock(content), "utf8");
  } catch (err) {
    process.stderr.write(`Error: failed to update profile ${profilePath}: ${String(err)}\n`);
    return 1;
  }

  out();
  out("tscope otel disable — applied");
  out();
  out(`Removed the managed block from:`);
  out(`  ${profilePath}`);
  out(`The telemetry file (if any) was left untouched:`);
  out(`  ${getOtelExportPath()}`);
  out();
  out("Open a new terminal (or restart your shell) so copilot stops");
  out("exporting telemetry.");
  return 0;
}

/** `tscope otel prune` — rotate and prune archives to bound disk usage. */
export async function otelPrune(
  subArgs: string[],
  confirm: Confirm = defaultConfirm
): Promise<number> {
  // Parse flags: --max-size, --keep, --force, --dry-run, -y/--yes
  let maxSizeStr: string | undefined;
  let keepStr: string | undefined;
  let force = false;
  let dryRun = false;
  let skipConfirm = false;

  for (let i = 0; i < subArgs.length; i++) {
    const arg = subArgs[i];
    if (arg === "--max-size" && i + 1 < subArgs.length) {
      maxSizeStr = subArgs[++i];
    } else if (arg === "--keep" && i + 1 < subArgs.length) {
      keepStr = subArgs[++i];
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "-y" || arg === "--yes") {
      skipConfirm = true;
    } else if (arg === "--help" || arg === "-h") {
      out("tscope otel prune");
      out();
      out("USAGE");
      out("  tscope otel prune [options]");
      out();
      out("OPTIONS");
      out("  --max-size SIZE   Archive threshold (e.g. '20MB', '1GB'). Default: 20 MB");
      out("  --keep N          Number of archives to retain. Default: 5");
      out("  --force           Rotate regardless of current size");
      out("  --dry-run         Preview changes without writing");
      out("  -y, --yes         Skip confirmation prompt");
      out("  --help            Show this help text");
      out();
      out("DESCRIPTION");
      out("  Manages the OTel export file (~/.copilot/tscope/otel.jsonl) by rotating");
      out("  it to numbered archives (.1, .2, ...) when it exceeds the size threshold,");
      out("  then pruning old archives to keep only the most recent ones.");
      out();
      out("EXAMPLES");
      out("  tscope otel prune                           Prune with defaults (20MB, keep 5)");
      out("  tscope otel prune --max-size 50MB --keep 3  Custom size/retention");
      out("  tscope otel prune --force                   Force rotation regardless of size");
      out("  tscope otel prune --dry-run                 Preview what would be done");
      return 0;
    } else {
      process.stderr.write(
        `Error: unknown prune option "${arg}"\n` +
        `Run 'tscope otel prune --help' for usage.\n`
      );
      return 1;
    }
  }

  // Import rotation functions (lazy-load to avoid circular dependency)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveRotationConfig, rotateOtelFile, getRotationStatus } = require("./otelRotation");

  const otelPath = getOtelExportPath();

  // Check if file exists
  try {
    fs.statSync(otelPath);
  } catch {
    out("tscope otel prune");
    out();
    out(`OTel file not found: ${otelPath}`);
    out();
    out("No action taken.");
    return 0;
  }

  // Resolve config with CLI flag overrides (validation/precedence handled centrally).
  const config = resolveRotationConfig(process.env, {
    maxSize: maxSizeStr,
    keep: keepStr,
  });

  // Get rotation status for preview
  const status = getRotationStatus(otelPath, config);

  // Show preview
  out("tscope otel prune");
  out();
  out(`OTel export file: ${otelPath}`);
  out(`Current size:     ${status.currentSizeFormatted}`);
  out(`Threshold:        ${formatBytes(config.maxSizeBytes)}`);
  out(`Archives:         ${status.archiveCount} file(s)`);
  if (status.archiveSizes.length > 0) {
    out(`Archive sizes:    ${status.archiveSizes.map((a: { path: string; sizeBytes: number; formatted: string }) => `${path.basename(a.path)} (${a.formatted})`).join(", ")}`);
  }
  out();

  // Simulate rotation to show what will happen
  const dryResult = rotateOtelFile({ otelPath, config, dryRun: true, force });
  if (dryResult.reason === "under_threshold" && !force) {
    out("Result: File is under threshold — no rotation needed.");
    return 0;
  }

  if (dryResult.reason === "rotated_dry_run") {
    out("Result: Would rotate:");
    if (dryResult.archivedTo) {
      out(`  • Rename current → ${path.basename(dryResult.archivedTo)}`);
    }
    out(`  • Create fresh ${path.basename(otelPath)}`);
    if (dryResult.prunedArchives.length > 0) {
      out(`  • Delete old archive(s): ${dryResult.prunedArchives.map((p: string) => path.basename(p)).join(", ")}`);
    } else {
      out(`  • Keep ${config.keepArchives} archive(s)`);
    }
  } else if (dryResult.reason === "error") {
    out(`Result: Error — ${dryResult.error}`);
    return 1;
  }

  if (dryRun) {
    out();
    out("(dry-run mode — no changes written)");
    return 0;
  }

  // Ask for confirmation (unless -y/--yes)
  if (!skipConfirm) {
    out();
    const confirmed = await confirm("Apply this rotation? [y/N] ");
    if (!confirmed) {
      out();
      out("Cancelled. No changes written.");
      return 0;
    }
  }

  // Execute rotation
  const result = rotateOtelFile({ otelPath, config, force });
  out();
  if (result.reason === "rotated") {
    out("tscope otel prune — applied");
    out();
    out(`Rotated: ${status.currentSizeFormatted} archived to ${result.archivedTo ? path.basename(result.archivedTo) : "archive"}`);
    if (result.prunedArchives.length > 0) {
      out(`Pruned:  ${result.prunedArchives.map((p: string) => path.basename(p)).join(", ")}`);
    }
  } else if (result.reason === "under_threshold") {
    out("No rotation needed (file is under threshold).");
  } else if (result.reason === "error") {
    out("Error during rotation:");
    out(result.error ?? "Unknown error");
    return 1;
  } else {
    out("Unexpected result.");
    return 1;
  }
  return 0;
}

const OTEL_USAGE = `
tscope otel — configure GitHub Copilot CLI OpenTelemetry export

USAGE
  tscope otel status            Show whether OTel export is configured
  tscope otel enable            Add the OTel file-export config to your shell
                                profile (asks for confirmation)
  tscope otel disable           Remove the OTel file-export config from your
                                shell profile (asks for confirmation)
  tscope otel prune             Rotate and prune OTel archives to bound growth
                                (asks for confirmation)

NOTES
  Sets ${OTEL_ENV_VAR} in your shell startup file. This
  enables Copilot CLI's local file exporter — no collector, endpoint, or
  authentication required. Telemetry is written to:
    ~/.copilot/tscope/otel.jsonl

ROTATION & PRUNING
  The OTel export file grows continuously as Copilot sessions are tracked.
  Use 'tscope otel prune' to rotate the live file to a numbered archive
  (otel.jsonl.1, .2, …) when it exceeds a size threshold, keeping historical
  data for reports while bounding total disk usage. Archives are pruned to
  retain only the most recent ones. Auto-rotation is enabled by default during
  'tscope' reads — set TSCOPE_OTEL_AUTOROTATE=0 to disable.

  Environment variables control rotation:
    TSCOPE_OTEL_MAX_SIZE    Max file size before rotation (default: 20MB)
    TSCOPE_OTEL_KEEP        Archive retention count (default: 5)
    TSCOPE_OTEL_AUTOROTATE  Enable auto-rotation during reads (default: true)
`.trim();

/**
 * Entry point for the `otel` subcommand. `subArgs` are the tokens after
 * `otel` (e.g. ["enable"]). Returns a process exit code.
 */
export async function runOtel(subArgs: string[]): Promise<number> {
  const sub = subArgs[0];

  switch (sub) {
    case "status":
      return otelStatus();
    case "enable":
      return otelEnable();
    case "disable":
      return otelDisable();
    case "prune":
      return otelPrune(subArgs.slice(1));
    case undefined:
    case "--help":
    case "-h":
      out(OTEL_USAGE);
      return 0;
    default:
      process.stderr.write(`Error: unknown otel command "${sub}"\n\n`);
      process.stderr.write(OTEL_USAGE + "\n");
      return 1;
  }
}
