// SVG assembly: coloured class boxes, gradient side arrows, member containers.

import {
  EXPANDER_H,
  HEADER_H,
  MEMBER_TOP_PAD,
  SECTION_LINE_H,
  SECTION_TITLE_H,
  memberRows,
} from './layout.mjs';
import { MEMBER_GROUPS, MEMBER_TITLES } from './model.mjs';
import { escapeXml, routeEdges } from './routing.mjs';

const fmt = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Golden-angle hue: neighbouring classes never share a colour family. */
export function hueFor(index) {
  return ((index * 137.508) % 360 + 360) % 360;
}

export function classColor(index) {
  return `hsl(${fmt(hueFor(index))} 68% 56%)`;
}

function packageFrame(pkg, zone) {
  if (!zone) return '';
  const left = zone.left;
  const right = zone.right;
  const top = zone.top;
  const bottom = zone.bottom;
  const labelWidth = Math.ceil([...pkg.label].length * 7.4 + 20);

  return `<g class="package" data-package="${escapeXml(pkg.id)}" data-members="${escapeXml(
    pkg.classes.join(','),
  )}">
    <rect class="package-frame" x="${fmt(left)}" y="${fmt(top)}" width="${fmt(
      right - left,
    )}" height="${fmt(bottom - top)}" rx="12"/>
    <rect class="package-hit" x="${fmt(left)}" y="${fmt(top)}" width="${fmt(
      right - left,
    )}" height="${fmt(bottom - top)}" rx="12"/>
    <g class="package-label" transform="translate(${fmt(left + 14)},${fmt(top - 12)})">
      <rect width="${labelWidth}" height="24" rx="7"/>
      <text x="10" y="16">${escapeXml(pkg.label)}</text>
    </g>
  </g>`;
}

function membersMarkup(entry, width, offsetY) {
  const groups = [];
  let y = MEMBER_TOP_PAD;
  let row = 0;

  for (const group of MEMBER_GROUPS) {
    const items = entry[group] ?? [];
    if (items.length === 0) continue;
    const height = SECTION_TITLE_H + items.length * SECTION_LINE_H;
    const lines = items
      .map((line, index) => {
        const mix = 48 + ((row + index) % 4) * 12;
        const rowIndex = row + index;
        return `<g class="member-row" data-member="${rowIndex}">
          <rect class="member-bg" x="1" y="${SECTION_TITLE_H + index * SECTION_LINE_H - 1}" width="${fmt(
            width - 2,
          )}" height="${SECTION_LINE_H}"/>
          <text class="member" x="26" y="${SECTION_TITLE_H + 13 + index * SECTION_LINE_H}" style="--mix:${mix}%">${escapeXml(
            line,
          )}</text>
        </g>`;
      })
      .join('');
    groups.push(`<g transform="translate(0,${fmt(y)})" data-member-section="${group}">
      <line class="sep" x1="0" y1="0" x2="${fmt(width)}" y2="0"/>
      <text class="section" x="14" y="17">${escapeXml(MEMBER_TITLES[group])}</text>
      ${lines}
    </g>`);
    y += height;
    row += items.length;
  }

  if (groups.length === 0) return '';
  return `<g class="members" transform="translate(0,${fmt(offsetY)})" hidden="">${groups.join('')}</g>`;
}

function expanderMarkup(width, offsetY) {
  const cx = width / 2;
  return `<g class="expander" data-expand-toggle="" role="button" tabindex="0" aria-expanded="false" transform="translate(0,${fmt(
    offsetY,
  )})">
    <rect class="expander-bg" width="${fmt(width)}" height="${EXPANDER_H}" rx="0"/>
    <path class="chev" d="M ${fmt(cx - 6)} 8 L ${fmt(cx)} 13 L ${fmt(cx + 6)} 8"/>
  </g>`;
}

function pinsMarkup(entry, node, hue, used) {
  if (!node.hasMembers || used.size === 0) return '';
  const rows = memberRows(entry).filter((row) => used.has(row.index));
  if (rows.length === 0) return '';
  const circles = rows
    .map((row) => {
      const color = memberColor(entry, row.index, hue);
      const y = fmt(row.y);
      return `<g class="pin-group" data-node="${escapeXml(entry.id)}" data-member="${
        row.index
      }" data-side="left">
        <line class="pin-stem" x1="1" y1="${y}" x2="12" y2="${y}" stroke="${color}"/>
        <circle class="pin" cx="0" cy="${y}" r="4" fill="${color}"/>
      </g>
      <g class="pin-group" data-node="${escapeXml(entry.id)}" data-member="${
        row.index
      }" data-side="right">
        <line class="pin-stem" x1="${fmt(node.width - 1)}" y1="${y}" x2="${fmt(
          node.width - 12,
        )}" y2="${y}" stroke="${color}"/>
        <circle class="pin" cx="${fmt(node.width)}" cy="${y}" r="4" fill="${color}"/>
      </g>`;
    })
    .join('');
  return `<g class="pins" hidden="">${circles}</g>`;
}

