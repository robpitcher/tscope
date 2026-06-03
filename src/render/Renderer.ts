import { Report } from "../types";

/**
 * Renderer interface — pluggable output format.
 * Phase 1 implements TextRenderer.
 * Future: HtmlRenderer, JsonRenderer.
 */
export interface Renderer {
  render(report: Report): void;
}
