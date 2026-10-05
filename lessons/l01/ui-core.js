/* =====================================================================
   ui-core.js — общие помощники интерфейса: DOM, тема, подсказки,
   планировщик «тяжёлых» вычислений, SVG-графики.
   ===================================================================== */
'use strict';
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v != null) e.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
const fmtInt = (n) => Math.round(n).toLocaleString('ru-RU');
const fmtPct = (x, d) => (x * 100).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: 0 }) + '%';
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function setRangeFill(input) {
  const min = +input.min, max = +input.max, v = +input.value;
  input.style.setProperty('--fill', ((v - min) / (max - min)) * 100 + '%');
}

/* ---------- Шина событий приложения ---------- */
const App = {
  models: { policy: null, percept: null, N: 200, light: true, data: null, ready: false },
  rules: { wb: false, teal: false },
  _l: {},
  on(evt, fn) { (this._l[evt] = this._l[evt] || []).push(fn); },
  emit(evt, data) { (this._l[evt] || []).forEach((fn) => fn(data)); },
};

/* ---------- Тема ---------- */
function initTheme() {
  const btn = $('#themeBtn');
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('mr-theme', t); } catch (e) { /* файл открыт без доступа к хранилищу */ }
    App.emit('theme', t);
  };
  btn.addEventListener('click', () => apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
}

/* ---------- Подсказка ---------- */
const Tip = {
  el: null,
  show(html, x, y) {
    if (!this.el) this.el = $('#tooltip');
    this.el.innerHTML = html;
    this.el.classList.add('show');
    const r = this.el.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    this.el.style.left = left + 'px'; this.el.style.top = top + 'px';
  },
  hide() { if (this.el) this.el.classList.remove('show'); },
};
function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- Планировщик: выполнять генератор порциями, не блокируя страницу ---------- */
const nextTick = (() => {
  if (typeof MessageChannel !== 'undefined') {
    const ch = new MessageChannel(), q = [];
    ch.port1.onmessage = () => { const f = q.shift(); if (f) f(); };
    return (f) => { q.push(f); ch.port2.postMessage(0); };
  }
  return (f) => setTimeout(f, 0);
})();
function runChunked(gen, onEvent, budget) {
  budget = budget || 16;
  return new Promise((resolve, reject) => {
    function work() {
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < budget) {
          const r = gen.next();
          if (r.done) { resolve(r.value); return; }
          if (onEvent && r.value !== undefined) onEvent(r.value);
        }
      } catch (e) { reject(e); return; }
      nextTick(work);
    }
    nextTick(work);
  });
}

/* ---------- Минимальная библиотека SVG-графиков ---------- */
let _rzT = null;
window.addEventListener('resize', () => { clearTimeout(_rzT); _rzT = setTimeout(() => App.emit('resize'), 150); });
const Chart = {
  /** Реальная ширина контейнера графика в пикселях (графики рисуются 1:1, чтобы текст не мельчал). */
  width(svg, min, max) {
    const w = (svg.parentElement || svg).getBoundingClientRect().width || max;
    return Math.round(Math.max(min, Math.min(max, w)));
  },
  scaleLinear(d0, d1, r0, r1) { const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0); f.inv = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0); return f; },
  scaleLog(d0, d1, r0, r1) { const l0 = Math.log10(d0), l1 = Math.log10(d1); const f = (v) => r0 + ((Math.log10(Math.max(v, 1e-12)) - l0) / (l1 - l0)) * (r1 - r0); return f; },
  clear(svg) { while (svg.firstChild) svg.firstChild.remove(); },
  // Сетка и оси: xTicks/yTicks = [{v, label}]
  frame(svg, box, x, y, xTicks, yTicks, opts) {
    opts = opts || {};
    const g = s('g', {});
    const grid = s('g', { class: 'grid' });
    yTicks.forEach((t) => grid.append(s('line', { x1: box.l, x2: box.r, y1: y(t.v), y2: y(t.v) })));
    if (opts.xGrid) xTicks.forEach((t) => grid.append(s('line', { x1: x(t.v), x2: x(t.v), y1: box.t, y2: box.b })));
    g.append(grid);
    const ax = s('g', { class: 'axis' });
    ax.append(s('line', { x1: box.l, x2: box.r, y1: box.b, y2: box.b }));
    g.append(ax);
    yTicks.forEach((t) => g.append(s('text', { x: box.l - 8, y: y(t.v) + 4, 'text-anchor': 'end', style: 'font-variant-numeric: tabular-nums' }, t.label)));
    xTicks.forEach((t) => g.append(s('text', { x: x(t.v), y: box.b + 18, 'text-anchor': 'middle', style: 'font-variant-numeric: tabular-nums' }, t.label)));
    if (opts.xTitle) g.append(s('text', { x: (box.l + box.r) / 2, y: box.b + 38, 'text-anchor': 'middle', class: 'ttl' }, opts.xTitle));
    if (opts.yTitle) g.append(s('text', { x: box.l - 8, y: box.t - 10, 'text-anchor': 'start', class: 'ttl', transform: null }, opts.yTitle));
    svg.append(g);
    return g;
  },
  path(points, x, y) {
    return points.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join('');
  },
};