function nodeMarkup(entry, node, neighbors, hue, used = new Set(), packageId = '') {
  const width = node.width;
  const stereotype = entry.stereotype ? `«${entry.stereotype}»` : '';
  const hasMembers = node.hasMembers;

  return `<g class="node st-${entry.stereotype ?? 'class'}" data-node="${escapeXml(
    entry.id,
  )}" data-name="${escapeXml(entry.name)}" data-pkg="${escapeXml(
    packageId,
  )}" data-expanded="false" data-neighbors="${escapeXml(
    neighbors,
  )}" data-expand-delta="${fmt(node.membersHeight)}" data-has-members="${
    hasMembers ? '1' : '0'
  }" data-x="${fmt(node.x)}" data-y="${fmt(node.y)}" data-orig-x="${fmt(node.x)}" data-orig-y="${fmt(
    node.y,
  )}" data-w="${fmt(width)}" data-h="${fmt(
    node.height,
  )}" style="--h:${fmt(hue)}; --c:hsl(${fmt(hue)} 68% 56%)" transform="translate(${fmt(
    node.x,
  )},${fmt(node.y)})" role="group" aria-label="${escapeXml(entry.name)}">
    <rect class="box" width="${fmt(width)}" height="${fmt(node.height)}" rx="10"/>
    <rect class="body" x="1" y="${HEADER_H}" width="${fmt(width - 2)}" height="${fmt(
      node.membersHeight,
    )}" rx="8" hidden=""/>
    <rect class="stripe" width="5" height="${fmt(node.height)}" rx="2.5"/>
    ${
      stereotype
        ? `<text class="stereo" x="18" y="22">${escapeXml(stereotype)}</text>`
        : ''
    }
    <text class="name" x="18" y="${stereotype ? 45 : 36}">${escapeXml(entry.name)}</text>
    ${hasMembers ? membersMarkup(entry, width, HEADER_H) : ''}
    ${hasMembers ? expanderMarkup(width, HEADER_H) : ''}
    ${hasMembers ? pinsMarkup(entry, node, hue, used) : ''}
  </g>`;
}

function headMarkup(kind, tip, angle, color) {
  const shape =
    kind === 'inheritance' || kind === 'realization'
      ? '<polygon class="head-tri" points="0,0 -15,8 -15,-8"/>'
      : '<path class="head-open" d="M -13 -6 L 0 0 L -13 6"/>';
  return `<g class="head-wrap" transform="translate(${fmt(tip[0])},${fmt(tip[1])}) rotate(${fmt(
    angle,
  )})" style="--head:${color}">${shape}</g>`;
}

function labelMarkup(label) {
  if (!label) return '';
  return `<g class="edge-label" transform="translate(${fmt(label.x)},${fmt(label.y)})">
    <rect width="${label.width}" height="${label.height}" rx="6"/>
    <text x="${label.width / 2}" y="13" text-anchor="middle">${escapeXml(label.text)}</text>
  </g>`;
}

