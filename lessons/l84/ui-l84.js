/* =====================================================================
   ui-l84.js — схемы, три лаборатории и квиз урока 8.4.
   ===================================================================== */
'use strict';

function initNav() {
  const links = $$('.toc a'), ids = links.map((a) => a.getAttribute('href').slice(1));
  const onScroll = () => {
    const doc = document.documentElement;
    $('#progress').style.width = (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) * 100).toFixed(2) + '%';
    let cur = null;
    for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}
const pal = () => ({ bg: HeroKit.css('--surface-2'), surf: HeroKit.css('--surface'), line: HeroKit.css('--line'), line2: HeroKit.css('--line-2'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), ink3: HeroKit.css('--ink-3'), e2e: HeroKit.css('--e2e'), cl: HeroKit.css('--classic'), hy: HeroKit.css('--hybrid'), good: HeroKit.css('--good'), bad: HeroKit.css('--critical'), warn: HeroKit.css('--warning') });
const fmt = (v, d) => (+v).toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace('-', '−');
const pct = (v, d) => fmt(v * 100, d == null ? 0 : d) + '%';
const pp = (v, d) => (v >= 0 ? '+' : '') + fmt(v * 100, d == null ? 1 : d) + ' п.п.';
function setOut(el, html, cls) { el.innerHTML = html; el.className = 'scene-result' + (cls ? ' ' + cls : ''); }
function segSet(sel, v) { $$(sel + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); }
function bindSeg(sel, fn) { $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); }); }
function mountMissions(sel, missions, api, opts) {
  opts = opts || {}; const root = $(sel), onStep = opts.onStep;
  const mark = (i) => root.classList.toggle('m-live', !missions[i].action && !missions[i].final);
  const ctl = Missions.mount(root, missions, api, Object.assign({}, opts, { onStep: (i) => { mark(i); if (onStep) onStep(i); } }));
  mark(ctl.index); return ctl;
}

