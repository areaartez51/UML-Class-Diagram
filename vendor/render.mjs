// Orchestration: spec -> layout -> svg -> standalone html (or an embeddable panel).

import { buildLayout } from './layout.mjs';
import { renderHtml } from './html.mjs';
import { renderSvg } from './svg.mjs';

/**
 * Short, stable id of the diagram. Gradient ids carry it (they are document-global
 * even when they live inside one <svg>), so several diagrams can share a page and
 * a host can re-render one without touching the others.
 *
 * FNV-1a instead of a crypto hash on purpose: the renderer must also run where
 * `node:crypto` is absent (mobile Obsidian, plain browser).
 */
function diagramUid(spec) {
  const text = JSON.stringify(spec);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function renderDiagram(spec) {
  const layout = buildLayout(spec);
  const uid = diagramUid(spec);
  const svgData = renderSvg(spec, layout, uid);
  const html = renderHtml(spec, svgData, uid);
  return {
    html,
    svg: svgData.svg,
    edges: svgData.edges,
    stats: svgData.stats,
    uid,
    warnings: layout.warnings,
  };
}

const PANEL_OPEN = '<body class="uml-page">';
const PANEL_CLOSE = '<script>';

/**
 * The diagram without the page around it: what a host (an editor view, a plugin)
 * inserts into its own container. Styles and the client script are separate exports,
 * so the host injects them once per application, not once per diagram.
 */
export function renderPanel(spec) {
  const diagram = renderDiagram(spec);
  const start = diagram.html.indexOf(PANEL_OPEN) + PANEL_OPEN.length;
  const end = diagram.html.lastIndexOf(PANEL_CLOSE);
  return {
    uid: diagram.uid,
    markup: diagram.html.slice(start, end),
    stats: diagram.stats,
    warnings: diagram.warnings,
  };
}
