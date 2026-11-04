// Side-only orthogonal routing: every edge leaves a left/right port and enters
// a left/right port. No diamonds — the arrowhead carries the direction.

import { HEADER_H, findMemberRow, textWidth } from './layout.mjs';

const HEAD_TRIANGLE = 15;
const HEAD_OPEN = 13;
const SIDE_PAD = 26;

const fmt = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

function normalize(x, y) {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

function dedupe(points) {
  const result = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (
      previous &&
      Math.abs(previous[0] - point[0]) < 0.01 &&
      Math.abs(previous[1] - point[1]) < 0.01
    ) {
      continue;
    }
    result.push(point);
  }
  return result.length >= 2 ? result : points;
}

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function pathFromPoints(points) {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${fmt(first[0])} ${fmt(first[1])} ${rest
    .map(([x, y]) => `L ${fmt(x)} ${fmt(y)}`)
    .join(' ')}`.trim();
}

export function headLength(kind) {
  return kind === 'inheritance' || kind === 'realization' ? HEAD_TRIANGLE : HEAD_OPEN;
}

function claimCorridor(x, top, bottom, used, clear) {
  let candidate = x;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const clash = used.some(
      (entry) => Math.abs(entry.x - candidate) < 16 && entry.top < bottom && entry.bottom > top,
    );
    if (!clash && clear(candidate)) {
      used.push({ x: candidate, top, bottom });
      return candidate;
    }
    candidate += 30;
  }
  used.push({ x: candidate, top, bottom });
  return candidate;
}

/**
 * Orthogonal route between two rectangles.
 * `yFrom`/`yTo` are absolute y of the ports (member row or header centre).
 */
export function routeSide(from, to, yFrom, yTo, obstacles = [], used = [], zone = null) {
  const top = Math.min(yFrom, yTo);
  const bottom = Math.max(yFrom, yTo);
  const clear = (x) =>
    obstacles.every(
      (node) => !(x > node.x - 12 && x < node.x + node.width + 12 && node.y < bottom && node.y + node.height > top),
    );
  const inside = (x) => !zone || (x > zone.left + 12 && x < zone.right - 12);
  const clampX = (x) => (zone ? Math.min(Math.max(x, zone.left + 14), zone.right - 14) : x);

  const centerFrom = from.x + from.width / 2;
  const centerTo = to.x + to.width / 2;
  const overlapping = Math.abs(centerFrom - centerTo) < (from.width + to.width) / 2 - 6;

  if (overlapping) {
    let corridor = clampX(Math.max(from.x + from.width, to.x + to.width) + SIDE_PAD);
    while ((!clear(corridor) || !inside(corridor)) && corridor < from.x + 4000) corridor += 34;
    corridor = claimCorridor(corridor, top, bottom, used, clear);
    return [
      [from.x + from.width, yFrom],
      [corridor, yFrom],
      [corridor, yTo],
      [to.x + to.width, yTo],
    ];
  }

  const toRight = centerTo > centerFrom;
  const startX = toRight ? from.x + from.width : from.x;
  const endX = toRight ? to.x : to.x + to.width;
  const midX = clampX((startX + endX) / 2);

  let corridor = null;
  if (inside(midX) && clear(midX) && !used.some((entry) => Math.abs(entry.x - midX) < 16 && entry.top < bottom && entry.bottom > top)) {
    corridor = midX;
  } else {
    const candidates = [];
    for (const node of obstacles) {
      candidates.push(node.x - 22, node.x + node.width + 22);
    }
    candidates.sort((a, b) => Math.abs(a - midX) - Math.abs(b - midX) || a - b);
    for (const candidate of candidates) {
      if (candidate <= Math.min(startX, endX) + 6 || candidate >= Math.max(startX, endX) - 6) continue;
      if (!inside(candidate)) continue;
      if (!clear(candidate)) continue;
      if (used.some((entry) => Math.abs(entry.x - candidate) < 16 && entry.top < bottom && entry.bottom > top)) continue;
      corridor = candidate;
      break;
    }
  }

  if (corridor === null) {
    let far = clampX(Math.max(from.x + from.width, to.x + to.width) + SIDE_PAD);
    while ((!clear(far) || !inside(far)) && far < from.x + 4000) far += 34;
    corridor = claimCorridor(far, top, bottom, used, clear);
    return [
      [from.x + from.width, yFrom],
      [corridor, yFrom],
      [corridor, yTo],
      [to.x + to.width, yTo],
    ];
  }

  used.push({ x: corridor, top, bottom });
  return [
    [startX, yFrom],
    [corridor, yFrom],
    [corridor, yTo],
    [endX, yTo],
  ];
}

function labelBox(text, points, ordinal = 0) {
  const width = Math.ceil(textWidth(text, 11) + 16);
  const height = 19;
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (!best || length > best.length) best = { length, x1, y1, x2, y2 };
  }
  if (!best) return null;
  const horizontal = Math.abs(best.x1 - best.x2) >= Math.abs(best.y1 - best.y2);
  const cx = horizontal ? (best.x1 + best.x2) / 2 : (best.x1 + best.x2) / 2 + 13;
  const spread = 0.22 + (ordinal % 4) * 0.16;
  const cy = horizontal
    ? (best.y1 + best.y2) / 2 - 13
    : best.y1 + (best.y2 - best.y1) * spread;
  return { text, x: cx - width / 2, y: cy - height / 2, width, height };
}

function multiplicityBox(text, point, direction, sign, side) {
  const [dx, dy] = direction;
  const width = Math.ceil(textWidth(text, 11) + 10);
  const x = point[0] + -dy * sign * 14 + dx * 10;
  const y = point[1] + dx * sign * 14 + dy * 10;
  return { text, side, x: x - width / 2, y: y - 8, width, height: 16 };
}

/** Bounding boxes of the package zones, plus the class → zone map. */
function zoneBoxes(spec, layout) {
  const zones = new Map();
  const zoneOf = new Map();
  for (const pkg of spec.packages) {
    const nodes = pkg.classes.map((id) => layout.nodes.get(id)).filter(Boolean);
    if (nodes.length === 0) continue;
    zones.set(pkg.id, {
      left: Math.min(...nodes.map((node) => node.x)) - 26,
      right: Math.max(...nodes.map((node) => node.x + node.width)) + 26,
      top: Math.min(...nodes.map((node) => node.y)) - 34,
      bottom: Math.max(...nodes.map((node) => node.y + node.height)) + 22,
    });
    for (const id of pkg.classes) zoneOf.set(id, pkg.id);
  }
  return { zones, zoneOf };
}

/**
 * Route every relation. Coordinates use the collapsed geometry; member anchors
 * are exported separately so the viewer can switch them on when expanding.
 */
function routeIntra(from, to, yFrom, yTo) {
  const exitX = from.x + from.width;
  const entryX = to.x;
  if (entryX > exitX + 8) {
    const midX = (exitX + entryX) / 2;
    if (Math.abs(yTo - yFrom) < 0.5) {
      return [
        [exitX, yFrom],
        [entryX, yTo],
      ];
    }
    return [
      [exitX, yFrom],
      [midX, yFrom],
      [midX, yTo],
      [entryX, yTo],
    ];
  }
  // Target is to the left: go around it and enter its left border from the left.
  const below = yTo >= yFrom;
  const laneY = below ? to.y + to.height + 16 : to.y - 16;
  const outX = exitX + 22;
  const inX = entryX - 22;
  return [
    [exitX, yFrom],
    [outX, yFrom],
    [outX, laneY],
    [inX, laneY],
    [inX, yTo],
    [entryX, yTo],
  ];
}

export function routeEdges(spec, layout) {
  const byId = new Map(spec.classes.map((entry) => [entry.id, entry]));
  const zoneOf = new Map();
  for (const pkg of spec.packages) {
    for (const id of pkg.classes) zoneOf.set(id, pkg.id);
  }

  const zones = new Map();
  for (const pkg of spec.packages) {
    const nodes = pkg.classes.map((id) => layout.nodes.get(id)).filter(Boolean);
    if (nodes.length === 0) continue;
    zones.set(pkg.id, {
      left: Math.min(...nodes.map((node) => node.x)) - 26,
      right: Math.max(...nodes.map((node) => node.x + node.width)) + 26,
      top: Math.min(...nodes.map((node) => node.y)) - 34,
      bottom: Math.max(...nodes.map((node) => node.y + node.height)) + 22,
    });
  }

  // Merge relations that connect the same pair of members into one line.
  const keyOf = (relation) => {
    const fromEntry = byId.get(relation.from);
    const toEntry = byId.get(relation.to);
    const fromRow = findMemberRow(fromEntry, relation.fromMember ?? toEntry?.name ?? null);
    const toRow = findMemberRow(toEntry, relation.toMember ?? fromEntry?.name ?? null);
    return fromRow && toRow
      ? relation.from + ':' + fromRow.index + '>' + relation.to + ':' + toRow.index
      : null;
  };
  const firstByKey = new Map();
  const mergedIds = new Map();
  const skip = new Set();
  for (const relation of spec.relations) {
    const key = keyOf(relation);
    if (!key) continue;
    if (firstByKey.has(key)) {
      mergedIds.get(firstByKey.get(key)).push(relation.id);
      skip.add(relation.id);
    } else {
      firstByKey.set(key, relation.id);
      mergedIds.set(relation.id, [relation.id]);
    }
  }

  const items = spec.relations
    .filter((relation) => !skip.has(relation.id))
    .map((relation) => {
      const from = layout.nodes.get(relation.from);
      const to = layout.nodes.get(relation.to);
      const fromEntry = byId.get(relation.from);
      const toEntry = byId.get(relation.to);
      const fromRow = findMemberRow(fromEntry, relation.fromMember ?? toEntry?.name ?? null);
      const toRow = findMemberRow(toEntry, relation.toMember ?? fromEntry?.name ?? null);
      return { relation, from, to, fromRow, toRow };
    })
    .filter((item) => item.from && item.to);

  const headerY = HEADER_H / 2;
  const lanes = [];

  // Phase 1: lines inside a zone. Exit on the right border of the source,
  // enter on the left border of the target.
  const intra = new Map();
  for (const item of items) {
    const pkgFrom = zoneOf.get(item.relation.from) ?? null;
    const pkgTo = zoneOf.get(item.relation.to) ?? null;
    if (pkgFrom !== pkgTo) continue;
    intra.set(
      item.relation.id,
      routeIntra(item.from, item.to, item.from.y + headerY, item.to.y + headerY),
    );
  }

  // The frame hugs its classes: no expansion by line waypoints, otherwise a single
  // detour stretches the whole zone.
  const edges = [];

  for (const item of items) {
    const relation = item.relation;
    const pkgFrom = zoneOf.get(relation.from) ?? null;
    const pkgTo = zoneOf.get(relation.to) ?? null;
    const y1 = item.from.y + headerY;
    const y2 = item.to.y + headerY;

    let points;
    let exitPoint = null;
    let entryPoint = null;

    if (pkgFrom && pkgTo && pkgFrom !== pkgTo) {
      const zoneFrom = zones.get(pkgFrom);
      const zoneTo = zones.get(pkgTo);
      const rightward = zoneTo.left + zoneTo.right > zoneFrom.left + zoneFrom.right;
      const startX = rightward ? item.from.x + item.from.width : item.from.x;
      const endX = rightward ? item.to.x : item.to.x + item.to.width;
      const exitX = rightward ? zoneFrom.right : zoneFrom.left;
      const entryX = rightward ? zoneTo.left : zoneTo.right;
      const gapMid = claimCorridor(
        (exitX + entryX) / 2,
        Math.min(y1, y2),
        Math.max(y1, y2),
        lanes,
        () => true,
      );
      exitPoint = [exitX, y1];
      entryPoint = [entryX, y2];
      points = [
        [startX, y1],
        [exitX, y1],
        [gapMid, y1],
        [gapMid, y2],
        [entryX, y2],
        [endX, y2],
      ];
    } else {
      points = intra.get(relation.id) ?? routeIntra(item.from, item.to, y1, y2);
    }

    points = dedupe(points);

    const lastIndex = points.length - 1;
    const tip = [points[lastIndex][0], points[lastIndex][1]];
    const direction = normalize(
      tip[0] - points[lastIndex - 1][0],
      tip[1] - points[lastIndex - 1][1],
    );
    const angle = (Math.atan2(direction[1], direction[0]) * 180) / Math.PI;

    const length = headLength(relation.kind);
    points = [
      ...points.slice(0, lastIndex),
      [tip[0] - direction[0] * length, tip[1] - direction[1] * length],
    ];

    const label = relation.label ? labelBox(relation.label, points, relation.index) : null;

    edges.push({
      id: relation.id,
      ordinal: relation.index,
      merged: mergedIds.get(relation.id) ?? [relation.id],
      from: relation.from,
      to: relation.to,
      kind: relation.kind,
      dir: 'side',
      points,
      path: pathFromPoints(points),
      tip,
      angle,
      gradient: { x1: points[0][0], y1: points[0][1], x2: tip[0], y2: tip[1] },
      exitPoint,
      entryPoint,
      fromAnchor: item.fromRow ? item.fromRow.y : null,
      toAnchor: item.toRow ? item.toRow.y : null,
      fromMember: item.fromRow ? item.fromRow.index : null,
      toMember: item.toRow ? item.toRow.index : null,
      label,
      pointsAttr: points.map((point) => fmt(point[0]) + ',' + fmt(point[1])).join(' '),
    });
  }

  return { edges, zones };
}
