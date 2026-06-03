#!/usr/bin/env node
/**
 * tscope — GitHub Copilot session token usage viewer
 * Discovers Copilot CLI sessions, parses token metrics, and renders a
 * formatted report (text, JSON, or HTML).
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { discoverSessions, getSessionStateDir } from "./discovery";
import { parseEventsFile } from "./parser";
import {
  makeDateFilter,
  makeRangeDateFilter,
  isValidDateString,
  todayLocalDateString,
} from "./filter";
import { Renderer, createRenderer } from "./render";
import { ParsedSession, InProgressSession, Report, SessionRef } from "./types";

const VERSION = "0.3.0";

const HELP_TEXT = `
tscope — GitHub Copilot session token usage viewer

USAGE
  tscope [options]

OPTIONS
  --help              Show this help text and exit
  --version           Print version and exit
  --json              Output JSON to stdout instead of formatted text
  --html [FILE]       Write a self-contained HTML dashboard to FILE
                      (default: ./tscope-report-YYYY-MM-DD.html)
  --open              Open the generated HTML file in the default browser
                      (only valid with --html; default OFF)
  --all               Show all sessions (no date filter)
  --date YYYY-MM-DD   Show sessions for a specific local date
  --range START END   Show sessions in a local-date range (inclusive)

DESCRIPTION
  With no arguments, tscope discovers all Copilot CLI sessions from today
  (current local date), parses token usage from each session's events.jsonl,
  and prints a formatted report with per-model token counts and session totals.

  Use --json to get machine-readable output suitable for piping to jq or
  other tools.

  Use --html to generate a polished, dark-mode HTML dashboard with charts.

DATA SOURCE
  ~/.copilot/session-state/<session-id>/events.jsonl

NOTES
  • Sessions are bucketed by their start date, so a session continued from a
    previous day appears under the day it started (not today).
  • In-progress sessions (no shutdown event) are shown as [IN PROGRESS].
  • Premium requests (raw count from session data) are shown when available.
`.trim();

type FilterMode = "today" | "date" | "range" | "all";

interface ParsedArgs {
  help: boolean;
  version: boolean;
  json: boolean;
  html: boolean;
  htmlOutputPath: string | undefined;
  openAfterWrite: boolean;
  filterMode: FilterMode;
  filterDate?: string;
  filterStart?: string;
  filterEnd?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  const help = args.includes("--help") || args.includes("-h");
  const version = args.includes("--version") || args.includes("-v");
  const json = args.includes("--json");
  const all = args.includes("--all");
  const openAfterWrite = args.includes("--open");

  const htmlIdx = args.indexOf("--html");
  let html = htmlIdx !== -1;
  let htmlOutputPath: string | undefined;
  if (html) {
    // Next arg is the output path if it doesn't start with '--'
    const next = args[htmlIdx + 1];
    if (next && !next.startsWith("--")) {
      htmlOutputPath = next;
    }
  }

  const dateIdx = args.indexOf("--date");
  const rangeIdx = args.indexOf("--range");

  let filterMode: FilterMode = "today";
  let filterDate: string | undefined;
  let filterStart: string | undefined;
  let filterEnd: string | undefined;

  if (all) {
    filterMode = "all";
  } else if (dateIdx !== -1) {
    filterMode = "date";
    filterDate = args[dateIdx + 1];
  } else if (rangeIdx !== -1) {
    filterMode = "range";
    filterStart = args[rangeIdx + 1];
    filterEnd = args[rangeIdx + 2];
  }

  return { help, version, json, html, htmlOutputPath, openAfterWrite, filterMode, filterDate, filterStart, filterEnd };
}

function validateArgs(args: ParsedArgs): void {
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
}

/** Apply the active filter and return matching SessionRefs */
async function applyFilter(
  allRefs: SessionRef[],
  args: ParsedArgs
): Promise<SessionRef[]> {
  if (args.filterMode === "all") {
    return allRefs;
  }

  const today = todayLocalDateString();
  const predicate =
    args.filterMode === "today"
      ? makeDateFilter(today)
      : args.filterMode === "date"
      ? makeDateFilter(args.filterDate!)
      : makeRangeDateFilter(args.filterStart!, args.filterEnd!);

  const results = await Promise.all(
    allRefs.map(async (ref) => ({ ref, keep: await predicate(ref) }))
  );
  return results.filter(({ keep }) => keep).map(({ ref }) => ref);
}

/** Build the human-readable filter description for reports */
function buildFilterDescription(args: ParsedArgs): string {
  if (args.filterMode === "all") return "all time";
  if (args.filterMode === "date") return args.filterDate!;
  if (args.filterMode === "range")
    return `${args.filterStart} to ${args.filterEnd}`;
  return "today";
}

async function main(): Promise<void> {
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
  const sessionStateDir = getSessionStateDir();

  if (!fs.existsSync(sessionStateDir)) {
    process.stderr.write(
      `Warning: Copilot session-state directory not found: ${sessionStateDir}\n`
    );
  }

  const allRefs = discoverSessions(sessionStateDir);
  const filteredRefs = await applyFilter(allRefs, args);

  const completedSessions: ParsedSession[] = [];
  const inProgressSessions: InProgressSession[] = [];

  for (const ref of filteredRefs) {
    let session;
    try {
      session = await parseEventsFile(ref.sessionId, ref.eventsPath);
    } catch (err) {
      process.stderr.write(
        `Warning: failed to parse session ${ref.sessionId}: ${String(err)}\n`
      );
      continue;
    }

    if (session.inProgress) {
      inProgressSessions.push(session as InProgressSession);
    } else {
      completedSessions.push(session as ParsedSession);
    }
  }

  const filterDescription = buildFilterDescription(args);

  const report: Report = {
    sessions: completedSessions,
    inProgressSessions,
    reportDate: today,
    filterDescription,
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

  if (args.html && args.openAfterWrite && htmlPath) {
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
