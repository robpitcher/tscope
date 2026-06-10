#!/usr/bin/env node
/**
 * tscope — GitHub Copilot session token usage viewer
 * Discovers Copilot CLI sessions, parses token metrics, and renders a
 * formatted report (text, JSON, or HTML).
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { createRequire } from "module";
import {
  isValidDateString,
  todayLocalDateString,
  localDateNDaysAgo,
  selectMostRecentSessions,
} from "./filter";
import { hasTokenData } from "./tokens";
import { Renderer, createRenderer } from "./render";
import { runOtel } from "./otel";
import { getOtelExportPath } from "./otel";
import { NormalizedSession, InProgressSession, Report, SessionDatePredicate, DataSourceKind } from "./types";
import { LogsDataSource } from "./sources/logsSource";
import { OtelDataSource, isOtelAvailable } from "./sources/otelSource";
import { getSessionStateDir } from "./discovery";

const packageJson = createRequire(__filename)("../package.json") as { version: string };
const VERSION = packageJson.version;

const HELP_TEXT = `
tscope — GitHub Copilot session token usage viewer

USAGE
  tscope [options]

OPTIONS
  --help              Show this help text and exit
  --version           Print version and exit
  --source SOURCE     Data source: "auto" (default), "otel", or "logs"
                      auto: use OTel if available, fall back to logs with notice
                      otel: force OTel; exits with error if unavailable
                      logs: force the existing events.jsonl parser
  --json              Output JSON to stdout instead of formatted text
  --html [FILE]       Write a self-contained HTML dashboard to FILE and open
                      it in the default browser
                      (default: ./tscope-report-YYYY-MM-DD.html)
  --all               Show all sessions (no date filter)
  --date YYYY-MM-DD   Show sessions for a specific local date
  --range START END   Show sessions in a local-date range (inclusive)
  --lastdays N        Show sessions from the last N days (today and the
                      preceding N-1 days)
  --max N             Keep only the N most recent sessions from the matched
                      set (sessions are ordered by start time, newest first)

SUBCOMMANDS
  otel status         Show whether Copilot OTel export is configured
  otel enable         Add OTel file-export config to your shell profile
                      (preview only; re-run with --apply to write)
  otel disable        Remove OTel file-export config from your shell profile
                      (preview only; re-run with --apply to write)

DESCRIPTION
  With no arguments, tscope discovers all Copilot CLI sessions from today
  (current local date), parses token usage, and prints a formatted report
  with per-model token counts and session totals.

  In auto mode (default), tscope uses the OTel export when available —
  this provides authoritative server-side cost data. When OTel is not
  configured, it falls back to the events.jsonl log parser.

  Use --json to get machine-readable output suitable for piping to jq or
  other tools.

  Use --html to generate a polished HTML dashboard with charts that follows
  your system's light/dark theme.

EXAMPLES
  tscope                                  Report today's sessions
  tscope --lastdays 7                     Report sessions from the last 7 days
  tscope --range 2026-05-01 2026-05-31    Report sessions in a date range
                                          (dates are YYYY-MM-DD, inclusive)
  tscope --date 2026-06-02                Report a specific local date
  tscope --lastdays 30 --max 10           Report the 10 most recent sessions
                                          from the last 30 days
  tscope --all --html                     Open full history as an HTML dashboard
  tscope --source otel                    Force OTel data source
  tscope --source logs                    Force events.jsonl log parser

DATA SOURCE
  OTel (preferred): ~/.copilot/tscope/otel.jsonl
  Logs (fallback):  ~/.copilot/session-state/<session-id>/events.jsonl

NOTES
  • Sessions are bucketed by their start date, so a session continued from a
    previous day appears under the day it started (not today).
  • Sessions with no token data (in-progress sessions and sessions with empty
    or all-zero token metrics) are silently excluded from all output formats.
`.trim();

type FilterMode = "today" | "date" | "range" | "lastdays" | "all";
type SourceMode = "auto" | "otel" | "logs";

interface ParsedArgs {
  help: boolean;
  version: boolean;
  json: boolean;
  html: boolean;
  htmlOutputPath: string | undefined;
  filterMode: FilterMode;
  filterDate?: string;
  filterStart?: string;
  filterEnd?: string;
  filterLastDays?: string;
  max?: string;
  maxProvided: boolean;
  sourceMode: SourceMode;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  const help = args.includes("--help") || args.includes("-h");
  const version = args.includes("--version") || args.includes("-v");
  const json = args.includes("--json");
  const all = args.includes("--all");

  const htmlIdx = args.indexOf("--html");
  const html = htmlIdx !== -1;
  let htmlOutputPath: string | undefined;
  if (html) {
    const next = args[htmlIdx + 1];
    if (next && !next.startsWith("--")) {
      htmlOutputPath = next;
    }
  }

  const dateIdx = args.indexOf("--date");
  const rangeIdx = args.indexOf("--range");
  const lastDaysIdx = args.indexOf("--lastdays");
  const maxIdx = args.indexOf("--max");
  const sourceIdx = args.indexOf("--source");

  let filterMode: FilterMode = "today";
  let filterDate: string | undefined;
  let filterStart: string | undefined;
  let filterEnd: string | undefined;
  let filterLastDays: string | undefined;
  let max: string | undefined;

  if (all) {
    filterMode = "all";
  } else if (dateIdx !== -1) {
    filterMode = "date";
    filterDate = args[dateIdx + 1];
  } else if (rangeIdx !== -1) {
    filterMode = "range";
    filterStart = args[rangeIdx + 1];
    filterEnd = args[rangeIdx + 2];
  } else if (lastDaysIdx !== -1) {
    filterMode = "lastdays";
    filterLastDays = args[lastDaysIdx + 1];
  }

  if (maxIdx !== -1) {
    const next = args[maxIdx + 1];
    if (next !== undefined && !next.startsWith("--")) {
      max = next;
    }
  }

  let sourceMode: SourceMode = "auto";
  if (sourceIdx !== -1) {
    const next = args[sourceIdx + 1];
    if (next === "otel" || next === "logs" || next === "auto") {
      sourceMode = next;
    } else {
      // Invalid value — leave as "auto"; validateArgs will catch and exit
      sourceMode = next as SourceMode;
    }
  }

  return {
    help,
    version,
    json,
    html,
    htmlOutputPath,
    filterMode,
    filterDate,
    filterStart,
    filterEnd,
    filterLastDays,
    max,
    maxProvided: maxIdx !== -1,
    sourceMode,
  };
}

function validateArgs(args: ParsedArgs): void {
  if (args.sourceMode !== "auto" && args.sourceMode !== "otel" && args.sourceMode !== "logs") {
    process.stderr.write(
      `Error: --source must be "auto", "otel", or "logs" — got "${args.sourceMode}"\n`
    );
    process.exit(1);
  }

  if (args.filterMode === "date") {
    if (!args.filterDate) {
      process.stderr.write("Error: --date requires a YYYY-MM-DD argument\n");
      process.exit(1);
    }
    if (!isValidDateString(args.filterDate)) {
      process.stderr.write(
        `Error: invalid date "${args.filterDate}" — expected YYYY-MM-DD (e.g. 2026-06-02)\n`
      );
      process.exit(1);
    }
  }

  if (args.filterMode === "range") {
    if (!args.filterStart || !args.filterEnd) {
      process.stderr.write(
        "Error: --range requires two YYYY-MM-DD arguments: --range START END\n"
      );
      process.exit(1);
    }
    if (!isValidDateString(args.filterStart)) {
      process.stderr.write(
        `Error: invalid start date "${args.filterStart}" — expected YYYY-MM-DD\n`
      );
      process.exit(1);
    }
    if (!isValidDateString(args.filterEnd)) {
      process.stderr.write(
        `Error: invalid end date "${args.filterEnd}" — expected YYYY-MM-DD\n`
      );
      process.exit(1);
    }
    if (args.filterStart > args.filterEnd) {
      process.stderr.write(
        `Error: start date "${args.filterStart}" must not be after end date "${args.filterEnd}"\n`
      );
      process.exit(1);
    }
  }

  if (args.filterMode === "lastdays") {
    if (!args.filterLastDays) {
      process.stderr.write(
        "Error: --lastdays requires a positive integer argument (e.g. --lastdays 7)\n"
      );
      process.exit(1);
    }
    if (!/^\d+$/.test(args.filterLastDays) || Number(args.filterLastDays) < 1) {
      process.stderr.write(
        `Error: invalid value "${args.filterLastDays}" for --lastdays — expected a positive integer (e.g. 7)\n`
      );
      process.exit(1);
    }
  }

  if (args.maxProvided) {
    if (args.max === undefined) {
      process.stderr.write(
        "Error: --max requires a positive integer argument (e.g. --max 10)\n"
      );
      process.exit(1);
    }
    if (!/^\d+$/.test(args.max) || Number(args.max) < 1) {
      process.stderr.write(
        `Error: invalid value "${args.max}" for --max — expected a positive integer (e.g. 10)\n`
      );
      process.exit(1);
    }
  }
}

/**
 * Build a synchronous date predicate from the parsed filter arguments.
 * Returns undefined for "all" mode (no filtering needed).
 *
 * The predicate takes a local date string (YYYY-MM-DD) and returns true if
 * the session should be included. The data source is responsible for resolving
 * the session's local date before calling this predicate.
 */