function edgeMarkup(edge, colorFrom, colorTo, uid) {
  return `<g class="edge k-${edge.kind}" data-edge="${escapeXml(edge.id)}" data-merged="${escapeXml(
    (edge.merged ?? [edge.id]).join(','),
  )}" data-from="${escapeXml(
    edge.from,
  )}" data-to="${escapeXml(edge.to)}" data-kind="${edge.kind}" data-dir="side" data-ordinal="${
    edge.ordinal
  }" data-tip="${fmt(edge.tip[0])},${fmt(edge.tip[1])}" data-from-member="${
    edge.fromMember === null ? '' : edge.fromMember
  }" data-to-member="${edge.toMember === null ? '' : edge.toMember}" data-from-anchor="${
    edge.fromAnchor === null ? '' : fmt(edge.fromAnchor)
  }" data-to-anchor="${edge.toAnchor === null ? '' : fmt(edge.toAnchor)}" data-points="${
    edge.pointsAttr
  }">
    <path class="edge-hit" d="${edge.path}"/>
    <path class="line" d="${edge.path}" stroke="url(#eg-${uid}-${escapeXml(edge.id)})"/>
    ${
      edge.exitPoint
        ? `<circle class="zonepin" data-role="exit" cx="${fmt(edge.exitPoint[0])}" cy="${fmt(
            edge.exitPoint[1],
          )}" r="3.5"/>`
        : ''
    }
    ${
      edge.entryPoint
        ? `<circle class="zonepin" data-role="entry" cx="${fmt(edge.entryPoint[0])}" cy="${fmt(
            edge.entryPoint[1],
          )}" r="3.5"/>`
        : ''
    }
    ${headMarkup(edge.kind, edge.tip, edge.angle, colorTo)}
    ${labelMarkup(edge.label)}
  </g>`;
}

function gradientDef(edge, colorFrom, colorTo, uid) {
  return `<linearGradient id="eg-${uid}-${escapeXml(edge.id)}" gradientUnits="userSpaceOnUse" x1="${fmt(
    edge.gradient.x1,
  )}" y1="${fmt(edge.gradient.y1)}" x2="${fmt(edge.gradient.x2)}" y2="${fmt(
    edge.gradient.y2,
  )}">
      <stop offset="0%" stop-color="${colorFrom}"/>
      <stop offset="16%" stop-color="${colorFrom}"/>
      <stop offset="84%" stop-color="${colorTo}"/>
      <stop offset="100%" stop-color="${colorTo}"/>
    </linearGradient>`;
}

/** Colour of a concrete member row: a lighter shade of its class colour. */
function memberColor(entry, index, hue) {
  if (!entry || index === null || index === undefined || index === '') return null;
  const rows = memberRows(entry);
  if (!rows.some((row) => row.index === Number(index))) return null;
  const light = 58 + (Number(index) % 4) * 5;
  return `hsl(${fmt(hue)} 62% ${light}%)`;
}

/**
 * Build the full SVG document fragment and per-diagram statistics.
 */
export function renderSvg(spec, layout, uid = '') {
  const { edges, zones } = routeEdges(spec, layout);
  const colorOf = new Map(spec.classes.map((entry, index) => [entry.id, classColor(index)]));
  const hueOf = new Map(spec.classes.map((entry, index) => [entry.id, hueFor(index)]));

  const usedByNode = new Map();
  for (const edge of edges) {
    if (edge.fromMember !== null) {
      if (!usedByNode.has(edge.from)) usedByNode.set(edge.from, new Set());
      usedByNode.get(edge.from).add(edge.fromMember);
    }
    if (edge.toMember !== null) {
      if (!usedByNode.has(edge.to)) usedByNode.set(edge.to, new Set());
      usedByNode.get(edge.to).add(edge.toMember);
    }
  }

  const packages = spec.packages
    .map((pkg) => packageFrame(pkg, zones.get(pkg.id)))
    .join('');

  const entryById = new Map(spec.classes.map((entry) => [entry.id, entry]));
  const colorsOf = (edge) => ({
    from:
      memberColor(entryById.get(edge.from), edge.fromMember, hueOf.get(edge.from)) ??
      colorOf.get(edge.from),
    to:
      memberColor(entryById.get(edge.to), edge.toMember, hueOf.get(edge.to)) ??
      colorOf.get(edge.to),
  });

  const defs = edges
    .map((edge) => {
      const colors = colorsOf(edge);
      return gradientDef(edge, colors.from, colors.to, uid);
    })
    .join('');

  const edgeLayer = edges
    .map((edge) => {
      const colors = colorsOf(edge);
      return edgeMarkup(edge, colors.from, colors.to, uid);
    })
    .join('');

  const zoneOf = new Map();
  for (const pkg of spec.packages) {
    for (const id of pkg.classes) zoneOf.set(id, pkg.id);
  }

  const nodeLayer = spec.classes
    .map((entry) => {
      const node = layout.nodes.get(entry.id);
      if (!node) return '';
      const neighbors = [...(spec.neighbors.get(entry.id) ?? [])].sort().join(',');
      return nodeMarkup(
        entry,
        node,
        neighbors,
        hueOf.get(entry.id),
        usedByNode.get(entry.id),
        zoneOf.get(entry.id) ?? '',
      );
    })
    .join('');

  const minX = Math.min(0, ...edges.flatMap((edge) => edge.points.map((point) => point[0])));
  const minY = Math.min(0, ...edges.flatMap((edge) => edge.points.map((point) => point[1])));
  const maxX = Math.max(layout.width, ...edges.flatMap((edge) => edge.points.map((point) => point[0])));
  const maxY = Math.max(layout.height, ...edges.flatMap((edge) => edge.points.map((point) => point[1])));

  const originX = Math.floor(minX) - 24;
  const originY = Math.floor(minY) - 24;
  const viewWidth = Math.ceil(maxX - originX + 48);
  const viewHeight = Math.ceil(maxY - originY + 48);

  const svg = `<svg class="diagram" data-uml="canvas" data-uid="${uid}" xmlns="http://www.w3.org/2000/svg" viewBox="${originX} ${originY} ${viewWidth} ${viewHeight}" width="${viewWidth}" height="${viewHeight}" role="img" aria-label="${escapeXml(spec.title)}">
  <defs>${defs}</defs>
  <g class="layer-packages">${packages}</g>
  <g class="layer-edges">${edgeLayer}</g>
  <g class="layer-nodes">${nodeLayer}</g>
</svg>`;

  return {
    svg,
    edges,
    stats: {
      classes: spec.classes.length,
      relations: spec.relations.length,
      packages: spec.packages.length,
      width: viewWidth,
      height: viewHeight,
    },
  };
}
