/* Урок 7.4: схема, две лаборатории, диаграммы и квиз. */
'use strict';
(() => {
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)], L = window.L74;
  if (!L) return;

  function architecture() {
    const path = L.run('wam', 'detour', 100, 0).imag;
    const lanes = ['видео → действие', 'совместная WAM', 'признаки будущего', 'будущее только в обучении'];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function point(q) {
      const n = Math.max(1, path.length / 2), x = clamp(q, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(x)), u = x - i;
      if (n === 1) return [path[0], path[1]];
      return [path[i * 2] + (path[(i + 1) * 2] - path[i * 2]) * u, path[i * 2 + 1] + (path[(i + 1) * 2 + 1] - path[i * 2 + 1]) * u];
    }
    function thumb(c, P, A, b, q, color) {
      A.rect(c, b.x, b.y, b.w, b.h, 6, P.dark ? '#655847' : '#eadcc5', P.line, 1);
      const p = point(q), x = b.x + clamp((p[0] - .08) / .72, .06, .94) * b.w, y = b.y + clamp((p[1] - .07) / .50, .08, .92) * b.h;
      A.circle(c, x, y, Math.max(3.5, b.h * .075), '#c9653c', P.ink3, 1);
      A.circle(c, b.x + b.w * .80, b.y + b.h * .55, Math.max(5, b.h * .12), P.surf, P.good, 1.2);
      A.line(c, [[b.x + 7, b.y + b.h - 7], [b.x + b.w - 7, b.y + 7]], A.alpha(color, .45), 1.2, [4, 3]);
    }
    function box2(c, k, P, A, x, y, w, h, one, two, color) {
      A.rect(c, x, y, w, h, 7, A.alpha(color, .08), color, 1.4);
      A.lab(c, k, one, x + w / 2, y + h / 2 - 8, { px: 10, weight: 780, color, halo: false });
      A.lab(c, k, two, x + w / 2, y + h / 2 + 10, { px: 10, weight: 650, color, halo: false });
    }
    function action(c, k, P, A, x, y) {
      A.circle(c, x, y, 13, A.alpha(P.good, .12), P.good, 1.5);
      A.lab(c, k, 'a', x, y, { px: 11, weight: 850, color: P.good, halo: false });
    }
    function marker(c, A, x1, x2, y, q, color) { A.circle(c, x1 + (x2 - x1) * q, y, 3.1, color); }

    function laneWide(c, k, P, A, b, index, q, pulse) {
      const cy = b.y + 58, ax = b.x + b.w - 25, obs = { x: b.x + 10, y: b.y + 31, w: 72, h: 52 };
      A.rect(c, b.x, b.y, b.w, b.h, 9, P.surf, P.line, 1);
      A.lab(c, k, lanes[index], b.x + 10, b.y + 15, { px: 10.5, weight: 820, color: P.ink, align: 'left', halo: false });
      // Маршруты и маркеры рисуются до узлов, поэтому карточки перекрывают концы линий.
      if (index === 0) {
        A.arrow(c, obs.x + obs.w, cy, b.x + 110, cy, P.spr, 1.6, 6);
        A.arrow(c, b.x + 220, cy, b.x + 255, cy, P.mot, 1.6, 6);
        A.arrow(c, b.x + 327, cy, b.x + 370, cy, P.mot, 1.6, 6);
        A.arrow(c, b.x + 500, cy, ax - 15, cy, P.good, 1.7, 6);
        marker(c, A, obs.x + obs.w, ax - 15, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 110, b.y + 34, 110, 48, 'видео-', 'модель', P.spr);
        thumb(c, P, A, { x: b.x + 255, y: b.y + 31, w: 72, h: 52 }, q, P.mot);
        box2(c, k, P, A, b.x + 370, b.y + 34, 130, 48, 'обратная', 'динамика', P.spr);
      } else if (index === 1) {
        A.arrow(c, obs.x + obs.w, cy, b.x + 145, cy, P.spr, 1.6, 6);
        A.line(c, [[b.x + 400, cy], [b.x + 450, cy]], P.mot, 1.6);
        A.arrow(c, b.x + 450, cy, b.x + 485, cy, P.mot, 1.6, 6);
        A.arrow(c, b.x + 557, cy, ax - 15, cy, P.good, 1.7, 6);
        marker(c, A, obs.x + obs.w, ax - 15, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 145, b.y + 32, 255, 52, 'общая модель', 'будущее + действие', P.spr);
        thumb(c, P, A, { x: b.x + 485, y: b.y + 31, w: 72, h: 52 }, q, P.mot);
      } else if (index === 2) {
        A.arrow(c, obs.x + obs.w, cy, b.x + 120, cy, P.spr, 1.6, 6);
        A.arrow(c, b.x + 240, cy, b.x + 300, cy, P.spr, 1.6, 6);
        A.arrow(c, b.x + 350, cy, b.x + 405, cy, P.spr, 1.6, 6);
        A.arrow(c, b.x + 545, cy, ax - 15, cy, P.good, 1.7, 6);
        marker(c, A, obs.x + obs.w, ax - 15, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 120, b.y + 34, 120, 48, 'видео-', 'модель', P.spr);
        for (let i = 0; i < 6; i++) A.circle(c, b.x + 310 + (i % 3) * 15, b.y + 49 + Math.floor(i / 3) * 18, 4, P.spr);
        A.lab(c, k, 'признаки', b.x + 325, b.y + 88, { px: 10, color: P.spr, haloColor: P.surf });
        box2(c, k, P, A, b.x + 405, b.y + 34, 140, 48, 'голова', 'действий', P.spr);
      } else {
        A.arrow(c, obs.x + obs.w, cy, b.x + 135, cy, P.spr, 1.6, 6);
        A.arrow(c, b.x + 290, cy, b.x + 430, cy, P.spr, 1.6, 6);
        A.arrow(c, b.x + 570, cy, ax - 15, cy, P.good, 1.7, 6);
        A.line(c, [[b.x + 212, b.y + 34], [b.x + 212, b.y + 24], [b.x + 490, b.y + 24]], P.mot, 1.4, [5, 4]);
        A.lab(c, k, 'цель обучения', b.x + 490, b.y + 24, { px: 10, color: P.mot, haloColor: P.surf });
        marker(c, A, obs.x + obs.w, ax - 15, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 135, b.y + 34, 155, 48, 'общий', 'энкодер', P.spr);
        box2(c, k, P, A, b.x + 430, b.y + 34, 140, 48, 'действие', 'при работе', P.spr);
      }
      action(c, k, P, A, ax, cy);
    }

    function laneNarrow(c, k, P, A, b, index, q, pulse) {
      const cy = b.y + 82, ax = b.x + b.w - 18, obs = { x: b.x + 10, y: b.y + 50, w: 50, h: 64 };
      A.rect(c, b.x, b.y, b.w, b.h, 9, P.surf, P.line, 1);
      A.lab(c, k, lanes[index], b.x + 10, b.y + 17, { px: 10.5, weight: 820, color: P.ink, align: 'left', halo: false });
      // Узкая раскладка сохраняет тот же порядок слоёв: сначала маршруты, затем узлы.
      if (index === 0) {
        A.arrow(c, obs.x + obs.w, cy, b.x + 72, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 132, cy, b.x + 145, cy, P.mot, 1.5, 5);
        A.arrow(c, b.x + 195, cy, b.x + 208, cy, P.mot, 1.5, 5);
        A.arrow(c, b.x + 282, cy, ax - 14, cy, P.good, 1.5, 5);
        marker(c, A, obs.x + obs.w, ax - 14, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 72, b.y + 58, 60, 48, 'видео-', 'модель', P.spr);
        thumb(c, P, A, { x: b.x + 145, y: b.y + 50, w: 50, h: 64 }, q, P.mot);
        box2(c, k, P, A, b.x + 208, b.y + 58, 74, 48, 'обратная', 'динамика', P.spr);
      } else if (index === 1) {
        A.arrow(c, obs.x + obs.w, cy, b.x + 86, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 236, cy, b.x + 252, cy, P.mot, 1.5, 5);
        A.arrow(c, b.x + 296, cy, ax - 14, cy, P.good, 1.5, 5);
        marker(c, A, obs.x + obs.w, ax - 14, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 86, b.y + 56, 150, 52, 'общая модель', 'будущее + действие', P.spr);
        thumb(c, P, A, { x: b.x + 252, y: b.y + 50, w: 44, h: 64 }, q, P.mot);
      } else if (index === 2) {
        A.arrow(c, obs.x + obs.w, cy, b.x + 72, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 138, cy, b.x + 157, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 193, cy, b.x + 207, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 286, cy, ax - 14, cy, P.good, 1.5, 5);
        marker(c, A, obs.x + obs.w, ax - 14, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 72, b.y + 58, 66, 48, 'видео-', 'модель', P.spr);
        for (let i = 0; i < 6; i++) A.circle(c, b.x + 164 + (i % 2) * 13, b.y + 67 + Math.floor(i / 2) * 15, 3.6, P.spr);
        A.lab(c, k, 'признаки', b.x + 174, b.y + 128, { px: 10, color: P.spr, haloColor: P.surf });
        box2(c, k, P, A, b.x + 207, b.y + 58, 79, 48, 'голова', 'действий', P.spr);
      } else {
        A.arrow(c, obs.x + obs.w, cy, b.x + 80, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 175, cy, b.x + 215, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 296, cy, ax - 14, cy, P.good, 1.5, 5);
        A.line(c, [[b.x + 128, b.y + 58], [b.x + 128, b.y + 40], [b.x + 260, b.y + 40]], P.mot, 1.4, [4, 3]);
        A.lab(c, k, 'цель обучения', b.x + 260, b.y + 40, { px: 10, color: P.mot, haloColor: P.surf });
        marker(c, A, obs.x + obs.w, ax - 14, cy, pulse, P.spr);
        thumb(c, P, A, obs, 0, P.out);
        box2(c, k, P, A, b.x + 80, b.y + 58, 95, 48, 'общий', 'энкодер', P.spr);
        box2(c, k, P, A, b.x + 215, b.y + 58, 81, 48, 'действие', 'при работе', P.spr);
      }
      action(c, k, P, A, ax, cy);
    }

    function draw(c, k, t, P, A, narrow) {
      const W = narrow ? 360 : 760, H = narrow ? 750 : 480, u = ((t % 5) + 5) % 5, q = A.ease(A.seg(u, .2, 4.2)), pulse = ((t * .32) % 1 + 1) % 1;
      c.fillStyle = P.surf2; c.fillRect(0, 0, W, H);
      A.lab(c, k, narrow ? 'Где находится предсказанное будущее' : 'Одна сцена, четыре места будущего в вычислительном графе', W / 2, 23, { px: narrow ? 11 : 13, weight: 820, color: P.ink, halo: false });
      if (narrow) {
        lanes.forEach((_, i) => laneNarrow(c, k, P, A, { x: 8, y: 48 + i * 171, w: 344, h: 155 }, i, q, (pulse + i * .17) % 1));
        A.lab(c, k, 'Показана архитектура, а не сравнение качества.', 180, 742, { px: 10, color: P.ink2, halo: false });
      } else {
        lanes.forEach((_, i) => laneWide(c, k, P, A, { x: 15, y: 48 + i * 101, w: 730, h: 94 }, i, q, (pulse + i * .17) % 1));
        A.lab(c, k, 'Здесь показана архитектура. Поведение контуров сравнивается в лаборатории.', 380, 467, { px: 10, color: P.ink2, halo: false });
      }
    }

    Anim.add('wam', {
      W: 760, H: 480, start: 1, narrowAt: 450,
      draw(c, k, t, P, A) { draw(c, k, t, P, A, false); },
      narrow: { W: 360, H: 750, draw(c, k, t, P, A) { draw(c, k, t, P, A, true); } },
    });
  }

  function charts() {
    StatsChart.bars($('#dreamBars'), { series: [{ id: 'n1', label: 'GR00T N1.6', color: 'var(--ink-3)' }, { id: 'pi', label: 'π0.5', color: 'var(--classic)' }, { id: 'dz', label: 'DreamZero', color: 'var(--e2e)' }], groups: [{ label: 'новое место', values: { n1: 8.4, pi: 27.4, dz: 62.2 } }, { label: 'новая задача', values: { n1: 5, pi: 16.3, dz: 39.5 } }, { label: 'дообучение', values: { n1: 53.3, pi: 79.8, dz: 90.5 } }], max: 100, unit: '%', ticks: [0, 50, 100], height: 170, digits: 1 });
    StatsChart.bars($('#transferBars'), { series: [{ id: 'ok', label: 'прогресс задачи', color: 'var(--wam)' }], groups: [{ label: 'только робот', values: { ok: 38.3 } }, { label: '+ видео людей', values: { ok: 54.3 } }, { label: '+ другой робот', values: { ok: 55.4 } }], max: 60, unit: '%', ticks: [0, 30, 60], height: 155, digits: 1 });
    StatsChart.bars($('#fastSuccess'), { series: [{ id: 'ok', label: 'успех', color: 'var(--classic)' }], groups: [{ label: 'без видео на инференсе', values: { ok: 91.8 } }, { label: 'совместно', values: { ok: 90.6 } }, { label: 'видео → действие', values: { ok: 91.3 } }, { label: 'без видео в обучении', values: { ok: 83.8 } }], max: 100, unit: '%', ticks: [0, 50, 100], height: 150, digits: 1 });
    StatsChart.bars($('#fastLatency'), { series: [{ id: 'ms', label: 'задержка', color: 'var(--e2e)' }], groups: [{ label: 'без видео на инференсе', values: { ms: 190 } }, { label: 'совместно', values: { ms: 580 } }, { label: 'видео → действие', values: { ms: 810 } }, { label: 'без видео в обучении', values: { ms: 190 } }], max: 900, unit: ' мс', ticks: [0, 450, 900], height: 150, digits: 0 });
    StatsChart.bars($('#robustBars'), { series: [{ id: 'pi', label: 'π0.5 · VLA', color: 'var(--classic)' }, { id: 'ling', label: 'LingBot-VA · WAM', color: 'var(--wam)' }, { id: 'fast', label: 'Fast-WAM', color: 'var(--e2e)' }], groups: [{ label: 'камера', values: { pi: 45.6, ling: 28.9, fast: 30.4 } }, { label: 'поза робота', values: { pi: 27.6, ling: 36.2, fast: 53.2 } }, { label: 'свет', values: { pi: 49.6, ling: 89, fast: 88.8 } }, { label: 'раскладка', values: { pi: 56.8, ling: 87.9, fast: 83.2 } }, { label: 'итог', values: { pi: 58.6, ling: 74.2, fast: 72.7 } }], max: 100, unit: '%', ticks: [0, 50, 100], height: 190, digits: 1 });
  }

  /* ---------- Лаборатория 1 ---------- */
  function lab1() {
    let scenario = 'familiar', share = 0, bias = 0, result = L.compare(scenario, share, bias), progress = 0, ctl = null, raf = 0;
    const minimumShare = L.minimumShare('detour');
    const minimumBias = L.minimumBias('detour', minimumShare);
    const names = { vla: 'VLA без модели будущего', open: 'WAM · разомкнуто', wam: 'WAM · замкнуто' };
    function setSeg(id, value) { $$(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value)))); }
    function setScenario(v) { scenario = v; setSeg('scenarioCtl', v); reset(false); }
    function setShare(v) { share = +v; setSeg('shareCtl', share); reset(false); }
    function setBias(v) { bias = +v; setSeg('biasCtl', bias); reset(false); }
    function map(panel, x, y) { const inner = Math.max(40, panel.w - 52); return [panel.x + (panel.w - inner) / 2 + x / .9 * inner, panel.y + 55 + y / .6 * (panel.h - 78)]; }
    function path(c, panel, a, color, dash, p) { const n = Math.max(2, Math.ceil(a.length / 2 * p)); c.save(); c.strokeStyle = color; c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(dash || []); c.beginPath(); for (let i = 0; i < Math.min(a.length / 2, n); i++) { const q = map(panel, a[i * 2], a[i * 2 + 1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); } c.stroke(); c.restore(); }
    function draw() {
      const cv = $('#compareCv'), dpr = devicePixelRatio || 1, cssW = cv.clientWidth || 920, cssH = Math.max(310, Math.min(390, cssW * .38)); cv.style.height = cssH + 'px'; cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, cssW, cssH);
      const gap = cssW < 680 ? 8 : 12, w = (cssW - gap * 2) / 3, P = { blue: HeroKit.css('--classic'), orange: HeroKit.css('--e2e'), bad: HeroKit.css('--critical'), ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), line: HeroKit.css('--line-2'), surf: HeroKit.css('--surface') };
      result.forEach((r, i) => { const panel = { x: i * (w + gap), y: 0, w, h: cssH }, narrow = cssW < 680, short = { vla: 'VLA', open: 'WAM · без ОС', wam: 'WAM · с ОС' }; c.fillStyle = P.surf; c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.roundRect(panel.x + .5, .5, w - 1, cssH - 1, 11); c.fill(); c.stroke(); c.fillStyle = P.ink; c.font = `${narrow ? 700 : 700} ${narrow ? 11 : 13}px sans-serif`; c.textAlign = 'center'; c.fillText(narrow ? short[r.kind] : names[r.kind], panel.x + w / 2, 22); if (!narrow) { c.fillStyle = P.ink2; c.font = '11px sans-serif'; c.fillText(r.kind === 'vla' ? 'только действия робота' : r.kind === 'open' ? 'те же веса, без нового наблюдения' : 'те же веса, с новым наблюдением', panel.x + w / 2, 39); }
        const a = map(panel, 0, 0), b = map(panel, .9, .6); c.fillStyle = HeroKit.dark() ? '#7a6a54' : '#e6d9c4'; c.strokeStyle = HeroKit.dark() ? '#9c8c76' : '#af9c80'; c.beginPath(); c.roundRect(a[0], a[1], b[0] - a[0], b[1] - a[1], 7); c.fill(); c.stroke();
        const g = map(panel, L.GOAL[0], L.GOAL[1]); c.fillStyle = '#f5f2e9'; c.strokeStyle = '#88847c'; c.beginPath(); c.arc(g[0], g[1], Math.max(6, w * .035), 0, Math.PI * 2); c.fill(); c.stroke();
        const s = L.SCENARIOS[scenario]; s.layout.objs.forEach((ob) => { const o = map(panel, ob.x, ob.y), rr = Math.max(3, ob.r / .9 * Math.max(40, w - 52)); c.fillStyle = ob.kind === 'milk' ? '#f1f0ea' : '#b8d7e8'; c.strokeStyle = '#6d7580'; c.beginPath(); c.arc(o[0], o[1], rr, 0, Math.PI * 2); c.fill(); c.stroke(); });
        path(c, panel, r.imag, P.orange, [6, 5], progress); path(c, panel, r.real, P.blue, [], progress); const idx = Math.min(r.real.length / 2 - 1, Math.max(0, Math.floor((r.real.length / 2 - 1) * progress))), q = map(panel, r.real[idx * 2], r.real[idx * 2 + 1]); c.fillStyle = '#d85b48'; c.beginPath(); c.arc(q[0], q[1], Math.max(4, w * .025), 0, Math.PI * 2); c.fill(); if (progress >= 1) { c.fillStyle = r.success ? HeroKit.css('--good') : P.bad; c.font = `800 ${cssW < 680 ? 10 : 12}px sans-serif`; c.fillText(r.success ? 'цель достигнута' : r.hit ? 'столкновение' : 'промах', panel.x + w / 2, cssH - 12); }
      }); c.textAlign = 'left';
    }
    function renderMetrics(done) { const loop = { vla: 'прямое действие', open: 'разомкнутая WAM', wam: 'поправка по наблюдению' }, short = { vla: 'VLA', open: 'WAM · без ОС', wam: 'WAM · с ОС' }; $('#compareMetrics').innerHTML = result.map((r) => { const outcome = done ? (r.success ? 'цель' : r.hit ? 'столкновение' : `промах ${Math.round(r.dist * 100)} см`) : 'ещё не исполнено'; return `<div class="${done ? (r.success ? 'ok' : 'no') : ''}"><b>${short[r.kind]}</b><span>${loop[r.kind]} · ${outcome}</span></div>`; }).join(''); }
    function reset(redraw = true) { cancelAnimationFrame(raf); progress = 0; result = L.compare(scenario, share, bias); $('#compareStatus').textContent = 'ожидает запуска'; $('#compareRead').textContent = 'Следуй миссии: выбери условие, затем исполни три контура.'; renderMetrics(false); if (redraw) draw(); else draw(); }
    async function run() { cancelAnimationFrame(raf); result = L.compare(scenario, share, bias); progress = 0; renderMetrics(false); $('#compareStatus').textContent = 'исполнение'; const t0 = performance.now(); return await new Promise((resolve) => { function tick(t) { progress = Math.min(1, (t - t0) / (HeroKit.reduced() ? 1 : 1100)); draw(); if (progress < 1) raf = requestAnimationFrame(tick); else { const ok = result.filter((x) => x.success).map((x) => names[x.kind]); $('#compareStatus').textContent = `${ok.length} из 3 достигли цели`; $('#compareRead').textContent = ok.length ? `Цель достигли: ${ok.join(', ')}.` : 'Ни один контур не достиг цели.'; renderMetrics(true); resolve(state()); } } raf = requestAnimationFrame(tick); }); }
    function state() { const by = Object.fromEntries(result.map((x) => [x.kind, x])), sameFuture = by.open.imag.length === by.wam.imag.length && by.open.imag.every((v, i) => Math.abs(v - by.wam.imag[i]) < 1e-9); return { scenario, share, bias, result, sameFuture, vla: by.vla.success, open: by.open.success, wam: by.wam.success, openDist: by.open.dist }; }
    $('#scenarioCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setScenario(b.dataset.v); };
    $('#shareCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setShare(b.dataset.v); };
    $('#biasCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setBias(b.dataset.v); };
    $('#compareRun').onclick = run; $('#compareReset').onclick = () => reset(); window.addEventListener('resize', draw); App.on('theme', draw);
    const action = { label: 'Исполнить три контура', run };
    const missions = [
      { short: 'Калибровка', title: 'Проверь знакомый прямой путь', text: 'Начни там, где у всех трёх контуров есть роботизированные демонстрации. Исполни путь и убедись, что при точном приводе сравнение не даёт одному контуру искусственного преимущества.', onEnter: () => { setScenario('familiar'); setShare(0); setBias(0); }, bet: { q: 'Кто достигнет блюдца на знакомом пути?', options: ['только замкнутая WAM', 'все три контура', 'ни один'], answer: () => 1 }, action, criteria: [{ label: 'Все три контура достигли цели', test: (r) => r && r.vla && r.open && r.wam }], explain: () => 'На знакомой задаче дополнительное предсказание будущего не требуется: нужное действие уже есть в роботизированных демонстрациях.' },
      { short: 'Общий путь', title: 'Дай двум контурам WAM одинаковое видео', text: 'Открой новую задачу и меняй долю видео человека. Разомкнутый и замкнутый контуры используют одну обученную WAM и один предсказанный обход. Различается только получение нового наблюдения после действия.', controls: ['share'], onEnter: () => { setScenario('detour'); setShare(0); setBias(0); }, bet: { q: 'Кто обойдёт сахарницу при одинаковом видео и точном приводе?', options: ['только замкнутая WAM', 'оба контура WAM', 'все три контура'], answer: () => 1 }, action, criteria: [{ label: `Выбрана первая достаточная доля — ${minimumShare}%`, test: (r) => r && r.share === minimumShare }, { label: 'Оба контура WAM получили один путь будущего', test: (r) => r && r.sameFuture }, { label: 'Оба контура WAM достигли цели, VLA — нет', test: (r) => r && r.open && r.wam && !r.vla }], hint: 'Начни с нуля и повышай долю видео по одному шагу.', explain: () => `При ${minimumShare}% одна и та же WAM строит обход, а оба контура достигают цели. Видео без действий добавило форму пути; преимущество обратной связи здесь ещё не проявилось.` },
      { short: 'Обратная связь', title: 'Внеси ошибку калибровки привода', text: 'Оставь общий путь и увеличивай недоход привода. Разомкнутый контур исполняет пачку команд без нового наблюдения. Замкнутый после каждого шага видит положение чашки и может сделать до четырёх дополнительных поправок.', controls: ['bias'], onEnter: () => { setScenario('detour'); setShare(minimumShare); setBias(0); }, bet: { q: 'Кто компенсирует систематический недоход при одних весах и одном плане?', options: ['оба контура WAM', 'только WAM с обратной связью', 'ни один'], answer: () => 1 }, action, criteria: [{ label: `Найдена первая разделяющая ошибка — ${minimumBias}%`, test: (r) => r && r.bias === minimumBias }, { label: 'Путь и веса у двух контуров одинаковы', test: (r) => r && r.sameFuture }, { label: 'Разомкнутый контур промахнулся, замкнутый исправился', test: (r) => r && !r.open && r.wam }], hint: 'Повышай недоход по одному шагу и каждый раз исполняй общий план.', explain: (r) => `При недоходе ${minimumBias}% разомкнутая WAM завершила движение в ${Math.round(r.openDist * 100)} см от блюдца. Замкнутая WAM увидела остаточную ошибку и скорректировала её. Теперь различается ровно один фактор — обратная связь.` },
      { short: 'Свободно', final: true, title: 'Свободный режим: перенеси проверку', text: 'Открой все условия. Сравни знакомый путь, обход и сдвинутую сахарницу при разных долях видео и ошибках привода. Сначала проверь общий воображаемый путь двух контуров WAM, затем сравни синие исполненные пути.', controls: 'all', onEnter: () => { setScenario('shifted'); setShare(minimumShare); setBias(minimumBias); } },
    ];
    ctl = Missions.mount($('#compareMis'), missions, { reset() { setScenario('familiar'); setShare(0); setBias(0); }, state }, { controls: { scenario: '#scenarioWrap', share: '#shareWrap', bias: '#biasWrap', manual: '#manualRunWrap' }, scene: '#compareCv' });
    renderMetrics(false); draw();
  }

  /* ---------- Лаборатория 2 ---------- */
  function lab2() {
    const forecasts = {}, revealed = new Set(); let active = 'idm', ctl = null, lastIntervention = L.intervention(0, 'ordered', 'id');
    const ids = () => L.CALIBRATION.filter((x) => x.pipe === active).map((x) => x.id);
    function label(c) { return c.pipe === 'idm' ? 'видео → действие' : 'совместная WAM'; }
    function drawCalThumb(cv, item) { const c = cv.getContext('2d'), W = cv.width, H = cv.height, fw = W / 4, dark = HeroKit.dark(), table = dark ? '#6d5e4d' : '#e6d9c4', line = dark ? '#9c8c76' : '#ae9b7f', order = item.ordered ? [0, 1, 2, 3] : [0, 2, 1, 3], detour = [[.17, .67], [.36, .28], [.64, .28], [.84, .67]], straight = [[.17, .67], [.38, .58], [.61, .58], [.84, .58]], points = item.id === 'i4' ? straight : detour; c.clearRect(0, 0, W, H); for (let j = 0; j < 4; j++) { const x = j * fw, p = points[order[j]]; c.fillStyle = table; c.strokeStyle = line; c.lineWidth = 1; c.beginPath(); c.roundRect(x + 2, 4, fw - 4, H - 8, 4); c.fill(); c.stroke(); c.fillStyle = '#f3f1ea'; c.strokeStyle = '#747980'; c.beginPath(); c.arc(x + fw * .52, H * .56, 5.2, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#d85b48'; c.beginPath(); c.arc(x + p[0] * fw, 5 + p[1] * (H - 10), 3.6, 0, Math.PI * 2); c.fill(); const noise = Math.round((1 - item.visual) * 10); c.fillStyle = dark ? 'rgba(240,235,225,.35)' : 'rgba(55,65,85,.28)'; for (let k = 0; k < noise; k++) { const seed = item.id.charCodeAt(1) * 17 + j * 29 + k * 13; c.fillRect(x + 3 + seed % Math.max(1, Math.floor(fw - 7)), 6 + seed * 7 % Math.max(1, H - 13), 1.2, 1.2); } if (j < 3) { c.fillStyle = HeroKit.css('--ink-3'); c.font = '9px sans-serif'; c.fillText('›', x + fw - 3, H / 2 + 3); } } }
    function renderRows() { const root = $('#calRows'); root.innerHTML = ''; for (const c of L.CALIBRATION.filter((x) => x.pipe === active)) { const row = document.createElement('div'); row.className = 'cal-row' + (revealed.has(c.id) ? ` revealed ${c.outcome ? 'ok' : 'no'}` : ''); row.dataset.id = c.id; const thumb = document.createElement('canvas'); thumb.className = 'cal-thumb'; thumb.width = 128; thumb.height = 52; thumb.setAttribute('role', 'img'); thumb.setAttribute('aria-label', c.ordered ? 'Четыре будущих кадра в правильном порядке' : 'Четыре будущих кадра в перемешанном порядке'); const info = document.createElement('div'); info.className = 'cal-info'; const title = document.createElement('div'); title.className = 'cal-title'; title.innerHTML = `<b>${c.id.toUpperCase()} · ${label(c)}</b><span>${c.ordered ? 'порядок сохранён' : 'кадры перемешаны'}</span>`; const prob = document.createElement('div'); prob.className = 'prob'; [10, 30, 50, 70, 90].forEach((p) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = `${p}%`; b.setAttribute('aria-pressed', String(forecasts[c.id] === p)); b.disabled = revealed.has(c.id); b.onclick = () => { forecasts[c.id] = p; renderRows(); if (ctl) ctl.update(); }; prob.appendChild(b); }); const out = document.createElement('div'); out.className = 'cal-outcome'; out.textContent = revealed.has(c.id) ? `${c.outcome ? 'успех' : 'неудача'} · ${c.note}` : 'исход скрыт'; info.append(title, prob, out); row.append(thumb, info); root.appendChild(row); drawCalThumb(thumb, c); } updateScore(); }
    function updateScore() { const chosen = ids().filter((id) => forecasts[id] != null).length, score = L.brier(ids().filter((id) => revealed.has(id)), forecasts); $('#calScore').textContent = score == null ? `${chosen} из ${ids().length} оценок` : `ошибка Брайера ${score.toFixed(3).replace('.', ',')}`; }
    function setPipe(pipe) { active = pipe; revealed.clear(); $('#calTitle').textContent = pipe === 'idm' ? 'Цепочка «видео → действие»' : 'Совместная World Action Model'; $('#interventionWrap').hidden = true; renderRows(); $('#calRead').textContent = pipe === 'idm' ? 'Оцени видимый путь и временной порядок до исполнения.' : 'Не приравнивай шероховатые пиксели к плохому действию: ищи причинный порядок.'; }
    function clear() { ids().forEach((id) => { delete forecasts[id]; revealed.delete(id); }); renderRows(); }
    function reveal() { const group = ids(); if (group.some((id) => forecasts[id] == null)) return { complete: false, score: null, pipe: active }; group.forEach((id) => revealed.add(id)); renderRows(); const score = L.brier(group, forecasts); $('#calRead').textContent = `Ошибка Брайера: ${score.toFixed(3).replace('.', ',')}. Чем ближе к нулю, тем лучше откалиброваны вероятности.`; return { complete: true, score, pipe: active }; }
    function interventionState() { const noise = +$('#noiseCtl').value, order = $('#orderCtl button[aria-pressed="true"]').dataset.v, domain = $('#domainCtl button[aria-pressed="true"]').dataset.v; lastIntervention = L.intervention(noise, order, domain); drawIntervention(); return lastIntervention; }
    function drawIntervention() { const cv = $('#interveneCv'), { c, k } = HeroKit.fit(cv, 720, 210), P = { ink: HeroKit.css('--ink'), ink2: HeroKit.css('--ink-2'), line: HeroKit.css('--line-2'), blue: HeroKit.css('--classic'), orange: HeroKit.css('--e2e'), bad: HeroKit.css('--critical') }; c.clearRect(0, 0, 720, 210); c.fillStyle = HeroKit.css('--surface-2'); c.fillRect(0, 0, 720, 210); const items = [{ x: 40, y: 52, w: 280, label: 'изменение действия', value: lastIntervention.actionChange, max: 100, unit: '%' }, { x: 400, y: 52, w: 280, label: 'падение успеха', value: lastIntervention.successDrop, max: 100, unit: ' п. п.' }]; items.forEach((d, i) => { c.fillStyle = P.ink; c.font = '700 13px sans-serif'; c.fillText(d.label, d.x, d.y - 16); c.fillStyle = P.line; c.beginPath(); c.roundRect(d.x, d.y, d.w, 24, 8); c.fill(); c.fillStyle = i ? P.bad : P.blue; c.beginPath(); c.roundRect(d.x, d.y, Math.max(2, d.w * d.value / d.max), 24, 8); c.fill(); c.fillStyle = P.ink; c.font = '800 20px sans-serif'; c.fillText(`${d.value.toFixed(1).replace('.', ',')}${d.unit}`, d.x, d.y + 58); }); c.fillStyle = P.ink2; c.font = '600 12px sans-serif'; c.fillText(lastIntervention.order === 'shuffled' ? 'временной порядок нарушен' : `содержательный шум ${lastIntervention.noise}%`, 40, 164); c.fillText(lastIntervention.domain === 'ood' ? 'новые условия' : 'знакомые условия', 40, 184); }
    function setTwo(id, value) { $$(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value))); interventionState(); }
    $('#calReset').onclick = clear; $('#noiseCtl').oninput = () => { $('#noiseOut').textContent = `${$('#noiseCtl').value}%`; interventionState(); }; $('#orderCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setTwo('orderCtl', b.dataset.v); }; $('#domainCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setTwo('domainCtl', b.dataset.v); }; App.on('theme', () => { renderRows(); drawIntervention(); });
    const missions = [
      { short: 'Перевод', title: 'Откалибруй цепочку «видео → действие»', text: 'Для каждого эпизода оцени вероятность успеха. Здесь воображаемый путь непосредственно становится целью модели обратной динамики, поэтому проверяй и геометрию, и порядок кадров.', onEnter: () => setPipe('idm'), action: { label: 'Открыть исходы и посчитать ошибку', run: async () => reveal() }, criteria: [{ label: 'Вероятность выставлена всем четырём эпизодам', test: (r) => r && r.complete }, { label: 'Ошибка Брайера не выше 0,30', test: (r) => r && r.score <= .30 }], fail: () => 'Если оценки ещё не заполнены, выставь все четыре. Если ошибка велика, сбрось оценки и удели больше веса временному порядку, а не только чистоте картинки.', explain: (r) => `Ошибка Брайера — ${r.score.toFixed(3).replace('.', ',')}. В этой цепочке неверное видео прямо задаёт неверную цель действию.` },
      { short: 'Совместно', title: 'Откалибруй совместную WAM', text: 'Теперь действие и будущее выходят из общей модели. Шероховатое декодированное видео может сопровождать верное действие, а красивое — скрывать нарушенный порядок. Снова оцени все эпизоды до открытия исходов.', onEnter: () => setPipe('wam'), action: { label: 'Открыть исходы и посчитать ошибку', run: async () => reveal() }, criteria: [{ label: 'Вероятность выставлена всем четырём эпизодам', test: (r) => r && r.complete }, { label: 'Ошибка Брайера не выше 0,30', test: (r) => r && r.score <= .30 }], fail: () => 'Сбрось оценки и проверь временной порядок. В совместной модели качество пикселей — слабая подсказка о качестве действия.', explain: (r) => `Ошибка Брайера — ${r.score.toFixed(3).replace('.', ',')}. Декодированный кадр — лишь один выход общей модели, поэтому его визуальная чистота не обязана совпадать с точностью действия.` },
      { short: 'Вмешательство', title: 'Найди вмешательство, которое меняет действие сильнее', text: 'Сравни сильный шум содержимого с перестановкой кадров. Добейся изменения действия больше двух процентов и падения успеха не меньше двадцати четырёх процентных пунктов.', controls: ['intervention'], onEnter: () => { $('#interventionWrap').hidden = false; $('#noiseCtl').value = 0; $('#noiseOut').textContent = '0%'; setTwo('orderCtl', 'ordered'); setTwo('domainCtl', 'id'); interventionState(); }, action: { label: 'Измерить вмешательство', run: async () => interventionState() }, criteria: [{ label: 'Изменение действия больше 2%', test: (r) => r && r.actionChange > 2 }, { label: 'Падение успеха не меньше 24 п. п.', test: (r) => r && r.successDrop >= 24 }, { label: 'Проверка проведена в новых условиях', test: (r) => r && r.domain === 'ood' }], hint: 'Шум меняет пиксели, но сохраняет причинную последовательность. Попробуй нарушить порядок и перейти к новым условиям.', explain: (r) => `Перестановка кадров изменила действие на ${r.actionChange.toFixed(1).replace('.', ',')}% и снизила успех на ${r.successDrop.toFixed(1).replace('.', ',')} п. п. В исследовании содержание оказалось менее важным, чем временная структура, особенно вне обучающих условий.` },
      { short: 'Свободно', final: true, title: 'Свободный режим: отдели видимость от управления', text: 'Меняй шум, порядок и условия. Сравни, когда картинка выглядит хуже, а действие почти не меняется, и когда те же кадры в неверном порядке ломают политику.', controls: 'all', onEnter: () => { $('#interventionWrap').hidden = false; interventionState(); } },
    ];
    ctl = Missions.mount($('#trustMis'), missions, { reset() { Object.keys(forecasts).forEach((k) => delete forecasts[k]); revealed.clear(); setPipe('idm'); }, state: () => ({ forecasts: { ...forecasts }, intervention: lastIntervention }) }, { controls: { intervention: '#interventionWrap' }, scene: '#calRows' }); renderRows(); drawIntervention();
  }

  const Q = [
    { q: 'Что превращает политику в World Action Model?', o: ['Большое число параметров', 'Учебная цель о будущем мира помогает выбирать действие', 'Обязательное фотореалистичное видео'], a: 1, e: 'WAM связывает предсказание изменения мира с действием. Будущее может быть кадром, признаком или позой, а не только видео.' },
    { q: 'Чем WAM отличается от обычной VLA в рабочем определении урока?', o: ['VLA не видит изображение', 'WAM дополнительно учится предсказывать будущее мира', 'WAM не выдаёт действий'], a: 1, e: 'Обычная VLA учит условное распределение действий. WAM добавляет предсказание будущего, которое влияет на действие.' },
    { q: 'Почему цепочка «видео → обратная динамика» может промахнуться?', o: ['Два модуля запрещены', 'Ошибка видео и ошибка перевода в действия складываются в разомкнутой цепочке', 'Видео всегда короче действия'], a: 1, e: 'Отдельная модель обратной динамики исполняет переход, который дала видеомодель, и добавляет свою ошибку.' },
    { q: 'Что показала лаборатория с видео человека?', o: ['Видео без действий бесполезно', 'Общий прогноз будущего может перенести форму нового пути, а действия калибруются по данным робота', 'VLA тайно получила разметку действий человека'], a: 1, e: 'WAM использовала путь из видео без действий и масштаб команд из роботизированных демонстраций.' },
    { q: 'Что означает чистое воображаемое видео?', o: ['Высокую вероятность успеха', 'Только хорошее декодирование; управление надо проверять отдельно', 'Физическую верность'], a: 1, e: 'В совместной модели качество пикселей и точность действия могут расходиться.' },
    { q: 'Зачем нужна ошибка Брайера?', o: ['Оценить калибровку вероятностей до открытия исхода', 'Измерить число кадров', 'Выбрать цвет траектории'], a: 0, e: 'Ошибка Брайера сравнивает заявленную вероятность с бинарным исходом и сильнее штрафует уверенные ошибки.' },
    { q: 'Что в исследовании сильнее влияло на WAM вне обучающих условий?', o: ['Содержательный шум кадра', 'Нарушение временного порядка кадров', 'Размер подписи'], a: 1, e: 'Перестановка кадров нарушает причинную последовательность и меняет действия сильнее, чем шум содержимого.' },
    { q: 'Почему Fast-WAM может не генерировать видео во время работы?', o: ['Она не учится будущему', 'Предсказание будущего сформировало полезные признаки при обучении, а в контуре остаётся голова действий', 'Видео запрещено на роботе'], a: 1, e: 'Видеоцель может быть вспомогательной: она улучшает представление, но декодирование будущего на инференсе не обязательно.' },
  ];
  function quiz() { const box = $('#quizBox'), perms = [[1, 0, 2], [2, 1, 0], [0, 2, 1], [1, 2, 0], [2, 0, 1], [0, 1, 2], [1, 0, 2], [2, 1, 0]]; let answered = 0, correct = 0; Q.forEach((q, qi) => { const card = document.createElement('div'); card.className = 'card q-card'; const h = document.createElement('h4'), n = document.createElement('span'), t = document.createElement('span'); n.className = 'qn'; n.textContent = `${qi + 1}.`; t.textContent = q.q; h.append(n, t); const opts = document.createElement('div'), exp = document.createElement('div'); opts.className = 'q-opts'; exp.className = 'q-exp'; exp.hidden = true; const pm = perms[qi]; pm.forEach((oi) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'q-opt'; b.textContent = q.o[oi]; b.onclick = () => { if (card.dataset.done) return; card.dataset.done = '1'; const ok = oi === q.a; b.classList.add(ok ? 'correct' : 'incorrect'); if (!ok) opts.children[pm.indexOf(q.a)].classList.add('correct'); exp.innerHTML = `<strong>${ok ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false; answered++; if (ok) correct++; $('#quizScore').textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= 6 ? 'Можно идти дальше.' : 'Вернись к разделам, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`; }; opts.appendChild(b); }); card.append(h, opts, exp); box.appendChild(card); }); }

  architecture(); charts(); lab1(); lab2(); quiz();
  window.__lessonReady = true;
})();
