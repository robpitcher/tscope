/**
 * Tests for workspace.ts — reading the client (agentic surface) from
 * workspace.yaml and enriching sessions by sessionId.
 */

import * as fs from "fs";
import * as path from "path";
import {
  readWorkspaceClientName,
  resolveClientName,
  enrichSessionsWithClient,
} from "../workspace";
import { NormalizedSession } from "../types";
import { makeTmpDir } from "./helpers/fs";

/** Write a workspace.yaml into a session dir (created if needed). */
function writeWorkspaceYaml(sessionDir: string, body: string): void {
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "workspace.yaml"), body, "utf8");
}

function makeSession(sessionId: string): NormalizedSession {
  return {
    sessionId,
    eventsPath: `/x/${sessionId}/events.jsonl`,
    startTime: "2026-06-02T20:00:00.000Z",
    models: {},
    chronicleTips: [],
    inProgress: false,
    source: "logs",
  };
}

describe("readWorkspaceClientName", () => {
  test("reads client_name from a realistic workspace.yaml", () => {
    const dir = makeTmpDir();
    const sessionDir = path.join(dir, "sess-1");
    writeWorkspaceYaml(
      sessionDir,
      [
        "id: sess-1",
        "repository: robpitcher/tscope",
        "client_name: github/autopilot",
        "name: Some session",
      ].join("\n") + "\n"
    );
    expect(readWorkspaceClientName(sessionDir)).toBe("github/autopilot");
  });

  test("strips surrounding quotes and whitespace", () => {
    const dir = makeTmpDir();
    const sessionDir = path.join(dir, "sess-q");
    writeWorkspaceYaml(sessionDir, `client_name: "github/cli"  \n`);
    expect(readWorkspaceClientName(sessionDir)).toBe("github/cli");
  });

  test("returns undefined when workspace.yaml is missing", () => {
    const dir = makeTmpDir();
    expect(readWorkspaceClientName(path.join(dir, "nope"))).toBeUndefined();
  });

  test("returns undefined when client_name is absent", () => {
    const dir = makeTmpDir();
    const sessionDir = path.join(dir, "sess-2");
    writeWorkspaceYaml(sessionDir, "id: sess-2\nrepository: a/b\n");
    expect(readWorkspaceClientName(sessionDir)).toBeUndefined();
  });

  test("returns undefined when client_name value is empty", () => {
    const dir = makeTmpDir();
    const sessionDir = path.join(dir, "sess-3");
    writeWorkspaceYaml(sessionDir, "client_name:\n");
    expect(readWorkspaceClientName(sessionDir)).toBeUndefined();
  });
});

describe("resolveClientName", () => {
  test("resolves by sessionId under the session-state dir", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "abc"), "client_name: sdk\n");
    expect(resolveClientName(stateDir, "abc")).toBe("sdk");
  });

  test("returns undefined for unknown sessionId", () => {
    const stateDir = makeTmpDir();
    expect(resolveClientName(stateDir, "missing")).toBeUndefined();
  });

  test("returns undefined for empty sessionId", () => {
    const stateDir = makeTmpDir();
    expect(resolveClientName(stateDir, "")).toBeUndefined();
  });

  test("returns undefined for unsafe sessionId values", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "safe-id"), "client_name: sdk\n");
    for (const unsafeId of ["..", "../safe-id", "safe/id", "safe\\id", "/safe-id"]) {
      expect(resolveClientName(stateDir, unsafeId)).toBeUndefined();
    }
  });
});

describe("enrichSessionsWithClient", () => {
  test("attaches clientName where resolvable and leaves others unchanged", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "cli-sess"), "client_name: github/cli\n");
    // "no-ws-sess" intentionally has no workspace.yaml.

    const sessions = [makeSession("cli-sess"), makeSession("no-ws-sess")];
    const enriched = enrichSessionsWithClient(sessions, stateDir);

    expect(enriched[0].clientName).toBe("github/cli");
    expect(enriched[1].clientName).toBeUndefined();
  });

  test("does not mutate the input sessions", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "s"), "client_name: github/cli\n");
    const original = makeSession("s");
    enrichSessionsWithClient([original], stateDir);
    expect(original.clientName).toBeUndefined();
  });
});
