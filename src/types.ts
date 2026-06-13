/**
 * Core data types for tscope.
 * Parsing, storage, and rendering are decoupled through these types.
 */

/** Which data source produced a single session. */
export type DataSourceKind = "otel" | "logs";

/**
 * Report-level provenance. "mixed" means the report contains sessions from
 * both OTel and the log parser (the default `--source auto` merged case).
 */
export type ReportSourceKind = DataSourceKind | "mixed";

/**
 * A predicate that decides whether a session should be included in a report.
 * Receives the session's local date string (YYYY-MM-DD) and session ID.
 * Returning true includes the session; returning false excludes it.
 * Synchronous — async date resolution is the data source's responsibility.
 */
export type SessionDatePredicate = (localDateString: string, sessionId: string) => boolean;

/**
 * Extended metrics available from the OTel source only.
 * v1 populates reasoningTokens and contextWindow; designed for future fields.
 */
export interface ExtendedMetrics {
  /** Chain-of-thought token count from gen_ai.usage.reasoning_output_tokens */
  reasoningTokens?: number;
  /** Context-window utilization from event.github.copilot.current_tokens vs token_limit */
  contextWindow?: {
    usedTokens: number;
    limitTokens: number;
    utilizationRatio: number;
  };
}

/**
 * Abstraction over data sources (OTel and logs).
 * Each source produces NormalizedSession[] from its own storage.
 */
export interface DataSource {
  /**
   * Load and return sessions passing the predicate.
   * Pass undefined to return all sessions (no date filtering).
   */
  loadSessions(predicate?: SessionDatePredicate): Promise<NormalizedSession[]>;
  /**
   * Load in-progress sessions (logs source only; always empty for OTel).
   * Optional so OtelDataSource doesn't need to implement it.
   */
  loadInProgressSessions?(predicate?: SessionDatePredicate): Promise<InProgressSession[]>;
}

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
  /**
   * Cumulative model API call time across all runs of this session
   * (sum of `session.shutdown.data.totalApiDurationMs` over every shutdown
   * event). Undefined when no shutdown event reports the field.
   *
   * This is pure compute time reported by the Copilot CLI itself — it does
   * NOT include user think time, idle gaps, or session resume gaps. It's
   * the most defensible "how much AI work happened" measure available.
   */
  apiDurationMs?: number;
  /**
   * Total session AI credits from summed `session.shutdown.data.totalNanoAiu / 1e9`.
   * Undefined when no shutdown reported the field.
   */
  totalCost?: number;
  /** /chronicle tips insights captured in this session (chronological) */
  chronicleTips: ChronicleTip[];
  inProgress: false;
}

/**
 * A normalized session produced by either the OTel or log data source.
 * Superset of ParsedSession — all existing renderers that accept ParsedSession
 * remain compatible without changes.
 */
export interface NormalizedSession extends ParsedSession {
  /** Which data source produced this session. */
  source: DataSourceKind;
  /**
   * Per-model estimated AI credits (OTel only, from github.copilot.nano_aiu ÷ 1e9).
   * Undefined for log-sourced sessions.
   * Key = model name, matching the keys in `models`.
   */
  modelCosts?: Record<string, number>;
  /**
   * Total session AI credits (OTel, or logs via summed totalNanoAiu).
   */
  totalCost?: number;
  /** Extended OTel-only metrics (v1: reasoning tokens, context window). */
  extended?: ExtendedMetrics;
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

/**
 * Per-source session counts and cost-availability summary for a merged report.
 * Renderers can use this to display "N OTel / M logs" coverage labels.
 */
export interface SourceCoverage {
  /** Number of sessions sourced from OTel in this report. */
  otelCount: number;
  /** Number of sessions sourced from the log parser in this report. */
  logsCount: number;
  /**
   * Cost-data availability across the report:
   *   "all"     — every session has authoritative cost data (pure OTel)
   *   "partial" — some sessions have cost data (OTel + logs mixed)
   *   "none"    — no sessions have cost data (pure logs or empty)
   */
  costCoverage: "all" | "partial" | "none";
}

/** Final report data passed to renderers */
export interface Report {
  /** Completed sessions with token data (source determined by Report.source). */
  sessions: NormalizedSession[];
  inProgressSessions: InProgressSession[];
  reportDate: string; // local date string YYYY-MM-DD
  /** Human-readable description of the active filter, e.g. "today", "2026-06-02", "2026-06-01 to 2026-06-02", "all time" */
  filterDescription: string;
  /**
   * Which data source(s) produced the sessions in this report.
   * "otel"  — all sessions from OTel
   * "logs"  — all sessions from the log parser
   * "mixed" — merged OTel + logs (default --source auto when OTel is available)
   */
  source: ReportSourceKind;
  /**
   * Whether cost data is present for at least the OTel subset of this report.
   * true when source is "otel" or "mixed" (otelCount > 0).
   */
  costAvailable: boolean;
  /**
   * Per-source session counts and cost-availability summary.
   * Use this for "N OTel / M logs" coverage displays and partial-cost indicators.
   */
  coverage: SourceCoverage;
}

/** Raw session folder info from discovery */
export interface SessionRef {
  sessionId: string;
  eventsPath: string;
}
