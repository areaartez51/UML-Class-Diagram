// C# source → UML class spec. Zero dependencies: a tolerant declaration scanner,
// not a full C# parser. It reads types, members and references, and never throws
// on unfamiliar syntax: anything it cannot read becomes a warning.

const TYPE_KEYWORDS = new Set(['class', 'interface', 'struct', 'enum', 'record']);
const MODIFIERS = new Set([
  'public',
  'private',
  'protected',
  'internal',
  'static',
  'readonly',
  'const',
  'abstract',
  'sealed',
  'partial',
  'virtual',
  'override',
  'async',
  'unsafe',
  'extern',
  'new',
  'volatile',
  'required',
  'file',
  'ref',
  'scoped',
  'fixed',
]);

const PRIMITIVES = new Set([
  'void',
  'bool',
  'byte',
  'sbyte',
  'char',
  'decimal',
  'double',
  'float',
  'int',
  'uint',
  'long',
  'ulong',
  'short',
  'ushort',
  'object',
  'string',
  'dynamic',
  'var',
  'nint',
  'nuint',
]);

/** Blank out comments, string/char literals and preprocessor lines, keeping offsets. */
export function cleanSource(source) {
  const out = source.split('');
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' && source.startsWith('"""', i)) {
      const end = source.indexOf('"""', i + 3);
      const stop = end < 0 ? n : end + 3;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '@' && next === '"') {
      let j = i + 2;
      while (j < n) {
        if (source[j] === '"') {
          if (source[j + 1] === '"') {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '$' && (next === '"' || (next === '@' && source[i + 2] === '"'))) {
      let j = i + (next === '@' ? 3 : 2);
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '"' || source[j] === '\n') {
          j += 1;
          break;
        }
        j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === "'") {
          j += 1;
          break;
        }
        j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '#') {
      const lineStart = source.lastIndexOf('\n', i) + 1;
      if (source.slice(lineStart, i).trim() === '') {
        const end = source.indexOf('\n', i);
        const stop = end < 0 ? n : end;
        blank(i, stop);
        i = stop;
        continue;
      }
    }
    i += 1;
  }
  return out.join('');
}

function matchPair(text, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const matchBrace = (text, i) => matchPair(text, i, '{', '}');
const matchParen = (text, i) => matchPair(text, i, '(', ')');
const matchBracket = (text, i) => matchPair(text, i, '[', ']');

function matchAngle(text, i) {
  let depth = 0;
  for (let k = i; k < text.length; k += 1) {
    if (text[k] === '<') depth += 1;
    else if (text[k] === '>') {
      depth -= 1;
      if (depth === 0) return k;
    } else if (text[k] === ';' || text[k] === '{' || text[k] === '\n') {
      return -1;
    }
  }
  return -1;
}

function skipSpace(text, i) {
  let k = i;
  while (k < text.length && /\s/.test(text[k])) k += 1;
  return k;
}

function namespaceRanges(text) {
  const ranges = [];
  const re = /\bnamespace\s+([A-Za-z_][\w.]*)\s*([{;])/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    if (match[2] === ';') {
      ranges.push({ name, start: match.index, end: text.length });
    } else {
      const open = text.indexOf('{', match.index);
      const close = open < 0 ? -1 : matchBrace(text, open);
      ranges.push({ name, start: match.index, end: close < 0 ? text.length : close });
    }
  }
  return ranges;
}

function namespaceAt(ranges, position) {
  let best = '';
  let bestLength = -1;
  for (const range of ranges) {
    if (position >= range.start && position <= range.end && range.name.length > bestLength) {
      best = range.name;
      bestLength = range.name.length;
    }
  }
  return best;
}

function modifiersBefore(text, index) {
  const window = text.slice(Math.max(0, index - 240), index);
  const tail = window.split(/[;{}]/).pop() ?? '';
  const words = tail.split(/\s+/).filter(Boolean);
  const found = new Set();
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const word = words[i];
    if (MODIFIERS.has(word)) found.add(word);
    else if (TYPE_KEYWORDS.has(word)) break;
    else break;
  }
  return found;
}

