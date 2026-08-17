/**
 * Tests for workspace.ts — reading the client (agentic surface) from
 * workspace.yaml and enriching sessions by sessionId.
 */

import fs = require("fs");
import * as path from "path";
import {
  readWorkspaceClientName,
  readWorkspaceSessionName,
  resolveClientName,
  resolveSessionName,
  enrichSessionsWithWorkspace,
} from "../workspace";
import { InProgressSession, NormalizedSession } from "../types";
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

describe("readWorkspaceSessionName", () => {
  test("reads an unquoted session name", () => {
    const dir = makeTmpDir();
    const sessionDir = path.join(dir, "named");
    writeWorkspaceYaml(sessionDir, "client_name: github/cli\nname: Create Implementation Plan\n");
    expect(readWorkspaceSessionName(sessionDir)).toBe("Create Implementation Plan");
  });

  test("strips surrounding quotes and whitespace", () => {
    const dir = makeTmpDir();
    const sessionDir = path.join(dir, "quoted");
    writeWorkspaceYaml(sessionDir, `name: "Fix the dashboard"  \n`);
    expect(readWorkspaceSessionName(sessionDir)).toBe("Fix the dashboard");
  });

  test("does not mistake client_name for name", () => {
    const dir = makeTmpDir();
    const sessionDir = path.join(dir, "client-only");
    writeWorkspaceYaml(sessionDir, "client_name: github/cli\n");
    expect(readWorkspaceSessionName(sessionDir)).toBeUndefined();
  });

  test.each(["name:\n", "name:   \n", "id: no-name\n"])(
    "returns undefined for an absent or empty value",
    (body) => {
      const dir = makeTmpDir();
      const sessionDir = path.join(dir, "empty-name");
      writeWorkspaceYaml(sessionDir, body);
      expect(readWorkspaceSessionName(sessionDir)).toBeUndefined();
    }
  );

  test("returns undefined when workspace.yaml is missing or unreadable", () => {
    const dir = makeTmpDir();
    expect(readWorkspaceSessionName(path.join(dir, "missing"))).toBeUndefined();

    const sessionDir = path.join(dir, "unreadable");
    fs.mkdirSync(path.join(sessionDir, "workspace.yaml"), { recursive: true });
    expect(readWorkspaceSessionName(sessionDir)).toBeUndefined();
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

describe("resolveSessionName", () => {
  test("resolves by safe sessionId and rejects unsafe values", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "safe-id"), "name: Friendly session\n");
    expect(resolveSessionName(stateDir, "safe-id")).toBe("Friendly session");
    for (const unsafeId of ["", "..", "../safe-id", "safe/id", "safe\\id", "/safe-id"]) {
      expect(resolveSessionName(stateDir, unsafeId)).toBeUndefined();
    }
  });
});

describe("enrichSessionsWithWorkspace", () => {
  test("attaches both workspace fields and leaves unresolved sessions unchanged", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(
      path.join(stateDir, "cli-sess"),
      "client_name: github/cli\nname: Dashboard work\n"
    );
    // "no-ws-sess" intentionally has no workspace.yaml.

    const sessions = [makeSession("cli-sess"), makeSession("no-ws-sess")];
    const enriched = enrichSessionsWithWorkspace(sessions, stateDir);

    expect(enriched[0].clientName).toBe("github/cli");
    expect(enriched[0].sessionName).toBe("Dashboard work");
    expect(enriched[1].clientName).toBeUndefined();
    expect(enriched[1]).toBe(sessions[1]);
  });

  test("does not mutate the input sessions", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "s"), "client_name: github/cli\n");
    const original = makeSession("s");
    enrichSessionsWithWorkspace([original], stateDir);
    expect(original.clientName).toBeUndefined();
  });

  test("reads workspace.yaml once per session while extracting both fields", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(
      path.join(stateDir, "one-read"),
      "client_name: github/cli\nname: Read once\n"
    );
    const readSpy = jest.spyOn(fs, "readFileSync");
    try {
      const enriched = enrichSessionsWithWorkspace([makeSession("one-read")], stateDir);
      expect(enriched[0]).toMatchObject({
        clientName: "github/cli",
        sessionName: "Read once",
      });
      expect(readSpy).toHaveBeenCalledTimes(1);
    } finally {
      readSpy.mockRestore();
    }
  });

  test("enriches in-progress sessions with their friendly name", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "active"), "name: Active dashboard work\n");
    const active: InProgressSession = {
      sessionId: "active",
      eventsPath: "/x/active/events.jsonl",
      startTime: "2026-06-02T20:00:00.000Z",
      chronicleTips: [],
      inProgress: true,
    };
    const [enriched] = enrichSessionsWithWorkspace([active], stateDir);
    expect(enriched.sessionName).toBe("Active dashboard work");
    expect(active.sessionName).toBeUndefined();
  });

  test("preserves existing metadata when workspace fields are absent", () => {
    const stateDir = makeTmpDir();
    writeWorkspaceYaml(path.join(stateDir, "partial"), "client_name: github/cli\n");
    const original = {
      ...makeSession("partial"),
      clientName: "existing/client",
      sessionName: "Existing name",
    };

    const [enriched] = enrichSessionsWithWorkspace([original], stateDir);

    expect(enriched.clientName).toBe("github/cli");
    expect(enriched.sessionName).toBe("Existing name");
  });
});
