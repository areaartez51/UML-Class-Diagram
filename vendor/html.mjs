// Self-contained HTML shell: dark theme, coloured classes, member highlight, drag.

import { escapeXml } from './routing.mjs';

import { STYLE } from './theme.mjs';
import { CLIENT } from './client.mjs';

export function renderHtml(spec, svgData, uid = '') {
  const title = escapeXml(spec.title);
  const stats = `${svgData.stats.classes} классов · ${svgData.stats.relations} связей`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style data-uml-style>${STYLE}</style>
</head>
<body class="uml-page">
<div class="uml-diagram" data-uml-diagram data-uid="${uid}" data-theme="dark">
<header class="bar">
  <div class="title">${title}</div>
  <div class="meta">${stats}</div>
  <div class="spacer"></div>
  <input data-uml="q" class="search" type="search" placeholder="Поиск класса…" aria-label="Поиск класса">
</header>
<div class="wrap" data-uml="wrap">
  ${svgData.svg}
  <div class="panel-dock" data-uml="dock">
    <div class="panel" data-uml="panel" hidden>
      <div class="panel-row">
        <label class="slider">Заливка <input data-uml="alpha" type="range" min="0" max="80" value="26" aria-label="Прозрачность заливки классов"></label>
        <label class="slider">Линии <input data-uml="lines" type="range" min="50" max="300" value="100" aria-label="Толщина линий связей"></label>
      </div>
      <div class="panel-row panel-pairs">
        <button data-uml="expand-all" type="button">Развернуть все</button>
        <button data-uml="collapse-all" type="button">Свернуть все</button>
        <button data-uml="theme" type="button" aria-label="Переключить тему">Тема</button>
        <button data-uml="legend-toggle" type="button" aria-expanded="false">Легенда</button>
      </div>
      <div class="panel-row panel-wide">
        <button data-uml="reset" type="button">Центрировать</button>
        <button data-uml="reset-layout" type="button">Пересобрать диаграмму</button>
        <button data-uml="unfreeze" type="button" hidden>Снять закрепление</button>
      </div>
      <div class="panel-row panel-pairs">
        <button data-uml="export-svg" type="button">Скачать SVG</button>
        <button data-uml="export-png" type="button">Скачать PNG</button>
      </div>
    </div>
    <button data-uml="panel-toggle" class="panel-toggle" type="button" aria-expanded="false" title="Панель управления">Панель</button>
  </div>
  <div class="legend" data-uml="legend" hidden>
    <h4>Обозначения</h4>
    <div class="legend-row">
      <svg width="58" height="16" viewBox="0 0 58 16" aria-hidden="true">
        <line x1="2" y1="8" x2="42" y2="8" stroke="currentColor" stroke-width="1.6"/>
        <polygon points="56,8 42,3 42,13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
      <span>сплошная + полый треугольник — наследование</span>
    </div>
    <div class="legend-row">
      <svg width="58" height="16" viewBox="0 0 58 16" aria-hidden="true">
        <line x1="2" y1="8" x2="42" y2="8" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 4"/>
        <polygon points="56,8 42,3 42,13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
      <span>пунктир + полый треугольник — реализация интерфейса</span>
    </div>
    <div class="legend-row">
      <svg width="58" height="16" viewBox="0 0 58 16" aria-hidden="true">
        <line x1="2" y1="8" x2="44" y2="8" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 4"/>
        <path d="M 44 3 L 56 8 L 44 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>пунктир + стрелка — зависимость (вызов, использование)</span>
    </div>
    <div class="legend-row">
      <svg width="58" height="16" viewBox="0 0 58 16" aria-hidden="true">
        <line x1="2" y1="8" x2="44" y2="8" stroke="currentColor" stroke-width="1.6"/>
        <path d="M 44 3 L 56 8 L 44 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>сплошная + стрелка — ассоциация, композиция, агрегация</span>
    </div>
    <div class="legend-note">Цвет линии — градиент от цвета класса-источника к цвету класса-цели. Ромбов нет: композиция и агрегация рисуются обычной стрелкой.</div>
    <div class="legend-hint">Класс можно перетащить. Наведите на поле или метод — подсветится его связь. Стрелка внизу раскрывает детали.</div>
  </div>
</div>
</div>
<script>${CLIENT}</script>
</body>
</html>
`;
}
