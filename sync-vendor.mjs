// Keeps vendor/ in step with the renderer that lives in the skill repository.
//
//   node sync-vendor.mjs            copy from the default sibling checkout
//   node sync-vendor.mjs <path>     copy from another checkout
//   node sync-vendor.mjs --check    only report drift, exit 1 if out of date
//
// The renderer is shared by two artefacts (the DSH skill and this plugin), so it
// is vendored. HASHES.json records what was copied; build.mjs refuses to build
// when the files and the record disagree, which makes silent drift impossible.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, 'vendor');
const DEFAULT_SOURCE = join(HERE, '..', 'uml-class-dsh', 'skills', 'uml-class', 'renderers');

const FILES = [
  'model.mjs',
  'layout.mjs',
  'routing.mjs',
  'svg.mjs',
  'theme.mjs',
  'html.mjs',
  'render.mjs',
  'client.mjs',
  'extract/csharp.mjs',
];

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const source = resolve(args.find((item) => !item.startsWith('--')) || DEFAULT_SOURCE);

if (!existsSync(source)) {
  console.error(`не найдена папка с рендерером: ${source}`);
  process.exit(1);
}

function hash(text) {
  return createHash('sha256').update(text).digest('hex');
}

const hashes = {};
const drift = [];

for (const file of FILES) {
  const from = join(source, file);
  if (!existsSync(from)) {
    console.error(`в источнике нет ${file}`);
    process.exit(1);
  }
  const content = readFileSync(from);
  hashes[file] = hash(content);

  const target = join(VENDOR, file);
  if (checkOnly) {
    const current = existsSync(target) ? hash(readFileSync(target)) : null;
    if (current !== hashes[file]) drift.push(file);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

if (checkOnly) {
  if (drift.length === 0) {
    console.log('vendor актуален');
    process.exit(0);
  }
  console.error(`vendor разошёлся с источником: ${drift.join(', ')}`);
  console.error('запустите: node sync-vendor.mjs');
  process.exit(1);
}

writeFileSync(join(VENDOR, 'HASHES.json'), `${JSON.stringify(hashes, null, 2)}\n`, 'utf8');
console.log(`vendor обновлён из ${source}`);
console.log(`файлов: ${FILES.length}`);
