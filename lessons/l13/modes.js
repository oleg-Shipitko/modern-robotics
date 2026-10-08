/* =====================================================================
   modes.js — урок 1.3, раздел «Как выдать распределение действий»:
   анимированная схема на общем движке shared/anim.js. Одни и те же данные —
   объезд чайника слева и справа — и четыре способа выдать действие:
   регрессия, смесь гауссиан, бины, диффузия. Серым — распределение
   действий в демонстрациях, оранжевым — то, что выдаёт политика,
   точка на оси — одно выбранное действие.
   ===================================================================== */
'use strict';
(() => {
  const MU = 0.62, SD = 0.16, DMAX = 1.35, NB = 12, NP = 12, T = 4.8, PICK = 1.6;
  const gauss = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const dens = (x) => 0.5 * gauss(x, -MU, SD) + 0.5 * gauss(x, MU, SD);
  const hash = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  // бины: вероятность каждого интервала по плотности в его середине
  const BW = 2 / NB, BIN = Array.from({ length: NB }, (_, i) => dens(-1 + BW * (i + 0.5)));
  const BSUM = BIN.reduce((a, b) => a + b, 0);
  function pickBin(r) { let acc = 0; for (let i = 0; i < NB; i++) { acc += BIN[i] / BSUM; if (r <= acc) return i; } return NB - 1; }
  const PANELS = [
    { key: 'reg', title: 'Регрессия', cap: 'одно действие — среднее', sub: 'попадает в чайник', bad: true },
    { key: 'mix', title: 'Смесь гауссиан', cap: 'по колоколу на моду', sub: 'сэмпл из одного колокола' },
    { key: 'bins', title: 'Бины', cap: 'вероятность интервала', sub: 'сэмпл из одного интервала' },
    { key: 'diff', title: 'Диффузия', cap: 'шум → действие по шагам', sub: 'сэмпл на одной из мод' },
  ];

  function panel(c, k, t, P, A, ox, oy, pw, ph, p) {
    const { line, circle, rect, lab, alpha, ease, seg, lerp } = A;
    const x0 = ox + 16, x1 = ox + pw - 16, base = oy + 150, top = oy + 42;
    const X = (v) => x0 + (v + 1) / 2 * (x1 - x0), Y = (d) => base - d / DMAX * (base - top);
    lab(c, k, p.title, ox + pw / 2, oy + 18, { px: 12.5, weight: 700, color: P.ink, haloColor: P.surf });
    // данные: распределение действий в демонстрациях
    c.beginPath(); c.moveTo(X(-1), base);
    for (let i = 0; i <= 80; i++) { const v = -1 + 2 * i / 80; c.lineTo(X(v), Y(dens(v))); }
    c.lineTo(X(1), base); c.closePath(); c.fillStyle = alpha(P.ink3, 0.16); c.fill();
    c.beginPath(); for (let i = 0; i <= 80; i++) { const v = -1 + 2 * i / 80; i ? c.lineTo(X(v), Y(dens(v))) : c.moveTo(X(v), Y(dens(v))); }
    c.strokeStyle = alpha(P.ink3, 0.55); c.lineWidth = 1.2; c.stroke();
    // ось: сдвиг вбок, чайник посередине
    line(c, [[x0, base], [x1, base]], P.line, 1.2);
    circle(c, X(0), base + 12, 6.5, P.surf, P.ink3, 1.3);
    lab(c, k, 'чайник', X(0), base + 27, { px: 9.5, color: P.ink3, halo: false });
    lab(c, k, '← слева', x0, base + 12, { px: 9.5, color: P.ink3, align: 'left', halo: false });
    lab(c, k, 'справа →', x1, base + 12, { px: 9.5, color: P.ink3, align: 'right', halo: false });
    const dot = (v, y, a) => circle(c, X(v), y, 4.6, alpha(P.mot, a == null ? 1 : a), P.surf, 1.6);
    const u = ((t % T) + T) % T, n = Math.floor(t / PICK), ph2 = ((t % PICK) + PICK) % PICK / PICK;
    if (p.key === 'reg') {
      line(c, [[X(0), base], [X(0), top + 4]], P.mot, 2.4);
      lab(c, k, 'среднее', X(0), top - 4, { px: 10.5, weight: 700, color: P.mot, haloColor: P.surf });
      dot(0, base);
    } else if (p.key === 'mix') {
      for (const m of [-MU, MU]) {
        c.beginPath(); for (let i = 0; i <= 60; i++) { const v = m - 0.5 + i / 60; const y = Y(0.5 * gauss(v, m, SD + 0.01)); i ? c.lineTo(X(v), y) : c.moveTo(X(v), y); }
        c.strokeStyle = P.mot; c.lineWidth = 2; c.stroke();
      }
      const m = hash(n) < 0.5 ? -MU : MU, v = m + (hash(n + 50) - 0.5) * 0.18;
      dot(v, lerp(Y(0.5 * gauss(v, m, SD)), base, ease(seg(ph2, 0, 0.45))), seg(ph2, 0.85, 1) > 0 ? 1 - seg(ph2, 0.85, 1) : 1);
    } else if (p.key === 'bins') {
      const sel = pickBin(hash(n + 7)), bw = (x1 - x0) / NB;
      for (let i = 0; i < NB; i++) {
        const h = BIN[i] / DMAX * (base - top), on = i === sel;
        rect(c, x0 + i * bw + 1, base - h, bw - 2, h, 2, alpha(P.mot, on ? 0.75 : 0.28), alpha(P.mot, on ? 1 : 0.6), on ? 1.6 : 1);
      }
      const v = -1 + BW * (sel + 0.5);
      dot(v, lerp(base - BIN[sel] / DMAX * (base - top), base, ease(seg(ph2, 0, 0.45))), seg(ph2, 0.85, 1) > 0 ? 1 - seg(ph2, 0.85, 1) : 1);
    } else {
      // диффузия: точки шума шаг за шагом сходятся к модам и ложатся на ось
      const cyc = Math.floor(t / T), s = ease(seg(u, 0.5, 3.6)), fade = 1 - seg(u, 4.3, 4.8);
      for (let i = 0; i < NP; i++) {
        const xs = (hash(i + cyc * 31) - 0.5) * 2, ys = top + 6 + hash(i + 90 + cyc * 17) * (base - top - 20);
        const xt = (i % 2 ? MU : -MU) + (hash(i + 200 + cyc) - 0.5) * 0.22;   // половина сэмплов — объезд слева, половина — справа
        circle(c, X(lerp(xs, xt, s)), lerp(ys, base - 5, s), 3.4, alpha(P.mot, 0.85 * fade), null);
      }
      lab(c, k, `шаг ${Math.round(s * 10)} из 10`, x1, top - 4, { px: 9.5, color: P.ink3, align: 'right', halo: false });
    }
    lab(c, k, p.cap, ox + pw / 2, oy + ph - 30, { px: 10.5, weight: 650, color: P.ink2, halo: false });
    lab(c, k, p.sub, ox + pw / 2, oy + ph - 14, { px: 10, weight: p.bad ? 650 : 500, color: p.bad ? P.bad : P.ink3, halo: false });
  }
  function draw(cols) {
    return (c, k, t, P, A) => {
      const pw = 180, ph = 230;
      PANELS.forEach((p, i) => {
        const ox = (i % cols) * pw, oy = Math.floor(i / cols) * ph;
        if (i % cols) A.line(c, [[ox, oy + 30], [ox, oy + ph - 40]], P.grid, 1);
        panel(c, k, t, P, A, ox, oy, pw, ph, p);
      });
    };
  }
  Anim.add('modes4', { W: 720, H: 230, start: 2.4, narrowAt: 600, draw: draw(4), narrow: { W: 360, H: 460, draw: draw(2) } });
})();
