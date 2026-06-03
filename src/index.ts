#!/usr/bin/env node
/**
 * tscope — GitHub Copilot session token usage viewer
 * Discovers today's local Copilot CLI sessions, parses token metrics, computes
 * estimated AI credits, and renders a formatted text report.
 */

import { discoverSessions, getSessionStateDir } from "./discovery";
import { parseEventsFile } from "./parser";
import { makeDateFilter, todayLocalDateString } from "./filter";
import { calcSessionCredits } from "./credits";
import { Renderer, createRenderer } from "./render";
import { ParsedSession, InProgressSession, Report } from "./types";

const VERSION = "0.1.0";

const HELP_TEXT = `
tscope — GitHub Copilot session token usage viewer

USAGE
  tscope [options]

OPTIONS
  --help        Show this help text and exit
  --version     Print version and exit

DESCRIPTION
  With no arguments, tscope discovers all Copilot CLI sessions from today
  (current local date), parses token usage from each session's events.jsonl,
  and prints a formatted report with per-model token counts and estimated
  AI credits.

DATA SOURCE
  ~/.copilot/session-state/<session-id>/events.jsonl

NOTES
  • Credits are estimated using a bundled rate table and displayed as "~N credits".
  • In-progress sessions (no shutdown event) are shown as [IN PROGRESS].
  • Unknown models show token counts but no credit estimate; a warning is printed
    to stderr.
  • Rate table version: see --version output.
`.trim();

function parseArgs(argv: string[]): { help: boolean; version: boolean } {
  const args = argv.slice(2);
  return {
    help: args.includes("--help") || args.includes("-h"),
    version: args.includes("--version") || args.includes("-v"),
  };
}

async function main(): Promise<void> {
  const { help, version } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(HELP_TEXT + "\n");
    process.exit(0);
  }

  if (version) {
    process.stdout.write(`tscope ${VERSION}\n`);
    process.exit(0);
  }

  const today = todayLocalDateString();
  const sessionStateDir = getSessionStateDir();

  // Discover all session folders
  const allRefs = discoverSessions(sessionStateDir);

  if (allRefs.length === 0 && !require("fs").existsSync(sessionStateDir)) {
    process.stderr.write(
      `Warning: Copilot session-state directory not found: ${sessionStateDir}\n`
    );
    process.stdout.write("No sessions found for today.\n");
    process.exit(0);
  }

  // Apply today date filter
  const dateFilter = makeDateFilter(today);
  const filteredRefs = (
    await Promise.all(allRefs.map(async (ref) => ({ ref, keep: await dateFilter(ref) })))
  )
    .filter(({ keep }) => keep)
    .map(({ ref }) => ref);

  if (filteredRefs.length === 0) {
    process.stdout.write("No sessions found for today.\n");
    process.exit(0);
  }

  // Parse each session
  const completedSessions: Array<{ session: ParsedSession; credits: ReturnType<typeof calcSessionCredits> }> = [];
  const inProgressSessions: InProgressSession[] = [];
  let totalCredits = 0;
  let hasUnknownRates = false;

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
      const parsed = session as ParsedSession;
      const credits = calcSessionCredits(parsed);
      completedSessions.push({ session: parsed, credits });
      totalCredits += credits.totalCredits;
      if (credits.hasUnknownRates) hasUnknownRates = true;
    }
  }

  const report: Report = {
    sessions: completedSessions,
    inProgressSessions,
    totalCredits,
    hasUnknownRates,
    reportDate: today,
  };

  const renderer: Renderer = createRenderer("text");
  renderer.render(report);

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