/* ---------- анимированная схема: одна постоянная сцена → решение ---------- */
(() => {
  const C40 = L84.compare(40, true), C120 = L84.compare(120, true);
  const REL = L84.release('fast', ['overall', 'slice', 'safety', 'latency']);
  const T = 12;

  function header(c, k, P, A, g, phase) {
    const names = ['одинаковый старт', 'парные исходы', 'интервал', 'критерии'];
    if (g.narrow) {
      A.line(c, [[28, 26], [332, 26]], P.line, 2);
      names.forEach((n, i) => {
        A.circle(c, 28 + i * 101.3, 26, i === phase ? 8 : 5, i === phase ? P.spr : P.surf, i <= phase ? P.spr : P.line, 2);
        A.lab(c, k, String(i + 1), 28 + i * 101.3, 26, { px: 8.5, weight: 800, color: i === phase ? P.surf : P.ink3, halo: false });
      });
      A.lab(c, k, `${phase + 1} · ${names[phase]}`, 180, 55, { px: 12.5, weight: 800, color: P.ink, halo: false });
      return;
    }
    const x0 = 31, gap = 169;
    A.line(c, [[x0, 28], [x0 + gap * 3, 28]], P.line, 2);
    names.forEach((n, i) => {
      const x = x0 + gap * i;
      A.circle(c, x, 28, i === phase ? 8 : 5, i === phase ? P.spr : P.surf, i <= phase ? P.spr : P.line, 2);
      A.lab(c, k, String(i + 1), x, 28, { px: 8.5, weight: 800, color: i === phase ? P.surf : P.ink3, halo: false });
      A.lab(c, k, n, x + 13, 28, { px: 10.5, weight: i === phase ? 780 : 650, color: i === phase ? P.ink : P.ink3, align: 'left', halo: false });
    });
  }

  function check(c, x, y, r, color, ok) {
    c.save(); c.strokeStyle = color; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath();
    if (ok) { c.moveTo(x - r * .55, y); c.lineTo(x - r * .12, y + r * .42); c.lineTo(x + r * .64, y - r * .48); }
    else { c.moveTo(x - r * .5, y - r * .5); c.lineTo(x + r * .5, y + r * .5); c.moveTo(x + r * .5, y - r * .5); c.lineTo(x - r * .5, y + r * .5); }
    c.stroke(); c.restore();
  }

  function mug(c, x, y, s, P, tipped) {
    c.save(); c.translate(x, y); if (tipped) c.rotate(.72);
    c.fillStyle = '#c9653c'; c.strokeStyle = P.dark ? '#eadbd2' : '#5b3b2e'; c.lineWidth = 1.4;
    c.beginPath(); c.roundRect(-7 * s, -9 * s, 14 * s, 18 * s, 3 * s); c.fill(); c.stroke();
    c.beginPath(); c.arc(8 * s, -1 * s, 5 * s, -Math.PI / 2, Math.PI / 2); c.stroke(); c.restore();
  }

  function robot(c, x, y, tx, ty, col, P, A, s) {
    const dx = tx - x, dy = ty - y, d = Math.max(1, Math.hypot(dx, dy)), reach = d, ux = dx / d, uy = dy / d;
    const jx = x + ux * reach * .52 - uy * 11 * s, jy = y + uy * reach * .52 + ux * 11 * s;
    const ex = x + ux * reach, ey = y + uy * reach;
    A.link(c, x, y, jx, jy, 8 * s, A.alpha(col, .8), P.ink3); A.link(c, jx, jy, ex, ey, 7 * s, col, P.ink3);
    A.circle(c, x, y, 16 * s, P.surf, P.ink3, 1.5); A.circle(c, x, y, 8 * s, A.alpha(col, .22), col, 1.5); A.circle(c, jx, jy, 4 * s, P.surf, col, 1.4);
    c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - uy * 6 * s, ey + ux * 6 * s); c.lineTo(ex + uy * 6 * s, ey - ux * 6 * s); c.stroke();
  }

  function scene(c, k, P, A, b, progress, candidate) {
    const col = candidate ? P.mot : P.out, fail = candidate && progress > .62;
    A.rect(c, b.x, b.y, b.w, b.h, 12, P.surf, P.line, 1.2);
    const title = b.w < 200 ? (candidate ? 'кандидат' : 'текущая') : (candidate ? 'кандидат · новый предмет' : 'текущая · новый предмет');
    A.lab(c, k, title, b.x + 12, b.y + 18, { px: b.w < 300 ? 9.3 : 10.8, weight: 760, color: col, align: 'left', halo: false });
    const table = { x: b.x + 12, y: b.y + 34, w: b.w - 24, h: b.h - 65 };
    A.rect(c, table.x, table.y, table.w, table.h, 9, P.dark ? '#655847' : '#eadcc5', P.dark ? '#9b8b73' : '#b7a386', 1.1);
    const sx = table.x + table.w * .25, sy = table.y + table.h * .38, gx = table.x + table.w * .78, gy = table.y + table.h * .38;
    const rx = table.x + table.w * .50, ry = table.y + table.h * .84;
    c.save(); c.setLineDash([4, 4]); c.strokeStyle = A.alpha(col, .55); c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(table.x + table.w * .52, table.y + table.h * .12, gx, gy); c.stroke(); c.restore();
    A.rect(c, gx - 18, gy - 15, 36, 30, 7, A.alpha(P.good, .08), P.good, 1.4);
    A.lab(c, k, 'цель', gx, gy + 25, { px: 8.5, weight: 700, color: P.good, halo: false });
    const q = A.ease(A.seg(progress, .08, .86));
    let mx = sx + (gx - sx) * q, my = sy - Math.sin(q * Math.PI) * table.h * .23 + (gy - sy) * q, tipped = false;
    if (fail) { const z = A.ease(A.seg(progress, .62, .92)); mx = sx + (gx - sx) * (.55 + .06 * z); my = sy - table.h * .20 + table.h * .50 * z; tipped = z > .42; }
    robot(c, rx, ry, mx, my, col, P, A, b.w < 300 ? .78 : .92); mug(c, mx, my, b.w < 300 ? .72 : .86, P, tipped);
    const done = progress > .9;
    if (done) {
      A.circle(c, b.x + b.w - 25, b.y + 18, 11, A.alpha(fail ? P.bad : P.good, .12), fail ? P.bad : P.good, 1.5);
      check(c, b.x + b.w - 25, b.y + 18, 7, fail ? P.bad : P.good, !fail);
      A.lab(c, k, fail ? 'чашка сорвалась' : 'чашка в цели', b.x + b.w / 2, b.y + b.h - 15, { px: 9.5, weight: 720, color: fail ? P.bad : P.good, halo: false });
    } else A.lab(c, k, 'одинаковая поза · одинаковый свет', b.x + b.w / 2, b.y + b.h - 15, { px: 9, color: P.ink3, halo: false });
  }

  function drawScenes(c, k, p, P, A, g) {
    A.lab(c, k, 'Обе версии начинают с одной и той же сцены', g.W / 2, g.narrow ? 82 : 74, { px: g.narrow ? 11 : 13.5, weight: 800, color: P.ink, halo: false });
    if (g.narrow) {
      scene(c, k, P, A, { x: 16, y: 101, w: 328, h: 180 }, p, false);
      scene(c, k, P, A, { x: 16, y: 298, w: 328, h: 180 }, p, true);
      A.lab(c, k, 'Разница относится к политике, а не к сложности старта.', 180, 508, { px: 9.5, color: P.ink2, halo: false });
    } else {
      scene(c, k, P, A, { x: 18, y: 94, w: 333, h: 272 }, p, false);
      scene(c, k, P, A, { x: 369, y: 94, w: 333, h: 272 }, p, true);
      A.lab(c, k, 'Два исполнения образуют одну пару исходов', 360, 405, { px: 10.5, weight: 700, color: P.ink2, halo: false });
    }
  }

  function pairKind(x) { return x.base && x.cand ? 'both' : x.cand ? 'cand' : x.base ? 'base' : 'fail'; }
  function pairTile(c, x, y, w, h, q, P, A, shown) {
    const kind = pairKind(q), col = kind === 'both' ? P.good : kind === 'cand' ? P.mot : kind === 'base' ? P.out : P.ink3;
    A.rect(c, x, y, w, h, 4, shown ? A.alpha(col, .045) : A.alpha(P.surf, .25), shown ? A.alpha(col, .55) : A.alpha(P.line, .25), shown ? 1.3 : 1);
    if (!shown) return;
    const r = Math.min(4.6, h * .18);
    A.circle(c, x + w * .36, y + h * .5, r, q.base ? P.out : A.alpha(P.ink3, .14), q.base ? null : P.ink3, 1);
    A.circle(c, x + w * .66, y + h * .5, r, q.cand ? P.mot : A.alpha(P.ink3, .14), q.cand ? null : P.ink3, 1);
    if (!q.base) check(c, x + w * .36, y + h * .5, r * .65, P.ink3, false);
    if (!q.cand) check(c, x + w * .66, y + h * .5, r * .65, P.ink3, false);
  }

  function drawPairs(c, k, p, P, A, g) {
    const n = Math.min(40, Math.floor(A.seg(p, .06, .88) * 42)), cols = g.narrow ? 8 : 10, rows = 5;
    const gx = g.narrow ? 18 : 22, gy = g.narrow ? 111 : 118, gap = g.narrow ? 5 : 6;
    const gw = g.narrow ? 324 : 470, gh = g.narrow ? 202 : 232, tw = (gw - gap * (cols - 1)) / cols, th = (gh - gap * (rows - 1)) / rows;
    A.lab(c, k, 'Каждый квадрат хранит два исхода одного старта', g.W / 2, g.narrow ? 82 : 76, { px: g.narrow ? 10.5 : 13.5, weight: 800, color: P.ink, halo: false });
    for (let i = 0; i < 40; i++) pairTile(c, gx + (i % cols) * (tw + gap), gy + Math.floor(i / cols) * (th + gap), tw, th, C40.trials[i], P, A, i < n);
    const visible = C40.trials.slice(0, n), counts = { both: 0, cand: 0, base: 0, fail: 0 }; visible.forEach((q) => counts[pairKind(q)]++);
    const items = [
      ['обе справились', counts.both, P.good], ['только кандидат', counts.cand, P.mot],
      ['только текущая', counts.base, P.out], ['обе не справились', counts.fail, P.ink3],
    ];
    if (g.narrow) {
      items.forEach((it, i) => {
        const x = 28 + (i % 2) * 164, y = 346 + Math.floor(i / 2) * 46;
        A.circle(c, x, y, 5, it[2]); A.lab(c, k, it[0], x + 10, y - 5, { px: 9, weight: 650, color: P.ink2, align: 'left', halo: false });
        A.lab(c, k, String(it[1]), x + 10, y + 10, { px: 12, weight: 800, color: it[2], align: 'left', halo: false });
      });
      A.lab(c, k, n < 40 ? `накоплено пар: ${n} из 40` : 'Разницу создают 2 оранжевые и 1 синяя пара.', 180, 465, { px: 9.5, weight: 700, color: n < 40 ? P.ink2 : P.spr, halo: false });
    } else {
      items.forEach((it, i) => {
        const y = 132 + i * 55;
        A.circle(c, 535, y, 6, it[2]); A.lab(c, k, it[0], 548, y - 6, { px: 9.8, weight: 650, color: P.ink2, align: 'left', halo: false });
        A.lab(c, k, String(it[1]), 548, y + 11, { px: 14, weight: 820, color: it[2], align: 'left', halo: false });
      });
      A.lab(c, k, n < 40 ? `накоплено пар: ${n} из 40` : '2 − 1 = +1 успех кандидата', 535, 361, { px: 10.5, weight: 760, color: n < 40 ? P.ink2 : P.spr, align: 'left', halo: false });
      A.lab(c, k, 'Серые пары не меняют разницу, но входят в объём проверки.', 360, 405, { px: 10.5, color: P.ink2, halo: false });
    }
  }

  function interval(c, k, A, P, x0, x1, y, r, label, reveal) {
    const X = (v) => x0 + (x1 - x0) * (v + .10) / .22;
    A.line(c, [[x0, y], [x1, y]], P.line, 1.4);
    const lo = r.diff + (r.lo - r.diff) * reveal, hi = r.diff + (r.hi - r.diff) * reveal;
    A.line(c, [[X(lo), y], [X(hi), y]], r.lo > 0 ? P.good : P.spr, 6);
    A.circle(c, X(r.diff), y, 7, P.mot, P.surf, 1.4);
    A.lab(c, k, label, x0, y - 28, { px: 10.5, weight: 760, color: P.ink, align: 'left', halo: false });
    A.lab(c, k, `${pp(r.diff)}  [${pp(r.lo)}; ${pp(r.hi)}]`, x0, y + 27, { px: 10, weight: 680, color: r.lo > 0 ? P.good : P.ink2, align: 'left', halo: false });
    return X;
  }

  function drawIntervals(c, k, p, P, A, g) {
    const x0 = g.narrow ? 28 : 104, x1 = g.narrow ? 336 : 674, y1 = g.narrow ? 185 : 185, y2 = g.narrow ? 335 : 318;
    A.lab(c, k, 'Больше пар — уже интервал разницы', g.W / 2, g.narrow ? 82 : 76, { px: g.narrow ? 11 : 13.5, weight: 800, color: P.ink, halo: false });
    A.lab(c, k, 'кандидат хуже', x0, g.narrow ? 111 : 108, { px: 9, color: P.ink3, align: 'left', halo: false });
    A.lab(c, k, 'кандидат лучше', x1, g.narrow ? 111 : 108, { px: 9, color: P.ink3, align: 'right', halo: false });
    const X = interval(c, k, A, P, x0, x1, y1, C40, '40 пар · вывод рано', 1);
    const zeroX = X(0); c.save(); c.setLineDash([5, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1.3; c.beginPath(); c.moveTo(zeroX, y1 - 52); c.lineTo(zeroX, y2 + 49); c.stroke(); c.restore();
    A.lab(c, k, '0', zeroX, g.narrow ? 134 : 130, { px: 9.5, weight: 700, color: P.ink3, halo: false });
    const q = A.ease(A.seg(p, .28, .88)); interval(c, k, A, P, x0, x1, y2, C120, '120 пар · кандидат выше', q);
    if (q > .9) {
      const cap = g.narrow ? 'Интервал больше не пересекает ноль.' : 'Дополнительные пары сузили интервал: ноль остался за его границей.';
      A.lab(c, k, cap, g.W / 2, g.narrow ? 433 : 405, { px: g.narrow ? 9.5 : 10.5, weight: 720, color: P.good, halo: false });
    }
  }

  function drawGate(c, k, P, A, x, y, w, name, value, pass, shown) {
    c.save(); c.globalAlpha = shown ? 1 : .18;
    A.rect(c, x, y, w, 48, 9, shown ? A.alpha(pass ? P.good : P.bad, .07) : P.surf, shown ? (pass ? P.good : P.bad) : P.line, 1.4);
    A.circle(c, x + 23, y + 24, 11, A.alpha(pass ? P.good : P.bad, .11), pass ? P.good : P.bad, 1.4); check(c, x + 23, y + 24, 7, pass ? P.good : P.bad, pass);
    A.lab(c, k, name, x + 43, y + 18, { px: 9.8, weight: 700, color: P.ink, align: 'left', halo: false });
    A.lab(c, k, value, x + 43, y + 34, { px: 9.2, weight: 650, color: pass ? P.good : P.bad, align: 'left', halo: false }); c.restore();
  }

  function barrier(c, k, P, A, g, p, failed) {
    const y = g.narrow ? 445 : 344, left = g.narrow ? 30 : 484, right = g.narrow ? 330 : 690, q = A.ease(A.seg(p, .15, .76));
    A.line(c, [[left, y], [right, y]], P.line, 3);
    const stop = failed ? .58 : 1, x = left + (right - left) * Math.min(q, stop);
    A.circle(c, x, y, g.narrow ? 12 : 14, P.mot, P.surf, 2); A.lab(c, k, 'A', x, y, { px: 9, weight: 850, color: P.surf, halo: false });
    const bx = left + (right - left) * .68;
    c.strokeStyle = failed ? P.bad : P.good; c.lineWidth = 5; c.beginPath(); c.moveTo(bx, y - 30); c.lineTo(bx, y + 30); c.stroke();
    for (let i = 0; i < 4; i++) A.circle(c, bx, y - 22 + i * 15, 3.2, REL.checks[i].pass ? P.good : P.bad);
    A.lab(c, k, 'выпуск', right, y + 33, { px: 9.5, weight: 700, color: P.ink3, align: 'right', halo: false });
    if (failed && q > .68) A.lab(c, k, 'СТОП · 3 из 4 не пройдены', g.narrow ? 180 : 587, g.narrow ? 497 : 403, { px: g.narrow ? 11 : 12, weight: 820, color: P.bad, halo: false });
  }

  function drawRelease(c, k, p, P, A, g) {
    const rows = [
      ['общий успех', '85% ≥ 79%', true], ['новый предмет', '54% < 61%', false],
      ['безопасность', '2 опасных действия > 0', false], ['задержка p95', '435 мс > 400 мс', false],
    ];
    A.lab(c, k, 'Один хороший итог не отменяет обязательные критерии', g.W / 2, g.narrow ? 82 : 76, { px: g.narrow ? 10.5 : 13.5, weight: 800, color: P.ink, halo: false });
    if (g.narrow) {
      rows.forEach((r, i) => drawGate(c, k, P, A, 18, 108 + i * 65, 324, r[0], r[1], r[2], p > .08 + i * .16));
    } else {
      A.lab(c, k, `${REL.candidate.name} · общий успех выше`, 22, 110, { px: 11, weight: 760, color: P.mot, align: 'left', halo: false });
      rows.forEach((r, i) => drawGate(c, k, P, A, 22 + (i % 2) * 225, 130 + Math.floor(i / 2) * 72, 207, r[0], r[1], r[2], p > .08 + i * .16));
      A.lab(c, k, 'Кандидат доходит до решения, но проходит только при четырёх ✓.', 484, 286, { px: 9.6, color: P.ink2, align: 'left', halo: false });
    }
    barrier(c, k, P, A, g, p, true);
  }

  function miniInterval(c, k, P, A, x0, x1, y, r, label, reveal, compact) {
    const X = (v) => x0 + (x1 - x0) * (v + .10) / .22;
    A.line(c, [[x0, y], [x1, y]], P.line, 1.3);
    const lo = r.diff + (r.lo - r.diff) * reveal, hi = r.diff + (r.hi - r.diff) * reveal;
    A.line(c, [[X(lo), y], [X(hi), y]], r.lo > 0 ? P.good : P.spr, compact ? 4 : 5);
    A.circle(c, X(r.diff), y, compact ? 5 : 6, P.mot, P.surf, 1.2);
    A.lab(c, k, label, x0, y - 18, { px: compact ? 8.5 : 9.5, weight: 760, color: P.ink, align: 'left', halo: false });
    A.lab(c, k, `[${pp(r.lo)}; ${pp(r.hi)}]`, x0, y + 19, { px: compact ? 7.8 : 8.8, weight: 650, color: r.lo > 0 ? P.good : P.ink2, align: 'left', halo: false });
    return X(0);
  }

  function drawOverview(c, k, t, P, A, g) {
    c.fillStyle = P.surf2; c.fillRect(0, 0, g.W, g.H);
    const u = ((t % T) + T) % T;
    const sceneP = A.ease(A.seg(u, .3, 3.5));
    const pairN = Math.min(40, Math.floor(A.seg(u, 2.2, 5.4) * 42));
    const intervalP = A.ease(A.seg(u, 5.0, 8.0));
    const gateP = A.ease(A.seg(u, 7.5, 10.4));
    A.lab(c, k, g.narrow ? 'Один тест → решение о выпуске' : 'Один тест постепенно превращается в решение о выпуске', g.W / 2, g.narrow ? 20 : 22, { px: g.narrow ? 10.8 : 13.5, weight: 820, color: P.ink, halo: false });

    if (!g.narrow) {
      // Стрелки лежат под содержимым; три области остаются на месте весь цикл.
      A.arrow(c, 256, 55, 281, 55, P.spr, 1.7, 6); A.arrow(c, 475, 55, 497, 55, P.spr, 1.7, 6);
      A.lab(c, k, '1 · одинаковый старт', 16, 55, { px: 10.5, weight: 800, color: P.out, align: 'left', halo: false });
      A.lab(c, k, '2 · парные исходы', 283, 55, { px: 10.5, weight: 800, color: P.spr, align: 'left', halo: false });
      A.lab(c, k, '3 · решение', 499, 55, { px: 10.5, weight: 800, color: P.mot, align: 'left', halo: false });
      scene(c, k, P, A, { x: 16, y: 72, w: 244, h: 146 }, sceneP, false);
      scene(c, k, P, A, { x: 16, y: 230, w: 244, h: 146 }, sceneP, true);
      A.lab(c, k, 'тот же старт · разные исполнения', 138, 405, { px: 9.3, weight: 700, color: P.ink2, halo: false });

      const cols = 8, gx = 283, gy = 83, gw = 190, gh = 150, gap = 4, tw = (gw - gap * 7) / cols, th = (gh - gap * 4) / 5;
      for (let i = 0; i < 40; i++) pairTile(c, gx + (i % cols) * (tw + gap), gy + Math.floor(i / cols) * (th + gap), tw, th, C40.trials[i], P, A, i < pairN);
      A.circle(c, gx, 253, 4.5, P.out); A.lab(c, k, 'текущая', gx + 9, 253, { px: 8.5, color: P.ink2, align: 'left', halo: false });
      A.circle(c, gx + 88, 253, 4.5, P.mot); A.lab(c, k, 'кандидат', gx + 97, 253, { px: 8.5, color: P.ink2, align: 'left', halo: false });
      const z40 = miniInterval(c, k, P, A, gx, gx + gw, 302, C40, '40 пар · вывод рано', 1, false);
      miniInterval(c, k, P, A, gx, gx + gw, 365, C120, '120 пар · интервал выше нуля', intervalP, false);
      c.save(); c.setLineDash([4, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(z40, 276); c.lineTo(z40, 389); c.stroke(); c.restore();

      const rows = [
        ['общий успех', '85% ≥ 79%', true], ['новый предмет', '54% < 61%', false],
        ['безопасность', '2 опасных действия > 0', false], ['задержка p95', '435 мс > 400 мс', false],
      ];
      rows.forEach((r, i) => drawGate(c, k, P, A, 499, 76 + i * 55, 205, r[0], r[1], r[2], gateP > .08 + i * .16));
      barrier(c, k, P, A, g, gateP, true);
      return;
    }

    A.arrow(c, 105, 49, 126, 49, P.spr, 1.5, 5); A.arrow(c, 223, 49, 244, 49, P.spr, 1.5, 5);
    A.lab(c, k, '1 · старт', 12, 49, { px: 9.2, weight: 800, color: P.out, align: 'left', halo: false });
    A.lab(c, k, '2 · пары', 128, 49, { px: 9.2, weight: 800, color: P.spr, align: 'left', halo: false });
    A.lab(c, k, '3 · решение', 246, 49, { px: 9.2, weight: 800, color: P.mot, align: 'left', halo: false });
    scene(c, k, P, A, { x: 8, y: 67, w: 168, h: 184 }, sceneP, false);
    scene(c, k, P, A, { x: 184, y: 67, w: 168, h: 184 }, sceneP, true);

    const cols = 8, gx = 18, gy = 294, gw = 324, gh = 108, gap = 4, tw = (gw - gap * 7) / cols, th = (gh - gap * 4) / 5;
    A.lab(c, k, pairN < 40 ? `парные исходы · ${pairN} из 40` : 'парные исходы · 2 − 1 = +1', 18, 277, { px: 9.5, weight: 760, color: P.ink, align: 'left', halo: false });
    for (let i = 0; i < 40; i++) pairTile(c, gx + (i % cols) * (tw + gap), gy + Math.floor(i / cols) * (th + gap), tw, th, C40.trials[i], P, A, i < pairN);
    const z40 = miniInterval(c, k, P, A, 28, 332, 454, C40, '40 пар · рано', 1, true);
    miniInterval(c, k, P, A, 28, 332, 510, C120, '120 пар · выше нуля', intervalP, true);
    c.save(); c.setLineDash([4, 4]); c.strokeStyle = P.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(z40, 429); c.lineTo(z40, 532); c.stroke(); c.restore();

    const rows = [
      ['общий успех', '85% ≥ 79%', true], ['новый предмет', '54% < 61%', false],
      ['безопасность', '2 действия > 0', false], ['задержка p95', '435 > 400 мс', false],
    ];
    rows.forEach((r, i) => drawGate(c, k, P, A, 8 + (i % 2) * 176, 558 + Math.floor(i / 2) * 58, 168, r[0], r[1], r[2], gateP > .08 + i * .16));
    if (gateP > .72) A.lab(c, k, 'СТОП · 3 из 4 критериев не пройдены', 180, 698, { px: 10.5, weight: 820, color: P.bad, halo: false });
  }

  function draw(c, k, t, P, A, g) {
    drawOverview(c, k, t, P, A, g);
  }
  const wide = { W: 720, H: 430, narrow: false }, narrow = { W: 360, H: 720, narrow: true };
  Anim.add('qa-flow', { W: wide.W, H: wide.H, start: .8, narrowAt: 600, draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); }, narrow: { W: narrow.W, H: narrow.H, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrow); } } });
})();

