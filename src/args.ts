/**
 * CLI argument parsing and validation for tscope.
 *
 * This module is internal to the CLI entry point (`src/index.ts`) and is not
 * part of the package's public API — it has no library use case and is kept
 * out of the `dist/index.d.ts` declaration surface intentionally.
 */

import { isValidDateString, todayLocalDateString, localDateNDaysAgo } from "./filter";
import { SessionDatePredicate } from "./types";

export type FilterMode = "today" | "date" | "range" | "lastdays" | "all";
export type SourceMode = "auto" | "otel" | "logs";

export interface ParsedArgs {
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
  defaultRecent: boolean;
  sourceMode: SourceMode;
}

export function parseArgs(argv: string[]): ParsedArgs {
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

  const noDateFilterFlags = !all && dateIdx === -1 && rangeIdx === -1 && lastDaysIdx === -1;
  const noFilterFlags = noDateFilterFlags && maxIdx === -1;

  let filterMode: FilterMode = noDateFilterFlags ? "all" : "today";
  let filterDate: string | undefined;
  let filterStart: string | undefined;
  let filterEnd: string | undefined;
  let filterLastDays: string | undefined;
  let max: string | undefined = noFilterFlags ? "20" : undefined;
  const defaultRecent = noFilterFlags;

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
    defaultRecent,
    sourceMode,
  };
}

export function validateArgs(args: ParsedArgs): void {
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
export function buildDatePredicate(args: ParsedArgs): SessionDatePredicate | undefined {
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
export function buildFilterDescription(args: ParsedArgs): string {
  if (args.defaultRecent) return "last 20 sessions";

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