function readTypeAt(text, keywordIndex, keyword) {
  let i = keywordIndex + keyword.length;
  i = skipSpace(text, i);

  let kind = keyword;
  if (keyword === 'record') {
    const rest = /^(class|struct)\b/.exec(text.slice(i));
    if (rest) {
      kind = rest[1] === 'struct' ? 'record-struct' : 'record-class';
      i += rest[1].length;
      i = skipSpace(text, i);
    }
  }

  const nameMatch = /^[A-Za-z_]\w*/.exec(text.slice(i));
  if (!nameMatch) return null;
  const name = nameMatch[0];
  i = skipSpace(text, i + name.length);

  if (text[i] === '<') {
    const close = matchAngle(text, i);
    i = skipSpace(text, close < 0 ? i : close + 1);
  }
  if (text[i] === '(') {
    const close = matchParen(text, i);
    i = skipSpace(text, close < 0 ? i : close + 1);
  }

  let bases = '';
  if (text[i] === ':') {
    let k = i + 1;
    let depth = 0;
    while (k < text.length) {
      const c = text[k];
      if (c === '<' || c === '(' || c === '[') depth += 1;
      else if (c === '>' || c === ')' || c === ']') depth -= 1;
      else if (depth <= 0 && (c === '{' || c === ';')) break;
      else if (depth <= 0 && /\bwhere\b/.test(text.slice(k, k + 6))) break;
      k += 1;
    }
    bases = text.slice(i + 1, k).trim();
    i = skipSpace(text, k);
  }
  if (text.slice(i, i + 5) === 'where') {
    let k = i;
    let depth = 0;
    while (k < text.length) {
      const c = text[k];
      if (c === '<' || c === '(') depth += 1;
      else if (c === '>' || c === ')') depth -= 1;
      else if (depth <= 0 && c === '{') break;
      k += 1;
    }
    i = skipSpace(text, k);
  }

  if (text[i] === ';') {
    return { kind, name, bases, bodyStart: i, bodyEnd: i, end: i + 1 };
  }
  if (text[i] !== '{') return null;
  const close = matchBrace(text, i);
  const bodyStart = i + 1;
  const bodyEnd = close < 0 ? text.length : close;
  return { kind, name, bases, bodyStart, bodyEnd, end: close < 0 ? text.length : close + 1 };
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '<' || c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === '>' || c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function stripAttributes(text) {
  let rest = text.trim();
  while (rest.startsWith('[')) {
    const close = matchBracket(rest, 0);
    if (close < 0) break;
    rest = rest.slice(close + 1).trim();
  }
  return rest;
}

function splitBody(body) {
  const chunks = [];
  const n = body.length;
  let i = 0;
  while (i < n) {
    i = skipSpace(body, i);
    if (i >= n) break;
    const start = i;
    let end = -1;
    let depthP = 0;
    let depthB = 0;
    while (i < n) {
      const c = body[i];
      if (c === '(') depthP += 1;
      else if (c === ')') depthP -= 1;
      else if (c === '[') depthB += 1;
      else if (c === ']') depthB -= 1;
      else if (depthP === 0 && depthB === 0 && c === '{') {
        const close = matchBrace(body, i);
        end = close < 0 ? n : close + 1;
        let k = skipSpace(body, end);
        if (body[k] === ';') end = k + 1;
        break;
      } else if (depthP === 0 && depthB === 0 && c === ';') {
        end = i + 1;
        break;
      }
      i += 1;
    }
    if (end < 0) end = n;
    const chunk = body.slice(start, end);
    if (chunk.trim()) chunks.push(chunk);
    i = end;
  }
  return chunks;
}

function visibility(modifiers) {
  if (modifiers.has('public')) return '+';
  if (modifiers.has('protected')) return '#';
  if (modifiers.has('internal')) return '~';
  return '-';
}

function stripModifiers(decl) {
  const words = decl.trim().split(/\s+/);
  let k = 0;
  while (k < words.length && MODIFIERS.has(words[k])) k += 1;
  return words.slice(k).join(' ');
}

function splitTypeAndName(decl) {
  const text = decl.trim().replace(/;$/, '').trim();
  const match = /^(.*?)\s*([A-Za-z_]\w*)\s*(\[\s*\])?$/.exec(text);
  if (!match) return { type: '', name: text };
  return { type: (match[1] + (match[3] ? '[]' : '')).trim(), name: match[2] };
}

function paramsOf(text) {
  const inner = text.trim();
  if (!inner) return [];
  return splitTopLevel(inner, ',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const withoutDefault = part.split('=')[0].trim();
      const cleaned = withoutDefault.replace(/^(this|ref|out|in|params|scoped)\s+/, '');
      const { type, name } = splitTypeAndName(cleaned);
      return { name, type, text: name ? `${name}: ${type}` : type };
    });
}

