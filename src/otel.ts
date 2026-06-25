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

const OTEL_USAGE = `
tscope otel — configure GitHub Copilot CLI OpenTelemetry export

USAGE
  tscope otel status            Show whether OTel export is configured
  tscope otel enable            Add the OTel file-export config to your shell
                                profile (asks for confirmation)
  tscope otel disable           Remove the OTel file-export config from your
                                shell profile (asks for confirmation)

NOTES
  Sets ${OTEL_ENV_VAR} in your shell startup file. This
  enables Copilot CLI's local file exporter — no collector, endpoint, or
  authentication required. Telemetry is written to:
    ~/.copilot/tscope/otel.jsonl
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