function buildDatePredicate(args: ParsedArgs): SessionDatePredicate | undefined {
  if (args.filterMode === "all") return undefined;

  const today = todayLocalDateString();

  if (args.filterMode === "today") {
    return (localDate) => localDate === today;
  }
  if (args.filterMode === "date") {
    const d = args.filterDate!;
    return (localDate) => localDate === d;
  }
  if (args.filterMode === "range") {
    const start = args.filterStart!;
    const end = args.filterEnd!;
    return (localDate) => localDate >= start && localDate <= end;
  }
  if (args.filterMode === "lastdays") {
    const startDate = localDateNDaysAgo(Number(args.filterLastDays!) - 1);
    return (localDate) => localDate >= startDate && localDate <= today;
  }
  return undefined;
}

/** Build the human-readable filter description for reports */
function buildFilterDescription(args: ParsedArgs): string {
  let base: string;
  if (args.filterMode === "all") base = "all time";
  else if (args.filterMode === "date") base = args.filterDate!;
  else if (args.filterMode === "range") base = `${args.filterStart} to ${args.filterEnd}`;
  else if (args.filterMode === "lastdays") {
    const n = Number(args.filterLastDays);
    base = n === 1 ? "today" : `last ${n} days`;
  } else {
    base = "today";
  }

  if (args.max !== undefined) {
    const n = Number(args.max);
    const noun = n === 1 ? "session" : "sessions";
    return `${base} (top ${n} most recent ${noun})`;
  }
  return base;
}

