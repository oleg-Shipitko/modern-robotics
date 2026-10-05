/* =====================================================================
   ui-lab2.js — Лаборатория 2 «Почини робота: правила против данных».
   Здесь же — обучение моделей по умолчанию при загрузке страницы.
   ===================================================================== */
'use strict';
const Lab2 = (() => {
  const NS = [5, 10, 25, 50, 100, 200, 500, 1000];
  const CONDS = ['normal', 'evening', 'kettle', 'teal', 'evekettle'];
  const COND_NAMES = { normal: 'Обычные сцены', evening: '🌆 Вечерний свет', kettle: '🫖 Чайник на пути', teal: '🩵 Бирюзовая чашка', evekettle: '🌆+🫖 Вечер и чайник' };
  const SEED = 7;
  const N_TEST = 40;
  let busy = false;
  let points = [];          // {N, light, res: {cond: {e2e, hybrid}}}
  const modelCache = {};    // key N|light → {policy, percept, data}
  let classicRes = null, classicKey = null;
  let lossHist = { train: [], val: [], restarts: 0 };
  let scaleCond = 'normal';
  let lastRes = null;

  const keyOf = (N, light) => N + '|' + (light ? 1 : 0);
  const sliderN = () => NS[+$('#demoRange').value];

  /* ---------- Правила ---------- */
  function rulesLines() {
    const R = RC.RULES_TEXT, lines = [];
    const add = (arr, isAdd) => arr.forEach((t) => lines.push({ t, add: isAdd }));
    if (App.rules.wb) { add(R.wb, true); lines.push({ t: '', add: true }); }
    lines.push({ t: R.base[0], add: false });
    lines.push({ t: (App.rules.wb ? '    r, g, b = normalize(img)[pixel]' : null), add: true });
    lines.push({ t: R.base[1], add: false });
    if (App.rules.teal) add(R.teal, true);
    lines.push({ t: '', add: false });
    add(R.obstacle, false);
    if (App.rules.mem) add(R.mem, true);
    return lines.filter((l) => l.t !== null);
  }
  function renderRules() {
    const pre = $('#rulesCode');
    pre.innerHTML = '';
    let n = 0;
    rulesLines().forEach((l) => {
      const html = escapeHtml(l.t).replace(/(#.*)$/, '<span class="cm">$1</span>');
      pre.append(h('span', { class: 'ln' + (l.add ? ' add' : ''), html: html || '&nbsp;' }));
      if (l.t.trim()) n++;
    });
    $('#ruleLines').textContent = String(n);
    const cr = classicResults();
    const mini = $('#classicMini');
    mini.innerHTML = '';
    mini.append(h('div', { class: 'hd' }, 'КЛАССИКА С ЭТИМИ ПРАВИЛАМИ, 40 СЦЕН'));
    CONDS.forEach((c) => {
      const v = cr[c].success / cr[c].n;
      mini.append(h('span', { class: 't' }, COND_NAMES[c]), h('span', { class: 'v' }, `${v >= 0.9 ? '✅' : v >= 0.5 ? '⚠️' : '❌'} ${fmtPct(v)}`));
    });
    const fixed = (App.rules.wb ? 1 : 0) + (App.rules.teal ? 1 : 0) + (App.rules.mem ? 1 : 0);
    $('#ruleHours').textContent = fixed + ' из ∞';
    // правила мешают друг другу: баланс белого усиливает шум и ломает детектор препятствий
    $('#ruleMemWrap').hidden = !App.rules.wb;
    const ek = classicResults().evekettle;
    const warn = $('#ruleWarn');
    if (App.rules.wb && !App.rules.mem && ek.collision > 0) {
      warn.hidden = false; warn.className = 'callout mt-0'; $('#ruleWarnIco').textContent = '⚠️';
      $('#ruleWarnText').innerHTML = `<p><strong>Исправление сломало другое правило.</strong> Баланс белого усиливает каналы в 1,6–2,4 раза — а вместе с ними и шум камеры. Правило препятствий («тёмное и серое») стало иногда не видеть чайник, и вечером классика врезалась в него в ${ek.collision} ${plural(ek.collision, 'сцене', 'сценах', 'сценах')} из ${ek.n}. Гарантии классики верны, пока верно восприятие. Попробуй ещё одно правило выше.</p>`;
    } else if (App.rules.wb && App.rules.mem) {
      warn.hidden = false; warn.className = 'callout insight mt-0'; $('#ruleWarnIco').textContent = '✅';
      $('#ruleWarnText').innerHTML = '<p><strong>Память препятствий убрала мигание детектора.</strong> Каждое исправление закрыло известный случай и тянуло за собой следующее. Сколько таких случаев впереди, заранее не знает никто — это и есть длинный хвост.</p>';
    } else warn.hidden = true;
  }
  function classicResults() {
    const key = JSON.stringify(App.rules);
    if (classicKey === key && classicRes) return classicRes;
    classicRes = {};
    for (const c of CONDS) classicRes[c] = RC.evaluate(new RC.ClassicalAgent({ ...App.rules }), RC.testScenes(c, N_TEST), 0.02);
    classicKey = key;
    return classicRes;
  }

  /* ---------- Данные ---------- */
  function renderCost() {
    const N = sliderN();
    $('#demoOut').textContent = fmtInt(N);
    const sec = N * 30, hrs = Math.floor(sec / 3600), min = Math.round((sec % 3600) / 60);
    const t = hrs ? `${hrs} ч ${min ? min + ' мин' : ''}` : `${min} мин`;
    $('#demoCost').textContent = `≈ ${t} телеоперации, если одна демонстрация занимает 30 секунд вместе с расстановкой сцены`;
    setRangeFill($('#demoRange'));
  }
  function renderThumbs(data) {
    const box = $('#thumbs');
    box.innerHTML = '';
    data.scenes.slice(0, 6).forEach((sc) => {
      const c = h('canvas', { 'aria-hidden': 'true' });
      box.append(c);
      requestAnimationFrame(() => SceneView.render(c, sc.scene, { demoPath: sc.states.map((s) => s.g), color: '#eb6834', showGripper: false }));
    });
  }

  /* ---------- Обучение ---------- */
  function setStatus(html, spin) {
    $('#trainStatus').innerHTML = (spin ? '<span class="spinner"></span>' : '') + `<span>${html}</span>`;
  }
  function setBusy(b) {
    busy = b;
    $('#trainBtn').disabled = b; $('#curveBtn').disabled = b;
    $('#demoRange').disabled = b; $('#lightChk').disabled = b;
  }

  async function trainOne(N, light, opts) {
    opts = opts || {};
    lossHist = { train: [], val: [], restarts: 0 };
    let result = null;
    const prefix = opts.prefix || '';
    await runChunked(RC.trainModelsGen(N, light, SEED), (ev) => {
      if (ev.phase === 'data') { if (!opts.quiet) renderThumbs(ev.data); }
      else if (ev.phase === 'policy') {
        if (ev.restart) { lossHist = { train: [], val: [], restarts: lossHist.restarts + 1 }; return; }
        lossHist.train.push([ev.it, ev.train]);
        if (ev.valFresh) lossHist.val.push([ev.it, ev.val]);
        if (ev.it % 30 === 0 || ev.it === ev.iters) {
          drawLoss();
          const pct = Math.round((ev.it / ev.iters) * 70);
          setStatus(`${prefix}End-to-end политика: итерация ${ev.it} из ${ev.iters}${lossHist.restarts ? ' · был перезапуск из-за неудачной инициализации' : ''}`, true);
          App.emit('training', `Обучаю нейросеть на ${N} ${plural(N, 'демонстрации', 'демонстрациях', 'демонстрациях')}… ${pct}%`);
        }
      } else if (ev.phase === 'percept') {
        if (ev.it % 40 === 0 || ev.it === ev.iters) {
          setStatus(`${prefix}Восприятие гибрида: итерация ${ev.it} из ${ev.iters}`, true);
          App.emit('training', `Обучаю нейросеть… ${70 + Math.round((ev.it / ev.iters) * 30)}%`);
        }
      } else if (ev.phase === 'done') result = ev;
    }, 24);
    drawLoss();
    modelCache[keyOf(N, light)] = { policy: result.policy, percept: result.percept, data: result.data };
    return result;
  }

  function setModels(N, light) {
    const m = modelCache[keyOf(N, light)];
    App.models = { policy: m.policy, percept: m.percept, N, light, data: m.data, ready: true };
    App.emit('models');
  }

  async function evaluateModels(policy, percept, prefix) {
    const res = {};
    const gen = (function* () {
      for (const c of CONDS) {
        res[c] = {};
        const scenes = RC.testScenes(c, N_TEST);
        for (const a of ['e2e', 'hybrid']) {
          const r = { success: 0, collision: 0, explicit: 0, silent: 0, n: scenes.length };
          for (let i = 0; i < scenes.length; i++) {
            const agent = a === 'e2e' ? new RC.E2EAgent(policy) : new RC.HybridAgent(percept);
            const ep = new RC.Episode(scenes[i], agent, { noise: 0.02, seed: 1000 + i }).run();
            r[ep.outcome]++;
            yield { c, a, i };
          }
          res[c][a] = r;
        }
      }
    })();
    let k = 0;
    await runChunked(gen, () => { if (++k % 20 === 0) setStatus(`${prefix || ''}Проверяю на новых сценах: ${k} из ${CONDS.length * 2 * N_TEST}`, true); }, 20);
    return res;
  }

  function addPoint(N, light, res) {
    points = points.filter((p) => !(p.N === N && p.light === light));
    points.push({ N, light, res });
  }

  async function trainAndEval(N, light, opts) {
    opts = opts || {};
    const r = await trainOne(N, light, opts);
    if (opts.setModels !== false) setModels(N, light);
    const res = await evaluateModels(r.policy, r.percept, opts.prefix);
    addPoint(N, light, res);
    lastRes = { N, light, res, loss: lossHist };
    renderResults(); renderScale();
    return res;
  }

  async function onTrain() {
    if (busy) return;
    setBusy(true);
    const N = sliderN(), light = $('#lightChk').checked;
    await trainAndEval(N, light);
    setStatus(`Готово: обучено на ${N} ${plural(N, 'демонстрации', 'демонстрациях', 'демонстрациях')}${light ? '' : ' без разнообразия освещения'}. Роботы в лаборатории 1 уже используют новые сети.`);
    showInsight();
    setBusy(false);
  }

  async function onCurve() {
    if (busy) return;
    setBusy(true);
    const light = $('#lightChk').checked;
    for (let i = 0; i < NS.length; i++) {
      const N = NS[i];
      await trainAndEval(N, light, { quiet: true, setModels: false, prefix: `Кривая ${i + 1}/${NS.length}, N = ${N}. ` });
    }
    const N = sliderN();
    if (!modelCache[keyOf(N, light)]) await trainOne(N, light, { quiet: true });
    setModels(N, light);
    const cached = modelCache[keyOf(N, light)];
    renderThumbs(cached.data);
    setStatus(`Кривая построена${light ? '' : ' (без разнообразия освещения)'}. В лаборатории 1 — сети на ${N} ${plural(N, 'демонстрации', 'демонстрациях', 'демонстрациях')}.`);
    showInsight(true);
    setBusy(false);
  }

  /* ---------- Подсказки-выводы ---------- */
  function showInsight(curve) {
    const box = $('#lab2Insight'), txt = $('#lab2InsightText');
    const L = lastRes;
    if (!L) return;
    const tr = L.loss.train.length ? L.loss.train[L.loss.train.length - 1][1] : null;
    const va = L.loss.val.length ? L.loss.val[L.loss.val.length - 1][1] : null;
    let html;
    if (curve) {
      html = '<p><strong>Кривая масштабирования.</strong> Гибриду хватает 5–10 демонстраций, end-to-end нужно в десятки раз больше: его сеть учит всё поведение, а не только «где чашка». Переключай условия проверки над графиком: «вечер» держится, только если освещение было разнообразным; «чайник» и «бирюзовая чашка» не чинятся никаким количеством этих данных.</p>';
    } else if (L.N <= 10 && tr != null && va != null && va > 1.8 * tr) {
      html = `<p><strong>Переобучение.</strong> Ошибка на обучающих сценах — ${tr.toFixed(3)}, на новых — ${va.toFixed(3)}. Сеть выучила ${L.N} ${plural(L.N, 'демонстрацию', 'демонстрации', 'демонстраций')} наизусть, но не научилась обобщать. Добавь данных и сравни кривые.</p>`;
    } else if (!L.light) {
      html = '<p><strong>Проверь вечер.</strong> Переключи график на «Вечер»: без разнообразия освещения нейросети ломаются так же, как дневное правило классики. Больше данных одного вида не помогает — нужно <em>покрытие</em> ситуаций.</p>';
    } else if (L.N >= 100) {
      html = '<p><strong>Данные покрыли свет, но не всё.</strong> Нейросети уверенно справляются с вечером, но не с чайником и не с бирюзовой чашкой: таких сцен в демонстрациях нет. Классика объезжает чайник без единой демонстрации — зато каждую новую разновидность чашки ей приходится объяснять правилом.</p>';
    } else {
      html = '<p><strong>Сравни две нейросети.</strong> Гибриду хватает горстки демонстраций, а end-to-end на том же объёме ещё ошибается. Попробуй построить кривую целиком.</p>';
    }
    txt.innerHTML = html;
    box.hidden = false;
  }

  /* ---------- График ошибки обучения ---------- */
  function drawLoss() {
    const svg = $('#lossChart');
    Chart.clear(svg);
    const W = Chart.width(svg, 280, 520), narrow = W < 420;
    svg.setAttribute('viewBox', `0 0 ${W} 170`);
    const box = { l: 46, r: W - 15, t: 22, b: 140 };
    const x = Chart.scaleLinear(0, RC.TRAIN_CFG.policy.iters, box.l, box.r);
    const y = Chart.scaleLog(0.001, 1, box.b, box.t);
    Chart.frame(svg, box, x, y,
      [0, 250, 500, 750, 1000].map((v) => ({ v, label: String(v) })),
      [0.001, 0.01, 0.1, 1].map((v) => ({ v, label: String(v).replace('.', ',') })),
      { xTitle: 'итерация обучения end-to-end политики', yTitle: narrow ? null : 'ошибка (лог. шкала)' });
    const clampY = (v) => Math.max(0.001, Math.min(1, v));
    const series = [
      { pts: lossHist.train, color: cssVar('--e2e'), name: 'на обучающих сценах' },
      { pts: lossHist.val, color: cssVar('--muted'), name: 'на новых сценах' },
    ];
    series.forEach((sr) => {
      if (sr.pts.length < 2) return;
      svg.append(s('path', { d: Chart.path(sr.pts.map((p) => [p[0], clampY(p[1])]), x, y), fill: 'none', stroke: sr.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const last = sr.pts[sr.pts.length - 1];
      svg.append(s('circle', { cx: x(last[0]), cy: y(clampY(last[1])), r: 4, fill: sr.color, stroke: cssVar('--surface'), 'stroke-width': 2 }));
    });
    // легенда справа сверху
    let lx = box.r;
    series.slice().reverse().forEach((sr) => {
      const t = s('text', { x: lx, y: 12, class: 'lbl', 'text-anchor': 'end' }, sr.name);
      svg.append(t);
      const w = sr.name.length * 6.9;
      svg.append(s('line', { x1: lx - w - 22, x2: lx - w - 6, y1: 8, y2: 8, stroke: sr.color, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      lx -= w + 40;
    });
    if (!lossHist.train.length) svg.append(s('text', { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2, 'text-anchor': 'middle', class: 'ttl' }, 'Здесь появится кривая ошибки во время обучения'));
  }

  /* ---------- Кривая масштабирования ---------- */
  function seriesDefs() {
    const defs = [];
    for (const a of ['e2e', 'hybrid']) for (const light of [true, false]) {
      const pts = points.filter((p) => p.light === light).sort((p, q) => p.N - q.N).map((p) => ({ N: p.N, v: p.res[scaleCond][a].success / p.res[scaleCond][a].n, r: p.res[scaleCond][a] }));
      if (pts.length) defs.push({ a, light, pts, name: `${a === 'e2e' ? 'End-to-end' : 'Гибрид'} · ${light ? 'разный свет' : 'только день'}` });
    }
    return defs;
  }
  function renderScale() {
    const svg = $('#scaleChart');
    Chart.clear(svg);
    const W = Chart.width(svg, 300, 900), narrow = W < 620;
    const H = narrow ? 300 : 330;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const box = { l: 48, r: W - (narrow ? 16 : 140), t: 24, b: H - 50 };
    const x = Chart.scaleLog(4, 1250, box.l, box.r);
    const y = Chart.scaleLinear(0, 1, box.b, box.t);
    Chart.frame(svg, box, x, y, (narrow ? [5, 25, 100, 500] : NS).map((v) => ({ v, label: String(v) })), [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, label: fmtPct(v) })),
      { xTitle: narrow ? 'демонстраций (лог. шкала)' : 'число демонстраций (логарифмическая шкала)', yTitle: 'доля успешных сцен' });
    const cr = classicResults()[scaleCond];
    const cv = cr.success / cr.n;
    const ccol = cssVar('--classic');
    svg.append(s('line', { x1: box.l, x2: box.r, y1: y(cv), y2: y(cv), stroke: ccol, 'stroke-width': 2 }));
    if (narrow) svg.append(s('text', { x: box.r, y: cv > 0.85 ? y(cv) + 16 : y(cv) - 7, 'text-anchor': 'end', class: 'lbl' }, `Правила ${fmtPct(cv)}`));
    else svg.append(s('text', { x: box.r + 8, y: y(cv) + 4, class: 'lbl' }, `Правила ${fmtPct(cv)}`));
    const defs = seriesDefs();
    const surf = cssVar('--surface');
    defs.forEach((d) => {
      const col = cssVar(d.a === 'e2e' ? '--e2e' : '--hybrid');
      if (d.pts.length > 1) svg.append(s('path', { d: Chart.path(d.pts.map((p) => [p.N, p.v]), x, y), fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-opacity': d.light ? 1 : 0.55, 'stroke-linejoin': 'round' }));
      d.pts.forEach((p) => {
        const cx = x(p.N), cy = y(p.v);
        svg.append(s('circle', { cx, cy, r: 5, fill: d.light ? col : surf, stroke: d.light ? surf : col, 'stroke-width': d.light ? 2 : 2.5 }));
        const hit = s('circle', { cx, cy, r: 13, fill: 'transparent', tabindex: 0, role: 'img', 'aria-label': `${d.name}, ${p.N} демонстраций: ${fmtPct(p.v)}` });
        const tip = (e) => {
          const r = p.r;
          Tip.show(`<b>${fmtPct(p.v)}</b> успешных сцен<br><span class="key" style="background:${col}"></span>${escapeHtml(d.name)}<br>${p.N} ${plural(p.N, 'демонстрация', 'демонстрации', 'демонстраций')} · ${COND_NAMES[scaleCond]}<br>💥 ${r.collision} · 🤫 ${r.silent}`, e.clientX, e.clientY);
        };
        hit.addEventListener('pointermove', tip);
        hit.addEventListener('focus', () => { const b = hit.getBoundingClientRect(); tip({ clientX: b.right, clientY: b.top }); });
        hit.addEventListener('pointerleave', () => Tip.hide()); hit.addEventListener('blur', () => Tip.hide());
        svg.append(hit);
      });
    });
    if (!defs.length) svg.append(s('text', { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2, 'text-anchor': 'middle', class: 'ttl' }, 'Обучи сети, чтобы появились точки'));
    // легенда
    const lg = $('#scaleLegend');
    lg.innerHTML = '';
    lg.append(h('span', null, h('i', { class: 'line', style: `background:${ccol}` }), 'Правила (данные не нужны)'));
    defs.forEach((d) => {
      const col = d.a === 'e2e' ? 'var(--e2e)' : 'var(--hybrid)';
      lg.append(h('span', null, h('i', { style: d.light ? `background:${col};border-radius:50%` : `border:2.5px solid ${col};border-radius:50%;width:12px;height:12px;box-sizing:border-box` }), d.name));
    });
    renderScaleTable(defs, cv);
  }
  function renderScaleTable(defs, cv) {
    const box = $('#scaleTable');
    const Ns = Array.from(new Set(points.map((p) => p.N))).sort((a, b) => a - b);
    const t = h('table', { class: 'res-table' });
    t.append(h('tr', null, h('th', null, 'Демонстраций'), ...defs.map((d) => h('th', null, d.name)), h('th', null, 'Правила')));
    Ns.forEach((N) => {
      t.append(h('tr', null, h('td', { class: 'num' }, String(N)), ...defs.map((d) => { const p = d.pts.find((q) => q.N === N); return h('td', { class: 'num' }, p ? fmtPct(p.v) : '—'); }), h('td', { class: 'num' }, fmtPct(cv))));
    });
    box.innerHTML = ''; box.append(t);
  }

  /* ---------- Таблица результатов последней модели ---------- */
  function renderResults() {
    const t = $('#resTable');
    t.innerHTML = '';
    const cr = classicResults();
    const L = lastRes;
    const head = h('tr', null, h('th', null, 'Условия'), h('th', null, h('span', { class: 'chip classic' }, 'Правила')), h('th', null, h('span', { class: 'chip e2e' }, 'End-to-end')), h('th', null, h('span', { class: 'chip hybrid' }, 'Гибрид')));
    t.append(head);
    const cell = (r) => {
      if (!r) return h('td', { class: 'num' }, '—');
      const v = r.success / r.n;
      const ico = v >= 0.9 ? '✅' : v >= 0.5 ? '⚠️' : '❌';
      return h('td', { class: 'num' }, `${ico} ${fmtPct(v)}`);
    };
    CONDS.forEach((c) => t.append(h('tr', null, h('td', null, COND_NAMES[c]), cell(cr[c]), cell(L && L.res[c].e2e), cell(L && L.res[c].hybrid))));
    $('#resNote').textContent = L ? `Доля сцен из ${N_TEST}, где Ада дошла до чашки. Нейросети обучены на ${L.N} ${plural(L.N, 'демонстрации', 'демонстрациях', 'демонстрациях')}${L.light ? ' с разным освещением' : ' только при дневном свете'}.` : 'Доля сцен, где Ада дошла до чашки.';
  }

  /* ---------- Инициализация ---------- */
  function init() {
    renderRules(); renderCost(); drawLoss();
    $('#demoRange').addEventListener('input', renderCost);
    $('#trainBtn').addEventListener('click', onTrain);
    $('#curveBtn').addEventListener('click', onCurve);
    const onRule = () => {
      App.rules = { wb: $('#ruleWb').checked, teal: $('#ruleTeal').checked, mem: $('#ruleWb').checked && $('#ruleMem').checked };
      renderRules(); renderResults(); renderScale();
      App.emit('rules');
    };
    $('#ruleWb').addEventListener('change', onRule);
    $('#ruleTeal').addEventListener('change', onRule);
    $('#ruleMem').addEventListener('change', onRule);
    $$('#scaleCond button').forEach((b) => b.addEventListener('click', () => {
      scaleCond = b.dataset.c;
      $$('#scaleCond button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      renderScale();
    }));
    $('#scaleTableBtn').addEventListener('click', () => {
      const t = $('#scaleTable'); t.hidden = !t.hidden;
      $('#scaleTableBtn').textContent = t.hidden ? 'Таблица' : 'Скрыть таблицу';
    });
    App.on('theme', () => { drawLoss(); renderScale(); });
    App.on('resize', () => { drawLoss(); renderScale(); });
    renderResults(); renderScale();
  }

  /** Обучение моделей по умолчанию при загрузке страницы. */
  async function bootstrap() {
    setBusy(true);
    setStatus('Обучаю нейросети по умолчанию: 200 демонстраций, разное освещение…', true);
    const res = await trainAndEval(200, true, { prefix: 'Первый запуск. ' });
    setStatus('Нейросети по умолчанию обучены на 200 демонстрациях. Измени данные и обучи заново.');
    setBusy(false);
    return res;
  }
  return { init, bootstrap };
})();
