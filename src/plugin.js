// Obsidian plugin: generates a UML class diagram from C# sources in the vault
// and renders it in its own view.
//
// Bundled with the zero-dependency builder in ./build.mjs: the renderer modules and
// the C# extractor are inlined, so the plugin ships no npm dependencies at all.

const { Plugin, ItemView, FuzzySuggestModal, Modal, Notice, Setting } = require('obsidian');

const VIEW_TYPE = 'uml-class-diagram-view';
const STYLE_ID = 'uml-class-diagram-style';
const OUTPUT_DIR = 'UML';

const DEFAULT_SETTINGS = {
  folder: '',
  calls: false,
  noFields: false,
  noDeps: false,
  packageBy: 'auto',
  title: '',
  exclude: '',
  autoRegenerate: false,
};

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // The client reads this stylesheet to embed it into exported SVG files.
  style.setAttribute('data-uml-style', '');
  style.textContent = [
    __SCOPED_STYLE,
    '.uml-host { height: 100%; padding: 0; overflow: hidden; }',
    '.uml-host > .uml-diagram { height: 100%; }',
    // Touch panning inside the pane must not turn into a scroll of the whole view.
    '.uml-host .wrap { touch-action: none; }',
    '.uml-msg { padding: 18px; white-space: pre-wrap; font-family: var(--font-monospace); color: var(--text-muted); }',
    // A generated note renders the diagram in place of its JSON block.
    '.uml-embedded { height: 72vh; margin: 8px 0 16px; border: 1px solid var(--background-modifier-border); border-radius: 8px; overflow: hidden; }',
    '.uml-gen-summary { color: var(--text-muted); font-size: 12px; margin-top: 4px; }',
  ].join('\n');
  document.head.appendChild(style);
}

/** Minimal glob: `**` crosses folders, `*` does not. */
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          i += 1;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else {
      out += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
    }
  }
  return new RegExp(`^${out}$`);
}

/** Files outside the vault, for the desktop app: the project usually lives elsewhere. */
function externalFiles(folder) {
  // Obsidian desktop exposes Node in the plugin context; the mobile app does not.
  const req =
    typeof require === 'function' ? require : typeof window !== 'undefined' ? window.require : null;
  if (!req) return null;
  const fs = req('node:fs');
  const path = req('node:path');
  const skip = new Set(['bin', 'obj', 'node_modules', '.git', 'Library', 'Temp', 'Logs', '.vs']);
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(full);
      } else if (entry.name.endsWith('.cs')) {
        files.push(full.replace(/\\/g, '/'));
      }
    }
  };
  walk(folder);
  return { fs, files: files.sort() };
}

class FolderPicker extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder('Папка с исходниками');
  }

  getItems() {
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((file) => file.children !== undefined)
      .map((file) => file.path)
      .sort();
    return ['', ...folders];
  }

  getItemText(path) {
    return path || '(всё хранилище)';
  }

  onChooseItem(path) {
    this.onChoose(path);
  }
}

class FilePicker extends FuzzySuggestModal {
  constructor(app, files, onChoose) {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.setPlaceholder('Спека диаграммы (UML/…md или .json)');
  }

  getItems() {
    return this.files;
  }

  getItemText(file) {
    return file.path;
  }

  onChooseItem(file) {
    this.onChoose(file);
  }
}

class GeneratorModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.options = Object.assign({}, plugin.settings);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Диаграмма классов из папки' });

    let folderInput = null;
    new Setting(contentEl)
      .setName('Папка с C#')
      .setDesc('Путь в хранилище или полный путь на диске, например D:\\Unity\\Project\\Scripts. Пусто — всё хранилище.')
      .addText((text) => {
        folderInput = text;
        text
          .setPlaceholder('Assets/Scripts')
          .setValue(this.options.folder || '')
          .onChange((value) => {
            this.options.folder = value.trim();
          });
      })
      .addButton((button) =>
        button.setButtonText('Выбрать…').onClick(() => {
          new FolderPicker(this.app, (folder) => {
            this.options.folder = folder;
            if (folderInput) folderInput.setValue(folder);
          }).open();
        }),
      );

    new Setting(contentEl)
      .setName('Учитывать вызовы')
      .setDesc('Добавляет зависимости по телам методов: _field.Call(), new T(), GetComponent<T>()')
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.options.calls)).onChange((value) => {
          this.options.calls = value;
        }),
      );

    new Setting(contentEl)
      .setName('Без связей от полей')
      .setDesc('Оставить только наследование, интерфейсы и вызовы')
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.options.noFields)).onChange((value) => {
          this.options.noFields = value;
        }),
      );

    new Setting(contentEl)
      .setName('Без зависимостей от параметров')
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.options.noDeps)).onChange((value) => {
          this.options.noDeps = value;
        }),
      );

    new Setting(contentEl)
      .setName('Пересобирать при сохранении .cs')
      .setDesc('Диаграмма обновится сама, когда изменится скрипт в этой папке (внутри хранилища)')
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.options.autoRegenerate)).onChange((value) => {
          this.options.autoRegenerate = value;
        }),
      );

    new Setting(contentEl).setName('Зоны').addDropdown((dropdown) =>
      dropdown
        .addOptions({
          auto: 'авто (папки, если namespace один)',
          folder: 'по папкам',
          namespace: 'по namespace',
          none: 'без зон',
        })
        .setValue(this.options.packageBy || 'auto')
        .onChange((value) => {
          this.options.packageBy = value;
        }),
    );

    new Setting(contentEl).setName('Название').addText((text) =>
      text
        .setPlaceholder('по имени папки')
        .setValue(this.options.title || '')
        .onChange((value) => {
          this.options.title = value;
        }),
    );

    new Setting(contentEl)
      .setName('Исключить')
      .setDesc('Шаблон относительно папки, например **/Editor/**')
      .addText((text) =>
        text
          .setPlaceholder('**/Editor/**')
          .setValue(this.options.exclude || '')
          .onChange((value) => {
            this.options.exclude = value;
          }),
      );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText('Сгенерировать')
          .setCta()
          .onClick(async () => {
            this.close();
            await this.plugin.generateFromFolder(Object.assign({}, this.options));
          }),
      )
      .addButton((button) => button.setButtonText('Отмена').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class UmlView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filePath = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.filePath ? this.filePath.split('/').pop() : 'UML-диаграмма';
  }

  getIcon() {
    return 'git-fork';
  }

  async onOpen() {
    if (this.filePath) await this.render();
  }

  // The documented way to feed data into a view: Obsidian calls setState
  // right after the view is created, before onOpen.
  async setState(state, result) {
    this.filePath = state && typeof state.file === 'string' ? state.file : null;
    if (this.filePath && this.contentEl) await this.render();
    return super.setState(state, result);
  }

  getState() {
    return { file: this.filePath };
  }

  async render() {
    const host = this.contentEl;
    if (!host || typeof host.empty !== 'function') return;
    host.empty();

    if (!this.filePath) {
      host.createEl('div', { cls: 'uml-msg', text: 'Файл не выбран. Выполните команду «UML: Открыть».' });
      return;
    }

    let text;
    try {
      text = await this.app.vault.adapter.read(this.filePath);
    } catch (error) {
      host.createEl('div', { cls: 'uml-msg', text: `Не удалось прочитать ${this.filePath}:\n${error.message}` });
      return;
    }

    let parsed;
    try {
      parsed = __m.specfile.parseSpecText(text);
    } catch (error) {
      host.createEl('div', { cls: 'uml-msg', text: `Не удалось прочитать спеку:\n${error.message}` });
      return;
    }

    const result = __m.model.validateSpec(parsed);
    if (!result.ok) {
      const details = result.errors.map((item) => `${item.path}: ${item.message}`).join('\n');
      host.createEl('div', { cls: 'uml-msg', text: `Спека невалидна:\n${details}` });
      return;
    }

    let panel;
    try {
      panel = __m.render.renderPanel(result.spec);
    } catch (error) {
      host.createEl('div', { cls: 'uml-msg', text: `Не удалось построить диаграмму:\n${error.message}` });
      return;
    }

    // aria-label is what Obsidian's enhancer instruments to build its own tooltips.
    // Inside the app we hand that job to the browser via title: the enhancer then
    // never keeps a reference to our controls, which we replace on every re-render.
    const markup = panel.markup.replace(/\saria-label="([^"]*)"/g, ' title="$1"');

    // Render into our own container: replacing contentEl.innerHTML would destroy
    // nodes the app itself may have attached to the view.
    const frame = host.createDiv({ cls: 'uml-host' });
    frame.innerHTML = markup;
    const root = frame.querySelector('.uml-diagram');
    try {
      if (root && window.__umlClassMount) window.__umlClassMount(root, { autoTheme: true });
    } catch (error) {
      console.error('[uml-class-diagram] интерактив не подключился', error);
      this.plugin.notify(`интерактив не подключился — ${error.message}`);
    }
    const warnings = panel.warnings || [];
    if (warnings.length) this.plugin.notify(warnings.join('; '));
  }
}

