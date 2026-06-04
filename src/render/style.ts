/**
 * Minimal ANSI text styling for the terminal renderer.
 *
 * Only two attributes are exposed: `bold` and `dim`. We deliberately do NOT
 * change foreground colors — visual hierarchy is built from weight/intensity
 * alone, which keeps the output legible across every terminal palette and
 * avoids the "everyone's terminal looks different" problem.
 *
 * Styling auto-disables when either:
 *   - the `NO_COLOR` env var is present and non-empty (per https://no-color.org/), or
 *   - the target stream is not a TTY (e.g. piped to a file or another command).
 *
 * Functions take an explicit `enabled` flag so callers can compute the
 * decision once and pass it down — this also makes them trivially testable
 * without monkey-patching `process.stdout.isTTY`.
 */

const RESET = "\x1b[0m";

/**
 * Decide whether ANSI styling should be applied. Defaults to checking the
 * current process environment and `process.stdout`, but both can be injected
 * for testing.
 */
export function ansiEnabled(
  env: NodeJS.ProcessEnv = process.env,
  stream: { isTTY?: boolean } = process.stdout
): boolean {
  const nc = env.NO_COLOR;
  if (typeof nc === "string" && nc !== "") return false;
  return Boolean(stream.isTTY);
}

/** Wrap `text` in ANSI bold (SGR 1) when `enabled`, otherwise return as-is. */
export function bold(text: string, enabled: boolean): string {
  return enabled ? `\x1b[1m${text}${RESET}` : text;
}

/** Wrap `text` in ANSI dim/faint (SGR 2) when `enabled`, otherwise return as-is. */
export function dim(text: string, enabled: boolean): string {
  return enabled ? `\x1b[2m${text}${RESET}` : text;
}
