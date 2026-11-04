// Styles for the diagram shell. Kept as a string so the same CSS serves the
// standalone HTML file and any host that embeds the renderer (e.g. an editor plugin).

export const STYLE = `
.uml-diagram {
  --bg: #0e1116;
  --panel: #171b22;
  --ink: #e5e7eb;
  --ink-soft: #c3c9d4;
  --ink-mute: #8b93a3;
  --line: #2c333f;
  --accent: #60a5fa;
  --accent-soft: #1e3a5f;
  --pkg: #5b6675;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.35);
  --class-alpha: 26%;
  --line-scale: 1;
  color-scheme: dark;
}
.uml-diagram[data-theme="light"] {
  --bg: #f6f7f9;
  --panel: #ffffff;
  --ink: #111827;
  --ink-soft: #4b5563;
  --ink-mute: #6b7280;
  --line: #c3c9d4;
  --accent: #2563eb;
  --accent-soft: #dbeafe;
  --pkg: #94a3b8;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.06);
  color-scheme: light;
}
.uml-diagram *, .uml-diagram *::before, .uml-diagram *::after { box-sizing: border-box; }
.uml-diagram [hidden] { display: none !important; }
.uml-page { margin: 0; height: 100%; overflow: hidden; }
.uml-diagram {
  background: var(--bg);
  color: var(--ink);
  font-family: "Segoe UI", "Inter", system-ui, -apple-system, sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  height: 100%;
  position: relative;
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
  box-shadow: var(--shadow);
  z-index: 2;
}
.title { font-size: 15px; font-weight: 650; letter-spacing: 0.1px; white-space: nowrap; }
.meta { font-size: 12px; color: var(--ink-mute); white-space: nowrap; }
.spacer { flex: 1; }
.panel-dock {
  position: absolute;
  right: 14px;
  bottom: 12px;
  z-index: 7;
  display: grid;
  gap: 8px;
  justify-items: end;
}
.panel-toggle[aria-expanded="true"] { border-color: var(--accent); color: var(--accent); }
.panel {
  display: grid;
  gap: 10px;
  width: min(300px, 78vw);
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: 0 16px 40px rgba(0, 0, 0, .45);
}
.panel-row { display: grid; gap: 7px; }
.panel .slider { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--ink-soft); }
.panel .slider input { flex: 1; width: auto; }
/* Short actions sit side by side; labels that need the room take a whole row. */
.panel-pairs { grid-template-columns: 1fr 1fr; gap: 6px; }
.panel-wide { gap: 6px; }
.panel-pairs button, .panel-wide button { width: 100%; }
.search {
  width: 190px;
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  outline: none;
}
.search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
button {
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink-soft);
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
}
button:hover { border-color: var(--accent); color: var(--accent); }
.slider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-mute);
  white-space: nowrap;
}
.slider input { width: 110px; accent-color: var(--accent); }
.wrap { position: relative; flex: 1; overflow: hidden; cursor: grab; }
.wrap.dragging { cursor: grabbing; }
.diagram { position: absolute; top: 0; left: 0; transform-origin: 0 0; overflow: visible; }
.legend {
  position: absolute;
  left: 18px;
  bottom: 12px;
  max-width: min(360px, calc(100% - 190px));
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow);
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.35;
}
.legend-hint { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--line); color: var(--ink-mute); font-size: 11.5px; line-height: 1.45; }
.legend h4 { margin: 0 0 8px; font-size: 12px; letter-spacing: .3px; color: var(--ink); }
.legend-row { display: flex; align-items: center; gap: 9px; margin: 7px 0; }
.legend-row svg { flex: 0 0 auto; }
.legend-note { margin-top: 9px; color: var(--ink-mute); font-size: 11px; }
.package-frame {
  fill: color-mix(in srgb, var(--pkg) 6%, transparent);
  stroke: var(--pkg);
  stroke-width: 1;
  stroke-dasharray: 5 5;
  opacity: .55;
  pointer-events: none;
}
.package-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 18;
  pointer-events: stroke;
  cursor: move;
}
.package-label { cursor: move; }
.package-label rect { fill: var(--panel); stroke: var(--pkg); stroke-width: 1; }
.package-label text { fill: var(--ink-mute); font-size: 11px; font-weight: 600; letter-spacing: .3px; }
.node { cursor: move; transition: opacity .15s ease; }
.node .box {
  fill: color-mix(in srgb, var(--c) var(--class-alpha), var(--panel));
  stroke: var(--c);
  stroke-width: 1.6;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .25));
  transition: stroke .15s ease, opacity .15s ease, stroke-width .15s ease;
}
.node .body {
  fill: color-mix(in srgb, var(--c) 7%, var(--panel));
  stroke: var(--line);
  stroke-width: 1;
}
.node .stripe { fill: var(--c); }
.node .stereo { fill: color-mix(in srgb, var(--c) 72%, var(--ink)); font-size: 11px; letter-spacing: .2px; }
.node .name { fill: var(--ink); font-size: 15px; font-weight: 650; }
.node .sep { stroke: color-mix(in srgb, var(--c) 40%, var(--line)); stroke-width: 1; }
.node .section { fill: color-mix(in srgb, hsl(var(--h) 58% 60%) 60%, var(--ink)); font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
.node .member { fill: color-mix(in srgb, hsl(var(--h) 62% 65%) var(--mix, 60%), var(--ink)); font-size: 12px; font-family: "JetBrains Mono", "Cascadia Code", ui-monospace, monospace; }
.member-row { cursor: pointer; }
.member-row .member-bg { fill: color-mix(in srgb, var(--c) 22%, transparent); opacity: 0; transition: opacity .12s ease; }
.member-row:hover .member-bg, .member-row.hl .member-bg { opacity: 1; }
.node .expander-bg { fill: color-mix(in srgb, var(--c) 10%, transparent); }
.node .chev { fill: none; stroke: color-mix(in srgb, var(--c) 70%, var(--ink)); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.node .expander:hover .chev { stroke: var(--ink); }
.node.st-abstract .name { font-style: italic; }
.edge .line { fill: none; stroke-width: calc(1.8px * var(--line-scale)); stroke-linejoin: round; stroke-linecap: round; }
.edge-hit { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; }
.edge.frozen .line { stroke-width: calc(3.4px * var(--line-scale)); }
.edge.frozen .head-tri, .edge.frozen .head-open { stroke-width: calc(2px * var(--line-scale)); }
svg.has-freeze .edge:not(.frozen) { opacity: .12; }
svg.has-freeze .node:not(.frozen-endpoint) { opacity: .2; }
svg.has-freeze .package { opacity: .3; }
svg.has-freeze .node.frozen-endpoint .box { stroke-width: 2.2; }
.edge.k-dependency .line, .edge.k-realization .line { stroke-dasharray: 6 5; }
.head-tri { fill: var(--panel); stroke: var(--head); stroke-width: calc(1.5px * var(--line-scale)); stroke-linejoin: round; }
.head-open { fill: none; stroke: var(--head); stroke-width: calc(1.8px * var(--line-scale)); stroke-linecap: round; stroke-linejoin: round; }
.pin { stroke: var(--panel); stroke-width: calc(1.6px * var(--line-scale)); }
.zonepin { fill: var(--panel); stroke: var(--ink-mute); stroke-width: calc(1.5px * var(--line-scale)); }
.pin-stem { stroke-width: calc(2px * var(--line-scale)); stroke-linecap: round; opacity: .85; }
.pin-group.off { display: none; }
.pin.off { display: none; }
.pins { pointer-events: none; }
.edge-label rect { fill: var(--panel); stroke: var(--line); stroke-width: .8; }
.edge-label text { fill: var(--ink-soft); font-size: 11px; font-family: "JetBrains Mono", ui-monospace, monospace; }
.node.dim { opacity: .2; }
.edge.dim { opacity: .1; }
.edge.hl .line { stroke-width: calc(3px * var(--line-scale)); filter: brightness(1.35); }
.node.hl .box { stroke-width: 2.8; }
.node.hit .box { stroke-width: 3; }
`;
