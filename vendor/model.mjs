// Spec model: JSON parsing, validation, normalization.
// Pure functions, no I/O — the CLI and the renderer both use this.

export const KINDS = [
  'inheritance',
  'realization',
  'dependency',
  'association',
  'composition',
  'aggregation',
];

export const STEREOTYPES = ['class', 'interface', 'abstract', 'enum', 'record'];

export const MEMBER_GROUPS = ['fields', 'properties', 'events', 'constructors', 'methods'];

export const DOWN_KINDS = new Set([
  'inheritance',
  'realization',
  'composition',
  'aggregation',
  'dependency',
  'association',
]);

export const MEMBER_TITLES = {
  fields: 'поля',
  properties: 'свойства',
  events: 'события',
  constructors: 'конструкторы',
  methods: 'методы',
};

const ID_RE = /^[A-Za-z0-9_.:-]+$/;

/** Parse JSON text, reporting a human line/column on failure. */
export function parseSpecText(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: describeJsonError(text, error) };
  }
}

function describeJsonError(text, error) {
  const message = String((error && error.message) || error);
  const located = message.match(/line (\d+) column (\d+)/i);
  if (located) return `invalid JSON at line ${located[1]}, column ${located[2]}`;
  const positioned = message.match(/position (\d+)/i);
  if (positioned) {
    const at = lineColumn(text, Number(positioned[1]));
    return `invalid JSON at line ${at.line}, column ${at.column}`;
  }
  return `invalid JSON: ${message}`;
}

