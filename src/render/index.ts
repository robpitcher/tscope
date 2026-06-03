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

export { Renderer } from "./Renderer";
export { TextRenderer } from "./TextRenderer";

type RendererFactory = () => import("./Renderer").Renderer;

/**
 * Registry of available output-format renderers keyed by format name.
 * Phase 1: 'text' only.  Phase 2: add 'json' and 'html' here.
 */
const RENDERER_REGISTRY: Map<string, RendererFactory> = new Map([
  ["text", () => new TextRenderer()],
]);

/**
 * Returns a `Renderer` for the requested format.
 *
 * Phase 1 supports `'text'` only.  Future formats ('json', 'html') are
 * registered in `RENDERER_REGISTRY` — no other pipeline code needs to change.
 *
 * @throws {Error} if `format` is not registered
 */
export function createRenderer(format: string): import("./Renderer").Renderer {
  const factory = RENDERER_REGISTRY.get(format);
  if (!factory) {
    const supported = [...RENDERER_REGISTRY.keys()].join(", ");
    throw new Error(
      `Unknown renderer format: "${format}". Supported: ${supported}`
    );
  }
  return factory();
}
