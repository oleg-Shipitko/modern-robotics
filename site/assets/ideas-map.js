/* =====================================================================
   assets/ideas-map.js — «Карта идей»: работы курса на оси времени.
   Данные — lessons/shared/ideas-map.json (сборка site/build.py кладёт их в
   <script id="imData">), подписи интерфейса — <script id="imUi"> страницы
   (русские и английские строки живут в исходниках страниц, не здесь).
   Широкий экран: горизонтальная ось лет. Работы до 2016 года стоят по
   порядку, а не в масштабе: каждой дате (год и месяц) — одинаковый слот,
   ранняя часть занимает 20–24 % ширины; с 2016 года ось кусочно-линейная
   по годам, ширина года растёт с числом его работ; на стыке — «молния»;
   дорожки тем — полосы с заголовком; работа — «чип» с названием, внутри
   дорожки чипы раскладываются по подстрокам, а в тесноте сдвигаются на
   полгода с «ножкой» к точной дате. В покое видны только близкие связи
   внутри дорожки; связи «выросло из» появляются при наведении (прямые)
   и по клику (вся цепочка предков и потомков). Телефон (≤ 640 px): ось
   вертикальная, чипы в один столбец, связи — только у выбранной работы.
   Клик или Enter на чипе: карточка (под схемой, на телефоне — панель снизу).
   Фильтры по части курса и по дорожке бледнят чужие чипы; #id в адресе
   открывает работу.
   ===================================================================== */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const data = JSON.parse($('imData').textContent), UI = JSON.parse($('imUi').textContent);
  const READY = window.IM_READY || {}, READY_RU = window.IM_READY_RU || {};
  const svg = $('imSvg'), figure = $('imFigure'), card = $('imCard'), partBox = $('imFilter'), laneBox = $('imLanes');
  const NS = 'http://www.w3.org/2000/svg';
  const phone = () => matchMedia('(max-width: 640px)').matches;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tpl = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  function el(name, attrs, text) { const e = document.createElementNS(NS, name); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }

  // ---------- данные ----------
  const lanes = data.lanes, laneOf = Object.fromEntries(lanes.map((l) => [l.id, l]));
  const nodes = data.nodes.map((n) => Object.assign({}, n, {
    t: n.year + ((n.month || 7) - 0.5) / 12, part: n.lesson.split('.')[0], parents: n.parents || [], children: [], label: n.short || n.title,
    href: READY[n.lesson] || '', hrefRu: (!READY[n.lesson] && READY_RU[n.lesson]) || '',
  }));
  nodes.forEach((n) => { n.out = !!(n.href || n.hrefRu); });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((n) => n.parents.forEach((p) => { const P = byId.get(p); if (P) P.children.push(n.id); }));
  const edges = [];
  nodes.forEach((n) => n.parents.forEach((p) => { if (byId.has(p)) edges.push({ from: byId.get(p), to: n }); }));
  const parts = [...new Set(nodes.map((n) => n.part))].sort((a, b) => a - b);
  const byTime = (a, b) => a.t - b.t || a.title.localeCompare(b.title);

  // ---------- состояние ----------
  let selected = null, peek = null, part = 'all', lane = 'all', lastW = 0, wideNow = true;

  // ---------- размеры ----------
  const CH = 24, PADX = 12, ROWH = 34, GAP = 10, BAND_PAD = 13, AXIS_T = 30, AXIS_B = 26;

  function measure(texts) { // в группе .node, чтобы к тексту применился шрифт чипа (12,5 px, на телефоне 13 px)
    const g = el('g', { class: 'node', style: 'visibility:hidden' }); svg.append(g);
    const ws = texts.map((t) => { const e = el('text', { class: 'chip-t', x: 0, y: 0 }, t); g.append(e); return e.getComputedTextLength(); });
    g.remove(); return ws;
  }

  // ---------- ось времени ----------
  // До 2016 года работы стоят по порядку, а не в масштабе: каждой отдельной дате (год и месяц) — одинаковый слот.
  // С 2016 года ось кусочно-линейная по годам: ширина года пропорциональна 0,6 + наибольшему числу работ этого года
  // в одной дорожке, так что плотные годы получают больше места; год не бывает уже YEAR_MIN, чтобы влезла подпись
  // (недостающее снимается с остальных лет пропорционально). Между частями — разрыв-«молния».
  const T_LATE = 2016, BREAK = 26, YEAR_MIN = 34;
  const earlyT = [...new Set(nodes.filter((n) => n.t < T_LATE).map((n) => n.t))].sort((a, b) => a - b);
  const lateYears = [];
  for (let y = T_LATE, last = Math.floor(Math.max(T_LATE, ...nodes.map((n) => n.t))); y <= last; y++) lateYears.push(y);
  const yearWeight = lateYears.map((y) => 0.6 + Math.max(0, ...lanes.map((l) => nodes.filter((n) => n.lane === l.id && n.t >= y && n.t < y + 1).length)));
  function axisFor(X0, X1, f) {
    const T = X1 - X0, nE = earlyT.length, E = nE ? T * f : 0, G = nE ? BREAK : 0, s = nE ? E / nE : 0;
    const early = earlyT.map((t, i) => X0 + (i + 0.5) * s);
    const L = T - E - G, fixed = new Set();
    let ws = [];
    for (let k = 0; k <= lateYears.length; k++) { // года уже YEAR_MIN получают YEAR_MIN, остальное делится по весам
      const free = L - fixed.size * YEAR_MIN, wsum = yearWeight.reduce((sum, w, i) => sum + (fixed.has(i) ? 0 : w), 0);
      ws = yearWeight.map((w, i) => (fixed.has(i) ? YEAR_MIN : free * w / wsum));
      const narrow = ws.map((w, i) => i).filter((i) => !fixed.has(i) && ws[i] < YEAR_MIN);
      if (!narrow.length) break;
      narrow.forEach((i) => fixed.add(i));
    }
    const starts = []; let x = X0 + E + G;
    ws.forEach((w) => { starts.push(x); x += w; });
    const anchors = earlyT.map((t, i) => [t, early[i]]).concat([[T_LATE, X0 + E + G]]);
    const xOf = (t) => {
      if (t >= T_LATE) { const i = Math.min(lateYears.length - 1, Math.floor(t) - T_LATE); return Math.min(X1, starts[i] + (t - lateYears[i]) * ws[i]); }
      const j = anchors.findIndex(([u]) => u >= t); // дата работы — центр её слота; между датами — линейно (для подписей)
      if (j <= 0) return anchors[0][1];
      const [t0, x0] = anchors[j - 1], [t1, x1] = anchors[j];
      return t1 === t ? x1 : x0 + (t - t0) / (t1 - t0) * (x1 - x0);
    };
    const pxy = (t) => (t < T_LATE ? s : ws[Math.min(lateYears.length - 1, Math.floor(t) - T_LATE)]); // «год» для сдвига чипа: в ранней части — слот
    return { xOf, pxy, X0, X1, E, G, s, early, starts, ws };
  }

  // ---------- раскладка дорожек ----------
  // Внутри дорожки чипы идут по времени и раскладываются по подстрокам; если в подстроке тесно, новый чип сдвигается вправо,
  // а предыдущий влево, каждый не больше чем на полгода (по масштабу своего участка оси) и не за край схемы.
  function pack(ax, xMin, xMax) {
    let rowsTotal = 0, shiftTotal = 0;
    const out = lanes.map((ln) => {
      const items = nodes.filter((n) => n.lane === ln.id).sort(byTime);
      const rows = []; // чипы каждой подстроки слева направо
      let prevRow = 0;
      items.forEach((n) => {
        n.xd = ax.xOf(n.t); n.ms = 0.5 * ax.pxy(n.t);
        const x0 = Math.min(Math.max(n.xd, xMin + n.w / 2), xMax - n.w / 2);
        let best = null;
        rows.forEach((row, r) => {
          const P = row[row.length - 1], Q = row[row.length - 2];
          const need = (P.x + P.w / 2 + GAP) - (x0 - n.w / 2);
          let sN = 0, sP = 0;
          if (need > 0) {
            sN = Math.max(0, Math.min(need, n.ms - (x0 - n.xd), xMax - n.w / 2 - x0));
            const slackP = Math.min(P.ms + (P.x - P.xd), (P.x - P.w / 2) - (Q ? Q.x + Q.w / 2 + GAP : xMin));
            sP = Math.min(Math.max(0, need - sN), Math.max(0, slackP));
            if (sN + sP < need - 0.01) return; // не помещается
          }
          const cost = sN + sP * 1.5 + Math.abs(r - prevRow) * 2; // меньше сдвигов, ближе к ряду предыдущего чипа
          if (!best || cost < best.cost) best = { r, sN, sP, cost };
        });
        if (best) {
          const row = rows[best.r];
          if (best.sP) row[row.length - 1].x -= best.sP;
          n.row = best.r; n.x = x0 + best.sN; row.push(n);
        } else { n.row = rows.length; n.x = x0; rows.push([n]); }
        prevRow = n.row;
      });
      items.forEach((n) => { n.shift = n.x - n.xd; shiftTotal += Math.abs(n.shift); });
      rowsTotal += rows.length;
      return { lane: ln, items, rows: rows.length };
    });
    return { lanes: out.filter((b) => b.items.length), rowsTotal, shiftTotal };
  }

  // ---------- раскладка: широкий экран ----------
  // Доля ранней части перебирается от 20 до 24 % ширины шкалы, и берётся та, при которой схема ниже всего.
  function layoutWide(W) {
    const HEAD = W >= 980 ? 132 : 0, STRIP = HEAD ? 0 : 22;
    const widths = measure(nodes.map((n) => n.label));
    nodes.forEach((n, i) => { n.w = Math.ceil(widths[i]) + 2 * PADX; n.h = CH; });
    const xMin = HEAD + 8, xMax = W - 6, X1 = W - 26;
    let best = null;
    for (let f = 0.2; f < 0.2401; f += 0.01) {
      let X0 = xMin, ax = null;
      for (let k = 0; k < 3; k++) { // отступ слева такой, чтобы ни один чип у своей даты не залезал на заголовки дорожек
        ax = axisFor(X0, X1, f);
        const extra = Math.max(0, ...nodes.map((n) => xMin + n.w / 2 - ax.xOf(n.t)));
        if (extra < 0.5) break;
        X0 += extra;
      }
      const P = pack(ax, xMin, xMax), score = P.rowsTotal * 1000 + P.shiftTotal;
      if (!best || score < best.score - 0.5) best = { score, ax };
    }
    const P = pack(best.ax, xMin, xMax);
    let y = AXIS_T;
    const bands = P.lanes.map((b, li) => {
      const h = 2 * BAND_PAD + STRIP + b.rows * ROWH - (ROWH - CH);
      b.items.forEach((n) => { n.y = y + BAND_PAD + STRIP + n.row * ROWH + CH / 2; });
      const band = { lane: b.lane, top: y, h, odd: li % 2 === 1, items: b.items, rows: b.rows };
      y += h;
      return band;
    });
    return { H: y + AXIS_B, ax: best.ax, bands, HEAD, STRIP, bodyBottom: y };
  }

  // ---------- раскладка: телефон ----------
  function layoutPhone(W) {
    const sorted = nodes.slice().sort(byTime);
    const AX = 40, X = 72, PITCH = 48, TOP = 12, CHp = 26;
    const widths = measure(sorted.map((n) => n.label));
    sorted.forEach((n, i) => { n.w = Math.min(Math.ceil(widths[i]) + 2 * PADX, W - X - 8); n.h = CHp; n.x = X + n.w / 2; n.xd = n.x; n.shift = 0; n.y = TOP + CHp / 2 + i * PITCH; n.row = i; });
    return { H: TOP + sorted.length * PITCH + 2, sorted, AX, X };
  }

  // ---------- геометрия линий ----------
  function link(a, b, minGap) {
    const ar = a.x + a.w / 2, bl = b.x - b.w / 2;
    if (a.y === b.y) return `M${ar},${a.y} L${bl},${b.y}`;
    if (bl - ar >= minGap) { const dx = Math.max(24, (bl - ar) * 0.5); return `M${ar},${a.y} C${ar + dx},${a.y} ${bl - dx},${b.y} ${bl},${b.y}`; }
    const down = b.y > a.y, mid = (a.x + b.x) / 2;
    const x1 = Math.max(a.x - a.w / 2 + 8, Math.min(a.x + a.w / 2 - 8, mid)), x2 = Math.max(b.x - b.w / 2 + 8, Math.min(b.x + b.w / 2 - 8, mid));
    const y1 = down ? a.y + a.h / 2 : a.y - a.h / 2, y2 = down ? b.y - b.h / 2 : b.y + b.h / 2;
    const dy = Math.max(14, Math.abs(y2 - y1) * 0.5) * (down ? 1 : -1);
    return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
  }
  function linkBox(a, b, minGap) { // прямоугольник, внутри которого проходит линия link(a, b)
    const ar = a.x + a.w / 2, bl = b.x - b.w / 2;
    if (a.y === b.y || bl - ar >= minGap) return [ar, bl, Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const down = b.y > a.y, mid = (a.x + b.x) / 2;
    const x1 = Math.max(a.x - a.w / 2 + 8, Math.min(a.x + a.w / 2 - 8, mid)), x2 = Math.max(b.x - b.w / 2 + 8, Math.min(b.x + b.w / 2 - 8, mid));
    const y1 = down ? a.y + a.h / 2 : a.y - a.h / 2, y2 = down ? b.y - b.h / 2 : b.y + b.h / 2;
    return [Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2)];
  }
  function edgePath(a, b, wide, L) {
    if (wide) return link(a, b, 28);
    const x = L.X, bow = 12 + 12 * Math.min(1, Math.abs(b.row - a.row) / 12), k = (b.y - a.y) * 0.3; // телефон: дуга в поле между осью и чипами
    return `M${x},${a.y} C${x - bow},${a.y + k} ${x - bow},${b.y - k} ${x},${b.y}`;
  }

  // ---------- рисование ----------
  function laneTitle(g, text, x, y, maxW) {
    const t = el('text', { x, y }); g.append(t);
    const words = text.split(' '), lines = []; let cur = '';
    const probe = el('text', { style: 'visibility:hidden' }); g.append(probe);
    words.forEach((w) => { const cand = cur ? cur + ' ' + w : w; probe.textContent = cand; if (cur && probe.getComputedTextLength() > maxW) { lines.push(cur); cur = w; } else cur = cand; });
    lines.push(cur); probe.remove();
    lines.forEach((ln, i) => t.append(el('tspan', { x, dy: i ? '1.2em' : 0 }, ln)));
    t.setAttribute('y', y - (lines.length - 1) * 0.6 * 14);
    return t;
  }
  function render() {
    const W = Math.max(280, Math.floor(figure.clientWidth) - (phone() ? 8 : 16));
    lastW = figure.clientWidth;
    const wide = !phone(); wideNow = wide;
    svg.textContent = '';
    const defs = el('defs');
    lanes.forEach((ln) => { const m = el('marker', { id: 'im-arr-' + ln.id, class: 'lane-' + ln.id, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto', markerUnits: 'userSpaceOnUse' }); m.append(el('path', { d: 'M0,1 L9,5 L0,9 Z' })); defs.append(m); });
    svg.append(defs);
    const L = wide ? layoutWide(W) : layoutPhone(W);
    svg.setAttribute('viewBox', `0 0 ${W} ${L.H}`); svg.setAttribute('width', W); svg.setAttribute('height', L.H);

    if (wide) {
      const gl = el('g', { class: 'im-lanes' }); svg.append(gl); // в DOM до заголовков: перенос слов измеряет текст
      L.bands.forEach((b) => {
        gl.append(el('rect', { class: 'im-lane-bg' + (b.odd ? ' odd' : ''), x: 0, y: b.top, width: W, height: b.h }));
        gl.append(el('line', { class: 'im-lane-line', x1: 0, x2: W, y1: b.top + 0.5, y2: b.top + 0.5 }));
        const t = el('g', { class: 'im-lane-t lane-' + b.lane.id }); gl.append(t);
        if (L.HEAD) laneTitle(t, b.lane.title, 16, b.top + b.h / 2 + 5, L.HEAD - 26);
        else t.append(el('text', { class: 'strip', x: 12, y: b.top + 16 }, b.lane.title));
      });
      gl.append(el('line', { class: 'im-lane-line', x1: 0, x2: W, y1: L.bodyBottom + 0.5, y2: L.bodyBottom + 0.5 }));
      // ось лет сверху и снизу. Ранняя часть: подпись года у даты работы, если не наезжает на предыдущую (зазор от 6 px);
      // первая и последняя ранние даты подписаны всегда. С 2016 года подписан каждый год посередине своей полосы,
      // сетка — по границам лет. На стыке частей — разрыв-«молния».
      const ax = L.ax, grid = el('g', { class: 'im-grid' }), axis = el('g', { class: 'im-axis', 'data-early': (ax.E / (ax.X1 - ax.X0)).toFixed(3) });
      svg.append(grid, axis);
      const textW = (txt) => { const t = el('text', { x: 0, y: 0, style: 'visibility:hidden' }, txt); axis.append(t); const w = t.getComputedTextLength(); t.remove(); return w; };
      const label = (x, txt) => {
        axis.append(el('text', { x, y: AXIS_T - 10, 'text-anchor': 'middle' }, txt));
        axis.append(el('text', { x, y: L.bodyBottom + 18, 'text-anchor': 'middle' }, txt));
      };
      const tick = (x, cls, extra) => {
        const xx = Math.round(x) + 0.5;
        grid.append(el('line', Object.assign({ class: cls, x1: xx, x2: xx, y1: AXIS_T, y2: L.bodyBottom }, extra || {})));
        axis.append(el('line', { x1: xx, x2: xx, y1: AXIS_T - 5, y2: AXIS_T }));
        axis.append(el('line', { x1: xx, x2: xx, y1: L.bodyBottom, y2: L.bodyBottom + 5 }));
      };
      const dates = earlyT.map((t, i) => ({ x: ax.early[i], txt: String(Math.floor(t)) }));
      dates.forEach((d) => { d.w = textW(d.txt); });
      const pick = [];
      if (dates.length) {
        const last = dates[dates.length - 1];
        dates.slice(0, -1).forEach((d, i) => {
          const prev = pick[pick.length - 1];
          if (prev && (prev.txt === d.txt || d.x - d.w / 2 < prev.x + prev.w / 2 + 6)) return; // тот же год уже подписан или наезжает
          if (i > 0 && d.x + d.w / 2 > last.x - last.w / 2 - 6) return; // место для последней подписи
          pick.push(d);
        });
        if (pick.length && pick[pick.length - 1].txt === last.txt) pick.pop(); // год последней даты подписываем у неё
        pick.push(last);
      }
      pick.forEach((d) => { tick(d.x, 'early'); label(d.x, d.txt); });
      lateYears.forEach((y, i) => { tick(ax.starts[i], 'year', { 'data-year': y }); label(ax.starts[i] + ax.ws[i] / 2, String(y)); });
      tick(ax.X1, 'year', { 'data-year': lateYears[lateYears.length - 1] + 1 });
      const xb = ax.G ? ax.X0 + ax.E + ax.G / 2 : null;
      [AXIS_T, L.bodyBottom].forEach((yy) => {
        if (xb == null) { axis.append(el('line', { class: 'base', x1: L.HEAD, x2: W, y1: yy + 0.5, y2: yy + 0.5 })); return; }
        axis.append(el('line', { class: 'base', x1: L.HEAD, x2: xb - 7, y1: yy + 0.5, y2: yy + 0.5 }));
        axis.append(el('path', { class: 'im-break', d: `M${xb - 6},${yy + 4} l4,-7 l4,7 l4,-7` }));
        axis.append(el('line', { class: 'base', x1: xb + 7, x2: W, y1: yy + 0.5, y2: yy + 0.5 }));
      });

    } else {
      const gy = el('g', { class: 'im-year' });
      gy.append(el('line', { class: 'ax', x1: L.AX + 0.5, x2: L.AX + 0.5, y1: 4, y2: L.H - 2 }));
      let prev = null;
      L.sorted.forEach((n) => {
        if (n.year === prev) return; prev = n.year;
        gy.append(el('text', { x: L.AX - 7, y: n.y + 4, 'text-anchor': 'end' }, String(n.year)));
        gy.append(el('line', { x1: L.AX - 3, x2: L.AX + 4, y1: n.y + 0.5, y2: n.y + 0.5 }));
      });
      svg.append(gy);
    }

    // линии внутри темы — видны всегда: работа соединена с ближайшей по времени работой своей темы, из которой она выросла
    // (только настоящие связи из parents), если та рядом; остальные связи появляются при наведении и выборе
    const gr = el('g', { class: 'im-rails' });
    if (wide) L.bands.forEach((b) => b.items.forEach((c) => {
      const ps = c.parents.map((id) => byId.get(id)).filter((p) => p && p.lane === c.lane);
      if (!ps.length) return;
      const a = ps.reduce((m, p) => (p.t > m.t ? p : m));
      // далёкие связи (через другие чипы любой подстроки или дальше 160 px) в покое не рисуем: они появляются при выборе работы
      const [bx0, bx1, by0, by1] = linkBox(a, c, 12);
      const hop = b.items.some((m) => m !== a && m !== c && m.x - m.w / 2 < bx1 - 1 && m.x + m.w / 2 > bx0 + 1 && m.y - m.h / 2 < by1 - 1 && m.y + m.h / 2 > by0 + 1);
      if (hop || (c.x - c.w / 2) - (a.x + a.w / 2) > 160) return;
      gr.append(el('path', { class: 'rail lane-' + b.lane.id, d: link(a, c, 12), 'data-a': a.id, 'data-b': c.id }));
    }));
    svg.append(gr);
    // связи «выросло из» — появляются при наведении и выборе
    const ge = el('g', { class: 'im-edges' });
    edges.forEach((e) => ge.append(el('path', { class: 'edge lane-' + e.from.lane, d: edgePath(e.from, e.to, wide, L), 'data-from': e.from.id, 'data-to': e.to.id, 'marker-end': `url(#im-arr-${e.from.lane})` })));
    svg.append(ge);
    // чипы
    const gn = el('g', { class: 'im-nodes' });
    nodes.forEach((n) => {
      const g = el('g', { class: 'node lane-' + n.lane + (n.out ? '' : ' soon'), 'data-id': n.id, 'data-xd': Math.round(n.xd * 10) / 10, tabindex: 0, role: 'button', 'aria-label': tpl(UI.node, { title: n.title, org: n.org, year: n.year, lesson: n.lesson }) });
      g.append(el('title', null, `${n.title} — ${n.org}, ${n.year}`));
      if (wide && Math.abs(n.shift) > 2) { // чип сдвинут с даты — короткая «ножка» к точке даты под чипом
        const yb = n.y + n.h / 2 + 7;
        g.append(el('path', { class: 'leg', d: `M${n.x},${n.y + n.h / 2} L${n.xd},${yb}` }));
        g.append(el('circle', { class: 'leg-dot', cx: n.xd, cy: yb, r: 1.7 }));
      }
      g.append(el('rect', { class: 'chip', x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: 7 }));
      g.append(el('text', { class: 'chip-t', x: n.x, y: n.y + 4.5, 'text-anchor': 'middle' }, n.label));
      g.append(el('text', { class: 'mk mk-l', x: n.x - n.w / 2 + 3, y: n.y + 4 }, '←'));
      g.append(el('text', { class: 'mk mk-r', x: n.x + n.w / 2 - 3, y: n.y + 4, 'text-anchor': 'end' }, '→'));
      if (!wide) g.append(el('text', { class: 'lane-tag', x: n.x - n.w / 2 + 2, y: n.y + n.h / 2 + 12 }, laneOf[n.lane].title));
      gn.append(g);
    });
    svg.append(gn);
    applyState();
  }

  // ---------- выбор, подсветка, карточка ----------
  function relatives(id) {
    const anc = new Set(), desc = new Set(), up = [id], down = [id];
    while (up.length) byId.get(up.pop()).parents.forEach((p) => { if (!anc.has(p)) { anc.add(p); up.push(p); } });
    while (down.length) byId.get(down.pop()).children.forEach((c) => { if (!desc.has(c)) { desc.add(c); down.push(c); } });
    return { anc, desc };
  }
  const filtered = (n) => (part !== 'all' && n.part !== part) || (lane !== 'all' && n.lane !== lane);
  function applyState() {
    const rel = selected ? relatives(selected) : null;
    const pk = !selected && peek ? byId.get(peek) : null;
    const related = (id) => id === selected || rel.anc.has(id) || rel.desc.has(id);
    svg.querySelectorAll('.node').forEach((g) => {
      const id = g.dataset.id, n = byId.get(id);
      g.classList.toggle('dim', filtered(n));
      g.classList.toggle('sel', id === selected);
      g.classList.toggle('anc', !!rel && rel.anc.has(id));
      g.classList.toggle('desc', !!rel && rel.desc.has(id));
      g.classList.toggle('off', !!rel && !related(id));
      g.classList.toggle('peek', !!pk && (pk.parents.includes(id) || pk.children.includes(id)));
    });
    svg.querySelectorAll('.edge').forEach((e) => {
      const a = e.dataset.from, b = e.dataset.to;
      const direct = (rel && (a === selected || b === selected)) || (pk && (a === pk.id || b === pk.id));
      const on = !!direct || (!!rel && wideNow && (rel.anc.has(b) || rel.desc.has(a)));
      e.classList.toggle('on', on); e.classList.toggle('direct', !!direct);
    });
    svg.querySelectorAll('.rail').forEach((r) => {
      const A = byId.get(r.dataset.a), B = byId.get(r.dataset.b);
      r.classList.toggle('dim', filtered(A) || filtered(B));
      r.classList.toggle('off', !!rel && !(related(A.id) && related(B.id)));
    });
  }
  function lessonLink(n) {
    if (n.href) return `<a class="im-lesson" href="${esc(n.href)}">${esc(tpl(UI.lesson, { n: n.lesson }))}</a>`;
    if (n.hrefRu) return `<a class="im-lesson" href="${esc(n.hrefRu)}" hreflang="ru">${esc(tpl(UI.lessonRu || UI.lesson, { n: n.lesson }))}</a>`;
    return `<span class="im-lesson soon">${esc(tpl(UI.lessonSoon, { n: n.lesson }))}</span>`;
  }
  function showCard(n) {
    const date = n.month ? `${UI.months[n.month - 1]} ${n.year}` : String(n.year);
    const chips = (ids, cls) => ids.length ? ids.map((id) => { const m = byId.get(id); return `<button type="button" class="im-chip ${cls} lane-${esc(m.lane)}" data-go="${esc(id)}">${cls === 'anc' ? '<span class="mk">←</span>' : ''}${esc(m.title)}${cls === 'desc' ? '<span class="mk">→</span>' : ''}</button>`; }).join('') : `<span class="none">${esc(UI.none)}</span>`;
    card.innerHTML = `<button type="button" class="im-close" aria-label="${esc(UI.close)}">×</button>`
      + `<div class="im-card-head"><h2><i class="dot lane-${esc(n.lane)}"></i><span>${esc(n.title)}</span></h2><span class="meta">${esc(n.org)} · ${date} · ${esc(laneOf[n.lane].title)}</span>${lessonLink(n)}</div>`
      + `<dl><dt>${esc(UI.problem)}</dt><dd>${esc(n.problem)}</dd><dt>${esc(UI.contribution)}</dt><dd>${esc(n.contribution)}</dd></dl>`
      + `<div class="im-rel"><span class="im-rel-t">${esc(UI.from)}:</span>${chips(n.parents, 'anc')}</div>`
      + `<div class="im-rel"><span class="im-rel-t">${esc(UI.to)}:</span>${chips(n.children, 'desc')}</div>`;
    card.classList.add('open'); document.body.classList.toggle('im-sheet-open', phone());
  }
  function select(id, focus) {
    if (!byId.has(id)) return;
    selected = id; peek = null; applyState(); showCard(byId.get(id));
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// */ }
    if (focus) { const g = svg.querySelector(`.node[data-id="${id}"]`); if (g) g.focus({ preventScroll: true }); }
  }
  function clear() {
    selected = null; peek = null; applyState();
    card.classList.remove('open'); document.body.classList.remove('im-sheet-open');
    card.innerHTML = `<p class="im-card-hint">${esc(UI.hint)}</p>`;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// */ }
  }
  function setPeek(id) { if (id === peek) return; peek = id; if (!selected) applyState(); }

  // ---------- фильтры: часть курса и дорожка ----------
  function makeFilter(box, items, get, set) {
    items.forEach(([key, label, cls]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.key = key; b.className = cls || '';
      if (cls) { b.innerHTML = '<i class="dot"></i>'; b.append(label); } else b.textContent = label;
      b.setAttribute('aria-pressed', String(get() === key));
      b.addEventListener('click', () => { set(key); box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.key === key))); applyState(); });
      box.append(b);
    });
  }
  makeFilter(partBox, [['all', UI.all]].concat(parts.map((p) => [p, p])), () => part, (v) => { part = v; });
  makeFilter(laneBox, [['all', UI.all]].concat(lanes.map((l) => [l.id, l.title, 'lane-' + l.id])), () => lane, (v) => { lane = v; });

  // ---------- события ----------
  svg.addEventListener('click', (ev) => { const g = ev.target.closest('.node'); if (g) select(g.dataset.id); else if (selected) clear(); });
  svg.addEventListener('keydown', (ev) => { const g = ev.target.closest('.node'); if (!g) return; if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(g.dataset.id); } });
  svg.addEventListener('mouseover', (ev) => { const g = ev.target.closest('.node'); setPeek(g ? g.dataset.id : null); });
  svg.addEventListener('mouseleave', () => setPeek(null));
  svg.addEventListener('focusin', (ev) => { const g = ev.target.closest('.node'); if (g) setPeek(g.dataset.id); });
  svg.addEventListener('focusout', () => setPeek(null));
  card.addEventListener('click', (ev) => { const go = ev.target.closest('[data-go]'); if (go) { select(go.dataset.go, true); return; } if (ev.target.closest('.im-close')) clear(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && selected) clear(); });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (figure.clientWidth !== lastW) render(); }, 120); });
  matchMedia('(max-width: 640px)').addEventListener('change', () => { render(); if (selected) showCard(byId.get(selected)); });

  render();
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && byId.has(h)) select(h);
  // ширина подписей зависит от шрифта: после загрузки Inter — пересчитать раскладку
  const done = () => { render(); window.__ideasReady = true; };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(done); else done();
})();
