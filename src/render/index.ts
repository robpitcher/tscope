/**
 * Renderer registry and factory — the extension point for output formats.
 *
 * JsonRenderer and HtmlRenderer are intentionally not re-exported from this
 * barrel. Re-exporting those runtime values would eagerly load their modules
 * at import time and defeat createRenderer()'s lazy-loading behavior.
 * Consumers that need a specific renderer class should import it directly
 * from "./render/JsonRenderer" or "./render/HtmlRenderer" (or the equivalent
 * dist path when consuming the published package).
 *
 * ## How to add a phase-2 renderer (e.g. JSON, HTML)
 *   1. Create `src/render/JsonRenderer.ts` (or `HtmlRenderer.ts`) that
 *      implements the `Renderer` interface: `render(report: Report): void`.
 *   2. Import it here and register it in `RENDERER_REGISTRY`:
 *        RENDERER_REGISTRY.set('json', () => new JsonRenderer());
 *   3. Wire the CLI flag in `src/index.ts` — pass the format string to
 *      `createRenderer(format)`.  No other pipeline changes required.
 */

export { Renderer } from "./Renderer";

type RendererFactory = (outputPath?: string) => Promise<import("./Renderer").Renderer>;

/**
 * Registry of available output-format renderers keyed by format name.
 * Phase 1: 'text' only.  Phase 2: 'json' and 'html'.
 *
 * Note: 'html' accepts an optional outputPath (defaults to
 * './tscope-report.html') — pass it via createRenderer's second arg.
 *
 * Factories use dynamic import() so renderer modules are only loaded when
 * the format is actually requested, keeping startup cost low for commands
 * that exit before rendering (e.g. --help, otel status).
 */
const RENDERER_REGISTRY = new Map<string, RendererFactory>([
  ["text", async () => { const { TextRenderer } = await import("./TextRenderer"); return new TextRenderer(); }],
  ["json", async () => { const { JsonRenderer } = await import("./JsonRenderer"); return new JsonRenderer(); }],
  ["html", async (outputPath?: string) => { const { HtmlRenderer } = await import("./HtmlRenderer"); return new HtmlRenderer(outputPath ?? "./tscope-report.html"); }],
]);

/**
 * Returns a `Renderer` for the requested format.
 *
 * @param format      One of 'text', 'json', 'html'.
 * @param outputPath  Optional output path for 'html' (defaults to
 *                    './tscope-report.html'); ignored for other formats.
 * @throws {Error} if `format` is not registered
 */
export async function createRenderer(format: string, outputPath?: string): Promise<import("./Renderer").Renderer> {
  const factory = RENDERER_REGISTRY.get(format);
  if (!factory) {
    const supported = [...RENDERER_REGISTRY.keys()].join(", ");
    throw new Error(
      `Unknown renderer format: "${format}". Supported: ${supported}`
    );
  }
  return factory(outputPath);
}
