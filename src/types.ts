/**
 * Core data types for tscope.
 * Parsing, storage, and rendering are decoupled through these types.
 */

/** Per-model token usage counts extracted from session.shutdown.data.modelMetrics */
export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

/**
 * A `/chronicle tips` or `/chronicle cost-tips` insight captured from a session.
 * The markdown is the assistant's final rendered response to the command.
 */
export interface ChronicleTip {
  /** Which chronicle command produced this insight */
  variant: "tips" | "cost-tips";
  /** ISO 8601 UTC timestamp of the command invocation (may be empty if unknown) */
  timestamp: string;
  /** The assistant's final response text, as raw markdown */
  markdown: string;
}

/** Fully parsed session with token data */
export interface ParsedSession {
  sessionId: string;
  eventsPath: string;
  /** ISO 8601 UTC start time from session.start.data.startTime */
  startTime: string;
  /** Map from model name to token counts */
  models: Record<string, TokenCounts>;
  /** /chronicle tips insights captured in this session (chronological) */
  chronicleTips: ChronicleTip[];
  inProgress: false;
}

/** Session where no shutdown event was found */
export interface InProgressSession {
  sessionId: string;
  eventsPath: string;
  /** May be available from session.start even if shutdown missing */
  startTime: string | undefined;
  /** /chronicle tips insights captured in this session (chronological) */
  chronicleTips: ChronicleTip[];
  inProgress: true;
}

export type Session = ParsedSession | InProgressSession;

/** Final report data passed to renderers */
export interface Report {
  sessions: ParsedSession[];
  inProgressSessions: InProgressSession[];
  reportDate: string; // local date string YYYY-MM-DD
  /** Human-readable description of the active filter, e.g. "today", "2026-06-02", "2026-06-01 to 2026-06-02", "all time" */
  filterDescription: string;
}

/** Raw session folder info from discovery */
export interface SessionRef {
  sessionId: string;
  eventsPath: string;
}
