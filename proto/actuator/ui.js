/* =====================================================================
   proto/actuator/ui.js — прототип лабы урока 0.2:
   1) редуктор: свойства, удар о стену, «поверни рукой»;
   2) разрыв «симулятор — привод» и модель привода по данным.
   ===================================================================== */
'use strict';
(function () {
  const K = HeroKit, A = Act, $ = (s) => document.querySelector(s);
  let P = pal(); K.onTheme(() => { P = pal(); });
  function pal() { return { bg: K.css('--surface-2'), grid: K.css('--line'), ink: K.css('--ink'), ink2: K.css('--ink-2'), ink3: K.css('--ink-3'), e2e: K.css('--e2e'), classic: K.css('--classic'), hybrid: K.css('--hybrid'), good: K.css('--good'), bad: K.css('--critical'), surf: K.css('--surface') }; }
  const nextTick = (() => { const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => { const f = q.shift(); if (f) f(); }; return (f) => { q.push(f); ch.port2.postMessage(0); }; })();
  function runChunked(gen, onEv) { return new Promise((res) => { (function work() { const t0 = performance.now(); while (performance.now() - t0 < 14) { const r = gen.next(); if (r.done) { res(); return; } onEv(r.value); } nextTick(work); })(); }); }
  const fmt = (v, d) => v.toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 1 : d });

  /* =================== Часть 1: редуктор =================== */
  (function () {
    const cv = $('#gearCv'), W = 520, H = 300;
    const st = { N: 6, th: -0.25, w: 0, hit: false, impacts: {}, pull: null, mode: 'idle', t: 0 };
    const Nval = () => Math.round(Math.pow(10, +$('#gearN').value));
    function updateProps() {
      st.N = Nval(); $('#gearN').nextElementSibling.textContent = st.N + ' : 1';
      const p = A.props(st.N);
      $('#pTorque').textContent = fmt(p.torque) + ' Н·м'; $('#pSpeed').textContent = fmt(p.speed, 0) + ' об/мин';
      $('#pRefl').textContent = fmt(p.refl * 1000, 2) + ' г·м²'; $('#pFric').textContent = fmt(p.coul, 2) + ' Н·м';
    }
    function hitWall() { // анимация удара и запись кривой момента
      const im = A.impact(st.N, 3); st.impacts[st.N] = im; st.mode = 'hit'; st.t = 0; st.anim = im.hist;
      const keys = Object.keys(st.impacts).map(Number).sort((a, b) => a - b);
      $('#gearMsg').innerHTML = `Пик момента при ударе: <b>${fmt(im.peak, 0)} Н·м</b>. ` + (keys.length > 1 ? `Сравни: ${keys.map((n) => `${n}:1 — ${fmt(st.impacts[n].peak, 0)}`).join(', ')}. Чем больше передаточное число, тем больше инерция ротора, «пересчитанная» на выход (растёт как N²), и тем сильнее удар.` : 'Поменяй передаточное число и ударь снова.');
    }
    function backdriveStep(dt) {
      if (!st.pull) { st.w *= 0.9; return; }
      const f = A.fric(st.N), J = A.JL + A.JM * st.N * st.N, tauExt = 8 * (st.pull - st.th);
      for (let i = 0; i < 20; i++) {
        let net = tauExt - f.b * st.w * 60;
        if (Math.abs(st.w) < 1e-3 && Math.abs(net) <= f.c) { st.w = 0; continue; }
        net -= Math.sign(st.w || net) * f.c; st.w += net / J * dt / 20; st.th += st.w * dt / 20;
      }
      st.th = Math.min(0, Math.max(-1.4, st.th));
    }
    const PIV = { x: 150, y: 170 }, LEN = 200;
    function draw() {
      const { c, k } = K.fit(cv, W, H);
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 25, P.grid);
      // стена
      const wx = PIV.x + LEN + 6; c.beginPath(); c.rect(wx, 40, 18, 220); c.fillStyle = P.surf; c.fill(); c.beginPath(); c.rect(wx, 40, 18, 220); K.hatch(c, wx, 40, wx + 18, 260, P.ink3, 6, 1); c.strokeStyle = P.ink2; c.lineWidth = 1.5; c.strokeRect(wx, 40, 18, 220);
      K.label(c, k, 'стена', wx + 9, 270, { color: P.ink3, px: 11, haloColor: P.bg });
      // мотор и редуктор
      c.beginPath(); c.arc(PIV.x - 70, PIV.y, 30, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke();
      K.label(c, k, 'мотор', PIV.x - 70, PIV.y + 46, { color: P.ink3, px: 11, haloColor: P.bg });
      const gr = Math.min(34, 10 + Math.log10(st.N) * 12);
      c.beginPath(); c.arc(PIV.x - 70, PIV.y, 8, 0, 7); c.fillStyle = P.ink2; c.fill();
      c.beginPath(); c.moveTo(PIV.x - 62, PIV.y); c.lineTo(PIV.x - gr, PIV.y); c.strokeStyle = P.ink3; c.lineWidth = 3; c.stroke();
      c.beginPath(); c.arc(PIV.x, PIV.y, gr, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink2; c.stroke();
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + st.th * 3; c.beginPath(); c.moveTo(PIV.x + Math.cos(a) * gr, PIV.y + Math.sin(a) * gr); c.lineTo(PIV.x + Math.cos(a) * (gr + 4), PIV.y + Math.sin(a) * (gr + 4)); c.stroke(); }
      K.label(c, k, `редуктор ${st.N}:1`, PIV.x, PIV.y + gr + 18, { color: P.ink2, px: 11, weight: 650, haloColor: P.bg });
      // звено
      let th = st.th;
      if (st.mode === 'hit' && st.anim) { const i = Math.min(st.anim.length - 1, Math.floor(st.t / 0.45 * st.anim.length)); th = Math.min(0.01, -0.25 + (i / st.anim.length) * 0.6); }
      const ex = PIV.x + Math.cos(th) * LEN, ey = PIV.y + Math.sin(th) * LEN;
      c.lineCap = 'round'; c.strokeStyle = P.ink; c.lineWidth = 9; c.beginPath(); c.moveTo(PIV.x, PIV.y); c.lineTo(ex, ey); c.stroke();
      c.beginPath(); c.arc(PIV.x, PIV.y, 7, 0, 7); c.fillStyle = P.surf; c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink; c.stroke();
      c.beginPath(); c.arc(ex, ey, 9, 0, 7); c.fillStyle = P.classic; c.fill();
      if (st.pull != null) { const px = PIV.x + Math.cos(st.pull) * LEN, py = PIV.y + Math.sin(st.pull) * LEN; c.setLineDash([3, 3]); c.strokeStyle = P.hybrid; c.lineWidth = 1.6; c.beginPath(); c.moveTo(ex, ey); c.lineTo(px, py); c.stroke(); c.setLineDash([]); }
      // график удара
      const gx = W - 186, gy = 12, gw = 172, gh = 92, keys = Object.keys(st.impacts).map(Number).sort((a, b) => a - b);
      c.fillStyle = P.surf; c.fillRect(gx, gy, gw, gh); c.strokeStyle = P.grid; c.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
      const mx = Math.max(100, ...keys.map((n) => st.impacts[n].peak)), cols = [P.classic, P.hybrid, P.e2e, P.ink2];
      keys.forEach((n, ki) => {
        const h = st.impacts[n].hist.filter((p) => p[0] > 0.0), t0 = h.findIndex((p) => p[1] > 0); if (t0 < 0) return;
        const seg = h.slice(Math.max(0, t0 - 5), t0 + 60); c.strokeStyle = cols[ki % cols.length]; c.lineWidth = 2; c.beginPath();
        seg.forEach((p, i) => { const x = gx + 6 + i / 65 * (gw - 12), y = gy + gh - 6 - p[1] / mx * (gh - 22); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
        K.label(c, k, `${n}:1`, gx + gw - 8, gy + 22 + ki * 13, { align: 'right', mono: true, px: 10, color: cols[ki % cols.length], halo: false, weight: 700 });
      });
      K.label(c, k, 'момент при ударе', gx + 6, gy + 10, { align: 'left', px: 10.5, color: P.ink3, halo: false });
    }
    K.drag(cv, W, H, {
      hit: (p) => { const ex = PIV.x + Math.cos(st.th) * LEN, ey = PIV.y + Math.sin(st.th) * LEN; return Math.hypot(p.x - ex, p.y - ey) < 30 ? 'link' : null; },
      start: () => { st.mode = 'idle'; },
      move: (o, p) => { st.pull = Math.max(-1.5, Math.min(0, Math.atan2(p.y - PIV.y, p.x - PIV.x))); },
      end: () => { st.pull = null; },
    });
    $('#gearN').addEventListener('input', updateProps);
    $('#gearHit').onclick = hitWall;
    document.querySelectorAll('[data-predg]').forEach((b) => b.addEventListener('click', () => { document.querySelectorAll('[data-predg]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('#gearMsg').textContent = 'Проверь: ударь при 6:1, затем при 100:1 и сравни пики на графике.'; }));
    updateProps();
    K.loop(cv, (dt) => { if (st.mode === 'hit') { st.t += dt; if (st.t > 0.6) { st.mode = 'idle'; st.th = 0; } } else backdriveStep(dt); draw(); });
    window.__gear = st;
  })();

  /* =================== Часть 2: модель привода по данным =================== */
  (function () {
    const cv = $('#actCv'), W = 560, H = 260;
    const st = { real: null, sim: null, net: null, model: null, busy: false, data: null };
    function compute() { st.real = A.track(A.makeReal(), 5, A.cmdSine); st.sim = A.track(A.makeSim(), 5, A.cmdSine); }
    function draw() {
      const { c, k } = K.fit(cv, W, H);
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H); K.grid(c, W, H, 26, P.grid);
      const y = (v) => 96 - v * 62, x = (t) => 14 + t / 5 * (W - 28);
      // нижняя полоса: ошибка моделей относительно настоящего привода
      const ey0 = H - 14, eS = 900; c.fillStyle = P.surf; c.fillRect(0, 168, W, H - 168); c.strokeStyle = P.grid; c.beginPath(); c.moveTo(0, 168.5); c.lineTo(W, 168.5); c.moveTo(0, ey0 + 0.5); c.lineTo(W, ey0 + 0.5); c.stroke();
      K.label(c, k, 'ошибка модели, °', 14 * k, 180, { align: 'left', px: 10.5, color: P.ink3, halo: false });
      if (st.real) { const err = (pts, col) => { c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath(); pts.forEach((p, i) => { const e = Math.abs(p[2] - st.real[i][2]) * 180 / Math.PI, yy = ey0 - Math.min(70, e * 10); i ? c.lineTo(x(p[0]), yy) : c.moveTo(x(p[0]), yy); }); c.stroke(); }; err(st.sim, P.classic); if (st.net) err(st.net, P.e2e); }
      const line = (pts, idx, col, lw, dash) => { c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(x(p[0]), y(p[idx])) : c.moveTo(x(p[0]), y(p[idx])))); c.stroke(); c.setLineDash([]); };
      if (!st.real) return;
      line(st.real, 1, P.ink3, 1.4, [4, 4]);
      line(st.sim, 2, P.classic, 2);
      if (st.net) line(st.net, 2, P.e2e, 2.2);
      line(st.real, 2, P.ink, 2.2);
      const items = [['команда', P.ink3], ['настоящий привод', P.ink], [`модель из симулятора · ошибка ${fmt(A.rmse(st.real, st.sim) * 180 / Math.PI)}°`, P.classic]];
      if (st.net) items.push([`модель, выученная по данным · ошибка ${fmt(A.rmse(st.real, st.net) * 180 / Math.PI)}°`, P.e2e]);
      items.forEach(([t, col], i) => { c.fillStyle = col; c.fillRect(14 * k, (12 + i * 15) * k - 1.5 * k, 16 * k, 3 * k); K.label(c, k, t, 36 * k, (12 + i * 15) * k, { align: 'left', px: 10.5, color: P.ink2, haloColor: P.bg }); });
    }
    async function collectAndTrain() {
      st.busy = true; $('#actTrain').disabled = true;
      $('#actMsg').textContent = 'Гоняем настоящий привод 20 секунд на случайных командах и записываем, какой момент он реально выдаёт…';
      await new Promise((r) => setTimeout(r, 50));
      st.data = A.collect(20, 4); st.model = A.mlp(2);
      $('#actMsg').textContent = `Собрано ${st.data.X.length.toLocaleString('ru-RU')} примеров. Обучаем маленькую сеть: история ошибок и скоростей → момент…`;
      await runChunked(A.trainGen(st.model, st.data, 1500), (e) => { $('#actProg').style.width = (e.it / 1499 * 100) + '%'; });
      st.net = A.track(A.makeSim(A.netTau(st.model)), 5, A.cmdSine);
      $('#actMsg').innerHTML = `Модель привода, выученная по данным, повторяет настоящий привод с ошибкой <b>${fmt(A.rmse(st.real, st.net) * 180 / Math.PI)}°</b> против <b>${fmt(A.rmse(st.real, st.sim) * 180 / Math.PI)}°</b> у идеальной модели. Так в 2019 году ANYmal научили бегать после обучения в симуляторе.`;
      st.busy = false; $('#actTrain').disabled = false;
    }
    compute();
    $('#actTrain').onclick = collectAndTrain;
    K.loop(cv, draw);
    window.__act = st;
  })();
})();
