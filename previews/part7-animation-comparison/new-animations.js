'use strict';
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function frameCanvas(f) {
    const cv = document.createElement('canvas'), n = L73.RES;
    cv.width = cv.height = n;
    const c = cv.getContext('2d'), im = c.createImageData(n, n);
    for (let p = 0; p < n * n; p++) {
      im.data[p * 4] = clamp(Math.round(f[p * 3] * 255), 0, 255);
      im.data[p * 4 + 1] = clamp(Math.round(f[p * 3 + 1] * 255), 0, 255);
      im.data[p * 4 + 2] = clamp(Math.round(f[p * 3 + 2] * 255), 0, 255);
      im.data[p * 4 + 3] = 255;
    }
    c.putImageData(im, 0, 0); return cv;
  }

  function imageTile(c, k, P, A, cv, b, title, sub, col) {
    A.rect(c, b.x, b.y, b.w, b.h, 10, P.surf, col || P.line, col ? 1.8 : 1.2);
    A.lab(c, k, title, b.x + 10, b.y + 17, { px: 10, weight: 800, color: col || P.ink, align: 'left', halo: false });
    const m = 10, top = b.y + 32, ih = b.h - 57, iw = Math.min(b.w - m * 2, ih), ix = b.x + (b.w - iw) / 2;
    c.save(); c.imageSmoothingEnabled = false; c.drawImage(cv, ix, top, iw, ih); c.restore();
    A.lab(c, k, sub, b.x + b.w / 2, b.y + b.h - 13, { px: 8.5, weight: 650, color: P.ink3, halo: false });
  }

  function point(path, q) {
    const n = Math.max(1, path.length / 2), x = clamp(q, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(x)), s = x - i;
    if (n === 1) return [path[0], path[1]];
    return [path[i * 2] + (path[(i + 1) * 2] - path[i * 2]) * s, path[i * 2 + 1] + (path[(i + 1) * 2 + 1] - path[i * 2 + 1]) * s];
  }

  function cupPath(path) {
    const out = [];
    for (let i = 0; i < path.length; i += 4) out.push(path[i], path[i + 1]);
    return out;
  }

  function table(c, k, P, A, b, opt) {
    opt = opt || {};
    A.rect(c, b.x, b.y, b.w, b.h, 10, P.surf, opt.col || P.line, opt.col ? 1.5 : 1.1);
    A.lab(c, k, opt.title || '', b.x + 10, b.y + 16, { px: b.w < 250 ? 8.6 : 10, weight: 800, color: opt.col || P.ink, align: 'left', halo: false });
    const r = { x: b.x + 9, y: b.y + 29, w: b.w - 18, h: b.h - 40 };
    A.rect(c, r.x, r.y, r.w, r.h, 7, P.dark ? '#655847' : '#eadcc5', P.dark ? '#9b8b73' : '#b7a386', 1);
    const map = (x, y) => [r.x + (x - .08) / .72 * r.w, r.y + (y - .07) / .50 * r.h];
    const goal = map(.74, .34); A.circle(c, goal[0], goal[1], Math.max(5, r.h * .07), P.dark ? '#2a2925' : '#f7f4eb', P.good, 1.4);
    const obstacle = map(.47, .34); A.circle(c, obstacle[0], obstacle[1], Math.max(4.5, r.h * .065), '#b8d7e8', P.ink3, 1.1);
    const drawPath = (path, col, dash, alpha, upto, dots) => {
      if (!path || path.length < 4) return;
      const n = Math.max(2, Math.ceil(path.length / 2 * (upto == null ? 1 : upto))), pts = [];
      for (let i = 0; i < Math.min(path.length / 2, n); i++) pts.push(map(path[i * 2], path[i * 2 + 1]));
      c.save(); c.globalAlpha = alpha == null ? 1 : alpha; A.line(c, pts, col, dots ? 1.2 : 2.2, dash || []);
      if (dots) for (let i = 1; i < pts.length; i += Math.max(1, Math.floor(pts.length / 8))) A.circle(c, pts[i][0], pts[i][1], 2.5, col);
      c.restore();
    };
    if (opt.imagMode === 'features') drawPath(opt.imag, P.spr, [2, 5], .75, 1, true);
    else drawPath(opt.imag, P.mot, [5, 4], opt.imagAlpha == null ? .75 : opt.imagAlpha, 1, false);
    drawPath(opt.real, opt.realCol || P.out, [], 1, opt.q, false);
    const live = opt.real || opt.imag, p = point(live, opt.q == null ? 1 : opt.q), xy = map(p[0], p[1]);
    A.circle(c, xy[0], xy[1], Math.max(4.5, r.h * .055), '#c9653c', P.dark ? '#eadbd2' : '#5b3b2e', 1.2);
    if (opt.action) {
      const dx = opt.action[0], dy = opt.action[1], n = Math.hypot(dx, dy) || 1;
      A.arrow(c, xy[0], xy[1], xy[0] + dx / n * 22, xy[1] + dy / n * 22, P.good, 2, 6);
    }
    if (opt.bad && opt.q > .93) { A.circle(c, b.x + b.w - 18, b.y + 16, 9, A.alpha(P.bad, .1), P.bad, 1.3); A.K.cross(c, b.x + b.w - 18, b.y + 16, 5, P.bad, 1.8); }
    if (opt.good && opt.q > .93) { A.circle(c, b.x + b.w - 18, b.y + 16, 9, A.alpha(P.good, .1), P.good, 1.3); A.K.check(c, b.x + b.w - 18, b.y + 16, 5, P.good, 1.8); }
    if (opt.note) A.lab(c, k, opt.note, b.x + b.w - 10, b.y + b.h - 10, { px: 8, weight: 650, color: P.ink3, align: 'right', haloColor: P.surf });
  }

  /* 7.3 — как видео без действий превращается в словарь. Лаборатория затем
     исследует значения записей; здесь показан только механизм обучения. */
  (() => {
    const mm = L73.models(), T = mm.T, M = mm.g.main;
    const raw = [
      [[.22, .20], [.30, .20]], [[.31, .37], [.39, .37]], [[.57, .19], [.49, .19]],
    ];
    const samples = raw.map(([a, b]) => {
      const f0 = L73.frameAt(a[0], a[1]), f1 = L73.frameAt(b[0], b[1]), code = L73.codeOf(M, L73.encode(T, f0), L73.encode(T, f1));
      const S = L73.playStart(T, a); L73.playPress(M, T, S, code);
      return { a: frameCanvas(f0), b: frameCanvas(f1), pred: frameCanvas(S.frames.at(-1)), code };
    });
    function pair(c, k, P, A, b, s, on) {
      A.rect(c, b.x, b.y, b.w, b.h, 9, on ? A.alpha(P.out, .08) : P.surf, on ? P.out : P.line, on ? 1.8 : 1);
      const d = b.h - 20, w = Math.min(d, (b.w - 54) / 2), y = b.y + 10;
      c.save(); c.imageSmoothingEnabled = false; c.drawImage(s.a, b.x + 10, y, w, d); c.drawImage(s.b, b.x + b.w - 10 - w, y, w, d); c.restore();
      A.arrow(c, b.x + 15 + w, b.y + b.h / 2, b.x + b.w - 15 - w, b.y + b.h / 2, P.out, 1.5, 5);
    }
    function book(c, k, P, A, b, selected) {
      A.rect(c, b.x, b.y, b.w, b.h, 10, P.surf, P.spr, 1.4); A.lab(c, k, 'словарь из 8 записей', b.x + 10, b.y + 16, { px: 9.5, weight: 800, color: P.spr, align: 'left', halo: false });
      for (let i = 0; i < 8; i++) { const x = b.x + 10 + (i % 4) * ((b.w - 20) / 4), y = b.y + 34 + Math.floor(i / 4) * 42, on = i === selected; A.rect(c, x, y, (b.w - 32) / 4, 32, 6, on ? A.alpha(P.spr, .16) : P.surf2, on ? P.spr : P.line, on ? 2 : 1); A.lab(c, k, String(i), x + (b.w - 32) / 8, y + 16, { px: 10, weight: 820, color: on ? P.spr : P.ink3, halo: false }); }
    }
    function draw(c, k, t, P, A, g) {
      c.fillStyle = P.surf2; c.fillRect(0, 0, g.W, g.H); const u = ((t % 9) + 9) % 9, active = Math.floor(u / 3), s = samples[active], pulse = (u % 3) / 3;
      A.lab(c, k, g.narrow ? 'Видео → скрытая запись → динамика' : 'Модель группирует похожие переходы, не зная названий действий', g.W / 2, 21, { px: g.narrow ? 11 : 13, weight: 820, color: P.ink, halo: false });
      if (!g.narrow) {
        samples.forEach((q, i) => pair(c, k, P, A, { x: 16, y: 52 + i * 91, w: 244, h: 78 }, q, i === active));
        A.arrow(c, 260, 170, 306, 170, P.out, 1.8, 6); A.rect(c, 306, 121, 146, 98, 10, A.alpha(P.out, .08), P.out, 1.5); A.lab(c, k, 'модель', 379, 154, { px: 11, weight: 820, color: P.out, halo: false }); A.lab(c, k, 'скрытых действий', 379, 174, { px: 10, weight: 720, color: P.ink2, halo: false }); A.lab(c, k, 'сравнивает кадры', 379, 196, { px: 8.5, color: P.ink3, halo: false });
        A.arrow(c, 452, 170, 490, 170, P.spr, 1.8, 6); book(c, k, P, A, { x: 490, y: 94, w: 254, h: 145 }, s.code);
        A.line(c, [[617, 239], [617, 268], [452, 268]], P.spr, 1.8); A.arrow(c, 452, 268, 421, 268, P.spr, 1.8, 6);
        A.rect(c, 250, 246, 171, 90, 10, A.alpha(P.mot, .08), P.mot, 1.5); A.lab(c, k, 'модель динамики', 335, 272, { px: 11, weight: 820, color: P.mot, halo: false }); A.lab(c, k, 'прошлое + запись', 335, 296, { px: 9, color: P.ink2, halo: false });
        imageTile(c, k, P, A, s.pred, { x: 490, y: 260, w: 180, h: 118 }, 'предсказанный кадр', `использована запись ${s.code}`, P.mot); A.arrow(c, 421, 291, 490, 319, P.mot, 1.8, 6);
        A.circle(c, 260 + 46 * pulse, 170, 3.3, P.out); A.circle(c, 452 + 38 * pulse, 170, 3.3, P.spr);
        A.lab(c, k, 'Лаборатория начинается позже: там ученик сам выясняет смысл записей.', 250, 374, { px: 9.3, color: P.ink2, align: 'left', halo: false });
      } else {
        samples.forEach((q, i) => pair(c, k, P, A, { x: 12, y: 49 + i * 82, w: 336, h: 70 }, q, i === active));
        A.arrow(c, 180, 293, 180, 318, P.out, 1.7, 6); A.rect(c, 70, 322, 220, 62, 9, A.alpha(P.out, .08), P.out, 1.4); A.lab(c, k, 'модель скрытых действий', 180, 353, { px: 10.5, weight: 800, color: P.out, halo: false });
        book(c, k, P, A, { x: 42, y: 408, w: 276, h: 133 }, s.code); A.arrow(c, 180, 545, 180, 568, P.spr, 1.7, 6);
        A.rect(c, 23, 574, 151, 66, 9, A.alpha(P.mot, .08), P.mot, 1.4); A.lab(c, k, 'динамика', 98, 597, { px: 10, weight: 800, color: P.mot, halo: false }); A.lab(c, k, 'прошлое + запись', 98, 618, { px: 8.5, color: P.ink2, halo: false });
        imageTile(c, k, P, A, s.pred, { x: 190, y: 561, w: 147, h: 112 }, 'следующий кадр', `запись ${s.code}`, P.mot);
      }
    }
    const wide = { W: 760, H: 400, narrow: false }, narrow = { W: 360, H: 690, narrow: true };
    Anim.add('l73-v2', { W: wide.W, H: wide.H, start: 1.1, narrowAt: 450, draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); }, narrow: { W: narrow.W, H: narrow.H, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrow); } } });
  })();

  /* 7.4 — место будущего в вычислительном графе. Лаборатория отдельно
     сравнивает поведение контуров; здесь нет успехов, траекторий и ставок. */
  (() => {
    const path = L74.run('wam', 'detour', 100, 0).imag;
    function thumb(c, P, A, b, q, col) { A.rect(c, b.x, b.y, b.w, b.h, 6, P.dark ? '#655847' : '#eadcc5', P.line, 1); const p = point(path, q); A.circle(c, b.x + b.w * (.14 + p[0]), b.y + b.h * (.15 + p[1]), 4, '#c9653c', P.ink3, 1); A.circle(c, b.x + b.w * .78, b.y + b.h * .55, 7, P.surf, P.good, 1.2); A.line(c, [[b.x + 7, b.y + b.h - 8], [b.x + b.w - 8, b.y + 8]], A.alpha(col, .45), 1.2, [4, 3]); }
    const lanes = [
      { title: 'видео → действие', nodes: ['видеомодель', 'будущие кадры', 'обратная динамика'], future: 'frame' },
      { title: 'совместная WAM', nodes: ['общая модель', 'будущее + действие'], future: 'frame' },
      { title: 'признаки будущего', nodes: ['видеомодель', 'скрытые признаки', 'голова действий'], future: 'tokens' },
      { title: 'будущее только в обучении', nodes: ['общий энкодер', 'действие при работе'], future: 'loss' },
    ];
    function box2(c, k, P, A, x, y, w, h, one, two, col) {
      A.rect(c, x, y, w, h, 7, A.alpha(col, .08), col, 1.3);
      A.lab(c, k, one, x + w / 2, y + h / 2 - 7, { px: 7.4, weight: 760, color: col, halo: false });
      A.lab(c, k, two, x + w / 2, y + h / 2 + 8, { px: 7.1, weight: 650, color: col, halo: false });
    }
    function laneNarrow(c, k, P, A, b, d, index, q, pulse) {
      A.rect(c, b.x, b.y, b.w, b.h, 9, P.surf, P.line, 1);
      A.lab(c, k, d.title, b.x + 10, b.y + 14, { px: 9.5, weight: 800, color: P.ink, align: 'left', halo: false });
      const cy = b.y + 78, obs = { x: b.x + 10, y: b.y + 42, w: 52, h: 72 }, ax = b.x + b.w - 20;
      thumb(c, P, A, obs, 0, P.out);
      A.lab(c, k, 'наблюдение', obs.x + obs.w / 2, b.y + 124, { px: 7.2, color: P.out, haloColor: P.surf });
      A.circle(c, ax, cy, 12, A.alpha(P.good, .12), P.good, 1.4);
      A.lab(c, k, 'a', ax, cy, { px: 10, weight: 850, color: P.good, halo: false });
      if (index === 0) {
        box2(c, k, P, A, b.x + 78, b.y + 55, 58, 46, 'видео-', 'модель', P.spr);
        thumb(c, P, A, { x: b.x + 151, y: b.y + 42, w: 48, h: 72 }, q, P.mot);
        A.lab(c, k, 'будущее', b.x + 175, b.y + 124, { px: 7.2, color: P.mot, haloColor: P.surf });
        box2(c, k, P, A, b.x + 214, b.y + 55, 68, 46, 'обратная', 'динамика', P.spr);
        A.arrow(c, obs.x + obs.w + 3, cy, b.x + 75, cy, P.spr, 1.4, 5);
        A.arrow(c, b.x + 139, cy, b.x + 148, cy, P.mot, 1.4, 5);
        A.arrow(c, b.x + 202, cy, b.x + 211, cy, P.mot, 1.4, 5);
        A.arrow(c, b.x + 285, cy, ax - 14, cy, P.good, 1.5, 5);
      } else if (index === 1) {
        box2(c, k, P, A, b.x + 91, b.y + 51, 135, 54, 'общая модель', 'будущее + действие', P.spr);
        thumb(c, P, A, { x: b.x + 244, y: b.y + 42, w: 34, h: 72 }, q, P.mot);
        A.arrow(c, obs.x + obs.w + 3, cy, b.x + 88, cy, P.spr, 1.5, 5);
        A.arrow(c, b.x + 229, cy, b.x + 241, cy, P.mot, 1.5, 5);
        A.arrow(c, b.x + 281, cy, ax - 14, cy, P.good, 1.5, 5);
      } else if (index === 2) {
        box2(c, k, P, A, b.x + 78, b.y + 55, 64, 46, 'видео-', 'модель', P.spr);
        for (let i = 0; i < 6; i++) A.circle(c, b.x + 166 + (i % 2) * 12, b.y + 62 + Math.floor(i / 2) * 15, 3.6, P.spr);
        A.lab(c, k, 'признаки', b.x + 172, b.y + 124, { px: 7.2, color: P.spr, haloColor: P.surf });
        box2(c, k, P, A, b.x + 205, b.y + 55, 78, 46, 'голова', 'действий', P.spr);
        A.arrow(c, obs.x + obs.w + 3, cy, b.x + 75, cy, P.spr, 1.4, 5);
        A.arrow(c, b.x + 145, cy, b.x + 158, cy, P.spr, 1.4, 5);
        A.arrow(c, b.x + 188, cy, b.x + 202, cy, P.spr, 1.4, 5);
        A.arrow(c, b.x + 286, cy, ax - 14, cy, P.good, 1.5, 5);
      } else {
        box2(c, k, P, A, b.x + 82, b.y + 55, 92, 46, 'общий', 'энкодер', P.spr);
        box2(c, k, P, A, b.x + 216, b.y + 55, 70, 46, 'действие', 'при работе', P.spr);
        A.arrow(c, obs.x + obs.w + 3, cy, b.x + 79, cy, P.spr, 1.4, 5);
        A.arrow(c, b.x + 177, cy, b.x + 213, cy, P.spr, 1.4, 5);
        A.arrow(c, b.x + 289, cy, ax - 14, cy, P.good, 1.5, 5);
        A.line(c, [[b.x + 128, b.y + 52], [b.x + 128, b.y + 35], [b.x + 266, b.y + 35]], A.alpha(P.mot, .75), 1.4, [4, 3]);
        A.lab(c, k, 'цель обучения', b.x + 266, b.y + 35, { px: 7.3, color: P.mot, haloColor: P.surf });
      }
      A.circle(c, obs.x + obs.w + 6 + 218 * pulse, cy, 2.8, P.spr);
    }
    function lane(c, k, P, A, b, d, q, pulse) {
      A.rect(c, b.x, b.y, b.w, b.h, 9, P.surf, P.line, 1); A.lab(c, k, d.title, b.x + 10, b.y + 14, { px: 9.5, weight: 800, color: P.ink, align: 'left', halo: false });
      const small = b.w < 500, oy = b.y + 31, th = b.h - 38, obsW = small ? 56 : 72;
      thumb(c, P, A, { x: b.x + 10, y: oy, w: obsW, h: th }, 0, P.out); A.lab(c, k, 'наблюдение', b.x + 10 + obsW / 2, b.y + b.h - 7, { px: 7.5, color: P.out, haloColor: P.surf });
      const start = b.x + (small ? 98 : 106), end = b.x + b.w - (small ? 102 : 96), gap = d.nodes.length > 1 ? (end - start) / (d.nodes.length - 1) : 0, nw = small ? (d.nodes.length > 2 ? 54 : 72) : 92;
      d.nodes.forEach((n, i) => { const x = start + i * gap, col = n.includes('будущ') || n.includes('признак') ? P.mot : P.spr; A.rect(c, x - nw / 2, oy + 4, nw, th - 8, 7, A.alpha(col, .08), col, 1.3); A.lab(c, k, n, x, oy + th / 2, { px: small ? 7.2 : 8.1, weight: 700, color: col, halo: false }); if (i) A.arrow(c, start + (i - 1) * gap + nw / 2 + 2, oy + th / 2, x - nw / 2 - 2, oy + th / 2, col, 1.4, 5); });
      const ax = b.x + b.w - (small ? 22 : 50); A.arrow(c, end + nw / 2 + 2, oy + th / 2, ax - 13, oy + th / 2, P.good, 1.8, 6); A.circle(c, ax, oy + th / 2, 12, A.alpha(P.good, .12), P.good, 1.4); A.lab(c, k, 'a', ax, oy + th / 2, { px: 10, weight: 850, color: P.good, halo: false });
      if (d.future === 'frame') thumb(c, P, A, { x: b.x + b.w - (small ? 67 : 91), y: oy, w: small ? 28 : 31, h: th }, q, P.mot);
      if (d.future === 'tokens') for (let i = 0; i < 4; i++) A.circle(c, b.x + b.w - (small ? 62 : 78) + (i % 2) * 11, oy + 13 + Math.floor(i / 2) * 16, 3.6, P.spr);
      if (d.future === 'loss') { A.line(c, [[start, oy + 3], [start, b.y + 23], [b.x + b.w - (small ? 64 : 78), b.y + 23]], A.alpha(P.mot, .7), 1.4, [4, 3]); A.lab(c, k, 'цель обучения', b.x + b.w - (small ? 63 : 77), b.y + 23, { px: 7.5, color: P.mot, haloColor: P.surf }); }
      A.circle(c, b.x + 10 + obsW + (end - b.x - 10 - obsW) * pulse, oy + th / 2, 2.8, P.spr);
    }
    function draw(c, k, t, P, A, g) { c.fillStyle = P.surf2; c.fillRect(0, 0, g.W, g.H); const u = ((t % 5) + 5) % 5, q = A.ease(A.seg(u, .2, 4.2)), pulse = ((t * .32) % 1 + 1) % 1; A.lab(c, k, g.narrow ? 'Где живёт предсказанное будущее' : 'Одна сцена, четыре места будущего в вычислительном графе', g.W / 2, 21, { px: g.narrow ? 11 : 13, weight: 820, color: P.ink, halo: false }); if (!g.narrow) { lanes.forEach((d, i) => lane(c, k, P, A, { x: 15, y: 43 + i * 84, w: 730, h: 75 }, d, q, (pulse + i * .17) % 1)); A.lab(c, k, 'Здесь показана архитектура. Поведение трёх контуров ученик сравнивает уже в лаборатории.', 380, 388, { px: 9.3, color: P.ink2, halo: false }); } else { lanes.forEach((d, i) => laneNarrow(c, k, P, A, { x: 8, y: 43 + i * 157, w: 344, h: 146 }, d, i, q, (pulse + i * .17) % 1)); A.lab(c, k, 'архитектура, не сравнение качества', 180, 685, { px: 9, color: P.ink2, halo: false }); } }
    const wide = { W: 760, H: 400, narrow: false }, narrow = { W: 360, H: 700, narrow: true };
    Anim.add('l74-v2', { W: wide.W, H: wide.H, start: 1, narrowAt: 450, draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); }, narrow: { W: narrow.W, H: narrow.H, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrow); } } });
  })();

  /* 7.5 — один замкнутый прогон, а не экзамен и не отбор чекпойнтов.
     Лаборатории сохраняют обе экспериментальные механики без повторения. */
  (() => {
    const exam = L75.exam({ rollouts: 0, failures: false, judge: 'strict' }), row = exam.rows.find((r) => r.id === 'A'), start = L75.LAB_STARTS[0];
    const im = L75.L71.imagineCtl(L75.MODELS.demo, row.theta, start, L75.L71.LAYOUTS.base, { tau: 0, seed: 75, path: true });
    const imagined = cupPath(im.path), real = cupPath(row.real.runs[0].path), run = row.real.runs[0];
    function draw(c, k, t, P, A, g) {
      c.fillStyle = P.surf2; c.fillRect(0, 0, g.W, g.H); const u = ((t % 6) + 6) % 6, q = A.ease(A.seg(u, .2, 4.9));
      A.lab(c, k, g.narrow ? 'Одна политика · два замкнутых контура' : 'Одинаковое действие получает разную обратную связь от модели и физики', g.W / 2, 21, { px: g.narrow ? 10.8 : 13, weight: 820, color: P.ink, halo: false });
      if (!g.narrow) {
        A.rect(c, 278, 47, 204, 42, 9, A.alpha(P.spr, .10), P.spr, 1.4); A.lab(c, k, 'политика → пачка действий', 380, 68, { px: 10.5, weight: 800, color: P.spr, halo: false });
        A.arrow(c, 340, 89, 220, 112, P.spr, 1.6, 6); A.arrow(c, 420, 89, 540, 112, P.spr, 1.6, 6);
        table(c, k, P, A, { x: 18, y: 108, w: 352, h: 218 }, { title: 'модель мира', imag: imagined, real: imagined, realCol: P.mot, q, col: P.mot, good: im.ok, note: 'следующий кадр возвращается политике' });
        table(c, k, P, A, { x: 390, y: 108, w: 352, h: 218 }, { title: 'физический стол', real, realCol: P.out, q, col: P.out, bad: !run.ok, note: 'камера возвращает настоящий кадр' });
        A.line(c, [[70, 326], [70, 351], [690, 351], [690, 326]], P.spr, 1.4, [5, 4]); A.lab(c, k, 'обратная связь замыкает оба контура', 380, 351, { px: 9.5, weight: 700, color: P.spr, haloColor: P.surf2 });
        A.lab(c, k, q > .92 ? 'модель: успех' : 'модель продолжает сцену', 194, 383, { px: 10.5, weight: 800, color: q > .92 ? P.good : P.mot, halo: false });
        A.lab(c, k, q > .92 ? 'физика: чашка опрокинута' : 'робот исполняет те же действия', 566, 383, { px: 10.5, weight: 800, color: q > .92 ? P.bad : P.out, halo: false });
      } else {
        A.rect(c, 78, 43, 204, 40, 9, A.alpha(P.spr, .10), P.spr, 1.4); A.lab(c, k, 'политика → действия', 180, 63, { px: 10, weight: 800, color: P.spr, halo: false });
        table(c, k, P, A, { x: 10, y: 105, w: 340, h: 224 }, { title: 'модель мира', imag: imagined, real: imagined, realCol: P.mot, q, col: P.mot, good: im.ok, note: 'предсказанный следующий кадр' });
        table(c, k, P, A, { x: 10, y: 350, w: 340, h: 224 }, { title: 'физический стол', real, realCol: P.out, q, col: P.out, bad: !run.ok, note: 'настоящий следующий кадр' });
        A.lab(c, k, q > .92 ? 'модель: успех · физика: опрокидывание' : 'оба контура получают новый кадр', 180, 614, { px: 10.2, weight: 800, color: q > .92 ? P.bad : P.spr, halo: false });
        A.lab(c, k, 'Экзамен нескольких чекпойнтов остаётся лабораторией.', 180, 650, { px: 9, color: P.ink2, halo: false });
      }
    }
    const wide = { W: 760, H: 410, narrow: false }, narrow = { W: 360, H: 670, narrow: true };
    Anim.add('l75-v2', { W: wide.W, H: wide.H, start: 1, narrowAt: 450, draw(c, k, t, P, A) { draw(c, k, t, P, A, wide); }, narrow: { W: narrow.W, H: narrow.H, draw(c, k, t, P, A) { draw(c, k, t, P, A, narrow); } } });
  })();
})();
