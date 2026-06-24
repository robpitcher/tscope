/**
 * Shared renderer capture helpers for tests.
 *
 * These utilities isolate stdout side-effects so each test can assert on
 * the rendered output without leaking global state.
 */

import * as fs from "fs";
import * as path from "path";
import { TextRenderer } from "../../render/TextRenderer";
import { HtmlRenderer } from "../../render/HtmlRenderer";
import { JsonRenderer } from "../../render/JsonRenderer";
import { Report } from "../../types";

/** Capture all text written to stdout during a TextRenderer.render() call. */
export function captureText(report: Report): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    new TextRenderer().render(report);
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

/**
 * Render `report` as HTML to a temporary file named `filename` in
 * `process.cwd()`, read the content, delete the file, and return the HTML
 * string.
 */
export function renderHtml(report: Report, filename: string): string {
  const outPath = path.join(process.cwd(), filename);
  try {
    new HtmlRenderer(outPath).render(report);
    return fs.readFileSync(outPath, "utf8");
  } finally {
    fs.rmSync(outPath, { force: true });
  }
}

/** Capture all text written to stdout during a JsonRenderer.render() call and parse as JSON. */
export function captureJson(report: Report): ReturnType<typeof JSON.parse> {
  const chunks: string[] = [];
  const writeSpy = jest.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    new JsonRenderer().render(report);
    return JSON.parse(chunks.join(""));
  } finally {
    writeSpy.mockRestore();
  }
}
