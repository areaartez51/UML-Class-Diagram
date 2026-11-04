// Smoke test for the Obsidian bundle.
// Copies main.js into a scratch directory as CommonJS, stubs the `obsidian` module
// and a minimal DOM, then checks that the plugin class and the mount hook survive.
// This is not a substitute for running Obsidian, only a guard against a broken bundle.

import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const scratch = join(tmpdir(), 'uml-obsidian-smoke');

rmSync(scratch, { recursive: true, force: true });
mkdirSync(join(scratch, 'node_modules', 'obsidian'), { recursive: true });

copyFileSync(join(HERE, 'main.js'), join(scratch, 'main.cjs'));

writeFileSync(
  join(scratch, 'node_modules', 'obsidian', 'index.js'),
  `class Plugin { constructor(app) { this.app = app; } registerView() {} addCommand() {} addRibbonIcon() {} registerEvent() {} }
   class ItemView { constructor(leaf) { this.leaf = leaf; this.contentEl = {}; } }
   class FuzzySuggestModal { constructor(app) { this.app = app; } setPlaceholder() {} open() {} }
   class Modal { constructor(app) { this.app = app; this.contentEl = {}; } open() {} close() {} }
   class Setting {
     constructor() {}
     setName() { return this; } setDesc() { return this; }
     addText() { return this; } addButton() { return this; }
     addToggle() { return this; } addDropdown() { return this; }
   }
   class Notice { constructor(message) { this.message = message; } }
   class TFile {}
   module.exports = { Plugin, ItemView, FuzzySuggestModal, Modal, Setting, Notice, TFile };`,
);

writeFileSync(
  join(scratch, 'run.cjs'),
  `function makeEl() {
     return {
       id: '', textContent: '',
       appendChild() {}, empty() {}, addClass() {},
       createEl() { return makeEl(); },
       querySelector() { return null; },
       set innerHTML(value) {}, get innerHTML() { return ''; },
     };
   }
   global.document = {
     readyState: 'complete',
     getElementById() { return null; },
     querySelectorAll() { return []; },
     addEventListener() {},
     createElement() { return makeEl(); },
     head: makeEl(),
   };
   global.window = { addEventListener() {}, removeEventListener() {} };

   const Plugin = require('./main.cjs');
   const problems = [];
   if (typeof Plugin !== 'function') problems.push('экспорт не является классом');
   if (typeof window.__umlClassMount !== 'function') problems.push('нет window.__umlClassMount');
   if (typeof window.__umlClassBoot !== 'function') problems.push('нет window.__umlClassBoot');
   if (Plugin.prototype && typeof Plugin.prototype.onload !== 'function') problems.push('нет onload');
   if (Plugin.prototype && typeof Plugin.prototype.pickFile !== 'function') problems.push('нет pickFile');
   if (problems.length) {
     console.error('FAIL: ' + problems.join('; '));
     process.exit(1);
   }
   console.log('ok: плагин загружается, __umlClassMount на месте');`,
);

console.log(scratch);
