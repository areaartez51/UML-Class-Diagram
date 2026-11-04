// Browser interactivity: highlight, freeze, drag, zoom, pan, search, theme.
// Exported as a string so a host can inject it next to the markup it owns.

export const CLIENT = `
(function () {
  'use strict';

  // Everything below is scoped to one container, so several diagrams can share a page.
  function mount(root, options) {
  options = options || {};
  var svg = root.querySelector('[data-uml="canvas"]');
  var wrap = root.querySelector('[data-uml="wrap"]');
  var uid = svg ? svg.getAttribute('data-uid') || '' : '';
  if (!svg || !wrap) return;

  var view = { scale: 1, tx: 0, ty: 0 };
  // Once the reader zooms or pans, a host resize must not snap the view back.
  var userAdjusted = false;
  var HEADER = 28;

  function applyView() {
    svg.style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.scale + ')';
  }

  function fit() {
    var rect = wrap.getBoundingClientRect();
    // Layout may not have settled yet (hidden tab, freshly created view):
    // fitting against an empty box would throw the drawing to the top corner.
    if (rect.width < 40 || rect.height < 40) return;
    var vb = svg.viewBox.baseVal;
    var k = Math.min((rect.width - 90) / vb.width, (rect.height - 90) / vb.height, 1);
    view.scale = Math.max(0.15, k || 1);
    view.tx = (rect.width - vb.width * view.scale) / 2;
    view.ty = Math.max(10, (rect.height - vb.height * view.scale) / 2);
    applyView();
  }

  function nodeById(id) {
    return svg.querySelector('[data-node="' + id + '"]');
  }

  function rectOf(node) {
    return {
      x: Number(node.getAttribute('data-x')),
      y: Number(node.getAttribute('data-y')),
      w: Number(node.getAttribute('data-w')),
      h: Number(node.getAttribute('data-h'))
    };
  }

  function anchorY(node, rawAnchor) {
    var expanded = node.getAttribute('data-expanded') === 'true';
    var rect = rectOf(node);
    if (expanded && rawAnchor) return rect.y + Number(rawAnchor);
    return rect.y + HEADER;
  }

  // Package frames are the zones: their current rect gives the border coordinates.
  function packageRects() {
    var map = {};
    var packages = svg.querySelectorAll('.package[data-package]');
    for (var i = 0; i < packages.length; i += 1) {
      var frame = packages[i].querySelector('.package-frame');
      if (!frame) continue;
      var x = Number(frame.getAttribute('x'));
      var y = Number(frame.getAttribute('y'));
      var w = Number(frame.getAttribute('width'));
      var h = Number(frame.getAttribute('height'));
      var zone = { left: x, right: x + w, top: y, bottom: y + h };
      var ids = (packages[i].getAttribute('data-members') || '').split(',');
      for (var j = 0; j < ids.length; j += 1) {
        if (ids[j]) map[ids[j]] = zone;
      }
    }
    return map;
  }

  function claim(x, top, bottom, used, clear) {
    var candidate = x;
    for (var attempt = 0; attempt < 12; attempt += 1) {
      var clash = false;
      for (var i = 0; i < used.length; i += 1) {
        var entry = used[i];
        if (Math.abs(entry.x - candidate) < 16 && entry.top < bottom && entry.bottom > top) { clash = true; break; }
      }
      if (!clash && clear(candidate)) {
        used.push({ x: candidate, top: top, bottom: bottom });
        return candidate;
      }
      candidate += 30;
    }
    used.push({ x: candidate, top: top, bottom: bottom });
    return candidate;
  }

  function route(from, to, yFrom, yTo, obstacles, used, zone) {
    var top = Math.min(yFrom, yTo);
    var bottom = Math.max(yFrom, yTo);
    function clear(x) {
      for (var i = 0; i < obstacles.length; i += 1) {
        var n = obstacles[i];
        if (x > n.x - 12 && x < n.x + n.w + 12 && n.y < bottom && n.y + n.h > top) return false;
      }
      return true;
    }
    function taken(x) {
      for (var i = 0; i < used.length; i += 1) {
        var entry = used[i];
        if (Math.abs(entry.x - x) < 16 && entry.top < bottom && entry.bottom > top) return true;
      }
      return false;
    }
    function inside(x) {
      return !zone || (x > zone.left + 12 && x < zone.right - 12);
    }
    function clampX(x) {
      return zone ? Math.min(Math.max(x, zone.left + 14), zone.right - 14) : x;
    }

    var cF = from.x + from.w / 2;
    var cT = to.x + to.w / 2;
    var overlapping = Math.abs(cF - cT) < (from.w + to.w) / 2 - 6;

    if (overlapping) {
      var corridor = clampX(Math.max(from.x + from.w, to.x + to.w) + 26);
      var guard = 0;
      while ((!clear(corridor) || !inside(corridor)) && guard < 40) { corridor += 34; guard += 1; }
      corridor = claim(corridor, top, bottom, used, clear);
      return [[from.x + from.w, yFrom], [corridor, yFrom], [corridor, yTo], [to.x + to.w, yTo]];
    }

    var toRight = cT > cF;
    var startX = toRight ? from.x + from.w : from.x;
    var endX = toRight ? to.x : to.x + to.w;
    var midX = clampX((startX + endX) / 2);
    var corridor2 = null;

    if (inside(midX) && clear(midX) && !taken(midX)) {
      corridor2 = midX;
    } else {
      var candidates = [];
      for (var j = 0; j < obstacles.length; j += 1) {
        candidates.push(obstacles[j].x - 22, obstacles[j].x + obstacles[j].w + 22);
      }
      candidates.sort(function (a, b) { return Math.abs(a - midX) - Math.abs(b - midX) || a - b; });
      for (var k = 0; k < candidates.length; k += 1) {
        var candidate = candidates[k];
        if (candidate <= Math.min(startX, endX) + 6 || candidate >= Math.max(startX, endX) - 6) continue;
        if (!inside(candidate) || !clear(candidate) || taken(candidate)) continue;
        corridor2 = candidate;
        break;
      }
    }

    if (corridor2 === null) {
      var far = clampX(Math.max(from.x + from.w, to.x + to.w) + 26);
      var guard2 = 0;
      while ((!clear(far) || !inside(far)) && guard2 < 40) { far += 34; guard2 += 1; }
      corridor2 = claim(far, top, bottom, used, clear);
      return [[from.x + from.w, yFrom], [corridor2, yFrom], [corridor2, yTo], [to.x + to.w, yTo]];
    }

    used.push({ x: corridor2, top: top, bottom: bottom });
    return [[startX, yFrom], [corridor2, yFrom], [corridor2, yTo], [endX, yTo]];
  }

  function routeIntra(from, to, yFrom, yTo) {
    var exitX = from.x + from.w;
    var entryX = to.x;
    if (entryX > exitX + 8) {
      var midX = (exitX + entryX) / 2;
      if (Math.abs(yTo - yFrom) < 0.5) {
        return [[exitX, yFrom], [entryX, yTo]];
      }
      return [[exitX, yFrom], [midX, yFrom], [midX, yTo], [entryX, yTo]];
    }
    var below = yTo >= yFrom;
    var laneY = below ? to.y + to.h + 16 : to.y - 16;
    var outX = exitX + 22;
    var inX = entryX - 22;
    return [
      [exitX, yFrom],
      [outX, yFrom],
      [outX, laneY],
      [inX, laneY],
      [inX, yTo],
      [entryX, yTo]
    ];
  }

  function toPath(points) {
    var d = 'M ' + points[0][0] + ' ' + points[0][1];
    for (var i = 1; i < points.length; i += 1) d += ' L ' + points[i][0] + ' ' + points[i][1];
    return d;
  }

  function dedupePoints(points) {
    var result = [];
    for (var i = 0; i < points.length; i += 1) {
      var point = points[i];
      var previous = result[result.length - 1];
      if (previous && Math.abs(previous[0] - point[0]) < 0.01 && Math.abs(previous[1] - point[1]) < 0.01) continue;
      result.push(point);
    }
    return result.length >= 2 ? result : points;
  }

  function longestSegment(points) {
    var best = null;
    for (var i = 1; i < points.length; i += 1) {
      var a = points[i - 1], b = points[i];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!best || len > best.len) best = { len: len, a: a, b: b };
    }
    return best;
  }

  function applyEdge(edge, used) {
    var from = nodeById(edge.getAttribute('data-from'));
    var to = nodeById(edge.getAttribute('data-to'));
    if (!from || !to) return;

    var fr = rectOf(from), tr = rectOf(to);
    var yFrom = anchorY(from, edge.getAttribute('data-from-anchor'));
    var yTo = anchorY(to, edge.getAttribute('data-to-anchor'));

    var obstacles = [];
    var all = svg.querySelectorAll('[data-node]');
    for (var q = 0; q < all.length; q += 1) {
      if (all[q] === from || all[q] === to) continue;
      obstacles.push(rectOf(all[q]));
    }

    var points = [];
    var exitPoint = null;
    var entryPoint = null;
    var zones = packageRects();
    var zoneFrom = zones[from.getAttribute('data-node')] || null;
    var zoneTo = zones[to.getAttribute('data-node')] || null;

    if (zoneFrom && zoneTo && zoneFrom !== zoneTo) {
      // Crossing zones: right border out, left border in.
      var rightward = (zoneTo.left + zoneTo.right) / 2 > (zoneFrom.left + zoneFrom.right) / 2;
      var startX = rightward ? fr.x + fr.w : fr.x;
      var endX = rightward ? tr.x : tr.x + tr.w;
      var exitX = rightward ? zoneFrom.right : zoneFrom.left;
      var entryX = rightward ? zoneTo.left : zoneTo.right;
      var gapMid = (exitX + entryX) / 2;
      gapMid = claim(gapMid, Math.min(yFrom, yTo), Math.max(yFrom, yTo), used, function () { return true; });
      exitPoint = [exitX, yFrom];
      entryPoint = [entryX, yTo];
      points = [
        [startX, yFrom],
        [exitX, yFrom],
        [gapMid, yFrom],
        [gapMid, yTo],
        [entryX, yTo],
        [endX, yTo]
      ];
    } else {
      points = routeIntra(fr, tr, yFrom, yTo);
    }
    points = dedupePoints(points);

    var exitPin = edge.querySelector('.zonepin[data-role="exit"]');
    if (exitPin) {
      if (exitPoint) {
        exitPin.setAttribute('cx', exitPoint[0]);
        exitPin.setAttribute('cy', exitPoint[1]);
        exitPin.removeAttribute('display');
      } else {
        exitPin.setAttribute('display', 'none');
      }
    }
    var entryPin = edge.querySelector('.zonepin[data-role="entry"]');
    if (entryPin) {
      if (entryPoint) {
        entryPin.setAttribute('cx', entryPoint[0]);
        entryPin.setAttribute('cy', entryPoint[1]);
        entryPin.removeAttribute('display');
      } else {
        entryPin.setAttribute('display', 'none');
      }
    }
    var last = points[points.length - 1];
    var prev = points[points.length - 2];
    var dx = last[0] - prev[0], dy = last[1] - prev[1];
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    var kind = edge.getAttribute('data-kind');
    var head = (kind === 'inheritance' || kind === 'realization') ? 15 : 13;
    var trimmed = points.slice(0, points.length - 1);
    trimmed.push([last[0] - ux * head, last[1] - uy * head]);

    var line = edge.querySelector('path.line');
    if (line) {
      line.setAttribute('d', toPath(trimmed));
    }

    var headWrap = edge.querySelector('.head-wrap');
    if (headWrap) {
      var angle = Math.atan2(uy, ux) * 180 / Math.PI;
      headWrap.setAttribute('transform', 'translate(' + last[0] + ',' + last[1] + ') rotate(' + angle + ')');
    }

    var gradient = root.querySelector('#eg-' + uid + '-' + edge.getAttribute('data-edge'));
    if (gradient) {
      gradient.setAttribute('x1', points[0][0]);
      gradient.setAttribute('y1', points[0][1]);
      gradient.setAttribute('x2', last[0]);
      gradient.setAttribute('y2', last[1]);
    }

    var label = edge.querySelector('.edge-label');
    if (label) {
      var rect = label.querySelector('rect');
      var seg = longestSegment(trimmed);
      if (seg && rect) {
        var horizontal = Math.abs(seg.a[0] - seg.b[0]) >= Math.abs(seg.a[1] - seg.b[1]);
        var cx = horizontal ? (seg.a[0] + seg.b[0]) / 2 : (seg.a[0] + seg.b[0]) / 2 + 13;
        var ordinal = Number(edge.getAttribute('data-ordinal') || 0);
        var spread = 0.22 + (ordinal % 4) * 0.16;
        var cy = horizontal
          ? (seg.a[1] + seg.b[1]) / 2 - 13
          : seg.a[1] + (seg.b[1] - seg.a[1]) * spread;
        var w = Number(rect.getAttribute('width'));
        var h = Number(rect.getAttribute('height'));
        label.setAttribute('transform', 'translate(' + (cx - w / 2) + ',' + (cy - h / 2) + ')');
      }
    }
  }

  function rerouteAll() {
    var edges = svg.querySelectorAll('[data-edge]');
    var used = [];
    for (var i = 0; i < edges.length; i += 1) applyEdge(edges[i], used);
    syncPins();
  }

  // One pin per member per side, on the field boundary, only where an edge really leaves.
  function syncPins() {
    var pins = svg.querySelectorAll('.pin-group');
    if (!pins.length) return;
    var need = {};
    var zones = packageRects();
    var edges = svg.querySelectorAll('[data-edge]');
    for (var i = 0; i < edges.length; i += 1) {
      var edge = edges[i];
      var from = nodeById(edge.getAttribute('data-from'));
      var to = nodeById(edge.getAttribute('data-to'));
      if (!from || !to) continue;
      var fr = rectOf(from);
      var tr = rectOf(to);
      var zoneFrom = zones[from.getAttribute('data-node')] || null;
      var zoneTo = zones[to.getAttribute('data-node')] || null;
      var rightward = true;
      if (zoneFrom && zoneTo && zoneFrom !== zoneTo) {
        rightward = (zoneTo.left + zoneTo.right) / 2 > (zoneFrom.left + zoneFrom.right) / 2;
      }
      var fromMember = edge.getAttribute('data-from-member');
      var toMember = edge.getAttribute('data-to-member');
      if (fromMember !== '') {
        need[edge.getAttribute('data-from') + '|' + fromMember + '|' + (rightward ? 'right' : 'left')] = true;
      }
      if (toMember !== '') {
        need[edge.getAttribute('data-to') + '|' + toMember + '|' + (rightward ? 'left' : 'right')] = true;
      }
    }
    for (var j = 0; j < pins.length; j += 1) {
      var pin = pins[j];
      var key =
        pin.getAttribute('data-node') + '|' + pin.getAttribute('data-member') + '|' + pin.getAttribute('data-side');
      pin.classList.toggle('off', !need[key]);
    }
  }

  function syncPackages() {
    var groups = svg.querySelectorAll('.package[data-members]');
    for (var i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var ids = group.getAttribute('data-members').split(',').filter(Boolean);
      var member = {};
      for (var m = 0; m < ids.length; m += 1) member[ids[m]] = true;

      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var j = 0; j < ids.length; j += 1) {
        var node = nodeById(ids[j]);
        if (!node) continue;
        var r = rectOf(node);
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
      }
      if (!isFinite(minX)) continue;

      // The frame hugs the classes: no expansion by line waypoints.
      var left = minX - 26, top = minY - 34;
      var width = maxX - minX + 52;
      var height = maxY - minY + 56;
      var frame = group.querySelector('.package-frame');
      var hit = group.querySelector('.package-hit');
      if (frame) {
        frame.setAttribute('x', left);
        frame.setAttribute('y', top);
        frame.setAttribute('width', width);
        frame.setAttribute('height', height);
      }
      if (hit) {
        hit.setAttribute('x', left);
        hit.setAttribute('y', top);
        hit.setAttribute('width', width);
        hit.setAttribute('height', height);
      }
      var label = group.querySelector('.package-label');
      if (label) label.setAttribute('transform', 'translate(' + (left + 14) + ',' + (top - 12) + ')');
    }
  }

  function syncBounds() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var nodes = svg.querySelectorAll('[data-node]');
    for (var i = 0; i < nodes.length; i += 1) {
      var r = rectOf(nodes[i]);
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    var edges = svg.querySelectorAll('[data-edge]');
    for (var j = 0; j < edges.length; j += 1) {
      var pairs = (edges[j].getAttribute('data-points') || '').split(' ').filter(Boolean);
      for (var k = 0; k < pairs.length; k += 1) {
        var xy = pairs[k].split(',');
        minX = Math.min(minX, Number(xy[0]));
        minY = Math.min(minY, Number(xy[1]));
        maxX = Math.max(maxX, Number(xy[0]));
        maxY = Math.max(maxY, Number(xy[1]));
      }
    }
    if (!isFinite(minX)) return;
    var pad = 48;
    var width = Math.ceil(maxX - minX + pad * 2);
    var height = Math.ceil(maxY - minY + pad * 2);
    var nextX = Math.floor(minX) - pad;
    var nextY = Math.floor(minY) - pad;
    var previous = svg.viewBox.baseVal;
    var oldX = previous ? previous.x : nextX;
    var oldY = previous ? previous.y : nextY;
    svg.setAttribute('viewBox', nextX + ' ' + nextY + ' ' + width + ' ' + height);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    // The viewBox origin moved, so the same transform would shift the drawing.
    // Compensate to keep every class where the reader sees it now.
    view.tx += (nextX - oldX) * view.scale;
    view.ty += (nextY - oldY) * view.scale;
    applyView();
  }

  function toggleNode(node, force) {
    var expanded = node.getAttribute('data-expanded') === 'true';
    var target = typeof force === 'boolean' ? force : !expanded;
    if (target === expanded) return;

    var box = node.querySelector('rect.box');
    var stripe = node.querySelector('rect.stripe');
    var body = node.querySelector('rect.body');
    var expander = node.querySelector('.expander');
    var members = node.querySelector('.members');
    if (!box || !expander || !members) return;

    var delta = Number(node.getAttribute('data-expand-delta') || 0);
    var height = Number(box.getAttribute('height'));
    var next = target ? height + delta : height - delta;

    box.setAttribute('height', String(next));
    if (stripe) stripe.setAttribute('height', String(next));
    if (body) {
      if (target) body.removeAttribute('hidden');
      else body.setAttribute('hidden', '');
    }
    node.setAttribute('data-h', String(next));
    expander.setAttribute('transform', 'translate(0,' + (next - 20) + ')');
    if (target) members.removeAttribute('hidden');
    else members.setAttribute('hidden', '');
    var pins = node.querySelector('.pins');
    if (pins) {
      if (target) pins.removeAttribute('hidden');
      else pins.setAttribute('hidden', '');
    }

    node.setAttribute('data-expanded', String(target));
    var toggle = node.querySelector('[data-expand-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', String(target));

    rerouteAll();
    syncBounds();
  }

  // ---------- node dragging ----------
  function startPackageDrag(group, event) {
    event.stopPropagation();
    var ids = (group.getAttribute('data-members') || '').split(',').filter(Boolean);
    if (ids.length === 0) {
      var pkgId = group.getAttribute('data-package');
      var every = svg.querySelectorAll('[data-node]');
      for (var q = 0; q < every.length; q += 1) {
        if (every[q].getAttribute('data-pkg') === pkgId) ids.push(every[q].getAttribute('data-node'));
      }
    }
    var entries = [];
    for (var i = 0; i < ids.length; i += 1) {
      var node = nodeById(ids[i]);
      if (!node) continue;
      entries.push({
        node: node,
        x: Number(node.getAttribute('data-x')),
        y: Number(node.getAttribute('data-y'))
      });
    }
    var frame = group.querySelector('.package-frame');
    var hit = group.querySelector('.package-hit');
    var label = group.querySelector('.package-label');
    var frameBox = frame
      ? { x: Number(frame.getAttribute('x')), y: Number(frame.getAttribute('y')) }
      : null;
    var labelPos = frameBox ? { x: frameBox.x + 14, y: frameBox.y - 12 } : null;

    var startX = event.clientX;
    var startY = event.clientY;

    function move(moveEvent) {
      var dx = (moveEvent.clientX - startX) / view.scale;
      var dy = (moveEvent.clientY - startY) / view.scale;

      for (var j = 0; j < entries.length; j += 1) {
        var item = entries[j];
        var nx = item.x + dx;
        var ny = item.y + dy;
        item.node.setAttribute('data-x', String(nx));
        item.node.setAttribute('data-y', String(ny));
        item.node.setAttribute('transform', 'translate(' + nx + ',' + ny + ')');
      }

      // The frame is a rigid container: it moves, it does not re-measure while dragging.
      if (frameBox) {
        var fx = frameBox.x + dx;
        var fy = frameBox.y + dy;
        if (frame) {
          frame.setAttribute('x', String(fx));
          frame.setAttribute('y', String(fy));
        }
        if (hit) {
          hit.setAttribute('x', String(fx));
          hit.setAttribute('y', String(fy));
        }
      }
      if (labelPos && label) {
        label.setAttribute('transform', 'translate(' + (labelPos.x + dx) + ',' + (labelPos.y + dy) + ')');
      }

      rerouteAll();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      syncPackages();
      syncBounds();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  svg.addEventListener('pointerdown', function (event) {
    var node = event.target.closest && event.target.closest('[data-node]');
    if (!node) {
      var group = event.target.closest && event.target.closest('.package');
      if (group) startPackageDrag(group, event);
      return;
    }
    if (event.target.closest('[data-expand-toggle]')) return;
    if (event.target.closest('[data-member]')) return;
    event.stopPropagation();

    var startX = event.clientX, startY = event.clientY;
    var baseX = Number(node.getAttribute('data-x'));
    var baseY = Number(node.getAttribute('data-y'));

    function move(moveEvent) {
      var dx = (moveEvent.clientX - startX) / view.scale;
      var dy = (moveEvent.clientY - startY) / view.scale;
      var nx = baseX + dx;
      var ny = baseY + dy;
      node.setAttribute('data-x', String(nx));
      node.setAttribute('data-y', String(ny));
      node.setAttribute('transform', 'translate(' + nx + ',' + ny + ')');
      rerouteAll();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      syncPackages();
      syncBounds();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // ---------- zoom / pan ----------
  wrap.addEventListener('wheel', function (event) {
    event.preventDefault();
    var rect = wrap.getBoundingClientRect();
    var mx = event.clientX - rect.left;
    var my = event.clientY - rect.top;
    var factor = Math.exp(-event.deltaY * 0.0015);
    var next = Math.min(4, Math.max(0.12, view.scale * factor));
    view.tx = mx - (mx - view.tx) * (next / view.scale);
    view.ty = my - (my - view.ty) * (next / view.scale);
    view.scale = next;
    userAdjusted = true;
    applyView();
  }, { passive: false });

  function startPan(event) {
    var startX = event.clientX - view.tx;
    var startY = event.clientY - view.ty;

    function move(moveEvent) {
      view.tx = moveEvent.clientX - startX;
      view.ty = moveEvent.clientY - startY;
      userAdjusted = true;
      wrap.classList.add('dragging');
      applyView();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      wrap.classList.remove('dragging');
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // Right button drags the canvas from anywhere, including over nodes and lines.
  // Capture phase: it must win over node dragging, edge freezing and pane scrolling.
  root.addEventListener(
    'pointerdown',
    function (event) {
      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      startPan(event);
    },
    true,
  );
  root.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  wrap.addEventListener('pointerdown', function (event) {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.target.closest && event.target.closest('[data-expand-toggle]')) return;
    if (event.target.closest && event.target.closest('[data-node]')) return;
    // The panel and its button float above the canvas: they must not start a pan.
    if (event.target.closest && event.target.closest('.panel-dock')) return;
    event.preventDefault();
    startPan(event);
  });

  // ---------- export ----------
  function diagramName() {
    var titleEl = root.querySelector('.title');
    var raw = titleEl ? titleEl.textContent : 'diagram';
    return (raw || 'diagram')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'diagram';
  }

  function svgSource() {
    var clone = svg.cloneNode(true);
    clone.removeAttribute('style');
    clone.removeAttribute('id');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    var theme = root.getAttribute('data-theme') || 'dark';
    clone.setAttribute('data-theme', theme);

    var vb = svg.viewBox.baseVal;
    var backdrop = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backdrop.setAttribute('x', vb.x);
    backdrop.setAttribute('y', vb.y);
    backdrop.setAttribute('width', vb.width);
    backdrop.setAttribute('height', vb.height);
    backdrop.setAttribute('fill', theme === 'light' ? '#f6f7f9' : '#0e1116');

    // The page stylesheet is scoped to the container; in a standalone file the
    // root element is the svg itself, so the scope selector becomes "svg".
    var styleEl = document.querySelector('style[data-uml-style]');
    var css = styleEl ? styleEl.textContent.split('.uml-diagram').join('svg') : '';
    var styleNode = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleNode.textContent = css;

    var defs = clone.querySelector('defs');
    if (defs) defs.parentNode.insertBefore(styleNode, defs);
    else clone.insertBefore(styleNode, clone.firstChild);
    styleNode.parentNode.insertBefore(backdrop, styleNode.nextSibling);

    return new XMLSerializer().serializeToString(clone);
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  var exportSvg = root.querySelector('[data-uml="export-svg"]');
  if (exportSvg) {
    exportSvg.addEventListener('click', function () {
      saveBlob(new Blob([svgSource()], { type: 'image/svg+xml;charset=utf-8' }), diagramName() + '.svg');
    });
  }

  var exportPng = root.querySelector('[data-uml="export-png"]');
  if (exportPng) {
    exportPng.addEventListener('click', function () {
      var blob = new Blob([svgSource()], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var image = new Image();
      image.onload = function () {
        var vb = svg.viewBox.baseVal;
        var scale = Math.min(2, 4200 / Math.max(vb.width, vb.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(vb.width * scale));
        canvas.height = Math.max(1, Math.round(vb.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (png) {
          URL.revokeObjectURL(url);
          if (png) saveBlob(png, diagramName() + '.png');
        }, 'image/png');
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
      };
      image.src = url;
    });
  }

  // ---------- highlight ----------
  function clearHighlight() {
    var marked = svg.querySelectorAll('.hl, .dim, .hit');
    for (var i = 0; i < marked.length; i += 1) {
      marked[i].classList.remove('hl');
      marked[i].classList.remove('dim');
      marked[i].classList.remove('hit');
    }
  }

  function highlightNode(node) {
    var id = node.getAttribute('data-node');
    var edges = svg.querySelectorAll('[data-edge]');
    var incident = [];
    for (var e = 0; e < edges.length; e += 1) {
      if (edges[e].getAttribute('data-from') === id || edges[e].getAttribute('data-to') === id) {
        incident.push(edges[e]);
      }
    }
    // Nothing to point at: keep the diagram as is, do not dim the whole canvas.
    if (incident.length === 0) {
      clearHighlight();
      return;
    }

    var near = (node.getAttribute('data-neighbors') || '').split(',').filter(Boolean);
    var keep = {};
    keep[id] = true;
    for (var k = 0; k < near.length; k += 1) keep[near[k]] = true;

    var nodes = svg.querySelectorAll('[data-node]');
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].classList.add(keep[nodes[i].getAttribute('data-node')] ? 'hl' : 'dim');
    }
    for (var j = 0; j < edges.length; j += 1) {
      var isIncident = edges[j].getAttribute('data-from') === id || edges[j].getAttribute('data-to') === id;
      edges[j].classList.add(isIncident ? 'hl' : 'dim');
    }
  }

  function markEndRow(nodeId, index) {
    if (!index) return;
    var node = nodeById(nodeId);
    if (!node) return;
    var row = node.querySelector('.member-row[data-member="' + index + '"]');
    if (row) row.classList.add('hl');
  }

  // Only the relation itself lights up: the line, its two ends and their member rows.
  function highlightEdge(edge) {
    var fromId = edge.getAttribute('data-from');
    var toId = edge.getAttribute('data-to');
    var edges = svg.querySelectorAll('[data-edge]');
    for (var i = 0; i < edges.length; i += 1) {
      if (edges[i] === edge) edges[i].classList.add('hl');
      else edges[i].classList.add('dim');
    }
    var nodes = svg.querySelectorAll('g.node');
    for (var j = 0; j < nodes.length; j += 1) {
      var id = nodes[j].getAttribute('data-node');
      nodes[j].classList.add(id === fromId || id === toId ? 'hl' : 'dim');
    }
    markEndRow(fromId, edge.getAttribute('data-from-member'));
    markEndRow(toId, edge.getAttribute('data-to-member'));
  }

  // A member row and its pin are the same thing: both point at the member's relations.
  function highlightMember(row) {
    var node = row.closest('g.node');
    if (!node) return;
    var id = node.getAttribute('data-node');
    var index = row.getAttribute('data-member');
    var keep = {};
    keep[id] = true;
    var peers = [];
    var hits = [];

    var edges = svg.querySelectorAll('[data-edge]');
    for (var i = 0; i < edges.length; i += 1) {
      var edge = edges[i];
      var fromId = edge.getAttribute('data-from');
      var toId = edge.getAttribute('data-to');
      if (fromId === id && edge.getAttribute('data-from-member') === index) {
        hits.push(edge);
        keep[toId] = true;
        peers.push([toId, edge.getAttribute('data-to-member')]);
      } else if (toId === id && edge.getAttribute('data-to-member') === index) {
        hits.push(edge);
        keep[fromId] = true;
        peers.push([fromId, edge.getAttribute('data-from-member')]);
      } else {
        edge.classList.add('dim');
      }
    }

    // No relation behind this member: darken everything exactly like a relation hover does,
    // but without lighting any line up. The class being inspected stays readable.
    if (hits.length === 0) {
      clearHighlight();
      var voidNodes = svg.querySelectorAll('g.node');
      for (var vn = 0; vn < voidNodes.length; vn += 1) {
        if (voidNodes[vn] !== node) voidNodes[vn].classList.add('dim');
      }
      var voidEdges = svg.querySelectorAll('[data-edge]');
      for (var ve = 0; ve < voidEdges.length; ve += 1) voidEdges[ve].classList.add('dim');
      row.classList.add('hl');
      return;
    }
    for (var j = 0; j < hits.length; j += 1) hits[j].classList.add('hl');

    var nodes = svg.querySelectorAll('g.node');
    for (var k = 0; k < nodes.length; k += 1) {
      nodes[k].classList.add(keep[nodes[k].getAttribute('data-node')] ? 'hl' : 'dim');
    }

    row.classList.add('hl');
    for (var m = 0; m < peers.length; m += 1) {
      var peer = nodeById(peers[m][0]);
      var peerIndex = peers[m][1];
      if (!peer || !peerIndex) continue;
      var peerRow = peer.querySelector('.member-row[data-member="' + peerIndex + '"]');
      if (peerRow) peerRow.classList.add('hl');
    }
  }

  function rowFromTarget(target) {
    var row = target.closest && target.closest('.member-row');
    if (row) return row;
    var pin = target.closest && target.closest('.pin-group');
    if (!pin) return null;
    var owner = pin.closest('g.node');
    if (!owner) return null;
    return owner.querySelector('.member-row[data-member="' + pin.getAttribute('data-member') + '"]');
  }

  function anyExpanded() {
    return svg.querySelector('g.node[data-expanded="true"]') !== null;
  }

  svg.addEventListener('mouseover', function (event) {
    // A frozen relation owns the canvas: hover must not override it.
    if (frozenEdge !== null) return;
    var edge = event.target.closest && event.target.closest('.edge');
    if (edge) {
      clearHighlight();
      // Relations light up on direct hover, but only while some class is expanded.
      // Collapsed mode keeps its original behaviour: the class hover shows its links.
      if (!anyExpanded()) return;
      highlightEdge(edge);
      return;
    }
    var row = rowFromTarget(event.target);
    if (row) {
      clearHighlight();
      highlightMember(row);
      return;
    }
    var node = event.target.closest && event.target.closest('g.node');
    if (node) {
      clearHighlight();
      // An expanded class is a container: its box and section titles point at nothing.
      if (node.getAttribute('data-expanded') === 'true') return;
      highlightNode(node);
      return;
    }
    clearHighlight();
  });
  svg.addEventListener('mouseleave', clearHighlight);

  // ---------- expand toggle ----------
  svg.addEventListener('click', function (event) {
    var toggle = event.target.closest && event.target.closest('[data-expand-toggle]');
    if (!toggle) return;
    toggleNode(toggle.closest('[data-node]'));
  });
  svg.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var toggle = event.target.closest && event.target.closest('[data-expand-toggle]');
    if (!toggle) return;
    event.preventDefault();
    toggleNode(toggle.closest('[data-node]'));
  });

  // ---------- freeze a relation ----------
  var frozenEdge = null;
  var unfreezeButton = root.querySelector('[data-uml="unfreeze"]');

  function setFrozen(edgeId) {
    frozenEdge = edgeId;
    clearHighlight();
    var endpoints = {};
    var edges = svg.querySelectorAll('.edge');
    for (var i = 0; i < edges.length; i += 1) {
      var edge = edges[i];
      var isFrozen = edgeId !== null && edge.getAttribute('data-edge') === edgeId;
      if (isFrozen) {
        endpoints[edge.getAttribute('data-from')] = true;
        endpoints[edge.getAttribute('data-to')] = true;
        edge.classList.add('frozen');
      } else {
        edge.classList.remove('frozen');
      }
    }
    var nodes = svg.querySelectorAll('g.node');
    for (var j = 0; j < nodes.length; j += 1) {
      var nodeId = nodes[j].getAttribute('data-node');
      if (edgeId !== null && endpoints[nodeId]) nodes[j].classList.add('frozen-endpoint');
      else nodes[j].classList.remove('frozen-endpoint');
    }
    if (edgeId !== null) svg.classList.add('has-freeze');
    else svg.classList.remove('has-freeze');
    if (unfreezeButton) {
      if (edgeId !== null) unfreezeButton.removeAttribute('hidden');
      else unfreezeButton.setAttribute('hidden', '');
    }
  }

  // Clicking a relation must not start panning or dragging.
  svg.addEventListener('pointerdown', function (event) {
    if (event.target.closest && event.target.closest('.edge')) event.stopPropagation();
  });

  svg.addEventListener('click', function (event) {
    var edge = event.target.closest && event.target.closest('.edge');
    if (!edge) {
      // A click on the empty canvas releases the frozen relation.
      if (event.target === svg) setFrozen(null);
      return;
    }
    var id = edge.getAttribute('data-edge');
    setFrozen(frozenEdge === id ? null : id);
  });

  if (unfreezeButton) {
    unfreezeButton.addEventListener('click', function () {
      setFrozen(null);
    });
  }

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && frozenEdge !== null) setFrozen(null);
  });

  // ---------- controls ----------
  var search = root.querySelector('[data-uml="q"]');
  if (search) {
    search.addEventListener('input', function () {
      var query = search.value.trim().toLowerCase();
      var nodes = svg.querySelectorAll('[data-node]');
      if (!query) { clearHighlight(); return; }
      var edges = svg.querySelectorAll('[data-edge]');
      for (var i = 0; i < nodes.length; i += 1) {
        var name = (nodes[i].getAttribute('data-name') || '').toLowerCase();
        var id = (nodes[i].getAttribute('data-node') || '').toLowerCase();
        var hit = name.indexOf(query) !== -1 || id.indexOf(query) !== -1;
        nodes[i].classList.toggle('hit', hit);
        nodes[i].classList.toggle('dim', !hit);
      }
      for (var j = 0; j < edges.length; j += 1) edges[j].classList.add('dim');
    });
  }

  var alpha = root.querySelector('[data-uml="alpha"]');
  if (alpha) {
    alpha.addEventListener('input', function () {
      root.style.setProperty('--class-alpha', alpha.value + '%');
    });
  }

  // Relation strokes scale together: lines, arrow heads and relation pins.
  var lines = root.querySelector('[data-uml="lines"]');
  if (lines) {
    lines.addEventListener('input', function () {
      root.style.setProperty('--line-scale', String(lines.value / 100));
    });
  }

  // ---------- control panel ----------
  var dock = root.querySelector('[data-uml="dock"]');
  var panel = root.querySelector('[data-uml="panel"]');
  var panelToggle = root.querySelector('[data-uml="panel-toggle"]');
  var closeTimer = 0;
  function setPanelOpen(open) {
    if (!panel || !panelToggle) return;
    if (open) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
    panelToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (dock && panel && panelToggle) {
    function openNow() {
      window.clearTimeout(closeTimer);
      setPanelOpen(true);
    }
    // Small delay on the way out: crossing the dock must not flicker.
    function closeSoon() {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(function () {
        setPanelOpen(false);
      }, 180);
    }

    dock.addEventListener('mouseenter', openNow);
    dock.addEventListener('mouseleave', closeSoon);
    panelToggle.addEventListener('focus', openNow);

    // Touch and keyboard have no hover: a tap or Enter still opens the panel.
    panelToggle.addEventListener('click', function (event) {
      event.stopPropagation();
      setPanelOpen(panel.hasAttribute('hidden'));
    });

    document.addEventListener('pointerdown', function (event) {
      if (panel.hasAttribute('hidden')) return;
      if (dock.contains(event.target)) return;
      setPanelOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hasAttribute('hidden')) setPanelOpen(false);
    });
  }

  var expandAll = root.querySelector('[data-uml="expand-all"]');
  if (expandAll) expandAll.addEventListener('click', function () {
    var nodes = svg.querySelectorAll('[data-node][data-has-members="1"]');
    for (var i = 0; i < nodes.length; i += 1) toggleNode(nodes[i], true);
  });

  var collapseAll = root.querySelector('[data-uml="collapse-all"]');
  if (collapseAll) collapseAll.addEventListener('click', function () {
    var nodes = svg.querySelectorAll('[data-node][data-expanded="true"]');
    for (var i = 0; i < nodes.length; i += 1) toggleNode(nodes[i], false);
  });

  var theme = root.querySelector('[data-uml="theme"]');
  if (theme) theme.addEventListener('click', function () {
    root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  var resetView = root.querySelector('[data-uml="reset"]');
  if (resetView) resetView.addEventListener('click', function () {
    userAdjusted = false;
    fit();
  });

  var legendToggle = root.querySelector('[data-uml="legend-toggle"]');
  var legend = root.querySelector('[data-uml="legend"]');
  if (legendToggle && legend) {
    legendToggle.addEventListener('click', function () {
      var open = legend.hasAttribute('hidden');
      if (open) legend.removeAttribute('hidden');
      else legend.setAttribute('hidden', '');
      legendToggle.setAttribute('aria-expanded', String(open));
    });
  }

  var resetLayout = root.querySelector('[data-uml="reset-layout"]');
  if (resetLayout) resetLayout.addEventListener('click', function () {
    var nodes = svg.querySelectorAll('[data-node]');
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      node.setAttribute('data-x', node.getAttribute('data-orig-x'));
      node.setAttribute('data-y', node.getAttribute('data-orig-y'));
      node.setAttribute('transform', 'translate(' + node.getAttribute('data-orig-x') + ',' + node.getAttribute('data-orig-y') + ')');
    }
    rerouteAll();
    syncPackages();
    syncBounds();
  });

  fit();

  function refitIfUntouched() {
    if (!userAdjusted) fit();
  }
  window.addEventListener('resize', refitIfUntouched);

  // A host pane can change size without a window resize (split view, sidebar toggle).
  if (typeof ResizeObserver !== 'undefined') {
    var lastWidth = 0;
    var lastHeight = 0;
    new ResizeObserver(function () {
      var rect = root.getBoundingClientRect();
      if (Math.abs(rect.width - lastWidth) < 2 && Math.abs(rect.height - lastHeight) < 2) return;
      lastWidth = rect.width;
      lastHeight = rect.height;
      refitIfUntouched();
    }).observe(root);
  }

  // Host-controlled theme: follow the surrounding application instead of the built-in toggle.
  if (options.autoTheme) {
    var themeButton = root.querySelector('[data-uml="theme"]');
    if (themeButton) themeButton.setAttribute('hidden', '');
    var syncTheme = function () {
      var dark = document.body ? document.body.classList.contains('theme-dark') : true;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    syncTheme();
    if (typeof MutationObserver !== 'undefined' && document.body) {
      new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-uml-diagram]');
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].getAttribute('data-uml-ready') === 'true') continue;
      nodes[i].setAttribute('data-uml-ready', 'true');
      mount(nodes[i]);
    }
  }

  window.__umlClassMount = mount;
  window.__umlClassBoot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`;