class UmlClassPlugin extends Plugin {
  async onload() {
    ensureStyles();
    console.log(`[uml-class-diagram] v${this.manifest ? this.manifest.version : '?'} загружен`);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.registerView(VIEW_TYPE, (leaf) => new UmlView(leaf, this));

    this.addCommand({
      id: 'generate-from-folder',
      name: 'Создать',
      callback: () => new GeneratorModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'generate-again',
      name: 'Перегенерировать прошлую папку',
      callback: () => this.generateFromFolder(Object.assign({}, this.settings)),
    });

    this.addCommand({
      id: 'reload-plugin',
      name: 'Перезагрузить плагин после обновления',
      callback: () => {
        // Re-reads main.js from disk without restarting the app. Obsidian has no
        // public "reload plugin" call, so toggle it; deferred, because disabling
        // from inside a running command would pull the ground from under it.
        const id = this.manifest.id;
        window.setTimeout(async () => {
          try {
            await this.app.plugins.disablePlugin(id);
            await this.app.plugins.enablePlugin(id);
          } catch (error) {
            console.error('[uml-class-diagram] не удалось перезагрузить плагин', error);
            new Notice('UML Class Diagram: перезагрузите плагин вручную (Settings → Community plugins)');
          }
        }, 50);
      },
    });

    this.addCommand({
      id: 'open-diagram',
      name: 'Открыть готовую диаграмму',
      callback: () => this.pickFile(),
    });

    this.addCommand({
      id: 'reload-diagram',
      name: 'Перечитать открытую диаграмму',
      callback: () => this.reloadAll(),
    });

    this.addRibbonIcon('git-fork', 'UML: Создать', () => new GeneratorModal(this.app, this).open());
    this.addRibbonIcon('network', 'UML: Открыть', () => this.pickFile());

    // Always-visible entry point: the status bar button opens the list of diagrams.
    const status = this.addStatusBarItem();
    status.addClass('uml-status');
    status.setText('UML');
    status.setAttribute('aria-label', 'UML: Открыть');
    status.addEventListener('click', () => this.pickFile());

    // A diagram open in a tab follows its JSON file on disk.
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          const view = leaf.view;
          if (view && view.filePath === file.path && view.render) view.render();
        }
        this.onSourceChanged(file);
      }),
    );

    // Opening a generated note shows the diagram instead of the JSON block,
    // so a spec note needs no special command to be looked at.
    this.registerMarkdownPostProcessor((element, context) => {
      const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
      if (!file || file.extension !== 'md') return;
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache && cache.frontmatter;
      if (!frontmatter || frontmatter['uml-diagram'] !== true) return;

      const code = element.querySelector('pre > code');
      if (!code) return;

      let panel;
      try {
        const spec = __m.specfile.parseSpecText(code.textContent);
        const valid = __m.model.validateSpec(spec);
        if (!valid.ok) throw new Error(valid.errors[0].message);
        panel = __m.render.renderPanel(valid.spec);
      } catch (error) {
        this.notify(error.message);
        return;
      }

      const host = document.createElement('div');
      host.className = 'uml-host uml-embedded';
      host.innerHTML = panel.markup.replace(/\saria-label="([^"]*)"/g, ' title="$1"');
      const pre = code.closest('pre');
      if (pre) pre.replaceWith(host);
      else element.appendChild(host);

      const root = host.querySelector('.uml-diagram');
      if (root && window.__umlClassMount) {
        try {
          window.__umlClassMount(root, { autoTheme: true });
        } catch (error) {
          console.error('[uml-class-diagram] интерактив в заметке не подключился', error);
        }
      }
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  /** Rebuild quietly when a .cs file inside the watched folder changes. */
  onSourceChanged(file) {
    if (!this.settings.autoRegenerate) return;
    if (!file || file.extension !== 'cs') return;
    const folder = String(this.settings.folder || '');
    // Outside the vault there are no file events to watch.
    if (!folder || folder.includes(':') || folder.startsWith('/')) return;
    if (!file.path.startsWith(`${folder}/`)) return;

    window.clearTimeout(this.regenTimer);
    this.regenTimer = window.setTimeout(() => {
      this.generateFromFolder(Object.assign({}, this.settings, { silent: true })).catch((error) => {
        console.error('[uml-class-diagram] авто-пересборка не удалась', error);
      });
    }, 800);
  }

  /** Notice with the running version, so a stale build is obvious. */
  notify(message) {
    new Notice(`UML ${this.manifest ? this.manifest.version : '?'}: ${message}`);
  }

  async saveSettings(options) {
    this.settings = Object.assign({}, this.settings, options);
    await this.saveData(this.settings);
  }

  /** Read C# from the vault (or from disk on desktop), build a spec, save it and show it. */
  async generateFromFolder(options) {
    const folder = String(options.folder || '')
      .replace(/^\/+|\/+$/g, '')
      .trim();
    const exclude = options.exclude ? globToRegExp(options.exclude) : null;
    const isAbsolute = /^[A-Za-z]:[\\/]/.test(folder) || folder.startsWith('/');
    const root = isAbsolute ? folder.replace(/\\/g, '/') : folder;

    let files = [];
    let readText = null;

    if (isAbsolute) {
      const external = externalFiles(root);
      if (!external) {
        this.notify('внешние папки доступны только в десктопной версии');
        return;
      }
      const { fs } = external;
      files = external.files.filter((file) => {
        if (!exclude) return true;
        return !exclude.test(file.slice(root.length + 1));
      });
      readText = (file) => fs.readFileSync(file, 'utf8');
    } else {
      files = this.app.vault.getFiles().filter((file) => {
        if (file.extension !== 'cs') return false;
        if (root && !file.path.startsWith(`${root}/`)) return false;
        if (exclude) {
          const relative = root ? file.path.slice(root.length + 1) : file.path;
          if (exclude.test(relative)) return false;
        }
        return true;
      });
      readText = (file) => this.app.vault.cachedRead(file);
    }

    if (files.length === 0) {
      this.notify(`в папке «${folder || 'хранилище'}» нет .cs файлов`);
      return;
    }

    const types = [];
    for (const file of files) {
      const filePath = typeof file === 'string' ? file : file.path;
      const text = await readText(file);
      types.push(...__m.csharp.parseFile(__m.csharp.cleanSource(text), filePath));
    }

    const title =
      (options.title || '').trim() || (root ? root.split('/').pop() : 'Диаграмма классов');

    const built = __m.csharp.buildSpec(types, {
      root: root || '/',
      packageBy: options.packageBy || 'auto',
      title,
      calls: Boolean(options.calls),
      includeFields: !options.noFields,
      includeDependencies: !options.noDeps,
    });

    const valid = __m.model.validateSpec(built.spec);
    if (!valid.ok) {
      const details = valid.errors.slice(0, 3).map((item) => `${item.path}: ${item.message}`).join('; ');
      this.notify(`спека невалидна — ${details}`);
      return;
    }

    await this.saveSettings(options);
    const outPath = await this.writeSpec(built.spec, root);

    // A background refresh must not steal focus: the open tab reloads itself
    // from the file change.
    if (!options.silent) {
      await this.openPath(outPath);
      this.notify(
        `${built.spec.classes.length} классов, ${built.spec.relations.length} связей → ${outPath}`,
      );
    }
  }

  async writeSpec(spec, root) {
    const folder = OUTPUT_DIR;
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      try {
        await this.app.vault.createFolder(folder);
      } catch (error) {
        // The folder may already exist on disk without being indexed yet.
      }
    }

    const base = (root ? root.split('/').filter(Boolean).pop() : 'vault')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'diagram';
    const known = this.settings.outputs || {};
    let path = `${folder}/${base}.md`;
    if (known[path] && known[path] !== root) {
      // Same folder name in another project: keep both, disambiguate with a short hash.
      let hash = 0x811c9dc5;
      for (let i = 0; i < root.length; i += 1) {
        hash ^= root.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      path = `${folder}/${base}-${hash.toString(16).slice(0, 6)}.md`;
    }
    this.settings.outputs = Object.assign({}, known, { [path]: root });
    await this.saveData(this.settings);

    const data = __m.specfile.serializeSpec(spec, spec.title);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) {
      // Through the vault, not the adapter: only this keeps the index and the
      // file explorer in sync.
      await this.app.vault.modify(existing, data);
      return path;
    }

    try {
      await this.app.vault.create(path, data);
    } catch (error) {
      // The folder may exist on disk while Obsidian's index does not know it
      // (for example after the folder was deleted outside the app).
      console.warn('[uml-class-diagram] не удалось создать файл в папке, пишу в корень', error);
    }

    if (this.app.vault.getAbstractFileByPath(path)) return path;

    // Fallback that always works: the vault root is indexed by definition.
    const rootPath = `${base}.md`;
    const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
    if (rootFile) await this.app.vault.modify(rootFile, data);
    else await this.app.vault.create(rootPath, data);
    this.notify(`папку ${folder} Obsidian не видит, диаграмма сохранена в корень: ${rootPath}`);
    return rootPath;
  }

  pickFile() {
    const files = this.app.vault
      .getFiles()
      .filter((file) => {
        if (file.extension === 'json') return !file.path.startsWith('.obsidian/');
        // Generated specs live as notes under UML/.
        return file.extension === 'md' && file.path.startsWith(`${OUTPUT_DIR}/`);
      })
      .sort((left, right) => (right.stat ? right.stat.mtime : 0) - (left.stat ? left.stat.mtime : 0));

    if (files.length === 0) {
      this.notify('готовых диаграмм пока нет — открываю генератор');
      new GeneratorModal(this.app, this).open();
      return;
    }
    new FilePicker(this.app, files, (file) => this.openFile(file)).open();
  }

  async openFile(file) {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { file: file.path } });
  }

  async openPath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) await this.openFile(file);
  }

  reloadAll() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && view.render) view.render();
    }
  }
}

module.exports = UmlClassPlugin;
