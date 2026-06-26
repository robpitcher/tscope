import * as fs from "fs";
import * as path from "path";
import { createRenderer } from "../render";
import { Report } from "../types";
import { makeTmpDir } from "./helpers/fs";

const EMPTY_REPORT: Report = {
  sessions: [],
  inProgressSessions: [],
  reportDate: "2026-06-10",
  filterDescription: "all time",
  source: "logs",
  costAvailable: false,
  coverage: { otelCount: 0, logsCount: 0, costCoverage: "none" },
};

describe("createRenderer", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = makeTmpDir("tscope-render-factory-");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("throws a clear error for unknown renderer format", () => {
    expect(() => createRenderer("markdown")).toThrow(
      'Unknown renderer format: "markdown". Supported: text, json, html'
    );
  });

  test("html renderer writes to an explicit output path when provided", () => {
    const outputPath = path.join(tmpDir, "explicit-report.html");
    const renderer = createRenderer("html", outputPath);
    renderer.render(EMPTY_REPORT);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test("html renderer falls back to ./tscope-report.html when no path is provided", () => {
    const testCwd = path.join(tmpDir, "cwd");
    fs.mkdirSync(testCwd, { recursive: true });
    process.chdir(testCwd);
    const defaultHtml = path.resolve(process.cwd(), "tscope-report.html");
    const renderer = createRenderer("html");
    renderer.render(EMPTY_REPORT);
    expect(fs.existsSync(defaultHtml)).toBe(true);
  });
});