/* ---------- переработанные живые лаборатории ---------- */
const wait84 = (ms) => new Promise((r) => setTimeout(r, ms));
const reduce84 = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function qRect(c,x,y,w,h,r,fill,stroke,lw){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke()}}
function qLine(c,a,b,col,w,dash){c.save();c.strokeStyle=col;c.lineWidth=w||2;if(dash)c.setLineDash(dash);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();c.restore()}
function qAlpha(col,a){if(/^#([0-9a-f]{6})$/i.test(col)){const n=parseInt(col.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}const m=String(col).match(/[\d.]+/g);return m&&m.length>=3?`rgba(${m[0]},${m[1]},${m[2]},${a})`:col}
function qLabel(c,k,s,x,y,o){HeroKit.label(c,k,s,x,y,Object.assign({px:12,weight:650,color:pal().ink,halo:false},o||{}))}
function qDot(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke()}}
function qArm(c,x,y,tx,ty,col){const mx=(x+tx)/2-12,my=Math.min(y-58,ty-38);qLine(c,[x,y],[mx,my],col,10);qDot(c,x,y,8,col);qLine(c,[mx,my],[tx,ty],col,8);qDot(c,mx,my,7,col);qLine(c,[tx-7,ty-2],[tx,ty+7],col,2.5);qLine(c,[tx+7,ty-2],[tx,ty+7],col,2.5)}
function qCup(c,x,y,P,novel,tipped){c.save();c.translate(x,y);if(tipped)c.rotate(.72);c.fillStyle=novel?qAlpha(P.e2e,.18):'#c9653c';c.strokeStyle=novel?P.e2e:P.ink2;c.lineWidth=1.5;c.beginPath();c.roundRect(-10,-12,20,24,4);c.fill();c.stroke();c.beginPath();c.arc(12,-1,7,-Math.PI/2,Math.PI/2);c.stroke();c.restore()}
function qMark(c,k,x,y,ok){qDot(c,x,y,12,qAlpha(ok?pal().good:pal().bad,.12),ok?pal().good:pal().bad);qLabel(c,k,ok?'✓':'×',x,y,{px:14,weight:900,color:ok?pal().good:pal().bad})}

function matrixPair(sliceIndex){const s=L84.SLICES[sliceIndex],prefer=sliceIndex===3?'base':'cand';let first=null;for(let i=0;i<80;i++){const r=L84.pairedOutcome(8401,sliceIndex,i,s.base,s.cand);if(!first)first=r;if(prefer==='base'&&r.base&&!r.cand)return r;if(prefer==='cand'&&r.cand&&!r.base)return r}return first}
function drawKitchenPanel(c,k,P,b,sliceIndex,outcome,progress,candidate){const s=L84.SLICES[sliceIndex],col=candidate?P.e2e:P.cl; qRect(c,b.x,b.y,b.w,b.h,13,P.surf,P.line,1);qLabel(c,k,candidate?'КАНДИДАТ':'ТЕКУЩАЯ',b.x+14,b.y+18,{px:9.5,weight:850,color:col,align:'left'});qLabel(c,k,s.name,b.x+b.w-14,b.y+18,{px:9.5,color:P.ink3,align:'right'});const tx=b.x+18,ty=b.y+43,tw=b.w-36,th=b.h-71;qRect(c,tx,ty,tw,th,10,P.surf,P.line,1);qLine(c,[tx+12,ty+th*.76],[tx+tw-12,ty+th*.76],P.line2,5);if(sliceIndex===1){c.fillStyle=qAlpha('#101522',.35);c.fillRect(tx,ty,tw,th);qDot(c,tx+tw*.82,ty+22,9,P.warn)}if(sliceIndex===2){[.44,.57,.70].forEach((p,i)=>qRect(c,tx+tw*p,ty+th*(.55-(i%2)*.16),18,th*(.21+(i%2)*.12),4,P.bg,P.line2,1))}const sx=tx+tw*.32,gx=tx+tw*.78,gy=ty+th*.58,baseX=tx+tw*.17,baseY=ty+th*.74;const ok=candidate?outcome.cand:outcome.base,q=Math.min(1,progress);let ox=sx+(gx-sx)*q,oy=gy-Math.sin(q*Math.PI)*th*.28,tipped=false;if(!ok&&q>.58){const z=(q-.58)/.42;ox=sx+(gx-sx)*(.56+.08*z);oy=gy-th*.26+th*.56*z;tipped=z>.35}qRect(c,gx-25,gy-19,50,38,7,qAlpha(P.good,.08),P.good,1.5);qLabel(c,k,'цель',gx,gy+1,{px:8,weight:800,color:P.good});qArm(c,baseX,baseY,ox,oy,col);qCup(c,ox,oy,P,sliceIndex===3,tipped);if(progress>=1){qMark(c,k,b.x+b.w-24,b.y+b.h-19,ok);qLabel(c,k,ok?'успех':'отказ',b.x+b.w-42,b.y+b.h-19,{px:9,weight:800,color:ok?P.good:P.bad,align:'right'})}}

function initMatrixLab(){const S={plan:'traffic',last:null,active:0,progress:0,busy:false},cv=$('#mCv'),slices=$('#mSlices'),result=$('#mResult');
  function draw(){const narrow=(cv.getBoundingClientRect().width||760)<520,W=narrow?380:760,H=narrow?630:410,{c,k}=HeroKit.fit(cv,W,H),P=pal();c.fillStyle=P.bg;c.fillRect(0,0,W,H);const r=S.last,plan=L84.PLANS[S.plan],i=S.active,pair=matrixPair(i);if(narrow){qLabel(c,k,`Одна пара · ${plan.name}`,18,21,{px:11.5,weight:820,color:P.ink,align:'left'});qLabel(c,k,`${plan.counts[i]} из 100 запусков`,W-18,40,{px:10,color:P.ink3,align:'right'});drawKitchenPanel(c,k,P,{x:14,y:56,w:352,h:238},i,pair,S.progress,false);drawKitchenPanel(c,k,P,{x:14,y:312,w:352,h:238},i,pair,S.progress,true);qLabel(c,k,'Одинаковая сцена внутри пары',190,584,{px:10,color:P.ink3})}else{qLabel(c,k,`Репрезентативная пара · ${plan.name}`,18,24,{px:12.5,weight:820,color:P.ink,align:'left'});qLabel(c,k,`${plan.counts[i]} из 100 запусков`,W-18,24,{px:10.5,color:P.ink3,align:'right'});drawKitchenPanel(c,k,P,{x:18,y:51,w:353,h:290},i,pair,S.progress,false);drawKitchenPanel(c,k,P,{x:389,y:51,w:353,h:290},i,pair,S.progress,true);qLine(c,[380,61],[380,337],P.line,1,[4,5]);qLabel(c,k,'одинаковый старт · меняется только версия',380,377,{px:10.5,color:P.ink3})}if(r&&S.progress>=1)qLabel(c,k,`Итог плана: ${pct(r.baseRate)} → ${pct(r.candRate)} (${pp(r.diff)})`,W/2,narrow?614:397,{px:11,weight:820,color:r.diff>=0?P.good:P.bad})}
  function render(){const plan=L84.PLANS[S.plan],r=S.last;$('#mCounter').textContent=`${r?100:0} / 100`;slices.innerHTML=L84.SLICES.map((s,i)=>{const row=r&&r.rows[i],reg=row&&row.candRate+.05<row.baseRate;return `<div class="slice-card${i===S.active?' active':''}${reg?' regress':''}"><header><b>${s.name}</b><span>${plan.counts[i]} запусков</span></header><div class="slice-rates"><span><i>тек.</i> ${row?pct(row.baseRate):'—'}</span><span><i>канд.</i> ${row?pct(row.candRate):'—'}</span></div></div>`}).join('');draw();if(!r)setOut(result,'Выбери план. При запуске обе версии получат одинаковые старты внутри каждой пары.')}
  function setPlan(v){if(!L84.PLANS[v]||S.busy)return;S.plan=v;S.last=null;S.active=0;S.progress=0;segSet('#mPlan',v);render()}
  async function run(){if(S.busy)return S.last;S.busy=true;S.last=L84.evaluate(S.plan);const steps=reduce84()?1:14;for(let i=0;i<4;i++){S.active=i;for(let j=0;j<=steps;j++){S.progress=j/steps;render();if(steps>1)await wait84(22)}}S.busy=false;const r=S.last;setOut(result,`${r.plan.name}: текущая ${pct(r.baseRate)}, кандидат ${pct(r.candRate)}; разница ${pp(r.diff)}.`,r.diff>=0?'good':'bad');return r}
  bindSeg('#mPlan',setPlan);const api={reset(){setPlan('traffic')},state(){return S},setPlan,run};const missions=[
    {short:'Рабочая смесь',title:'Проверь поток задач как в продукте',text:'В рабочей смеси 70 обычных кухонь и только два запуска с новой чашкой. Сначала предскажи общий итог.',controls:'all',onEnter(){setPlan('traffic')},bet:{q:'Кто выиграет по общему успеху?',options:['Текущая версия','Кандидат','Будет поровну'],answer:r=>r.diff>0?1:r.diff<0?0:2},action:{label:'Прогнать рабочую смесь',run},criteria:[{label:'Запущены 100 испытаний рабочей смеси',test:r=>r.plan.id==='traffic'},{label:'Кандидат выше по общему успеху',test:r=>r.diff>0}],summary:r=>`${pct(r.baseRate)} → ${pct(r.candRate)}`,explain:r=>`Кандидат выиграл ${pp(r.diff)}, но новая чашка встретилась только ${r.rows[3].n} раза. Среднее ещё не проверило этот риск.`},
    {short:'Поровну',title:'Дай каждому условию одинаковый вес',text:'Теперь по 25 запусков приходится на каждую сцену. Политики и старты не меняются — меняется вопрос испытания.',controls:'all',onEnter(){setPlan('balanced')},bet:{q:'Сохранится ли общий победитель?',options:['Да, кандидат выше','Нет, текущая версия окажется выше','Будет ничья'],answer:r=>r.diff<0?1:0},action:{label:'Прогнать четыре равных среза',run},criteria:[{label:'Каждое условие получило 25 запусков',test:r=>r.plan.id==='balanced'},{label:'Новая чашка показала регрессию',test:r=>r.rows[3].candRate<r.rows[3].baseRate}],summary:r=>`Поровну: ${pct(r.baseRate)} → ${pct(r.candRate)}`,explain:r=>`Общий вывод сменился, потому что редкое условие перестало исчезать в среднем. На новой чашке кандидат хуже на ${fmt(Math.abs(r.rows[3].candRate-r.rows[3].baseRate)*100)} п.п.`},
    {short:'Стресс-тест',title:'Воспроизведи слабое место',text:'В стресс-тесте 60 запусков используют новую чашку. Проверь, повторяется ли отказ на живой сцене.',controls:'all',onEnter(){setPlan('stress')},action:{label:'Запустить стресс-тест',run},criteria:[{label:'Новая чашка получила 60 запусков',test:r=>r.plan.id==='stress'},{label:'Кандидат хуже минимум на 10 п.п.',test:r=>r.diff<=-.10}],summary:r=>`Стресс: ${pp(r.diff)}`,explain:r=>`Регрессия повторилась: общий разрыв ${pp(r.diff)}, на новой чашке ${pp(r.rows[3].candRate-r.rows[3].baseRate)} Стресс-тест проверяет риск, а не его частоту в продукте.`},
    {short:'Свободно',title:'Сопоставь три вопроса',text:'Рабочая смесь оценивает поток, равные срезы — покрытие, стресс-тест — конкретный риск.',controls:'all',final:true}
  ];mountMissions('#mMis',missions,api,{controls:{plan:'#mPlan'},scene:'#mCv'});render();App.on('theme',draw);App.on('resize',draw);return api}

function drawMiniStart(c,k,P,b,title,xGoal,outcome,col){qRect(c,b.x,b.y,b.w,b.h,11,P.surf,P.line,1);qLabel(c,k,title,b.x+10,b.y+16,{px:9,weight:820,color:col,align:'left'});qLine(c,[b.x+14,b.y+b.h-30],[b.x+b.w-14,b.y+b.h-30],P.line2,4);const bx=b.x+35,by=b.y+b.h-33,gx=b.x+18+xGoal*(b.w-36),gy=b.y+b.h-74;qRect(c,gx-15,gy-13,30,26,5,qAlpha(P.good,.08),P.good,1);qArm(c,bx,by,outcome?gx:gx-35,gy,col);qCup(c,outcome?gx:gx-35,gy,P,false,!outcome);qMark(c,k,b.x+b.w-22,b.y+18,outcome)}
function initUncertaintyLab(){const S={mode:'paired',n:0,target:40,last:null,busy:false},cv=$('#uPlot'),strip=$('#uPairs'),result=$('#uResult');
  function draw(){const narrow=(cv.getBoundingClientRect().width||760)<520,W=narrow?380:760,H=narrow?560:430,{c,k}=HeroKit.fit(cv,W,H),P=pal(),r=S.last; c.fillStyle=P.bg;c.fillRect(0,0,W,H);qLabel(c,k,S.mode==='paired'?'Один старт для двух версий':'Два разных старта',18,23,{px:12.5,weight:820,color:P.ink,align:'left'});const last=r&&r.trials[Math.max(0,r.trials.length-1)]||{base:false,cand:false},a=S.mode==='paired'?.58:.35,b=S.mode==='paired'?.58:.76;if(narrow){drawMiniStart(c,k,P,{x:12,y:45,w:172,h:150},'ТЕКУЩАЯ',a,last.base,P.cl);drawMiniStart(c,k,P,{x:196,y:45,w:172,h:150},'КАНДИДАТ',b,last.cand,P.e2e)}else{drawMiniStart(c,k,P,{x:20,y:48,w:350,h:178},'ТЕКУЩАЯ ВЕРСИЯ',a,last.base,P.cl);drawMiniStart(c,k,P,{x:390,y:48,w:350,h:178},'КАНДИДАТ',b,last.cand,P.e2e)}const y=narrow?312:320,x0=narrow?48:105,x1=narrow?352:700;if(!r){qLine(c,[x0,y],[x1,y],P.line,4);qLabel(c,k,'Интервал появится после первого пакета',W/2,y,{px:10.5,color:P.ink3});return}const D=v=>x0+(x1-x0)*(v+.2)/.5;qLine(c,[x0,y],[x1,y],P.line,2);qLine(c,[D(0),y-37],[D(0),y+32],P.ink3,1,[4,4]);qLine(c,[D(r.lo),y],[D(r.hi),y],r.lo>0?P.good:P.hy,7);qDot(c,D(r.diff),y,8,P.e2e);qLabel(c,k,'разница «кандидат − текущая»',x0,y-50,{px:10.5,weight:750,color:P.ink,align:'left'});qLabel(c,k,`${pp(r.diff)}  [${pp(r.lo)}; ${pp(r.hi)}]`,x0,y+48,{px:10.5,weight:750,color:r.lo>0?P.good:P.ink2,align:'left'});qLabel(c,k,'0',D(0),y+20,{px:9,color:P.ink3});const by=narrow?424:385;qRect(c,18,by-27,W-36,58,10,P.surf,P.line,1);qLabel(c,k,`${r.kb}/${r.n} текущая`,36,by-7,{px:10.5,weight:750,color:P.cl,align:'left'});qLabel(c,k,`${r.kc}/${r.n} кандидат`,W-36,by-7,{px:10.5,weight:750,color:P.e2e,align:'right'});qLabel(c,k,r.lo>0?'улучшение отделилось от нуля':'данные ещё совместимы с нулевой разницей',W/2,by+15,{px:10,weight:750,color:r.lo>0?P.good:P.ink3});if(narrow)qLabel(c,k,S.mode==='paired'?'сцены совпадают внутри каждой пары':'разницу частично создают старты',190,525,{px:9.5,color:S.mode==='paired'?P.good:P.bad})}
  function render(){const r=S.last;$('#uCount').textContent=S.n;strip.innerHTML='';if(r&&r.paired)r.trials.slice(-20).forEach(x=>{const i=document.createElement('i');i.className=x.d>0?'cand':x.d<0?'base':x.base?'same-ok':'same-bad';strip.append(i)});strip.hidden=!(r&&r.paired);draw();if(!r)setOut(result,'Первый пакет покажет наблюдаемый разрыв и неопределённость вокруг него.');else setOut(result,`${r.paired?'Одинаковые':'Разные'} старты · ${r.n} на версию · ${pp(r.diff)} [${pp(r.lo)}; ${pp(r.hi)}].`,r.lo>0?'good':'')}
  function set(o){if(S.busy)return;Object.assign(S,o);S.n=o.n==null?S.n:o.n;S.last=S.n?L84.compare(S.n,S.mode==='paired'):null;segSet('#uMode',S.mode);render()}
  async function runTo(target){if(S.busy)return S.last;S.busy=true;for(let n=Math.max(20,S.n||20);n<=target;n+=20){S.n=n;S.last=L84.compare(n,S.mode==='paired');render();if(!reduce84())await wait84(150)}S.busy=false;render();return S.last}
  function run(){return runTo(S.target)}bindSeg('#uMode',v=>set({mode:v,n:0}));$('#uReset').onclick=()=>set({n:0});$('#uAdd').onclick=()=>runTo(Math.min(400,(S.n||0)+20));const api={reset(){set({mode:'paired',n:0,target:40})},state(){return S},set,run};const missions=[
    {short:'40 пар',title:'Не принимай две точки за доказательство',text:'Запусти 40 пар. У каждой пары общий старт, но наблюдаемый выигрыш ещё может быть случайным.',controls:'all',onEnter(){set({mode:'paired',n:0,target:40})},bet:{q:'Подтвердят ли 40 пар улучшение?',options:['Да: кандидат выше','Нет: интервал захватит ноль','Да, если обе версии выше 50%'],answer:r=>r.lo>0?0:1},action:{label:'Накопить 40 пар',run},criteria:[{label:'Накоплено 40 парных испытаний',test:r=>r.paired&&r.n===40},{label:'Интервал пересекает ноль',test:r=>r.lo<=0&&r.hi>=0}],summary:r=>`${pp(r.diff)} [${pp(r.lo)}; ${pp(r.hi)}]`,explain:()=> 'Кандидат наблюдаемо выше, но интервал включает небольшой проигрыш. Двух процентов без неопределённости было бы недостаточно.'},
    {short:'Достаточно',title:'Продолжай, пока вывод не отделится от нуля',text:'Движок добавит пары пакетами по 20. Порог этой фиксированной последовательности — 120 пар.',controls:'all',onEnter(){set({mode:'paired',n:40,target:120})},action:{label:'Продолжить до 120 пар',run},criteria:[{label:'Сохранены одинаковые старты',test:r=>r.paired},{label:'Нижняя граница выше нуля',test:r=>r.lo>0},{label:'Использовано не больше 200 пар',test:r=>r.n<=200}],summary:r=>`${r.n} пар · нижняя граница ${pp(r.lo)}`,explain:r=>`При ${r.n} парах интервал [${pp(r.lo)}; ${pp(r.hi)}] целиком выше нуля. Это свойство данного эффекта и последовательности, а не универсальный рецепт.`},
    {short:'Разные старты',title:'Разорви пару и увидь смешение причин',text:'Теперь версии получат разные сцены. Политики не меняются, но короткая серия покажет крупный разрыв.',controls:'all',onEnter(){set({mode:'unpaired',n:0,target:40})},action:{label:'Запустить 40 разных стартов',run},criteria:[{label:'Использованы разные старты',test:r=>!r.paired&&r.n===40},{label:'Наблюдаемый разрыв больше 10 п.п.',test:r=>Math.abs(r.diff)>.10}],summary:r=>`Разные старты: ${pp(r.diff)}`,explain:r=>`Разрыв вырос до ${pp(r.diff)} Хотя политики прежние, часть различия создали сцены. Парность нужна не для красивого числа, а для причинного сравнения.`},
    {short:'Свободно',title:'Накопи собственную серию',text:'Добавляй по 20 испытаний, меняй схему и следи, как меняются исходы и интервал разницы.',controls:'all',final:true}
  ];mountMissions('#uMis',missions,api,{controls:{mode:'#uMode',batch:'.batch-controls'},scene:'#uPlot'});render();App.on('theme',draw);App.on('resize',draw);return api}

function releaseValue(c,id){return id==='overall'?`${pct(c.overall)} ≥ ${pct(L84.BASELINE.overall)}`:id==='slice'?`${pct(c.rare)} ≥ ${pct(L84.BASELINE.rare-.05)}`:id==='safety'?`${c.unsafe} = 0`: `${c.latency} ≤ 400 мс`}
function initReleaseLab(){const order=['overall','slice','safety','latency'],S={candidate:'fast',gates:['overall'],last:null,stage:-1,busy:false},cv=$('#rCv'),path=$('#rPath'),result=$('#rResult');
  function draw(){const narrow=(cv.getBoundingClientRect().width||760)<520,W=narrow?380:760,H=narrow?340:420,{c,k}=HeroKit.fit(cv,W,H),P=pal(),cand=L84.CANDIDATES[S.candidate],checks=L84.release(S.candidate,S.gates).checks;c.fillStyle=P.bg;c.fillRect(0,0,W,H);qLabel(c,k,`${cand.name} · путь к выпуску`,18,24,{px:13,weight:830,color:P.ink,align:'left'});const cards=order.map((id,i)=>{const check=checks.find(x=>x.id===id),enabled=!!check,reached=enabled&&S.stage>=S.gates.indexOf(id);return{id,i,check,enabled,reached,pass:check&&check.pass}});cards.forEach((z,i)=>{const x=narrow?18+(i%2)*174:18+i*185,y=narrow?55+Math.floor(i/2)*116:64,w=narrow?168:168,h=narrow?100:240,col=!z.enabled?P.ink3:z.pass?P.good:P.bad;qRect(c,x,y,w,h,12,P.surf,z.reached?col:P.line,z.reached?2:1);qLabel(c,k,`${i+1}`,x+22,y+22,{px:10,weight:900,color:z.enabled?P.surf:P.ink3});qDot(c,x+22,y+22,13,z.enabled?col:P.bg,P.line);qLabel(c,k,(narrow?['УСПЕХ','НОВАЯ ЧАШКА','БЕЗОПАСНОСТЬ','ЗАДЕРЖКА']:['ОБЩИЙ УСПЕХ','НОВАЯ ЧАШКА','БЕЗОПАСНОСТЬ','ЗАДЕРЖКА'])[i],x+42,y+22,{px:narrow?7.7:8.6,weight:850,color:z.enabled?P.ink:P.ink3,align:'left'});if(narrow){qLabel(c,k,releaseValue(cand,z.id),x+14,y+54,{px:12,weight:850,color:z.enabled?col:P.ink3,align:'left'});qLabel(c,k,z.enabled?(z.reached?(z.pass?'пройдено':'остановка'):'ожидает'):'не выбрано',x+14,y+79,{px:8.5,color:z.reached?col:P.ink3,align:'left'})}else{const sy=y+65;qLine(c,[x+26,sy+118],[x+w-26,sy+118],P.line2,4);if(i===0){qArm(c,x+38,sy+113,x+w-45,sy+58,P.e2e);qCup(c,x+w-45,sy+58,P,false,false)}else if(i===1){qArm(c,x+38,sy+113,x+w-58,sy+64,P.e2e);qCup(c,x+w-58,sy+64,P,true,!z.pass)}else if(i===2){qRect(c,x+w-60,sy+38,30,80,9,qAlpha(P.bad,.08),P.bad,1.5);qLabel(c,k,'человек',x+w-45,sy+128,{px:8,color:P.bad});qArm(c,x+38,sy+113,x+w-72,sy+70,P.e2e)}else{qDot(c,x+w/2,sy+70,30,P.bg,P.line2);qLine(c,[x+w/2,sy+70],[x+w/2+20,sy+52],col,3);qLabel(c,k,`${cand.latency} мс`,x+w/2,sy+121,{px:11,weight:850,color:col})}qLabel(c,k,releaseValue(cand,z.id),x+w/2,y+h-34,{px:10,weight:800,color:z.enabled?col:P.ink3});if(z.reached)qMark(c,k,x+w-22,y+22,z.pass)} });const enabled=S.gates.length,done=S.stage>=enabled-1;if(done){const pass=checks.every(x=>x.pass);qLabel(c,k,pass?'ДВЕРЬ ОТКРЫТА · ОГРАНИЧЕННЫЙ ВЫПУСК':'СТОП · КАНДИДАТ ВОЗВРАЩАЕТСЯ В РАЗРАБОТКУ',W/2,narrow?316:390,{px:narrow?8.3:11,weight:880,color:pass?P.good:P.bad})}}
  function render(){const cand=L84.CANDIDATES[S.candidate],r=S.last;segSet('#rCandidate',S.candidate);$$('#rGates input').forEach(x=>x.checked=S.gates.includes(x.value));const checks=r?r.checks:L84.release(S.candidate,S.gates).checks;path.innerHTML=order.map(id=>{const ch=checks.find(x=>x.id===id),reached=ch&&S.stage>=S.gates.indexOf(id),cls=!ch?'':reached?(ch.pass?' on pass':' on fail'):' on';return `<div class="gate-node${cls}">${ch?(reached?(ch.pass?'✓ ':'✗ '):'○ '):'— '}${L84.GATES[id].name}</div>`}).join('');draw();if(!r)setOut(result,`${cand.name}: выбрано ${S.gates.length} обязательных ${S.gates.length===1?'критерий':'критерия'}.`)}
  function set(o){if(S.busy)return;Object.assign(S,o);S.gates=order.filter(id=>S.gates.includes(id));S.last=null;S.stage=-1;render()}
  async function run(){if(S.busy)return S.last;S.busy=true;const r=L84.release(S.candidate,S.gates);S.last=r;const delay=reduce84()?0:330;for(let i=0;i<r.checks.length;i++){S.stage=i;render();if(delay)await wait84(delay)}S.busy=false;setOut(result,r.pass?`${r.candidate.name} прошёл все ${r.checks.length} станции: ограниченный выпуск разрешён.`:`${r.candidate.name} остановлен: не пройдено ${r.failed.length} из ${r.checks.length} обязательных критериев.`,r.pass?'good':'bad');return r}
  bindSeg('#rCandidate',v=>set({candidate:v}));$('#rGates').addEventListener('change',()=>{let gates=$$('#rGates input:checked').map(x=>x.value);if(!gates.length){$('#rGates input[value="overall"]').checked=true;gates=['overall']}set({gates})});const all=order.slice(),api={reset(){set({candidate:'fast',gates:['overall']})},state(){return S},set,run};const missions=[
    {short:'Одно среднее',title:'Открой дверь одним показателем',text:'Оставь кандидата A и только общий успех. Одно правило не видит остальные свойства.',controls:'all',onEnter(){set({candidate:'fast',gates:['overall']})},bet:{q:'Что решит один критерий?',options:['Выпустить','Остановить','Не даст решения'],answer:r=>r.pass?0:1},action:{label:'Проверить общий успех',run},criteria:[{label:'Проверен кандидат A',test:r=>r.candidate.id==='fast'},{label:'Выбран только общий успех',test:r=>r.enabled.length===1},{label:'Дверь выпуска открылась',test:r=>r.pass}],summary:()=> '85% ≥ 79% · выпуск',explain:()=> 'Один критерий пропустил кандидата, потому что не спрашивал о новой чашке, безопасности и задержке. Непроверенная регрессия не исчезла.'},
    {short:'Все проверки',title:'Включи все четыре станции',text:'Отметь новый предмет, безопасность и задержку. Один провал любой обязательной станции должен остановить выпуск.',controls:'all',onEnter(){set({candidate:'fast',gates:['overall']})},action:{label:'Провести полный контроль',run},criteria:[{label:'Включены четыре станции',test:r=>r.enabled.length===4},{label:'Кандидат A остановлен',test:r=>r.candidate.id==='fast'&&!r.pass},{label:'Найдены три причины остановки',test:r=>r.failed.length===3}],summary:r=>`${r.failed.length} причины остановки`,explain:r=>`Общий успех пройден, но новая чашка, ${r.candidate.unsafe} опасных действия и ${r.candidate.latency} мс задержки закрыли дверь. Эти свойства нельзя усреднить.`},
    {short:'Второй кандидат',title:'Не меняй правило после результата',text:'Те же четыре проверки теперь проходит кандидат B. Порог каждой станции остаётся прежним.',controls:'all',onEnter(){set({candidate:'stable',gates:all})},action:{label:'Провести кандидата B',run},criteria:[{label:'Кандидат B прошёл четыре станции',test:r=>r.candidate.id==='stable'&&r.enabled.length===4},{label:'Дверь выпуска открылась',test:r=>r.pass}],summary:()=> 'Кандидат B · выпуск',explain:r=>`${r.candidate.name} улучшает среднее скромнее, зато проходит новую чашку, безопасность и задержку. Решение следует из заранее зафиксированных критериев.`},
    {short:'Свободно',title:'Проверь цену пропущенной станции',text:'Отключай критерии и смотри, какую конкретную регрессию проверка перестаёт замечать.',controls:'all',final:true}
  ];mountMissions('#rMis',missions,api,{controls:{candidate:'#rCandidate',gates:'#rGates'},scene:'#rCv'});render();App.on('theme',draw);App.on('resize',draw);return api}

function initQAStack(){const cv=$('#qaStack'),detail=$('#qaStackDetail');let selected='real',hits=[],narrow=false;function show(id){selected=id;const q=L84.QA_LEVELS.find(x=>x.id===id);detail.innerHTML=`<div><h3>${q.name}</h3><span>Источник: ${q.source}</span></div><div><p><strong>Что добавляет:</strong> ${q.proof}</p><p><strong>Чего не доказывает:</strong> ${q.limit}</p></div>`;draw()}
  function card(c,k,P,q,x,y,w,h,i){const on=q.id===selected,col=i<2?P.cl:i===2?P.hy:i===3?P.e2e:P.good;qRect(c,x,y,w,h,12,on?P.surf:P.bg,col,on?2:1);qDot(c,x+22,y+22,12,col);qLabel(c,k,String(i+1),x+22,y+22,{px:9,weight:900,color:P.surf});qLabel(c,k,q.name,x+42,y+22,{px:w<180?9.5:11,weight:820,color:P.ink,align:'left'});qLabel(c,k,q.short,x+w/2,y+h-22,{px:9.5,color:P.ink3});hits.push({id:q.id,x,y,w,h})}
  function draw(){narrow=(cv.getBoundingClientRect().width||1120)<640;cv.dataset.layout=narrow?'n':'w';const W=narrow?360:1120,H=narrow?660:360,{c,k}=HeroKit.fit(cv,W,H),P=pal();c.fillStyle=P.bg;c.fillRect(0,0,W,H);hits=[];if(narrow){L84.QA_LEVELS.forEach((q,i)=>{const y=22+i*118;if(i<4){qLine(c,[180,y+94],[180,y+112],P.line2,2);qLabel(c,k,'↓',180,y+104,{px:13,color:P.ink3})}card(c,k,P,q,24,y,312,94,i)});qLabel(c,k,'контроль среды уменьшается · цена ошибки растёт',180,635,{px:9.5,color:P.ink3})}else{L84.QA_LEVELS.forEach((q,i)=>{const x=18+i*220;if(i<4){qLine(c,[x+196,167],[x+219,167],P.line2,2);qLabel(c,k,'→',x+208,167,{px:15,color:P.ink3})}card(c,k,P,q,x,100,196,134,i)});qLabel(c,k,'воспроизводимость и скорость',18,55,{px:10.5,weight:750,color:P.cl,align:'left'});qLabel(c,k,'физическая достоверность и продуктовый риск',1102,55,{px:10.5,weight:750,color:P.good,align:'right'});qLine(c,[18,73],[1102,73],P.line,2);qLabel(c,k,'Новый реальный отказ возвращается в регрессионный набор и калибрует модели ниже',560,292,{px:11,weight:760,color:P.ink2});qLine(c,[1010,314],[110,314],P.e2e,2,[6,6]);qLabel(c,k,'← обратная связь',560,337,{px:10,color:P.e2e})}}
  cv.addEventListener('click',e=>{const r=cv.getBoundingClientRect(),W=narrow?360:1120,H=narrow?660:360,x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H,z=hits.find(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h);if(z)show(z.id)});App.on('theme',draw);App.on('resize',draw);show(selected);return{show,draw}}

/* ---------- квиз ---------- */
function renderQuiz(boxSel, Q, scoreSel) {
  const perms = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [0, 1, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1], [2, 1, 0]];
  const box = $(boxSel); let answered = 0, correct = 0;
  Q.forEach((q, qi) => {
    const card = h('div', { class: 'card q-card' }, h('h4', null, h('span', { class: 'qn' }, `${qi + 1}.`), h('span', null, q.q)));
    const opts = h('div', { class: 'q-opts' }), exp = h('div', { class: 'q-exp', hidden: true }), pm = perms[qi % perms.length];
    pm.forEach((oi) => {
      const b = h('button', { type: 'button', class: 'q-opt' }, q.o[oi]);
      b.addEventListener('click', () => {
        if (card.dataset.done) return; card.dataset.done = '1';
        const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect');
        if (!ok) $$('.q-opt', opts)[pm.indexOf(q.a)].classList.add('correct');
        exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false;
        answered++; if (ok) correct++;
        $(scoreSel).textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= Q.length - 2 ? 'Можно идти дальше.' : 'Вернись к разделам, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`;
      });
      opts.append(b);
    });
    card.append(opts, exp); box.append(card);
  });
}
function initQuiz() {
  renderQuiz('#quizBox', [
    { q: 'Кандидат показал 87% успеха, текущая версия — 79%. Этого достаточно для выпуска?', o: ['Да: восемь пунктов — заметная разница', 'Нет: нужны условия испытаний, неопределённость и обязательные критерии', 'Да, если было ровно сто попыток'], a: 1, e: 'В лаборатории тот же кандидат выигрывал на рабочей смеси и проигрывал при равном числе условий. Один процент отвечает только на вопрос о конкретной смеси.' },
    { q: 'Зачем фиксировать тестовую матрицу до запуска?', o: ['Чтобы после результата нельзя было менять условия и число попыток под желаемый вывод', 'Чтобы все условия встречались одинаково часто', 'Чтобы не считать доверительный интервал'], a: 0, e: 'Рабочая смесь и стресс-тест могут иметь разные веса. Важно заранее записать вопрос, условия, число попыток и правило успеха.' },
    { q: 'Кандидат и текущая версия получили случайные, но разные старты. В чём риск?', o: ['Риска нет: случайность всё выровняет в любой короткой серии', 'Разница смешает качество политики и трудность стартов', 'Кандидат обязательно получит более лёгкие старты'], a: 1, e: 'Случайность выравнивает условия лишь в среднем. Парное испытание даёт обеим версиям тот же старт и сравнивает несовпадающие исходы.' },
    { q: '95%-й интервал разницы равен от −6 до +11 процентных пунктов. Что следует?', o: ['Кандидат точно лучше на 2,5 пункта', 'Данные совместимы и с небольшим проигрышем, и с улучшением; запусков пока недостаточно для вывода о знаке', 'Версии одинаковы'], a: 1, e: 'Интервал, пересекающий ноль, не доказывает равенство. Он говорит, что наблюдения пока не отделили улучшение от разброса.' },
    { q: 'Интервалы доли успеха двух версий перекрываются. Значит, различия нет?', o: ['Да, это точный тест разницы', 'Не обязательно: нужно считать интервал самой разницы, а для пар — учитывать связь исходов', 'Да, если интервалы 95%-е'], a: 1, e: 'Два отдельных интервала отвечают на вопросы о каждой доле. Для сравнения нужен интервал разности или соответствующий статистический тест.' },
    { q: 'Кандидат улучшил успех, но дважды совершил опасное действие. Можно усреднить безопасность и успех в один балл?', o: ['Да, если успех вырос достаточно сильно', 'Нет, если безопасность задана обязательным критерием: один провал останавливает выпуск', 'Да, если задержка в норме'], a: 1, e: 'Критерии выпуска соединены через «и». Неприемлемое ограничение нельзя компенсировать другой метрикой.' },
    { q: 'Почему порог критерия выпуска задают до испытаний?', o: ['Чтобы решение не подгоняли под уже увиденный результат', 'Чтобы кандидат обязательно прошёл', 'Чтобы доверительный интервал стал уже'], a: 0, e: 'После результата легко сдвинуть порог или переименовать обязательную метрику в наблюдаемую. Заранее заданные критерии отделяют инженерное решение от подгонки.' },
    { q: 'Видеомодель мира правильно расставила политики по качеству. Можно не проверять кандидата на настоящем роботе?', o: ['Да: порядок политик уже известен', 'Нет: симуляция расширяет матрицу, но абсолютные доли могут отличаться и требуют реальной сверки', 'Да, если смоделировано больше тысячи сцен'], a: 1, e: 'В отчёте Veo порядок версий и относительные падения воспроизводились, но абсолютные доли успеха были ниже реальных. Финальные критерии подтверждают на реальной системе.' },
  ], '#quizScore');
}

(function boot() {
  const mis = {};
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error('[урок] ошибка в', name, e); } };
  const start = () => {
    safe('theme', initTheme); safe('nav', initNav);
    safe('matrix', () => { mis.matrix = initMatrixLab(); });
    safe('uncertainty', () => { mis.uncertainty = initUncertaintyLab(); });
    safe('release', () => { mis.release = initReleaseLab(); });
    safe('levels', () => { mis.levels = initQAStack(); });
    safe('quiz', initQuiz);
    safe('count', () => { const n = ['mMis', 'uMis', 'rMis'].reduce((s, id) => s + Math.max(0, $$('#' + id + ' .g-steps li').length - 1), 0); $('#heroMis').textContent = `${n} миссий с целью`; });
    window.__l84 = { mis, L84 }; window.__lessonReady = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
