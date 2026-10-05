/* =====================================================================
   proto/actuator/core.js — движок лабы урока 0.2 «Привод: от мотора до модели».
   1) Один сустав: мотор + редуктор N. Момент ×N, скорость ÷N, отражённая
      инерция ×N², трение растёт с N. Удар о стену и «прозрачность».
   2) «Настоящий» привод с внутренним ПД-контуром, задержкой, насыщением,
      трением и люфтом против идеальной модели из симулятора. Модель привода
      по данным: MLP по истории ошибок и скоростей (идея Hwangbo et al. 2019).
   ===================================================================== */
'use strict';
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function randn(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- часть 1: редуктор ---------- */
  const JM = 1.2e-4, TM = 1.6, JL = 0.09, KW = 3e4, BW = 25; // ротор, кг·м²; пик момента мотора, Н·м; звено; стена
  const fric = (N) => ({ c: 0.02 * N, b: 2e-5 * N * N }); // кулоновское и вязкое трение на выходе
  const props = (N) => ({ torque: TM * N, speed: 600 / N, refl: JM * N * N, jeff: JL + JM * N * N, coul: fric(N).c });
  /** Удар: звено разгоняется к стене (угол 0) и бьёт в неё. Возвращает историю момента контакта. */
  function impact(N, v0) {
    const J = JL + JM * N * N, f = fric(N); let th = -0.25, w = 0; const hist = []; let peak = 0;
    for (let t = 0; t < 0.45; t += 0.0002) {
      const tauCmd = clamp(4 * (v0 - w) * J / 0.02, -TM * N, TM * N); // регулятор скорости
      let tauC = 0; if (th > 0) tauC = Math.max(0, KW * th + BW * w);
      const tf = -Math.sign(w) * f.c - f.b * w * 60;
      const a = (tauCmd - tauC + (Math.abs(w) > 1e-4 ? tf : 0)) / J;
      w += a * 0.0002; th += w * 0.0002;
      if ((t * 1e4 | 0) % 10 === 0) hist.push([t, tauC]);
      peak = Math.max(peak, tauC);
    }
    return { hist, peak };
  }
  /** Прозрачность: внешний момент от руки человека, мотор выключен. За 0,5 с — на сколько повернулось звено. */
  function backdrive(N, tauExt) {
    const J = JL + JM * N * N, f = fric(N); let th = 0, w = 0;
    for (let t = 0; t < 0.5; t += 0.0005) {
      let net = tauExt - f.b * w * 60;
      if (Math.abs(w) < 1e-4 && Math.abs(net) <= f.c) { w = 0; continue; }
      net -= Math.sign(w || net) * f.c;
      w += net / J * 0.0005; th += w * 0.0005;
    }
    return th;
  }

  /* ---------- часть 2: «настоящий» привод против идеальной модели ---------- */
  const DT = 0.0025, KP = 40, KD = 0.9, JLINK = 0.04, MGL = 0.9;
  /** Настоящий привод: задержка 7,5 мс, насыщение, кулоновское трение, люфт. */
  function makeReal() {
    const delay = 6, buf = []; let th = 0, w = 0, slack = 0;
    return {
      reset() { th = 0; w = 0; slack = 0; buf.length = 0; },
      get state() { return { th, w }; },
      step(cmd) {
        buf.push(cmd); const c = buf.length > delay ? buf.shift() : 0;
        let tau = clamp(KP * (c - th) - KD * w, -6, 6);
        const gap = 0.02; slack = clamp(slack + (tau > 0 ? 1 : -1) * 0.4 * DT * 60, -gap, gap); if (Math.abs(slack) < gap) tau *= 0.35; // люфт: до выбора зазора момент проходит слабо
        tau -= Math.sign(w) * 0.6 + 0.03 * w;
        const a = (tau - MGL * Math.sin(th)) / JLINK; w += a * DT; th += w * DT;
        return tau;
      },
    };
  }
  /** Модель из симулятора: идеальный ПД без задержки и нелинейностей. tauFn — заменитель (например, сеть). */
  function makeSim(tauFn) {
    let th = 0, w = 0; const hist = [];
    return {
      reset() { th = 0; w = 0; hist.length = 0; },
      get state() { return { th, w }; },
      step(cmd) {
        const e = cmd - th; hist.push([e, w]); if (hist.length > 4) hist.shift();
        const tau = tauFn ? tauFn(hist) : clamp(KP * e - KD * w, -6, 6);
        const a = (tau - MGL * Math.sin(th)) / JLINK; w += a * DT; th += w * DT;
        return tau;
      },
    };
  }
  const cmdSine = (t) => 0.6 * Math.sin(2 * Math.PI * 0.8 * t) + 0.25 * Math.sin(2 * Math.PI * 2.1 * t);
  function track(act, T, cmd) { act.reset(); const out = []; for (let t = 0; t < T; t += DT) { act.step(cmd(t)); if (Math.round(t / DT) % 4 === 0) out.push([t, cmd(t), act.state.th]); } return out; }
  const rmse = (a, b) => Math.sqrt(a.reduce((s, p, i) => s + (p[2] - b[i][2]) ** 2, 0) / a.length);

  /** Данные с настоящего привода: случайные команды → (история ошибок и скоростей → момент). */
  function collect(T, seed) {
    const r = rng(seed || 4), real = makeReal(), X = [], Y = [], hist = [];
    real.reset(); let cmd = 0, target = 0;
    for (let t = 0; t < T; t += DT) {
      if (r() < 0.012) target = (r() * 2 - 1) * 1.0;
      cmd += (target - cmd) * 0.04;
      const s = real.state, e = cmd - s.th; hist.push([e, s.w]); if (hist.length > 4) hist.shift();
      const tau = real.step(cmd);
      if (hist.length === 4) { X.push(feat(hist)); Y.push(tau / 6); }
    }
    return { X, Y };
  }
  function feat(hist) { const f = new Float32Array(8); for (let i = 0; i < 4; i++) { f[2 * i] = hist[i][0] * 2; f[2 * i + 1] = hist[i][1] * 0.15; } return f; }

  /* ---------- MLP 8 → 32 → 32 → 1 ---------- */
  function mlp(seed) {
    const r = rng(seed || 2), sizes = [8, 32, 32, 1], W = [], B = [];
    for (let l = 0; l < 3; l++) { const a = sizes[l], b = sizes[l + 1], w = new Float32Array(a * b), s = Math.sqrt(2 / a); for (let i = 0; i < w.length; i++) w[i] = randn(r) * s; W.push(w); B.push(new Float32Array(b)); }
    return { sizes, W, B, t: 0, mW: W.map((w) => new Float32Array(w.length)), vW: W.map((w) => new Float32Array(w.length)), mB: B.map((b) => new Float32Array(b.length)), vB: B.map((b) => new Float32Array(b.length)) };
  }
  function forward(m, x, acts) {
    let a = x; if (acts) { acts.length = 0; acts.push(x); }
    for (let l = 0; l < 3; l++) { const nI = m.sizes[l], nO = m.sizes[l + 1], w = m.W[l], b = m.B[l], z = new Float32Array(nO); for (let o = 0; o < nO; o++) { let s = b[o]; for (let i = 0; i < nI; i++) s += a[i] * w[i * nO + o]; z[o] = l < 2 ? Math.tanh(s) : s; } a = z; if (acts) acts.push(z); }
    return a[0];
  }
  function* trainGen(m, data, iters) {
    const r = rng(7), N = data.X.length, acts = []; let ema = null;
    for (let it = 0; it < iters; it++) {
      const gW = m.W.map((w) => new Float32Array(w.length)), gB = m.B.map((b) => new Float32Array(b.length)); let loss = 0; const bs = 64;
      for (let k = 0; k < bs; k++) {
        const n = Math.floor(r() * N), y = forward(m, data.X[n], acts), e = y - data.Y[n]; loss += e * e;
        let delta = new Float32Array([2 * e / bs]);
        for (let l = 2; l >= 0; l--) { const nI = m.sizes[l], nO = m.sizes[l + 1], a = acts[l], w = m.W[l]; for (let o = 0; o < nO; o++) { gB[l][o] += delta[o]; for (let i = 0; i < nI; i++) gW[l][i * nO + o] += a[i] * delta[o]; } if (l > 0) { const d2 = new Float32Array(nI); for (let i = 0; i < nI; i++) { let s = 0; for (let o = 0; o < nO; o++) s += w[i * nO + o] * delta[o]; d2[i] = s * (1 - a[i] * a[i]); } delta = d2; } }
      }
      m.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, m.t), c2 = 1 - Math.pow(b2, m.t), lr = it < iters * 0.7 ? 0.004 : 0.0012;
      for (let l = 0; l < 3; l++) for (const [P, G, M, V] of [[m.W[l], gW[l], m.mW[l], m.vW[l]], [m.B[l], gB[l], m.mB[l], m.vB[l]]]) for (let i = 0; i < P.length; i++) { M[i] = b1 * M[i] + (1 - b1) * G[i]; V[i] = b2 * V[i] + (1 - b2) * G[i] * G[i]; P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
      ema = ema == null ? loss / bs : 0.95 * ema + 0.05 * loss / bs;
      if (it % 10 === 0 || it === iters - 1) yield { it, loss: ema };
    }
  }
  const netTau = (m) => (hist) => hist.length < 4 ? clamp(KP * hist[hist.length - 1][0] - KD * hist[hist.length - 1][1], -6, 6) : forward(m, feat(hist)) * 6;

  const API = { rng, props, impact, backdrive, makeReal, makeSim, cmdSine, track, rmse, collect, mlp, trainGen, netTau, DT, fric, JM, JL, TM };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Act = API;
})(typeof window !== 'undefined' ? window : globalThis);
