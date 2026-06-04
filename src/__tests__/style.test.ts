/**
 * Tests for src/render/style.ts — ANSI bold/dim helpers and TTY/NO_COLOR
 * gating. We avoid touching the real `process.stdout.isTTY` and `process.env`
 * by always passing the dependencies in explicitly.
 */

import { ansiEnabled, bold, dim } from "../render/style";

describe("style helpers", () => {
  describe("bold()", () => {
    test("wraps text in ANSI bold escape (SGR 1) when enabled", () => {
      expect(bold("SESSION:", true)).toBe("\x1b[1mSESSION:\x1b[0m");
    });

    test("returns text unchanged when disabled", () => {
      expect(bold("SESSION:", false)).toBe("SESSION:");
    });

    test("does not modify empty strings beyond wrapping", () => {
      expect(bold("", true)).toBe("\x1b[1m\x1b[0m");
      expect(bold("", false)).toBe("");
    });
  });

  describe("dim()", () => {
    test("wraps text in ANSI dim escape (SGR 2) when enabled", () => {
      expect(dim("/path/to/events.jsonl", true)).toBe("\x1b[2m/path/to/events.jsonl\x1b[0m");
    });

    test("returns text unchanged when disabled", () => {
      expect(dim("/path/to/events.jsonl", false)).toBe("/path/to/events.jsonl");
    });
  });

  describe("ansiEnabled()", () => {
    test("returns true for a TTY stream with no NO_COLOR env var", () => {
      expect(ansiEnabled({}, { isTTY: true })).toBe(true);
    });

    test("returns false for a non-TTY stream", () => {
      expect(ansiEnabled({}, { isTTY: false })).toBe(false);
      expect(ansiEnabled({}, {})).toBe(false);
    });

    test("returns false when NO_COLOR is set to any non-empty value, even on a TTY", () => {
      expect(ansiEnabled({ NO_COLOR: "1" }, { isTTY: true })).toBe(false);
      expect(ansiEnabled({ NO_COLOR: "true" }, { isTTY: true })).toBe(false);
      expect(ansiEnabled({ NO_COLOR: "anything" }, { isTTY: true })).toBe(false);
    });

    test("returns true when NO_COLOR is the empty string on a TTY (per no-color.org spec)", () => {
      // The spec says NO_COLOR must be PRESENT and NON-EMPTY to disable colors.
      // An empty NO_COLOR should not suppress styling.
      expect(ansiEnabled({ NO_COLOR: "" }, { isTTY: true })).toBe(true);
    });
  });
});
