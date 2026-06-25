import * as path from "path";
import {
  hasBlock,
  removeBlock,
  renderBlock,
  resolveProfileTarget,
  upsertBlock,
} from "../otel";

function blockMarkers(): { start: string; end: string } {
  const lines = renderBlock("bash").split("\n");
  return { start: lines[0], end: lines[lines.length - 1] };
}

describe("otel block transforms", () => {
  test("hasBlock is true only when both delimiters exist", () => {
    const block = renderBlock("bash");
    const { start, end } = blockMarkers();
    expect(hasBlock(block)).toBe(true);
    expect(hasBlock(start)).toBe(false);
    expect(hasBlock(end)).toBe(false);
    expect(hasBlock("")).toBe(false);
  });

  test("upsertBlock appends to empty content", () => {
    const block = renderBlock("bash");
    expect(upsertBlock("", block)).toBe(block + "\n");
  });

  test("upsertBlock appends with one blank separator for non-empty content", () => {
    const block = renderBlock("bash");
    expect(upsertBlock("export PATH=/usr/local/bin\n", block)).toBe(
      `export PATH=/usr/local/bin\n\n${block}\n`
    );
  });

  test("upsertBlock replaces an existing managed block in-place", () => {
    const oldBlock = renderBlock("bash");
    const newBlock = renderBlock("powershell");
    const content = `before\n${oldBlock}\nafter\n`;
    const updated = upsertBlock(content, newBlock);
    expect(updated).toContain(newBlock);
    expect(updated).not.toContain(
      'export COPILOT_OTEL_FILE_EXPORTER_PATH="$HOME/.copilot/tscope/otel.jsonl"'
    );
    expect(hasBlock(updated)).toBe(true);
  });

  test("upsertBlock treats malformed block order as missing and appends", () => {
    const block = renderBlock("bash");
    const { start, end } = blockMarkers();
    const malformed = `prefix\n${end}\n${start}\n`;
    const result = upsertBlock(malformed, block);
    expect(result).toBe(`${malformed.trimEnd()}\n\n${block}\n`);
  });

  test("removeBlock returns input unchanged when no valid block exists", () => {
    const { start, end } = blockMarkers();
    expect(removeBlock("plain content\n")).toBe("plain content\n");
    expect(removeBlock(`${end}\n${start}\n`)).toBe(`${end}\n${start}\n`);
  });

  test("removeBlock removes block-only content", () => {
    const block = renderBlock("bash");
    expect(removeBlock(block + "\n")).toBe("");
  });

  test("removeBlock removes block at file start", () => {
    const block = renderBlock("bash");
    const after = "alias ll='ls -la'\n";
    expect(removeBlock(`${block}\n\n${after}`)).toBe(after);
  });

  test("removeBlock removes block at file end", () => {
    const block = renderBlock("bash");
    const before = "export TEST_FLAG=1\n";
    expect(removeBlock(`${before}\n${block}\n`)).toBe(before);
  });

  test("removeBlock removes block in file middle and preserves separation", () => {
    const block = renderBlock("bash");
    const result = removeBlock(`line-a\n\n${block}\n\nline-b\n`);
    expect(result).toBe("line-a\n\nline-b\n");
  });
});

describe("otel shell target resolution and block rendering", () => {
  test("resolveProfileTarget returns a powershell target on win32", () => {
    const target = resolveProfileTarget("win32", {}, "C:\\Temp\\home");
    expect(target.shell).toBe("powershell");
    expect(target.profilePath.length).toBeGreaterThan(0);
  });

  test("resolveProfileTarget returns zsh/fish/bash profiles on non-win32", () => {
    expect(resolveProfileTarget("linux", { SHELL: "/bin/zsh" }, "/home/u")).toEqual({
      shell: "zsh",
      profilePath: path.join("/home/u", ".zshrc"),
    });
    expect(resolveProfileTarget("linux", { SHELL: "/usr/bin/fish" }, "/home/u")).toEqual({
      shell: "fish",
      profilePath: path.join("/home/u", ".config", "fish", "config.fish"),
    });
    expect(resolveProfileTarget("linux", {}, "/home/u")).toEqual({
      shell: "bash",
      profilePath: path.join("/home/u", ".bashrc"),
    });
  });

  test("renderBlock emits shell-specific assignment syntax", () => {
    expect(renderBlock("bash")).toContain(
      'export COPILOT_OTEL_FILE_EXPORTER_PATH="$HOME/.copilot/tscope/otel.jsonl"'
    );
    expect(renderBlock("zsh")).toContain(
      'export COPILOT_OTEL_FILE_EXPORTER_PATH="$HOME/.copilot/tscope/otel.jsonl"'
    );
    expect(renderBlock("fish")).toContain(
      'set -gx COPILOT_OTEL_FILE_EXPORTER_PATH "$HOME/.copilot/tscope/otel.jsonl"'
    );
    expect(renderBlock("powershell")).toContain(
      '$env:COPILOT_OTEL_FILE_EXPORTER_PATH = "$HOME\\.copilot\\tscope\\otel.jsonl"'
    );
  });
});
