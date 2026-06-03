/**
 * Renderer registry and factory — the extension point for output formats.
 *
 * ## How to add a phase-2 renderer (e.g. JSON, HTML)
 *   1. Create `src/render/JsonRenderer.ts` (or `HtmlRenderer.ts`) that
 *      implements the `Renderer` interface: `render(report: Report): void`.
 *   2. Import it here and register it in `RENDERER_REGISTRY`:
 *        RENDERER_REGISTRY.set('json', () => new JsonRenderer());
 *   3. Wire the CLI flag in `src/index.ts` — pass the format string to
 *      `createRenderer(format)`.  No other pipeline changes required.
 */

import { TextRenderer } from "./TextRenderer";
import { JsonRenderer } from "./JsonRenderer";
import { HtmlRenderer } from "./HtmlRenderer";

export { Renderer } from "./Renderer";
export { JsonRenderer } from "./JsonRenderer";
export { HtmlRenderer } from "./HtmlRenderer";

type RendererFactory = (outputPath?: string) => import("./Renderer").Renderer;

/**
 * Registry of available output-format renderers keyed by format name.
 * Phase 1: 'text' only.  Phase 2: 'json' and 'html'.
 *
 * Note: 'html' requires an outputPath — pass it via createRenderer's second arg.
 */
const RENDERER_REGISTRY = new Map<string, RendererFactory>([
  ["text", () => new TextRenderer()],
  ["json", () => new JsonRenderer()],
  ["html", (outputPath?: string) => new HtmlRenderer(outputPath ?? "./tscope-report.html")],
]);

/**
 * Returns a `Renderer` for the requested format.
 *
 * @param format      One of 'text', 'json', 'html'.
 * @param outputPath  Required for 'html' — path to write the .html file.
 * @throws {Error} if `format` is not registered
 */
export function createRenderer(format: string, outputPath?: string): import("./Renderer").Renderer {
  const factory = RENDERER_REGISTRY.get(format);
  if (!factory) {
    const supported = [...RENDERER_REGISTRY.keys()].join(", ");
    throw new Error(
      `Unknown renderer format: "${format}". Supported: ${supported}`
    );
  }
  return factory(outputPath);
}
