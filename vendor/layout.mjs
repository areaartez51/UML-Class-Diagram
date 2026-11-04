// Deterministic layered layout for class diagrams.
// Ranks by inheritance/realization/composition/aggregation (downward),
// order within a rank by barycenter passes, coordinates by simple stacking.

import { DOWN_KINDS, MEMBER_GROUPS, MEMBER_TITLES } from './model.mjs';

export const HEADER_H = 56;
export const EXPANDER_H = 20;
export const SECTION_TITLE_H = 24;
export const SECTION_LINE_H = 17;
export const MEMBER_TOP_PAD = 10;
export const MEMBER_BOTTOM_PAD = 6;

const MIN_WIDTH = 170;
const COL_GAP = 110;
const ROW_GAP = 56;
const MARGIN = 84;
const WRAP_WIDTH = 1800;
const GROUP_GAP = 170;

const NAME_SIZE = 15;
const META_SIZE = 11;
const MEMBER_SIZE = 12;

function charWidth(size, mono) {
  return size * (mono ? 0.66 : 0.62);
}

export function textWidth(text, size, mono = false) {
  return [...String(text)].length * charWidth(size, mono);
}

export function sectionHeight(count) {
  return SECTION_TITLE_H + count * SECTION_LINE_H;
}

/**
 * Vertical centres of member rows relative to the node's top edge.
 * Used to attach edges to a concrete field, constructor or method.
 */
export function memberRows(entry) {
  const rows = [];
  let y = HEADER_H + MEMBER_TOP_PAD;
  let index = 0;
  for (const group of MEMBER_GROUPS) {
    const items = entry[group] ?? [];
    if (items.length === 0) continue;
    y += SECTION_TITLE_H;
    for (const line of items) {
      rows.push({ group, text: line, index, y: y + SECTION_LINE_H / 2 + 1 });
      y += SECTION_LINE_H;
      index += 1;
    }
  }
  return rows;
}

/** First member row whose text mentions `needle`. */
export function findMemberRow(entry, needle) {
  if (!needle) return null;
  const query = String(needle).toLowerCase();
  for (const row of memberRows(entry)) {
    if (row.text.toLowerCase().includes(query)) return row;
  }
  return null;
}

/** First member row whose text mentions `needle`; null when nothing matches. */
export function findMemberAnchor(entry, needle) {
  if (!needle) return null;
  const query = String(needle).toLowerCase();
  for (const row of memberRows(entry)) {
    if (row.text.toLowerCase().includes(query)) return row.y;
  }
  return null;
}

/** Size of a class box in collapsed state plus the height of its member area. */
export function measureClass(entry) {
  const hasMembers = MEMBER_GROUPS.some((group) => (entry[group] ?? []).length > 0);

  const nameWidth = textWidth(entry.name, NAME_SIZE) + 32;
  const stereoWidth = entry.stereotype
    ? textWidth(`«${entry.stereotype}»`, META_SIZE) + 32
    : 0;

  let membersWidth = 0;
  let membersHeight = 0;
  if (hasMembers) {
    membersHeight = MEMBER_TOP_PAD + MEMBER_BOTTOM_PAD;
    for (const group of MEMBER_GROUPS) {
      const items = entry[group] ?? [];
      if (items.length === 0) continue;
      membersHeight += sectionHeight(items.length);
      membersWidth = Math.max(
        membersWidth,
        textWidth(MEMBER_TITLES[group], META_SIZE) + 32,
      );
      for (const line of items) {
        membersWidth = Math.max(membersWidth, textWidth(line, MEMBER_SIZE, true) + 40);
      }
    }
  }

  const width = Math.max(MIN_WIDTH, Math.ceil(Math.max(nameWidth, stereoWidth, membersWidth)));
  const height = HEADER_H + (hasMembers ? EXPANDER_H : 0);

  return { width, height, membersHeight, hasMembers };
}

