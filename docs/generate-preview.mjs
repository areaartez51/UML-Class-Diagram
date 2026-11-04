// Renders docs/preview.svg from docs/example.json, so the README shows the real
// output rather than a screenshot that silently goes stale.
//
// The standalone export needs the stylesheet inside the file: selectors that are
// scoped to `.uml-diagram` on a page must target the svg root here.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const load = (relative) => import(pathToFileURL(join(ROOT, relative)).href);

const { validateSpec } = await load('vendor/model.mjs');
const { buildLayout } = await load('vendor/layout.mjs');
const { renderSvg } = await load('vendor/svg.mjs');
const { STYLE } = await load('vendor/theme.mjs');

const raw = JSON.parse(readFileSync(join(HERE, 'example.json'), 'utf8'));
const valid = validateSpec(raw);
if (!valid.ok) throw new Error(`пример невалиден: ${valid.errors[0].path}: ${valid.errors[0].message}`);

const layout = buildLayout(valid.spec);
const { svg } = renderSvg(valid.spec, layout, 'preview');

// Page-scoped CSS becomes root-scoped CSS.
const css = STYLE.split('.uml-diagram').join('svg');
const [vx, vy, vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const backdrop = `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#0e1116"/>`;

const styled = svg
  .replace('<defs>', `<style>${css}</style><defs>`)
  .replace(/(<svg[^>]*>)/, `$1\n${backdrop}`);

mkdirSync(HERE, { recursive: true });
writeFileSync(join(HERE, 'preview.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n${styled}\n`, 'utf8');
console.log(`docs/preview.svg: ${(styled.length / 1024).toFixed(1)} КБ, ${valid.spec.classes.length} классов`);