function accessorsOf(body) {
  const found = [];
  if (/\bget\b/.test(body)) found.push('get;');
  if (/\binit\b/.test(body)) found.push('init;');
  else if (/\bset\b/.test(body)) found.push('set;');
  return found;
}

function isTypeDeclaration(chunk) {
  const text = stripAttributes(chunk).trim();
  const words = text.split(/\s+/);
  let k = 0;
  while (k < words.length && MODIFIERS.has(words[k])) k += 1;
  return TYPE_KEYWORDS.has(words[k] ?? '');
}

function parseMember(chunk, typeName) {
  if (isTypeDeclaration(chunk)) return null;
  const cleaned = stripAttributes(chunk).replace(/;+$/, '').trim();
  if (!cleaned) return null;

  const modifiers = new Set();
  const words = cleaned.split(/\s+/);
  let k = 0;
  while (k < words.length && MODIFIERS.has(words[k])) {
    modifiers.add(words[k]);
    k += 1;
  }
  const rest = words.slice(k).join(' ');
  if (!rest) return null;
  const isEvent = /^event\s+/.test(rest);
  const body = isEvent ? rest.replace(/^event\s+/, '') : rest;

  const parenIndex = body.indexOf('(');
  const braceIndex = body.indexOf('{');
  const arrowIndex = body.indexOf('=>');
  const assignIndex = body.indexOf('=');

  // A '(' only starts a signature when no assignment precedes it:
  // `Dictionary<string, int> _map = new Dictionary<string, int>();` is a field.
  const isSignature =
    parenIndex >= 0 && (assignIndex < 0 || parenIndex < assignIndex) && (arrowIndex < 0 || parenIndex < arrowIndex);

  if (isSignature) {
    const head = body.slice(0, parenIndex).trim();
    const close = matchParen(body, parenIndex);
    const params = paramsOf(body.slice(parenIndex + 1, close < 0 ? body.length : close));
    const paramsText = params.map((param) => param.text).join(', ');
    const tail = close < 0 ? '' : body.slice(close + 1).trim();
    const bodyBrace = tail.indexOf('{');
    const callBody =
      bodyBrace >= 0 ? tail.slice(bodyBrace) : tail.startsWith('=>') ? tail.slice(2) : '';
    const returnMatch = /^:\s*([^{=]+)/.exec(tail);
    const headWords = head.split(/\s+/);
    let name = headWords.pop() ?? '';
    let typeParams = '';
    const generic = /^([A-Za-z_]\w*)<(.+)>$/.exec(name);
    if (generic) {
      name = generic[1];
      typeParams = `<${generic[2]}>`;
    }
    const returnType = headWords.join(' ').trim();
    if (!returnType && name === typeName) {
      return {
        kind: 'constructor',
        name,
        params,
        body: callBody,
        text: `${visibility(modifiers)} ${name}(${paramsText})`,
      };
    }
    if (!name) return null;
    return {
      kind: 'method',
      name,
      params,
      body: callBody,
      type: '',
      text: `${visibility(modifiers)} ${name}${typeParams}(${paramsText}): ${
        returnMatch ? returnMatch[1].trim() : returnType || 'void'
      }`,
    };
  }

  if (braceIndex >= 0) {
    const head = body.slice(0, braceIndex).trim();
    const close = matchBrace(body, braceIndex);
    const inner = body.slice(braceIndex + 1, close < 0 ? body.length : close);
    const { type, name } = splitTypeAndName(head);
    if (!name) return null;
    if (isEvent) {
      return { kind: 'event', name, type, text: `${visibility(modifiers)} ${name}: event ${type}` };
    }
    const accessors = accessorsOf(inner);
    return {
      kind: 'property',
      name,
      type,
      text: `${visibility(modifiers)} ${name}: ${type} { ${accessors.join(' ')} }`,
    };
  }

  if (arrowIndex >= 0) {
    const head = body.slice(0, arrowIndex).trim();
    const { type, name } = splitTypeAndName(head);
    if (!name) return null;
    return {
      kind: 'property',
      name,
      type,
      text: `${visibility(modifiers)} ${name}: ${type} { get; }`,
    };
  }

  const decl = body.split('=')[0].trim();
  const names = splitTopLevel(decl, ',');
  const results = [];
  for (const piece of names) {
    const { type, name } = splitTypeAndName(piece);
    if (!name || !type) continue;
    if (isEvent) {
      results.push({ kind: 'event', name, type, text: `${visibility(modifiers)} ${name}: event ${type}` });
    } else {
      results.push({ kind: 'field', name, type, text: `${visibility(modifiers)} ${name}: ${type}` });
    }
  }
  return results.length ? { kind: 'multi', members: results } : null;
}

function sanitizeId(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function baseNameOf(type) {
  return type.replace(/<.*$/, '').replace(/\[\s*\]/g, '').trim();
}

/** Extract types from one cleaned file. */
export function parseFile(text, filePath = '') {
  const ranges = namespaceRanges(text);
  const types = [];

  const walk = (start, end, outerName, namespace) => {
    let i = start;
    while (i < end) {
      const slice = text.slice(i, end);
      const match = /\b(class|interface|struct|enum|record)\b/.exec(slice);
      if (!match) break;
      const keywordIndex = i + match.index;
      const keyword = match[1];

      // Only accept a declaration keyword: the word before it must be a modifier
      // (so `where T : class` and `x.class` are ignored).
      const before = text.slice(Math.max(0, keywordIndex - 80), keywordIndex);
      const lastWord = /([A-Za-z_]\w*)\s*$/.exec(before)?.[1] ?? '';
      if (lastWord && !MODIFIERS.has(lastWord)) {
        i = keywordIndex + keyword.length;
        continue;
      }

      const parsed = readTypeAt(text, keywordIndex, keyword);
      if (!parsed) {
        i = keywordIndex + keyword.length;
        continue;
      }

      const modifiers = modifiersBefore(text, keywordIndex);
      const qualified = outerName ? `${outerName}.${parsed.name}` : parsed.name;
      const body = text.slice(parsed.bodyStart, parsed.bodyEnd);
      const members = [];
      const memberChunks = splitBody(body);
      const nested = [];

      for (const chunk of memberChunks) {
        const parsedMember = parseMember(chunk, parsed.name);
        if (!parsedMember) continue;
        if (parsedMember.kind === 'multi') members.push(...parsedMember.members);
        else members.push(parsedMember);
      }

      types.push({
        kind: parsed.kind,
        name: parsed.name,
        qualified,
        namespace: namespace || namespaceAt(ranges, keywordIndex),
        file: filePath,
        bases: parsed.bases,
        modifiers,
        members,
      });

      walk(parsed.bodyStart, parsed.bodyEnd, qualified, namespace || namespaceAt(ranges, keywordIndex));
      i = parsed.end;
    }
  };

  walk(0, text.length, '', '');
  return types;
}

function relativeFolder(filePath, root) {  const normalized = filePath.replace(/\\/g, '/');
  const rootNormalized = root.replace(/\\/g, '/').replace(/\/$/, '');
  const relative = normalized.startsWith(rootNormalized)
    ? normalized.slice(rootNormalized.length + 1)
    : normalized.split('/').pop();
  const parts = relative.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

function mergeTypes(types) {
  const merged = [];
  const byQualified = new Map();
  for (const type of types) {
    const existing = byQualified.get(type.qualified);
    if (!existing) {
      const copy = {
        ...type,
        members: [...type.members],
        modifiers: new Set(type.modifiers),
      };
      byQualified.set(type.qualified, copy);
      merged.push(copy);
      continue;
    }
    existing.members.push(...type.members);
    for (const modifier of type.modifiers) existing.modifiers.add(modifier);
    if (type.bases) {
      existing.bases = existing.bases ? `${existing.bases}, ${type.bases}` : type.bases;
    }
  }
  return merged;
}

function scanCalls(body, fieldTypes) {
  const calls = [];
  for (const match of body.matchAll(/\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)) {
    calls.push({ type: match[1], member: null });
  }
  for (const match of body.matchAll(/\bGetComponent\s*<\s*([A-Z][A-Za-z0-9_]*)\s*>/g)) {
    calls.push({ type: match[1], member: null });
  }
  for (const match of body.matchAll(/\b(?:this\.)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\(/g)) {
    const [, receiver, member] = match;
    const type = fieldTypes.get(receiver);
    if (type) calls.push({ type, member });
  }
  return calls;
}

/** Build a schema-v1 spec from parsed types. */
export function buildSpec(types, options = {}) {
  types = mergeTypes(types);
  const warnings = [];
  const packageBy = options.packageBy ?? 'auto';
  const root = options.root ?? '';

  const namespaces = new Set(types.map((type) => type.namespace || ''));
  const singleNamespace = namespaces.size <= 1;
  const mode = packageBy === 'auto' ? (singleNamespace ? 'folder' : 'namespace') : packageBy;

  const byName = new Map();
  const byQualified = new Map();
  for (const type of types) {
    byQualified.set(type.qualified, type);
    const list = byName.get(type.name) ?? [];
    list.push(type);
    byName.set(type.name, list);
  }

  const resolve = (name, from) => {
    const base = baseNameOf(name);
    if (!base || PRIMITIVES.has(base)) return null;
    const candidates = byName.get(base) ?? [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const sameNamespace = candidates.find((c) => c.namespace === from.namespace);
      if (sameNamespace) return sameNamespace;
      warnings.push(`неоднозначный тип "${base}" в ${from.name}`);
      return candidates[0];
    }
    return null;
  };

  const usedIds = new Set();
  const idOf = (type) => {
    let id = sanitizeId(type.name) || 'class';
    if (usedIds.has(id)) {
      let index = 2;
      while (usedIds.has(`${id}-${index}`)) index += 1;
      id = `${id}-${index}`;
    }
    usedIds.add(id);
    return id;
  };

  const classes = [];
  const packageOf = new Map();
  const relations = [];

  for (const type of types) {
    const stereotype =
      type.kind === 'interface'
        ? 'interface'
        : type.kind === 'enum'
          ? 'enum'
          : type.modifiers.has('abstract')
            ? 'abstract'
            : type.kind.startsWith('record')
              ? 'record'
              : undefined;

    const entry = { id: idOf(type), name: type.name };
    if (mode === 'namespace') entry.package = sanitizeId(type.namespace || 'default') || 'default';
    else if (mode === 'folder') {
      entry.package = sanitizeId(relativeFolder(type.file, root) || 'default') || 'default';
    }
    if (stereotype) entry.stereotype = stereotype;

    const groups = { fields: [], properties: [], events: [], constructors: [], methods: [] };
    for (const member of type.members) {
      if (member.kind === 'field') groups.fields.push(member.text);
      else if (member.kind === 'property') groups.properties.push(member.text);
      else if (member.kind === 'event') groups.events.push(member.text);
      else if (member.kind === 'constructor') groups.constructors.push(member.text);
      else if (member.kind === 'method') groups.methods.push(member.text);
    }
    for (const [key, value] of Object.entries(groups)) {
      if (value.length) entry[key] = value;
    }

    classes.push(entry);
    packageOf.set(type.qualified, entry.package ?? 'default');
  }

  const idByQualified = new Map(classes.map((entry, index) => [types[index].qualified, entry.id]));

  // Field name → declared type, per class, for resolving `_field.Call()` in method bodies.
  const memberTypes = new Map();
  for (const type of types) {
    const map = new Map();
    for (const member of type.members) {
      if ((member.kind === 'field' || member.kind === 'property') && member.type) {
        map.set(member.name, member.type);
      }
    }
    memberTypes.set(type.qualified, map);
  }

  const pushRelation = (relation) => {
    const key = `${relation.from}>${relation.to}:${relation.kind}:${relation.fromMember ?? ''}`;
    if (relations.some((existing) => existing.__key === key)) return;
    relations.push({ ...relation, __key: key });
  };

  for (const type of types) {
    const fromId = idByQualified.get(type.qualified);
    if (!fromId) continue;

    for (const base of splitTopLevel(type.bases, ',').map((part) => part.trim()).filter(Boolean)) {
      const target = resolve(base, type);
      if (!target) continue;
      const toId = idByQualified.get(target.qualified);
      if (!toId || toId === fromId) continue;
      const isInterface = target.kind === 'interface';
      const kind =
        isInterface && type.kind === 'interface'
          ? 'inheritance'
          : isInterface
            ? 'realization'
            : 'inheritance';
      pushRelation({ from: fromId, to: toId, kind });
    }

    for (const member of type.members) {
      if (options.includeFields === false) break;
      if (member.kind !== 'field' && member.kind !== 'property') continue;
      const target = resolve(member.type, type);
      if (!target) continue;
      const toId = idByQualified.get(target.qualified);
      if (!toId || toId === fromId) continue;
      pushRelation({
        from: fromId,
        to: toId,
        kind: target.kind === 'interface' ? 'association' : 'composition',
        fromMember: member.name,
      });
    }

    // Interfaces declare members, they do not depend on anything: skip them.
    if (type.kind !== 'interface' && options.includeDependencies !== false) {
      for (const member of type.members) {
        if (member.kind !== 'method' && member.kind !== 'constructor') continue;
        const params = member.params ?? [];
        for (const param of params) {
          const target = resolve(param.type, type);
          if (!target) continue;
          const toId = idByQualified.get(target.qualified);
          if (!toId || toId === fromId) continue;
          // A dependency adds nothing when the pair is already connected by a field or a base type.
          if (relations.some((existing) => existing.from === fromId && existing.to === toId)) continue;
          pushRelation({ from: fromId, to: toId, kind: 'dependency', fromMember: member.name });
        }
      }
    }

    // --calls: dependencies taken from method bodies (`_field.Call()`, `new T()`, `GetComponent<T>()`).
    if (options.calls) {
      const fieldTypes = memberTypes.get(type.qualified) ?? new Map();
      for (const member of type.members) {
        if (member.kind !== 'method' || !member.body) continue;
        const seen = new Set();
        for (const call of scanCalls(member.body, fieldTypes)) {
          const target = resolve(call.type, type);
          if (!target) continue;
          const toId = idByQualified.get(target.qualified);
          if (!toId || toId === fromId) continue;
          const key = `${toId}:${call.member ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pushRelation({
            from: fromId,
            to: toId,
            kind: 'dependency',
            fromMember: member.name,
            ...(call.member ? { toMember: call.member } : {}),
          });
        }
      }
    }
  }

  const rootName = root.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || 'root';
  const packages = new Map();
  for (const type of types) {
    const pkg = packageOf.get(type.qualified) ?? 'default';
    if (!packages.has(pkg)) {
      const folderLabel = relativeFolder(type.file, root);
      const label =
        mode === 'folder'
          ? folderLabel && folderLabel !== '.'
            ? folderLabel
            : rootName
          : type.namespace || 'default';
      packages.set(pkg, { id: pkg, label, classes: [] });
    }
    packages.get(pkg).classes.push(idByQualified.get(type.qualified));
  }

  const spec = {
    schemaVersion: 1,
    title: options.title ?? 'Диаграмма классов',
    classes,
    relations: relations.map(({ __key, ...rest }) => rest),
    packages: [...packages.values()],
  };

  return { spec, warnings };
}