/** Rank assignment over downward edges, ignoring back edges that form cycles. */
function assignRanks(spec) {
  const ids = spec.classes.map((entry) => entry.id);
  const out = new Map(ids.map((id) => [id, []]));
  const down = spec.relations
    .filter(
      (relation) => DOWN_KINDS.has(relation.kind) && out.has(relation.from) && out.has(relation.to),
    )
    .map((relation) => {
      // Inheritance and realization point at the parent: the parent ranks above the child.
      const inverted = relation.kind === 'inheritance' || relation.kind === 'realization';
      return inverted ? { ...relation, from: relation.to, to: relation.from } : relation;
    });
  for (const relation of down) out.get(relation.from).push(relation);

  const state = new Map();
  const kept = [];
  const warnings = [];

  const visit = (id) => {
    state.set(id, 1);
    for (const relation of out.get(id) || []) {
      const target = relation.to;
      const seen = state.get(target) || 0;
      if (seen === 1) {
        warnings.push(
          `relations[${relation.index}]: cycle in inheritance/realization chain, edge ignored for ranking`,
        );
        continue;
      }
      if (seen === 0) visit(target);
      kept.push(relation);
    }
    state.set(id, 2);
  };

  for (const id of ids) {
    if (!state.get(id)) visit(id);
  }

  const indegree = new Map(ids.map((id) => [id, 0]));
  const adjacency = new Map(ids.map((id) => [id, []]));
  for (const relation of kept) {
    adjacency.get(relation.from).push(relation.to);
    indegree.set(relation.to, indegree.get(relation.to) + 1);
  }

  const rankOf = new Map();
  const queue = ids.filter((id) => indegree.get(id) === 0).sort();
  for (const id of queue) rankOf.set(id, 0);

  let head = 0;
  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    for (const next of adjacency.get(id)) {
      rankOf.set(next, Math.max(rankOf.get(next) ?? 0, (rankOf.get(id) ?? 0) + 1));
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  for (const id of ids) {
    if (!rankOf.has(id)) rankOf.set(id, 0);
  }

  return { rankOf, warnings };
}

/** Barycenter ordering inside ranks: two top-down and two bottom-up sweeps. */
function orderRanks(spec, rankOf) {
  const ids = spec.classes.map((entry) => entry.id);
  const byRank = new Map();
  for (const id of ids) {
    const rank = rankOf.get(id) ?? 0;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(id);
  }
  for (const list of byRank.values()) list.sort();
  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);

  const adjacency = new Map(ids.map((id) => [id, new Set()]));
  for (const relation of spec.relations) {
    if (adjacency.has(relation.from) && adjacency.has(relation.to)) {
      adjacency.get(relation.from).add(relation.to);
      adjacency.get(relation.to).add(relation.from);
    }
  }

  const position = new Map();
  const syncPositions = () => {
    for (const list of byRank.values()) {
      list.forEach((id, index) => position.set(id, index));
    }
  };
  syncPositions();

  for (let pass = 0; pass < 4; pass += 1) {
    const topDown = pass % 2 === 0;
    const ranks = topDown ? rankKeys : [...rankKeys].reverse();
    for (const rank of ranks) {
      const list = byRank.get(rank);
      const referenceRank = topDown ? rank - 1 : rank + 1;
      const barycenter = new Map();
      for (const id of list) {
        const reference = [...adjacency.get(id)].filter(
          (neighbor) => (rankOf.get(neighbor) ?? 0) === referenceRank,
        );
        barycenter.set(
          id,
          reference.length === 0
            ? position.get(id)
            : reference.reduce((sum, neighbor) => sum + position.get(neighbor), 0) / reference.length,
        );
      }
      list.sort((a, b) => {
        const delta = barycenter.get(a) - barycenter.get(b);
        return delta !== 0 ? delta : a.localeCompare(b);
      });
      list.forEach((id, index) => position.set(id, index));
    }
  }

  return { byRank, rankKeys };
}

/**
 * Layout of one package group: local ranks, rows and coordinates.
 */
