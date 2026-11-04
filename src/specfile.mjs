// Spec files inside an Obsidian vault.
//
// Obsidian's file explorer shows notes and attachments, not arbitrary .json files,
// so a spec is stored as a Markdown note with the JSON in a fenced block. That keeps
// it visible, searchable and diffable, while staying trivial to parse.

export function serializeSpec(spec, title) {
  return [
    '---',
    'uml-diagram: true',
    `title: ${JSON.stringify(title || '')}`,
    '---',
    '',
    '```json',
    JSON.stringify(spec, null, 2),
    '```',
    '',
  ].join('\n');
}

export function parseSpecText(text) {
  const trimmed = String(text).replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new Error('файл пуст');
  // A plain .json file, for specs produced elsewhere.
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const body = trimmed.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const fence = body.match(/```(?:json|uml)?[^\S\r\n]*\r?\n([\s\S]*?)```/);
  if (!fence) throw new Error('в файле нет блока ```json со спекой');
  return JSON.parse(fence[1]);
}
