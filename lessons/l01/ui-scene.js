/* =====================================================================
   ui-scene.js — отрисовка кухонного стола, предметов, руки Ады и её «мыслей».
   Цвета предметов — физические (зависят от освещения сцены), а не от темы.
   ===================================================================== */
'use strict';
const SceneView = (() => {
  const AGENT_COLORS = { classic: '#2a78d6', e2e: '#eb6834', hybrid: '#4a3aa7' };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  function lit(c, L, k) {
    k = k == null ? 1 : k;
    const r = clamp01(c[0] * L.b * L.tint[0] * k), g = clamp01(c[1] * L.b * L.tint[1] * k), b = clamp01(c[2] * L.b * L.tint[2] * k);
    return `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
  }
  function mix(c, d, t) { return [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t]; }
  const WHITE = [1, 1, 1], BLACK = [0, 0, 0];

  function setupCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(10, Math.round(rect.width));
    if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, S: size };
  }

  function drawCounter(ctx, S, L) {
    const base = RC.COLORS.counter;
    ctx.fillStyle = lit(base, L); ctx.fillRect(0, 0, S, S);
    const planks = 6;
    for (let i = 0; i < planks; i++) {
      const y0 = (i * S) / planks;
      ctx.fillStyle = lit(mix(base, i % 2 ? BLACK : WHITE, 0.025), L);
      ctx.fillRect(0, y0, S, S / planks);
      ctx.fillStyle = 'rgba(60,35,10,0.10)'; ctx.fillRect(0, y0, S, 1);
    }
    // волокна дерева (детерминированно)
    ctx.strokeStyle = 'rgba(70,40,15,0.06)'; ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const y = ((i * 37) % 100) / 100 * S;
      ctx.beginPath();
      for (let x = 0; x <= S; x += S / 12) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.2);
      ctx.stroke();
    }
  }

  function shadow(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(45,28,10,0.22)';
    ctx.beginPath(); ctx.ellipse(x + r * 0.14, y + r * 0.2, r * 1.02, r * 0.98, 0, 0, Math.PI * 2); ctx.fill();
  }
  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawObject(ctx, o, S, L, time) {
    const x = o.x * S, y = o.y * S, r = o.r * S, c = o.color;
    switch (o.kind) {
      case 'cup': {
        shadow(ctx, x, y, r);
        // ручка
        ctx.fillStyle = lit(mix(c, BLACK, 0.12), L);
        roundRect(ctx, x + r * 0.7, y - r * 0.24, r * 0.62, r * 0.48, r * 0.2); ctx.fill();
        circle(ctx, x, y, r, lit(c, L));
        circle(ctx, x, y, r * 0.8, lit(mix(c, WHITE, 0.55), L));
        circle(ctx, x, y, r * 0.66, lit([0.42, 0.24, 0.12], L));
        circle(ctx, x - r * 0.18, y - r * 0.2, r * 0.18, 'rgba(255,255,255,0.18)');
        break;
      }
      case 'sugar': {
        shadow(ctx, x, y, r);
        circle(ctx, x, y, r, lit(c, L));
        circle(ctx, x, y, r * 0.72, lit(mix(c, WHITE, 0.18), L));
        circle(ctx, x, y, r * 0.2, lit(mix(c, WHITE, 0.45), L));
        break;
      }
      case 'napkins': {
        shadow(ctx, x, y, r);
        ctx.fillStyle = lit(c, L); roundRect(ctx, x - r * 0.92, y - r * 0.92, r * 1.84, r * 1.84, r * 0.3); ctx.fill();
        ctx.strokeStyle = lit([0.97, 0.97, 0.95], L); ctx.lineWidth = Math.max(1.5, r * 0.12);
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - r * 0.55, y + i * r * 0.36); ctx.lineTo(x + r * 0.55, y + i * r * 0.36); ctx.stroke(); }
        break;
      }
      case 'milk': {
        shadow(ctx, x, y, r);
        ctx.fillStyle = lit(mix(c, BLACK, 0.06), L);
        ctx.beginPath(); ctx.moveTo(x - r * 0.62, y - r * 0.62); ctx.lineTo(x - r * 1.18, y - r * 1.0); ctx.lineTo(x - r * 0.88, y - r * 0.38); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = lit(mix(c, BLACK, 0.18), L); ctx.lineWidth = Math.max(2, r * 0.18);
        ctx.beginPath(); ctx.arc(x + r * 0.95, y, r * 0.35, -1.2, 1.2); ctx.stroke();
        circle(ctx, x, y, r, lit(c, L), lit(mix(c, BLACK, 0.15), L), 1.2);
        circle(ctx, x, y, r * 0.72, lit(mix(c, BLACK, 0.05), L));
        break;
      }
      case 'beans': {
        shadow(ctx, x, y, r);
        circle(ctx, x, y, r, lit(mix(c, BLACK, 0.2), L));
        circle(ctx, x, y, r * 0.84, lit(c, L));
        ctx.fillStyle = lit(mix(c, BLACK, 0.45), L);
        for (let i = 0; i < 11; i++) {
          const a = i * 2.4, rr = r * (0.18 + 0.55 * ((i * 0.37) % 1));
          ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.13, r * 0.085, a, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'kettle': {
        // зона ожога
        const zr = (o.r + RC.GRIP_R) * S;
        const grd = ctx.createRadialGradient(x, y, r * 0.8, x, y, zr);
        grd.addColorStop(0, 'rgba(208,59,59,0.28)'); grd.addColorStop(1, 'rgba(208,59,59,0.0)');
        ctx.fillStyle = grd; circle(ctx, x, y, zr, grd);
        ctx.setLineDash([4, 4]); circle(ctx, x, y, zr, null, 'rgba(208,59,59,0.55)', 1.2); ctx.setLineDash([]);
        shadow(ctx, x, y, r);
        ctx.strokeStyle = lit(mix(c, BLACK, 0.25), L); ctx.lineWidth = Math.max(3, r * 0.2);
        ctx.beginPath(); ctx.arc(x, y, r * 1.05, Math.PI * 0.75, Math.PI * 1.25); ctx.stroke();
        ctx.fillStyle = lit(mix(c, BLACK, 0.1), L);
        ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.2); ctx.lineTo(x + r * 1.35, y - r * 0.05); ctx.lineTo(x + r * 0.7, y + r * 0.2); ctx.closePath(); ctx.fill();
        circle(ctx, x, y, r, lit(c, L));
        circle(ctx, x, y, r * 0.62, lit(mix(c, WHITE, 0.12), L));
        circle(ctx, x, y, r * 0.16, lit(mix(c, WHITE, 0.3), L));
        // пар
        const t = (time || 0) / 900;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.6;
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          for (let i = 0; i <= 10; i++) {
            const yy = y - r * 0.3 - i * r * 0.11, xx = x + r * (k ? 0.18 : -0.18) + Math.sin(i * 0.9 + t * 4 + k) * r * 0.12;
            if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
        break;
      }
      default: circle(ctx, x, y, r, lit(c, L));
    }
  }

  function drawStartMarker(ctx, p, S) {
    const x = p.x * S, y = p.y * S, r = 9;
    ctx.strokeStyle = 'rgba(40,30,20,0.55)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]); circle(ctx, x, y, r + 4, null, 'rgba(40,30,20,0.45)', 1.2); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  }

  function drawGripper(ctx, g, S, color, heading, state) {
    const x = g.x * S, y = g.y * S, r = RC.GRIP_R * S;
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading || 0);
    ctx.fillStyle = 'rgba(20,15,10,0.25)'; ctx.beginPath(); ctx.arc(2, 3, r * 1.15, 0, Math.PI * 2); ctx.fill();
    // рука Ады: тёплый белый корпус запястья, графитовые пальцы, фиолетовая метка
    ctx.fillStyle = '#3d3c38';
    roundRect(ctx, r * 0.15, -r * 1.25, r * 1.05, r * 0.42, r * 0.18); ctx.fill();
    roundRect(ctx, r * 0.15, r * 0.83, r * 1.05, r * 0.42, r * 0.18); ctx.fill();
    circle(ctx, 0, 0, r, '#f4efe6', '#3d3c38', 1.8);
    circle(ctx, 0, 0, r * 0.5, '#e6dccb');
    circle(ctx, 0, 0, r * 0.2, '#4a3aa7');
    ctx.restore();
    circle(ctx, x, y, r + 3.5, null, color, 3);
    if (state === 'collision') { ctx.font = `${Math.round(r * 2.2)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('💥', x, y - r * 1.4); }
  }

  function arrow(ctx, x0, y0, x1, y1, color, w) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 3) return;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w || 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 8 * Math.cos(a - 0.45), y1 - 8 * Math.sin(a - 0.45)); ctx.lineTo(x1 - 8 * Math.cos(a + 0.45), y1 - 8 * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  }
  function cross(ctx, x, y, r, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw || 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
  }
  function label(ctx, text, x, y, color) {
    ctx.font = '600 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 8;
    const S = ctx.canvas.width / (ctx.getTransform().a || 1);
    x = Math.max(w / 2 + 3, Math.min(S - w / 2 - 3, x));
    y = Math.max(11, Math.min(S - 11, y));
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; roundRect(ctx, x - w / 2, y - 8, w, 16, 5); ctx.fill();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  /** «Мысли» робота поверх сцены. */
  function drawThoughts(ctx, S, kind, agent, g) {
    const v = agent.view || {};
    const cell = S / RC.W;
    const color = AGENT_COLORS[kind];
    if (kind === 'classic' || kind === 'hybrid') {
      // карта запретных клеток планировщика
      const pl = agent.planner;
      if (pl && pl.obstacles && pl.obstacles.length) {
        const G = 40, cs = S / G;
        ctx.fillStyle = 'rgba(208,59,59,0.13)';
        for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) if (pl.blocked[i * G + j]) ctx.fillRect(j * cs, i * cs, cs + 0.5, cs + 0.5);
      }
      const per = v.per;
      if (per) {
        ctx.lineWidth = 1.5;
        for (let p = 0; p < RC.P; p++) {
          const i = (p / RC.W) | 0, j = p % RC.W;
          if (kind === 'classic' && per.cupMask[p]) { ctx.fillStyle = 'rgba(42,120,214,0.18)'; ctx.fillRect(j * cell, i * cell, cell, cell); ctx.strokeStyle = 'rgba(42,120,214,0.9)'; ctx.strokeRect(j * cell + 0.75, i * cell + 0.75, cell - 1.5, cell - 1.5); }
          if (per.obsMask[p]) { ctx.strokeStyle = 'rgba(208,59,59,0.85)'; ctx.strokeRect(j * cell + 0.75, i * cell + 0.75, cell - 1.5, cell - 1.5); }
        }
      }
      if (v.path && v.path.length > 1) {
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
        ctx.beginPath(); v.path.forEach((p, i) => (i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S))); ctx.stroke();
        ctx.globalAlpha = 1;
        v.path.slice(1, -1).forEach((p) => circle(ctx, p.x * S, p.y * S, 3.5, color, '#fff', 1.5));
      }
      if (kind === 'hybrid' && v.nnFeat) {
        const kp = v.nnFeat.kp;
        cross(ctx, kp[0] * S, kp[1] * S, 6, AGENT_COLORS.e2e, 2.6);
        label(ctx, 'нейросеть: чашка здесь', kp[0] * S, kp[1] * S - 16, '#b4461d');
      }
      if (v.kf) {
        const x = v.kf.x * S, y = v.kf.y * S, rr = Math.max(5, 2 * v.kf.s * S);
        circle(ctx, x, y, rr, kind === 'classic' ? 'rgba(42,120,214,0.12)' : 'rgba(74,58,167,0.12)', color, 1.8);
        ctx.strokeStyle = color; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x - rr - 4, y); ctx.lineTo(x + rr + 4, y); ctx.moveTo(x, y - rr - 4); ctx.lineTo(x, y + rr + 4); ctx.stroke();
        if (kind === 'classic') label(ctx, 'оценка: чашка', x, y + rr + 14, '#1c5cab');
      }
      if (v.safetyStop) { ctx.setLineDash([4, 3]); circle(ctx, g.x * S, g.y * S, RC.GRIP_R * S + 10, null, '#d03b3b', 2.2); ctx.setLineDash([]); }
    }
    if (kind === 'e2e' && v.nnFeat) {
      const kp = v.nnFeat.kp, K = kp.length / 2;
      for (let k = 0; k < K; k++) {
        const x = kp[2 * k] * S, y = kp[2 * k + 1] * S;
        circle(ctx, x, y, 8, 'rgba(235,104,52,0.16)', 'rgba(235,104,52,0.9)', 1.5);
        circle(ctx, x, y, 2.5, '#eb6834');
        label(ctx, 'т' + (k + 1), x + 15, y - 10, '#b4461d');
      }
    }
    if (v.v && g) {
      const k = 9 / RC.VMAX * 0.05;
      arrow(ctx, g.x * S, g.y * S, (g.x + v.v.x * k) * S, (g.y + v.v.y * k) * S, color, 2.5);
    }
  }

  /** Полная отрисовка панели. */
  function render(canvas, scene, opts) {
    opts = opts || {};
    const { ctx, S } = setupCanvas(canvas);
    const L = scene.light;
    drawCounter(ctx, S, L);
    const objs = scene.objects.slice().sort((a, b) => RC.DRAW_RANK[a.kind] - RC.DRAW_RANK[b.kind]);
    drawStartMarker(ctx, scene.start, S);
    for (const o of objs) drawObject(ctx, o, S, L, opts.time);
    const ep = opts.episode;
    if (opts.demoPath) {
      ctx.strokeStyle = opts.color || '#eb6834'; ctx.lineWidth = Math.max(1.5, S / 90); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); opts.demoPath.forEach((p, i) => (i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S))); ctx.stroke();
      const e = opts.demoPath[0];
      circle(ctx, e.x * S, e.y * S, Math.max(2.5, S / 50), '#fff', opts.color || '#eb6834', 1.5);
    }
    if (ep) {
      const color = AGENT_COLORS[opts.kind];
      if (ep.traj.length > 1) {
        ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ep.traj.forEach((p, i) => (i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S))); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (opts.thoughts && ep.t > 0) drawThoughts(ctx, S, opts.kind, ep.agent, ep.g);
      let heading = 0;
      const n = ep.traj.length;
      if (n > 2) { const a = ep.traj[Math.max(0, n - 4)], b = ep.traj[n - 1]; if (RC.dist(a, b) > 1e-4) heading = Math.atan2(b.y - a.y, b.x - a.x); }
      drawGripper(ctx, ep.g, S, color, heading, ep.outcome);
    } else if (opts.showGripper !== false && !opts.demoPath) {
      drawGripper(ctx, scene.start, S, AGENT_COLORS[opts.kind] || '#666', 0);
    }
    return S;
  }

  /** Изображение камеры 16×16 крупными пикселями (+ маски правила). */
  function renderCamera(canvas, img, opts) {
    opts = opts || {};
    const W = RC.W, cell = 14, size = W * cell;
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const ctx = canvas.getContext('2d');
    for (let p = 0; p < RC.P; p++) {
      const i = (p / W) | 0, j = p % W;
      ctx.fillStyle = `rgb(${(img[3 * p] * 255) | 0},${(img[3 * p + 1] * 255) | 0},${(img[3 * p + 2] * 255) | 0})`;
      ctx.fillRect(j * cell, i * cell, cell, cell);
    }
    if (opts.per) {
      ctx.lineWidth = 2;
      for (let p = 0; p < RC.P; p++) {
        const i = (p / W) | 0, j = p % W;
        if (opts.per.cupMask[p]) { ctx.strokeStyle = '#2a78d6'; ctx.fillStyle = 'rgba(42,120,214,0.35)'; ctx.fillRect(j * cell, i * cell, cell, cell); ctx.strokeRect(j * cell + 1, i * cell + 1, cell - 2, cell - 2); }
        else if (opts.per.obsMask[p]) { ctx.strokeStyle = '#d03b3b'; ctx.strokeRect(j * cell + 1, i * cell + 1, cell - 2, cell - 2); }
        else { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(j * cell, i * cell, cell, cell); }
      }
    }
  }

  /** Карта внимания канала k (spatial softmax) — последовательная оранжевая шкала. */
  function renderAttention(canvas, S, k) {
    const W = RC.W, cell = 6, size = W * cell;
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const ctx = canvas.getContext('2d');
    // абсолютная шкала: равномерное внимание (1/256 на пиксель) почти белое,
    // 12% веса и больше в одном пикселе — максимально тёмное
    const lo = [253, 240, 232], hi = [140, 46, 10];
    for (let p = 0; p < RC.P; p++) {
      const i = (p / W) | 0, j = p % W;
      const t = Math.sqrt(Math.min(1, S[k * RC.P + p] / 0.12));
      ctx.fillStyle = `rgb(${lo[0] + (hi[0] - lo[0]) * t | 0},${lo[1] + (hi[1] - lo[1]) * t | 0},${lo[2] + (hi[2] - lo[2]) * t | 0})`;
      ctx.fillRect(j * cell, i * cell, cell, cell);
    }
  }

  /** Поиск предмета под курсором (координаты сцены). */
  function hitTest(scene, pt) {
    let best = null, bd = 1e9;
    for (const o of scene.objects) { const d = RC.dist(o, pt); if (d < o.r * 1.25 && d < bd) { bd = d; best = o; } }
    if (best) return best;
    if (RC.dist(scene.start, pt) < 0.05) return 'start';
    return null;
  }

  return { render, renderCamera, renderAttention, hitTest, AGENT_COLORS, setupCanvas };
})();