function layoutGroup(spec, sizes) {
  const { rankOf, warnings } = assignRanks(spec);
  const { byRank, rankKeys } = orderRanks(spec, rankOf);

  const bands = rankKeys.map((rank) => {
    const ids = byRank.get(rank);
    const rowWidth =
      ids.reduce((sum, id) => sum + sizes.get(id).width, 0) + COL_GAP * (ids.length - 1);
    const rowHeight = Math.max(...ids.map((id) => sizes.get(id).height));
    const maxDelta = Math.max(0, ...ids.map((id) => sizes.get(id).membersHeight));
    return { rank, ids, rowWidth, rowHeight, maxDelta };
  });

  // Wrap wide bands into several physical rows, keeping the rank order.
  const physical = [];
  for (const band of bands) {
    let chunk = [];
    let chunkWidth = 0;
    for (const id of band.ids) {
      const width = sizes.get(id).width;
      const extra = chunk.length === 0 ? width : width + COL_GAP;
      if (chunk.length > 0 && chunkWidth + extra > WRAP_WIDTH) {
        physical.push({ rank: band.rank, ids: chunk });
        chunk = [];
        chunkWidth = 0;
      }
      chunkWidth += chunk.length === 0 ? width : width + COL_GAP;
      chunk.push(id);
    }
    if (chunk.length > 0) physical.push({ rank: band.rank, ids: chunk });
  }

  const rowMetrics = physical.map((row) => {
    const rowWidth =
      row.ids.reduce((sum, id) => sum + sizes.get(id).width, 0) + COL_GAP * (row.ids.length - 1);
    const rowHeight = Math.max(...row.ids.map((id) => sizes.get(id).height));
    const maxDelta = Math.max(0, ...row.ids.map((id) => sizes.get(id).membersHeight));
    return { rank: row.rank, ids: row.ids, rowWidth, rowHeight, maxDelta };
  });

  const contentWidth = Math.max(...rowMetrics.map((row) => row.rowWidth), 0);
  const nodes = new Map();
  let cursorY = MARGIN;

  rowMetrics.forEach((row, index) => {
    let x = MARGIN + (contentWidth - row.rowWidth) / 2;
    for (const id of row.ids) {
      const size = sizes.get(id);
      nodes.set(id, {
        id,
        rank: row.rank,
        rowIndex: index,
        x,
        y: cursorY,
        width: size.width,
        height: size.height,
        membersHeight: size.membersHeight,
        hasMembers: size.hasMembers,
      });
      x += size.width + COL_GAP;
    }
    cursorY += row.rowHeight;
    if (index < rowMetrics.length - 1) cursorY += ROW_GAP + row.maxDelta;
  });

  const rows = rowMetrics.map((row, index) => {
    const list = row.ids.map((id) => nodes.get(id));
    return {
      index,
      rank: row.rank,
      ids: row.ids,
      top: Math.min(...list.map((node) => node.y)),
      bottom: Math.max(...list.map((node) => node.y + node.height)),
    };
  });

  return {
    nodes,
    rows,
    rankOf,
    width: Math.max(520, contentWidth + MARGIN * 2),
    height: Math.max(360, cursorY + MARGIN),
    warnings,
  };
}

/**
 * Full layout: one independently laid-out zone per package, placed side by side.
 * Classes outside every package fall into their own trailing zone.
 */
export function buildLayout(spec) {
  const sizes = new Map(spec.classes.map((entry) => [entry.id, measureClass(entry)]));
  const membership = new Map();
  for (const pkg of spec.packages) {
    for (const id of pkg.classes) membership.set(id, pkg.id);
  }
  for (const entry of spec.classes) {
    if (!membership.has(entry.id)) membership.set(entry.id, null);
  }

  const keys = [...spec.packages.map((pkg) => pkg.id), null].filter((key) =>
    [...membership.values()].includes(key),
  );

  const nodes = new Map();
  const rows = [];
  const warnings = [];
  let offsetX = MARGIN;
  let rowOffset = 0;
  let height = 0;

  for (const key of keys) {
    const ids = new Set([...membership].filter(([, value]) => value === key).map(([id]) => id));
    const classes = spec.classes.filter((entry) => ids.has(entry.id));
    const relations = spec.relations.filter(
      (relation) => ids.has(relation.from) && ids.has(relation.to),
    );
    const group = layoutGroup({ classes, relations }, sizes);

    for (const [id, node] of group.nodes) {
      nodes.set(id, { ...node, x: node.x + offsetX, rowIndex: node.rowIndex + rowOffset });
    }
    for (const row of group.rows) {
      rows.push({ ...row, index: row.index + rowOffset, group: key ?? 'external' });
    }

    warnings.push(...group.warnings);
    offsetX += group.width + GROUP_GAP;
    height = Math.max(height, group.height);
    rowOffset += group.rows.length;
  }

  return {
    nodes,
    rows,
    rankOf: new Map(spec.classes.map((entry) => [entry.id, nodes.get(entry.id)?.rank ?? 0])),
    width: Math.max(520, offsetX - GROUP_GAP),
    height: Math.max(360, height),
    warnings,
  };
}