async function main(): Promise<void> {
  // Subcommand routing: `tscope otel <status|enable|disable>` exits early.
  const rawArgs = process.argv.slice(2);
  if (rawArgs[0] === "otel") {
    process.exit(runOtel(rawArgs.slice(1)));
  }

  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(HELP_TEXT + "\n");
    process.exit(0);
  }

  if (args.version) {
    process.stdout.write(`tscope ${VERSION}\n`);
    process.exit(0);
  }

  validateArgs(args);

  const today = todayLocalDateString();
  const predicate = buildDatePredicate(args);

  // --- Source selection ---
  let chosenSource: DataSourceKind;

  if (args.sourceMode === "logs") {
    chosenSource = "logs";
  } else if (args.sourceMode === "otel") {
    if (!isOtelAvailable()) {
      process.stderr.write(
        `Error: --source otel specified but no OTel data found at:\n` +
        `  ${getOtelExportPath()}\n\n` +
        `Run 'tscope otel enable --apply' to enable OTel collection, then start a new Copilot session.\n`
      );
      process.exit(1);
    }
    chosenSource = "otel";
  } else {
    // auto
    if (isOtelAvailable()) {
      chosenSource = "otel";
    } else {
      chosenSource = "logs";
      process.stderr.write(
        `No OpenTelemetry data found — falling back to log-file parsing.\n` +
        `Run 'tscope otel enable' to use OTel.\n`
      );
    }
  }

  // --- Load sessions via chosen DataSource ---
  let completedSessions: NormalizedSession[];
  let inProgressSessions: InProgressSession[];

  if (chosenSource === "otel") {
    const otelSource = new OtelDataSource();
    completedSessions = await otelSource.loadSessions(predicate);
    inProgressSessions = [];
  } else {
    const sessionStateDir = getSessionStateDir();
    if (!fs.existsSync(sessionStateDir)) {
      process.stderr.write(
        `Warning: Copilot session-state directory not found: ${sessionStateDir}\n`
      );
    }
    const logsSource = new LogsDataSource(sessionStateDir);
    const { completed, inProgress } = await logsSource.loadAll(predicate);
    completedSessions = completed;
    inProgressSessions = inProgress;
  }

  // --- Empty-result OTel hint ---
  // When OTel is the active source but no sessions matched the date range,
  // remind the user that OTel coverage is forward-only from enablement.
  if (chosenSource === "otel" && completedSessions.length === 0) {
    const extra = args.filterMode !== "all"
      ? " Use --source logs for historical data, or --all to see all available OTel sessions."
      : " Use --source logs for historical data.";
    process.stderr.write(
      `Hint: No OTel sessions found for this date range.` +
      ` OTel only captures sessions since 'tscope otel enable' was run.${extra}\n`
    );
  }

  // --- Apply --max (post-load recency slice) ---
  let finalCompleted: NormalizedSession[] = completedSessions;
  let finalInProgress: InProgressSession[] = inProgressSessions;

  if (args.max !== undefined) {
    const maxN = Number(args.max);
    const renderable = completedSessions.filter((s) => hasTokenData(s.models));
    finalCompleted = selectMostRecentSessions(renderable, maxN);
    finalInProgress = [];
  }

  const filterDescription = buildFilterDescription(args);

  const report: Report = {
    sessions: finalCompleted,
    inProgressSessions: finalInProgress,
    reportDate: today,
    filterDescription,
    source: chosenSource,
    costAvailable: chosenSource === "otel",
  };

  let format: string;
  let htmlPath: string | undefined;

  if (args.html) {
    format = "html";
    htmlPath = args.htmlOutputPath ?? path.resolve(process.cwd(), `tscope-report-${today}.html`);
  } else if (args.json) {
    format = "json";
  } else {
    format = "text";
  }

  const renderer: Renderer = createRenderer(format, htmlPath);
  renderer.render(report);

  if (args.html && htmlPath) {
    try {
      const platform = process.platform;
      const opener =
        platform === "win32" ? `start "" "${htmlPath}"` :
        platform === "darwin" ? `open "${htmlPath}"` :
        `xdg-open "${htmlPath}"`;
      const shellOpt: string | boolean = platform === "win32" ? "cmd.exe" : true;
      execSync(opener, { stdio: "ignore", shell: shellOpt as string });
    } catch {
      process.stderr.write(`Warning: could not open ${htmlPath} in browser\n`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});