function lineColumn(text, offset) {
  const before = text.slice(0, Math.max(0, offset));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate a raw spec object.
 * Returns { ok, spec, errors } where each error is { path, message }.
 */
export function validateSpec(raw) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });

  if (!isPlainObject(raw)) {
    add('$', 'spec must be a JSON object');
    return { ok: false, spec: null, errors };
  }

  if (raw.schemaVersion !== 1) add('schemaVersion', 'must be 1');
  if (raw.title !== undefined && typeof raw.title !== 'string') {
    add('title', 'must be a string');
  }

  const rawClasses = Array.isArray(raw.classes) ? raw.classes : null;
  if (!rawClasses || rawClasses.length === 0) {
    add('classes', 'must be a non-empty array');
  }

  const ids = new Set();
  const classes = [];

  for (const [index, entry] of (rawClasses || []).entries()) {
    const path = `classes[${index}]`;
    if (!isPlainObject(entry)) {
      add(path, 'must be an object');
      continue;
    }

    const id = entry.id;
    if (typeof id !== 'string' || id.trim() === '') {
      add(`${path}.id`, 'must be a non-empty string');
    } else if (!ID_RE.test(id)) {
      add(`${path}.id`, 'may contain only letters, digits, _ . : -');
    } else if (ids.has(id)) {
      add(`${path}.id`, `duplicate class id "${id}"`);
    } else {
      ids.add(id);
    }

    if (typeof entry.name !== 'string' || entry.name.trim() === '') {
      add(`${path}.name`, 'must be a non-empty string');
    }

    if (
      entry.stereotype !== undefined &&
      entry.stereotype !== null &&
      !STEREOTYPES.includes(entry.stereotype)
    ) {
      add(`${path}.stereotype`, `must be one of ${STEREOTYPES.join(', ')}`);
    }

    if (entry.package !== undefined && entry.package !== null && typeof entry.package !== 'string') {
      add(`${path}.package`, 'must be a string');
    }

    const members = {};
    for (const group of MEMBER_GROUPS) {
      const value = entry[group];
      if (value === undefined) {
        members[group] = [];
        continue;
      }
      if (!Array.isArray(value) || value.some((line) => typeof line !== 'string')) {
        add(`${path}.${group}`, 'must be an array of strings');
        members[group] = [];
        continue;
      }
      members[group] = value.slice();
    }

    if (typeof id === 'string' && id.trim() !== '') {
      classes.push({
        id,
        name: entry.name,
        stereotype: entry.stereotype ?? null,
        package: typeof entry.package === 'string' ? entry.package : null,
        ...members,
      });
    }
  }

  const rawRelations = Array.isArray(raw.relations) ? raw.relations : [];
  const relations = [];

  for (const [index, entry] of rawRelations.entries()) {
    const path = `relations[${index}]`;
    if (!isPlainObject(entry)) {
      add(path, 'must be an object');
      continue;
    }

    const { from, to, kind } = entry;
    if (typeof from !== 'string' || from === '') add(`${path}.from`, 'must be a class id');
    if (typeof to !== 'string' || to === '') add(`${path}.to`, 'must be a class id');
    if (!KINDS.includes(kind)) {
      add(`${path}.kind`, `must be one of ${KINDS.join(', ')}`);
    }
    if (from === to) {
      add(path, 'self-relations are not supported in v1');
    }
    if (typeof from === 'string' && from !== '' && !ids.has(from)) {
      add(`${path}.from`, `unknown class "${from}"`);
    }
    if (typeof to === 'string' && to !== '' && !ids.has(to)) {
      add(`${path}.to`, `unknown class "${to}"`);
    }
    if (entry.label !== undefined && typeof entry.label !== 'string') {
      add(`${path}.label`, 'must be a string');
    }
    for (const key of ['fromMultiplicity', 'toMultiplicity']) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') {
        add(`${path}.${key}`, 'must be a string');
      }
    }
    for (const key of ['fromMember', 'toMember']) {
      if (entry[key] !== undefined && entry[key] !== null && typeof entry[key] !== 'string') {
        add(`${path}.${key}`, 'must be a string');
      }
    }

    relations.push({
      index,
      id: typeof entry.id === 'string' ? entry.id : `e${index}`,
      from,
      to,
      kind,
      label: typeof entry.label === 'string' ? entry.label : null,
      fromMultiplicity: typeof entry.fromMultiplicity === 'string' ? entry.fromMultiplicity : null,
      toMultiplicity: typeof entry.toMultiplicity === 'string' ? entry.toMultiplicity : null,
      fromMember: typeof entry.fromMember === 'string' ? entry.fromMember : null,
      toMember: typeof entry.toMember === 'string' ? entry.toMember : null,
    });
  }

  const rawPackages = Array.isArray(raw.packages) ? raw.packages : [];
  const packages = [];
  const packageIds = new Set();
  const claimed = new Map();

  for (const [index, entry] of rawPackages.entries()) {
    const path = `packages[${index}]`;
    if (!isPlainObject(entry)) {
      add(path, 'must be an object');
      continue;
    }
    if (typeof entry.id !== 'string' || entry.id === '') {
      add(`${path}.id`, 'must be a non-empty string');
    } else if (packageIds.has(entry.id)) {
      add(`${path}.id`, `duplicate package id "${entry.id}"`);
    } else {
      packageIds.add(entry.id);
    }
    if (typeof entry.label !== 'string' || entry.label === '') {
      add(`${path}.label`, 'must be a non-empty string');
    }
    if (!Array.isArray(entry.classes) || entry.classes.length === 0) {
      add(`${path}.classes`, 'must be a non-empty array of class ids');
      continue;
    }
    const members = [];
    for (const [memberIndex, id] of entry.classes.entries()) {
      if (typeof id !== 'string') {
        add(`${path}.classes[${memberIndex}]`, 'must be a class id');
        continue;
      }
      if (!ids.has(id)) {
        add(`${path}.classes[${memberIndex}]`, `unknown class "${id}"`);
        continue;
      }
      if (claimed.has(id)) {
        add(`${path}.classes[${memberIndex}]`, `class "${id}" already belongs to package "${claimed.get(id)}"`);
        continue;
      }
      claimed.set(id, entry.id);
      members.push(id);
    }
    packages.push({ id: entry.id, label: entry.label, classes: members });
  }

  for (const entry of classes) {
    if (entry.package !== null && !packageIds.has(entry.package)) {
      add(`classes[${classes.indexOf(entry)}].package`, `unknown package "${entry.package}"`);
    }
  }

  const neighbors = new Map(classes.map((entry) => [entry.id, new Set()]));
  for (const relation of relations) {
    if (neighbors.has(relation.from) && neighbors.has(relation.to)) {
      neighbors.get(relation.from).add(relation.to);
      neighbors.get(relation.to).add(relation.from);
    }
  }

  const spec = {
    title: typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title : 'Диаграмма классов',
    classes,
    relations,
    packages,
    neighbors,
  };

  return { ok: errors.length === 0, spec, errors };
}
