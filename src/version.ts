/**
 * Single source of truth for the installed tscope version.
 *
 * Resolved from the package manifest at runtime so the CLI, and any report it
 * generates, always report the version that actually produced the output.
 * Falls back to "unknown" when the manifest cannot be read (e.g. an unusual
 * packaging layout) so rendering never fails over version metadata alone.
 */

import { createRequire } from "module";

function readVersion(): string {
  try {
    const packageJson = createRequire(__filename)("../package.json") as {
      version?: unknown;
    };
    const version = packageJson.version;
    return typeof version === "string" && version.trim() !== "" ? version.trim() : "unknown";
  } catch {
    return "unknown";
  }
}

/** Installed tscope version, or "unknown" when it cannot be resolved. */
export const VERSION = readVersion();
