/* =====================================================================
   flow.js — урок 2.2: анимированная схема пути данных в PerAct на общем
   движке shared/anim.js. Четыре камеры → сетка 100³ → 8000 патчей и 77 слов →
   2048 латентов (читают вход, шесть слоёв внимания между собой) → патчи
   спрашивают латенты → оценка каждого вокселя и три малые головы.
   Синим — патчи сцены, оранжевым — слова команды, фиолетовым — латенты.
   Две раскладки: широкая (слева направо) и узкая для телефона (сверху вниз).
   ===================================================================== */
'use strict';
(() => {
  const T = 13;                                     // секунд на полный проход
  const PH = [[0, 1.5], [1.5, 3.2], [3.2, 4.9], [4.9, 6.6], [6.6, 8.6], [8.6, 10.2], [10.2, 11.8]];
  // подписи столбцов схемы; этапы 4 и 5 идут в одном столбце — латентов
  const COLS = ['Камеры', 'Сетка вокселей', 'Патчи и слова', 'Латенты', 'Патчи спрашивают латенты', 'Оценка вокселей'];
  const COL_OF = [0, 1, 2, 3, 3, 4, 5];
  const hash = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /** Изометрический куб: центр, ребро; mode — 'empty' | 'fill' | 'patch' | 'heat'; pr — доля появления. */
  const VOX = [];                                     // занятые клетки 5×5×5: стол и комод с тремя ящиками
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) VOX.push([x, 0, z, 'table']);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 3; x++) VOX.push([x, y, 3, 'box']);
  function cube(c, k, cx, cy, a, P, A, mode, pr, t) {
    const { alpha, line } = A, cs = Math.cos(Math.PI / 6), sn = 0.5, n = 5, q = a / n;
    const pt = (x, y, z) => [cx + (x - z) * cs * q, cy + (x + z) * sn * q - y * q];   // клетки 0..5, центр куба в (2,5; 2,5; 2,5)
    const off = [2.5, 2.5, 2.5];
    const p = (x, y, z) => pt(x - off[0], y - off[1], z - off[2]);
    const poly = (pts, fill, stroke, lw) => { c.beginPath(); pts.forEach((v, i) => (i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } };
    // задние грани
    poly([p(0, 0, 5), p(5, 0, 5), p(5, 5, 5), p(0, 5, 5)], alpha(P.out, 0.04), P.grid, 1);
    poly([p(0, 0, 0), p(0, 0, 5), p(0, 5, 5), p(0, 5, 0)], alpha(P.out, 0.03), P.grid, 1);
    poly([p(0, 0, 0), p(5, 0, 0), p(5, 0, 5), p(0, 0, 5)], alpha(P.out, 0.05), P.grid, 1);
    // клетки
    const cell = (x, y, z, col, edge) => {
      poly([p(x, y + 1, z), p(x + 1, y + 1, z), p(x + 1, y + 1, z + 1), p(x, y + 1, z + 1)], col, edge, 0.8);
      poly([p(x + 1, y, z), p(x + 1, y + 1, z), p(x + 1, y + 1, z + 1), p(x + 1, y, z + 1)], col, edge, 0.8);
      poly([p(x, y, z + 1), p(x + 1, y, z + 1), p(x + 1, y + 1, z + 1), p(x, y + 1, z + 1)], col, edge, 0.8);
    };
    const order = VOX.slice().sort((u, v) => (u[0] + u[2] - u[1] * 0.1) - (v[0] + v[2] - v[1] * 0.1));
    if (mode === 'heat') {
      const tgt = [1.5, 4, 2.2];                       // перед верхним ящиком
      const cells = [];
      for (let x = 0; x < 5; x++) for (let y = 1; y < 5; y++) for (let z = 0; z < 3; z++) { const d = Math.hypot(x - tgt[0], y - tgt[1], z - tgt[2]); cells.push([x, y, z, Math.exp(-d * d / 2.2)]); }
      order.forEach(([x, y, z, kind]) => cell(x, y, z, kind === 'table' ? alpha(P.ink3, 0.18) : alpha(P.ink3, 0.32), alpha(P.ink3, 0.5)));
      cells.sort((u, v) => (u[0] + u[2] - u[1] * 0.1) - (v[0] + v[2] - v[1] * 0.1)).forEach(([x, y, z, h]) => { if (h * pr > 0.12) cell(x, y, z, alpha(P.mot, 0.7 * h * pr), null); });
      if (pr > 0.6) { const b = [1, 4, 2]; poly([p(b[0], b[1] + 1, b[2]), p(b[0] + 1, b[1] + 1, b[2]), p(b[0] + 1, b[1] + 1, b[2] + 1), p(b[0], b[1] + 1, b[2] + 1)], null, P.ink, 2.2); poly([p(b[0] + 1, b[1], b[2]), p(b[0] + 1, b[1] + 1, b[2]), p(b[0] + 1, b[1] + 1, b[2] + 1), p(b[0] + 1, b[1], b[2] + 1)], null, P.ink, 2.2); }
    } else if (mode !== 'empty') {
      const m = Math.floor(order.length * pr);
      order.slice(0, m).forEach(([x, y, z, kind]) => cell(x, y, z, kind === 'table' ? alpha(P.out, 0.28) : alpha(P.out, 0.5), alpha(P.out, 0.75)));
    }
    // передние рёбра
    const front = [[p(5, 0, 0), p(5, 5, 0)], [p(0, 0, 5), p(0, 5, 5)], [p(5, 0, 5), p(5, 5, 5)], [p(0, 5, 0), p(5, 5, 0)], [p(0, 5, 0), p(0, 5, 5)], [p(5, 5, 0), p(5, 5, 5)], [p(0, 5, 5), p(5, 5, 5)], [p(5, 0, 0), p(5, 0, 5)], [p(0, 0, 5), p(5, 0, 5)]];
    front.forEach(([u, v]) => line(c, [u, v], P.ink2, 1.4));
    if (mode === 'patch') {                           // границы патчей: куб режут на кубики 5 × 5 × 5 вокселей
      for (let i = 1; i < 5; i++) {
        line(c, [p(i, 5, 0), p(i, 5, 5)], alpha(P.out, 0.8 * pr), 1.2); line(c, [p(0, 5, i), p(5, 5, i)], alpha(P.out, 0.8 * pr), 1.2);
        line(c, [p(5, i, 0), p(5, i, 5)], alpha(P.out, 0.8 * pr), 1.2); line(c, [p(5, 0, i), p(5, 5, i)], alpha(P.out, 0.8 * pr), 1.2);
        line(c, [p(0, i, 5), p(5, i, 5)], alpha(P.out, 0.8 * pr), 1.2); line(c, [p(i, 0, 5), p(i, 5, 5)], alpha(P.out, 0.8 * pr), 1.2);
      }
    }
  }
  /** Камеры вокруг стола и облако точек. */
  function scene(c, k, cx, cy, s, P, A, act) {
    const { rect, line, circle, alpha } = A;
    const top = [[cx - 34 * s, cy], [cx + 10 * s, cy - 20 * s], [cx + 44 * s, cy], [cx, cy + 20 * s]];
    c.beginPath(); top.forEach((v, i) => (i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1]))); c.closePath(); c.fillStyle = alpha(P.ink3, 0.15); c.fill(); c.strokeStyle = P.ink3; c.lineWidth = 1.4; c.stroke();
    rect(c, cx - 6 * s, cy - 34 * s, 22 * s, 26 * s, 3, alpha(P.ink3, 0.18), P.ink3, 1.4);
    for (let i = 0; i < 3; i++) line(c, [[cx - 2 * s, cy - (29 - i * 8) * s], [cx + 12 * s, cy - (29 - i * 8) * s]], P.ink3, 1.2);
    const cams = [[cx - 48 * s, cy - 40 * s], [cx + 56 * s, cy - 40 * s], [cx - 50 * s, cy + 36 * s], [cx + 54 * s, cy + 36 * s]];
    cams.forEach(([x, y], i) => {
      if (act > 0) line(c, [[x, y], [cx + 4 * s, cy - 8 * s]], alpha(P.mot, 0.35 * act), 1.2, [3, 3]);
      rect(c, x - 8 * s, y - 6 * s, 16 * s, 12 * s, 3, P.surf, act > 0 && (Math.floor(act * 8) + i) % 2 ? P.mot : P.ink2, 1.6);
      circle(c, x, y, 3 * s, P.outS, P.out, 1.2);
    });
    for (let i = 0; i < 26; i++) { const x = cx - 26 * s + hash(i) * 62 * s, y = cy - 30 * s + hash(i + 50) * 42 * s; if (act * 26 > i) circle(c, x, y, 1.6 * s, alpha(P.out, 0.8)); }
  }
  /** Ряд или столбец токенов. kinds — массив 'p' | 'w' | 'l' | 'gap'. Возвращает центры. */
  function tokens(c, x, y, kinds, dir, sz, gap, P, A, pr, hi) {
    const { rect, lab } = A, pos = [];
    let o = 0;
    kinds.forEach((kd, i) => {
      const cx = dir === 'v' ? x : x + o, cy = dir === 'v' ? y + o : y;
      if (kd === 'gap') { o += sz + gap; pos.push(null); return; }
      pos.push([cx, cy]);
      const vis = pr === undefined ? 1 : Math.max(0, Math.min(1, pr * kinds.length - i));
      if (vis > 0) {
        const col = kd === 'p' ? [P.outS, P.out] : kd === 'w' ? [P.motS, P.mot] : [P.sprS, P.spr];
        c.globalAlpha = vis; rect(c, cx - sz / 2, cy - sz / 2, sz, sz, 2.5, col[0], hi === i ? P.ink : col[1], hi === i ? 2 : 1.4); c.globalAlpha = 1;
      }
      o += sz + gap;
    });
    return pos;
  }
  const dotsC = (kinds) => kinds.map((kd) => kd);
  /** Точки летят из одного набора в другой. */
  function flow(c, from, to, prog, n, color, A) {
    const { circle } = A, F = from.filter(Boolean), Tt = to.filter(Boolean);
    for (let i = 0; i < n; i++) {
      const a = F[Math.floor(hash(i) * F.length)], b = Tt[Math.floor(hash(i + 99) * Tt.length)], ph = ((prog * 2.2 + hash(i + 7)) % 1);
      if (prog <= 0 || prog >= 1) continue;
      circle(c, a[0] + (b[0] - a[0]) * ph, a[1] + (b[1] - a[1]) * ph, 2.2, color);
    }
  }
  function lines(c, from, to, alphaV, color, A) {
    const F = from.filter(Boolean), Tt = to.filter(Boolean);
    F.forEach((a, i) => Tt.forEach((b, j) => { if ((i + j) % 2) return; A.line(c, [a, b], A.alpha(color, alphaV), 0.8); }));
  }
  const PATCHES = ['w', 'w', 'w', 'gap', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'gap', 'p', 'p'];
  const PATCH_ONLY = ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'gap', 'p', 'p'];
  const LAT = ['l', 'l', 'l', 'l', 'l', 'l'];

  function drawFlow(c, k, t, P, A, G) {
    const { lab, arrow, line, seg, alpha, fmt } = A, u = ((t % T) + T) % T;
    const pr = PH.map(([a, b]) => seg(u, a, b)), cur = PH.findIndex(([a, b]) => u >= a && u < b);
    // подписи этапов
    const curCol = cur === -1 ? 5 : COL_OF[cur];
    G.caps.forEach(([x, y, cnt], i) => {
      const on = i === curCol, started = COL_OF.some((cc, st) => cc === i && pr[st] > 0);
      const name = i === 3 && cur === 3 ? 'Латенты читают вход' : i === 3 && cur === 4 ? 'Шесть слоёв внимания' : COLS[i];
      lab(c, k, name, x, y, { px: 11, weight: 700, color: on ? P.ink : started ? P.ink2 : P.ink3, haloColor: P.surf2 });
      lab(c, k, cnt, x, y + 15, { px: 10.5, color: on ? P.out : P.ink3, haloColor: P.surf2 });
    });
    const AR = [0, 1, 2, 3, 5, 6];                    // стрелка ведёт к столбцу, этап которого её зажигает
    G.arrows.forEach(([x1, y1, x2, y2], i) => arrow(c, x1, y1, x2, y2, pr[AR[i]] > 0 ? P.ink2 : P.line, 1.8, 6));
    // 1. камеры
    scene(c, k, G.s1[0], G.s1[1], G.s1[2], P, A, pr[0]);
    // 2. воксели
    if (pr[1] > 0) cube(c, k, G.s2[0], G.s2[1], G.s2[2], P, A, pr[2] > 0 ? 'patch' : 'fill', pr[2] > 0 ? 1 : pr[1], t);
    if (pr[2] > 0 && pr[2] < 1) cube(c, k, G.s2[0], G.s2[1], G.s2[2], P, A, 'patch', pr[2], t);
    // 3. патчи и слова
    const tk = tokens(c, G.s3[0], G.s3[1], PATCHES, G.dir, G.sz, G.gap, P, A, pr[2]);
    if (pr[2] > 0) {
      const wy = G.cmd; lab(c, k, '«открой верхний ящик»', wy[0], wy[1], { px: 10.5, color: P.mot, weight: 700, haloColor: P.surf2 });
    }
    // 4. латенты: читают патчи и слова
    const lt = tokens(c, G.s4[0], G.s4[1], LAT, G.dir, G.sz + 2, G.gap + 4, P, A, pr[3] > 0 ? 1 : 0);
    if (pr[3] > 0 && pr[3] < 1) { lines(c, tk, lt, 0.25, P.spr, A); flow(c, tk, lt, pr[3], 26, P.spr, A); }
    // 5. шесть слоёв внимания между латентами
    if (pr[4] > 0) {
      const layer = Math.min(6, Math.floor(pr[4] * 6) + 1), L = lt.filter(Boolean), ph = (pr[4] * 6) % 1;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        if ((i + j + layer) % 3) continue;
        const a = L[i], b = L[j], bend = G.dir === 'v' ? 18 + 4 * (j - i) : -(18 + 4 * (j - i));
        c.beginPath(); if (G.dir === 'v') { c.moveTo(a[0] + 8, a[1]); c.quadraticCurveTo(a[0] + 8 + bend, (a[1] + b[1]) / 2, b[0] + 8, b[1]); } else { c.moveTo(a[0], a[1] + 9); c.quadraticCurveTo((a[0] + b[0]) / 2, a[1] + 9 - bend, b[0], b[1] + 9); }
        c.strokeStyle = alpha(P.spr, pr[4] < 1 ? 0.25 + 0.5 * (1 - ph) : 0.18); c.lineWidth = 1.4; c.stroke();
      }
      if (pr[4] < 1) lab(c, k, `слой ${layer} из 6`, G.lay[0], G.lay[1], { px: 10.5, color: P.spr, weight: 700, haloColor: P.surf2 });
    }
    // 6. патчи спрашивают латенты
    const pb = tokens(c, G.s5[0], G.s5[1], PATCH_ONLY, G.dir, G.sz, G.gap, P, A, pr[5] > 0 ? Math.min(1, pr[5] * 1.5) : 0);
    if (pr[5] > 0 && pr[5] < 1) { lines(c, lt, pb, 0.25, P.out, A); flow(c, lt, pb, pr[5], 22, P.out, A); }
    // 7. оценка каждого вокселя и малые головы
    if (pr[6] > 0) cube(c, k, G.s6[0], G.s6[1], G.s6[2], P, A, 'heat', pr[6], t);
    if (pr[6] > 0.5) {
      G.heads.forEach(([x, y, txt]) => lab(c, k, txt, x, y, { px: 10, color: P.ink2, haloColor: P.surf2 }));
    }
  }

  Anim.add('peract', {
    W: 720, H: 300, start: 5.6, narrowAt: 600,
    draw(c, k, t, P, A) {
      drawFlow(c, k, t, P, A, {
        dir: 'v', sz: 10, gap: 3,
        caps: [[64, 262, '4 камеры RGB-D'], [184, 262, '100³ вокселей'], [312, 262, '8000 + 77 токенов'], [432, 262, '2048 латентов'], [552, 262, '8000 патчей'], [664, 262, '100³ оценок']],
        arrows: [[120, 150, 140, 150], [228, 150, 290, 150], [336, 150, 408, 150], [462, 150, 528, 150], [578, 150, 618, 150]],
        s1: [64, 150, 1], s2: [184, 156, 44], s3: [312, 62], s4: [432, 104], s5: [552, 88], s6: [664, 148, 44],
        cmd: [312, 44], lay: [432, 84], heads: [[664, 212, 'поворот: 3 × 72'], [664, 226, 'захват · столкновения']],
      });
    },
    narrow: {
      W: 360, H: 680,
      draw(c, k, t, P, A) {
        drawFlow(c, k, t, P, A, {
          dir: 'h', sz: 12, gap: 4,
          caps: [[262, 56, '4 камеры RGB-D'], [262, 176, '100³ вокселей'], [180, 298, '8000 + 77 токенов'], [180, 428, '2048 латентов'], [180, 514, '8000 патчей'], [262, 604, '100³ оценок']],
          arrows: [[96, 114, 96, 132], [96, 232, 96, 254], [180, 322, 180, 340], [180, 452, 180, 470], [180, 538, 180, 560]],
          s1: [96, 64, 0.8], s2: [96, 182, 40], s3: [44, 274], s4: [121, 360], s5: [106, 490], s6: [96, 620, 40],
          cmd: [100, 256], lay: [64, 360], heads: [[262, 636, 'поворот: 3 × 72'], [262, 650, 'захват · столкновения']],
        });
      },
    },
  });
})();
