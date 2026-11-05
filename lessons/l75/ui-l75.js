/* Урок 7.5: схема, две лаборатории, диаграммы и квиз. */
'use strict';
(() => {
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)], L = window.L75;
  if (!L) return;
  const fmt = (x, d) => Number(x).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 0) => `${fmt(100 * x, d)}%`;
  function setSeg(id, value) { $$(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value)))); }

  function architecture() {
    const exam = L.exam({ rollouts: 0, failures: false, judge: 'strict' });
    const row = exam.rows.find((r) => r.id === 'A'), start = L.LAB_STARTS[0];
    const imaginedRun = L.L71.imagineCtl(L.MODELS.demo, row.theta, start, L.L71.LAYOUTS.base, { tau: 0, seed: 75, path: true });
    const realRun = row.real.runs[0];
    const cupPath = (path) => { const out = []; for (let i = 0; i < path.length; i += 4) out.push(path[i], path[i + 1]); return out; };
    const imagined = cupPath(imaginedRun.path), real = cupPath(realRun.path);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function point(path, q) {
      const n = Math.max(1, path.length / 2), x = clamp(q, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(x)), u = x - i;
      if (n === 1) return [path[0], path[1]];
      return [path[i * 2] + (path[(i + 1) * 2] - path[i * 2]) * u, path[i * 2 + 1] + (path[(i + 1) * 2 + 1] - path[i * 2 + 1]) * u];
    }
    function table(c, k, P, A, b, opt) {
      A.rect(c, b.x, b.y, b.w, b.h, 10, P.surf, opt.color, 1.6);
      A.lab(c, k, opt.title, b.x + 11, b.y + 18, { px: 10.5, weight: 820, color: opt.color, align: 'left', halo: false });
      const r = { x: b.x + 10, y: b.y + 32, w: b.w - 20, h: b.h - 48 };
      A.rect(c, r.x, r.y, r.w, r.h, 7, P.dark ? '#655847' : '#eadcc5', P.dark ? '#9b8b73' : '#b7a386', 1);
      const map = (x, y) => [r.x + (x - .08) / .72 * r.w, r.y + (y - .07) / .50 * r.h];
      const goal = map(.74, .34), obstacle = map(.47, .34);
      A.circle(c, goal[0], goal[1], Math.max(6, r.h * .065), P.dark ? '#2a2925' : '#f7f4eb', P.good, 1.5);
      A.circle(c, obstacle[0], obstacle[1], Math.max(5, r.h * .055), '#b8d7e8', P.ink3, 1.1);
      const drawPath = (path, color, dash, upto) => {
        const n = Math.max(2, Math.ceil(path.length / 2 * upto)), pts = [];
        for (let i = 0; i < Math.min(path.length / 2, n); i++) pts.push(map(path[i * 2], path[i * 2 + 1]));
        A.line(c, pts, color, 2.4, dash || []);
      };
      drawPath(opt.path, opt.color, opt.dash, opt.q);
      const p = point(opt.path, opt.q), xy = map(p[0], p[1]);
      A.circle(c, xy[0], xy[1], Math.max(5, r.h * .05), '#c9653c', P.dark ? '#eadbd2' : '#5b3b2e', 1.2);
      if (opt.q > .93) {
        A.circle(c, b.x + b.w - 19, b.y + 18, 9, A.alpha(opt.ok ? P.good : P.bad, .1), opt.ok ? P.good : P.bad, 1.3);
        if (opt.ok) A.K.check(c, b.x + b.w - 19, b.y + 18, 5, P.good, 1.8); else A.K.cross(c, b.x + b.w - 19, b.y + 18, 5, P.bad, 1.8);
      }
      A.lab(c, k, opt.note, b.x + b.w - 11, b.y + b.h - 11, { px: 10, weight: 650, color: P.ink3, align: 'right', haloColor: P.surf });
    }
    function draw(c, k, t, P, A, narrow) {
      const W = narrow ? 360 : 760, H = narrow ? 700 : 430, u = ((t % 6) + 6) % 6, q = A.ease(A.seg(u, .2, 4.9));
      c.fillStyle = P.surf2; c.fillRect(0, 0, W, H);
      A.lab(c, k, narrow ? 'Одна политика · два замкнутых контура' : 'Одинаковые действия получают разную обратную связь от модели и физики', W / 2, 23, { px: narrow ? 11 : 13, weight: 820, color: P.ink, halo: false });
      if (!narrow) {
        // Сначала обратные связи и развилка, затем карточки поверх концов линий.
        A.arrow(c, 340, 90, 220, 115, P.spr, 1.7, 6); A.arrow(c, 420, 90, 540, 115, P.spr, 1.7, 6);
        A.line(c, [[72, 335], [72, 360], [688, 360], [688, 335]], P.spr, 1.5, [5, 4]);
        A.rect(c, 278, 48, 204, 42, 9, A.alpha(P.spr, .10), P.spr, 1.4);
        A.lab(c, k, 'политика → пачка действий', 380, 69, { px: 10.5, weight: 800, color: P.spr, halo: false });
        table(c, k, P, A, { x: 18, y: 115, w: 352, h: 220 }, { title: 'модель мира', path: imagined, q, color: P.mot, dash: [5, 4], ok: imaginedRun.ok, note: 'политике возвращается предсказанный кадр' });
        table(c, k, P, A, { x: 390, y: 115, w: 352, h: 220 }, { title: 'физический стол', path: real, q, color: P.out, dash: [], ok: realRun.ok, note: 'политике возвращается настоящий кадр' });
        A.lab(c, k, 'обратная связь замыкает оба контура', 380, 360, { px: 10, weight: 720, color: P.spr, haloColor: P.surf2 });
        A.lab(c, k, q > .92 ? 'модель: успех' : 'модель продолжает сцену', 194, 397, { px: 10.5, weight: 820, color: q > .92 ? P.good : P.mot, halo: false });
        A.lab(c, k, q > .92 ? 'физика: чашка опрокинута' : 'робот исполняет те же действия', 566, 397, { px: 10.5, weight: 820, color: q > .92 ? P.bad : P.out, halo: false });
        A.lab(c, k, 'Один старт и одна пачка действий; различается только среда.', 380, 420, { px: 10, color: P.ink2, halo: false });
      } else {
        A.arrow(c, 148, 87, 110, 112, P.spr, 1.6, 6); A.arrow(c, 212, 87, 250, 112, P.spr, 1.6, 6);
        A.line(c, [[36, 340], [36, 356], [324, 356], [324, 340]], P.spr, 1.4, [5, 4]);
        A.line(c, [[36, 600], [36, 616], [324, 616], [324, 600]], P.spr, 1.4, [5, 4]);
        A.rect(c, 78, 45, 204, 42, 9, A.alpha(P.spr, .10), P.spr, 1.4);
        A.lab(c, k, 'политика → действия', 180, 66, { px: 10.5, weight: 800, color: P.spr, halo: false });
        table(c, k, P, A, { x: 10, y: 115, w: 340, h: 225 }, { title: 'модель мира', path: imagined, q, color: P.mot, dash: [5, 4], ok: imaginedRun.ok, note: 'предсказанный следующий кадр' });
        table(c, k, P, A, { x: 10, y: 375, w: 340, h: 225 }, { title: 'физический стол', path: real, q, color: P.out, dash: [], ok: realRun.ok, note: 'настоящий следующий кадр' });
        A.lab(c, k, q > .92 ? 'модель: успех · физика: опрокидывание' : 'оба контура получают новый кадр', 180, 646, { px: 10.5, weight: 820, color: q > .92 ? P.bad : P.spr, halo: false });
        A.lab(c, k, 'Один старт; различается только среда.', 180, 680, { px: 10, color: P.ink2, halo: false });
      }
    }
    Anim.add('evaluation', {
      W: 760, H: 430, start: 1, narrowAt: 450,
      draw(c, k, t, P, A) { draw(c, k, t, P, A, false); },
      narrow: { W: 360, H: 700, draw(c, k, t, P, A) { draw(c, k, t, P, A, true); } },
    });
  }

  function charts() {
    StatsChart.bars($('#veoBars'), { series: [{ id: 'r', label: 'Pearson', color: 'var(--eval)' }], groups: [{ label: 'новый фон', values: { r: .91 } }, { label: 'малый объект', values: { r: .86 } }, { label: 'большой объект', values: { r: .77 } }, { label: 'новый предмет', values: { r: .56 } }], max: 1, unit: '', ticks: [0, .5, 1], height: 170, digits: 2 });
    StatsChart.bars($('#dreamgenBars'), { series: [{ id: 'real', label: 'только реальные', color: 'var(--classic)' }, { id: 'mix', label: 'реальные + синтетика', color: 'var(--e2e)' }], groups: [{ label: '30 реальных', values: { real: 17.44, mix: 23.32 } }, { label: '100 реальных', values: { real: 32.07, mix: 39.94 } }, { label: '300 реальных', values: { real: 49.59, mix: 57.61 } }, { label: 'только синтетика', values: { real: null, mix: 20.55 } }], max: 60, unit: '%', ticks: [0, 30, 60], height: 180, digits: 2 });
    StatsChart.bars($('#wmpoBars'), { series: [{ id: 'grpo', label: 'GRPO на реальных', color: 'var(--classic)' }, { id: 'dpo', label: 'DPO', color: 'var(--ink-3)' }, { id: 'wmpo', label: 'WMPO в модели мира', color: 'var(--e2e)' }], groups: [{ label: '128 траекторий', values: { grpo: 33.2, dpo: 37.3, wmpo: 47.1 } }, { label: '1280 траекторий', values: { grpo: 37.1, dpo: 42.4, wmpo: 57.6 } }], max: 60, unit: '%', ticks: [0, 30, 60], height: 175, digits: 1 });
  }

  function labExam() {
    let rollouts = 0, failures = false, judge = 'strict', result = L.exam(), revealed = false, raf = 0, progress = 1, ctl;
    function currentModel() { return L.MODELS[result.key]; }
    function setRollouts(v) { rollouts = +v; setSeg('rolloutCtl', rollouts); reset(); }
    function setFailures(v) { failures = String(v) === '1'; setSeg('failureCtl', failures ? 1 : 0); reset(); }
    function setJudge(v) { judge = v; setSeg('judgeCtl', judge); reset(); }
    function state() { return Object.assign({ rollouts, failures, judge }, result); }
    function cupPath(path) { const out = []; for (let i = 0; i < path.length; i += 4) out.push(path[i], path[i + 1]); return out; }
    function drawPane(cv, world, path, kind, run, visible) {
      const V = TableDraw.view(cv, { W: 340, margin: .06 }); TableDraw.table(V, world, { grid: true });
      if (visible) { const n = Math.max(2, Math.floor(path.length / 2 * progress) * 2), shown = path.slice(0, n); TableDraw.path(V, shown, { kind, lw: 3 }); const x = shown[shown.length - 2], y = shown[shown.length - 1]; TableDraw.cup(V, x, y, kind === 'imag' ? { imag: true } : { tipped: run && run.tip, fallen: run && run.fall }); }
      else { const st = L.LAB_STARTS[0]; TableDraw.cup(V, st.cup[0], st.cup[1], {}); const c = V.c; c.fillStyle = HeroKit.css('--surface'); c.globalAlpha = .94; c.beginPath(); c.roundRect(72, V.H / 2 - 24, 196, 48, 9); c.fill(); c.globalAlpha = 1; c.fillStyle = HeroKit.css('--ink-3'); c.font = '700 12px sans-serif'; c.textAlign = 'center'; c.fillText('результат скрыт до запуска', 170, V.H / 2 + 4); c.textAlign = 'left'; }
    }
    function draw() {
      const top = result.byModel[0], st = L.LAB_STARTS[0], world = L.L71.world({ layout: 'base', cup: st.cup, hand: st.hand, seed: st.seed, noise: false }), im = L.L71.imagineCtl(currentModel(), top.theta, st, L.L71.LAYOUTS.base, { tau: 0, seed: 75, path: true }), real = top.real.runs[0];
      drawPane($('#examModelCv'), world, cupPath(im.path), 'imag', null, true); drawPane($('#examRealCv'), world, cupPath(real.path), 'real', real, revealed);
    }
    function renderRanks() {
      const list = (el, rows, real) => { el.innerHTML = ''; rows.forEach((x) => { const li = document.createElement('li'); li.textContent = `${x.id}${real ? ` · ${pct(x.realSuccess)}` : ''}`; if (x.id === 'A') li.classList.add('trap'); el.appendChild(li); }); };
      list($('#rankModel'), result.byModel, false); list($('#rankReal'), result.byReal, true); $('#rankReal').classList.toggle('masked', !revealed); $('#rankReal').classList.toggle('revealed', revealed);
      const vals = [result.metrics.pearson, result.metrics.spearman, result.metrics.mmrv], cells = $$('#examMetrics>div'); cells.forEach((d, i) => { d.querySelector('b').textContent = revealed ? fmt(vals[i], 3) : '—'; d.classList.toggle('good', revealed && (i === 2 ? vals[i] <= .05 : vals[i] >= .85)); });
      $('#examModelLabel').textContent = `модель: ${result.key === 'demo' ? 'только демонстрации' : `${rollouts} прогона на чекпойнт · ${failures ? 'с неудачами' : 'только успехи'}`}`;
    }
    function reset() { cancelAnimationFrame(raf); result = L.exam({ rollouts, failures, judge }); revealed = false; progress = 1; $('#examStatus').textContent = 'ожидает запуска'; $('#examRealLabel').textContent = 'скрыт до запуска'; $('#examRead').textContent = 'Порядок на столе скрыт. Сначала посмотри, кому доверяет модель мира.'; renderRanks(); draw(); }
    async function run() { cancelAnimationFrame(raf); result = L.exam({ rollouts, failures, judge }); revealed = true; progress = 0; renderRanks(); $('#examStatus').textContent = '40 попыток на чекпойнт'; $('#examRealLabel').textContent = 'тот же старт · физика L71'; const t0 = performance.now(); return await new Promise((resolve) => { function tick(t) { progress = Math.min(1, (t - t0) / (HeroKit.reduced() ? 1 : 850)); draw(); if (progress < 1) raf = requestAnimationFrame(tick); else { $('#examStatus').textContent = `лучший: модель ${result.bestModel} · стол ${result.bestReal}`; $('#examRead').textContent = result.bestModel === 'A' ? 'Ловушка сработала: быстрый чекпойнт A модель поставила первым, а на столе он опрокидывает чашку.' : `Spearman ${fmt(result.metrics.spearman, 3)}, MMRV ${fmt(result.metrics.mmrv, 3)}. Сверь порядок и причины провалов.`; resolve(state()); } } raf = requestAnimationFrame(tick); }); }
    $('#rolloutCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setRollouts(b.dataset.v); }; $('#failureCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setFailures(b.dataset.v); }; $('#judgeCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setJudge(b.dataset.v); };
    window.addEventListener('resize', draw); App.on('theme', draw);
    const action = { label: 'Сверить с 40 попытками на столе', run };
    const missions = [
      { short: 'Ловушка', title: 'Проверь модель без автономных неудач', text: 'Модель видела только осторожные демонстрации. Сначала предскажи, останется ли её лучший чекпойнт лучшим на настоящем столе.', onEnter: () => { setRollouts(0); setFailures(0); setJudge('strict'); }, bet: { q: 'Лучший в модели чекпойнт A останется лучшим на столе?', options: ['да', 'нет, он провалится', 'все будут равны'], answer: () => 1 }, action, criteria: [{ label: 'Чекпойнт A первый в модели и провальный на столе', test: (r) => r && r.bestModel === 'A' && r.rows.find((x) => x.id === 'A').realSuccess === 0 }], explain: () => 'В демонстрациях не было быстрых ударов и опрокидываний. Модель продолжила короткую траекторию, но не знала её физического исхода.' },
      { short: 'Покрытие', title: 'Добавь прогоны, но убери провальные эпизоды', text: 'Начни с нуля и сам выбери шесть прогонов на чекпойнт. Оставь только успешные эпизоды и проверь, достаточно ли одного покрытия для надёжного порядка.', controls: ['rollouts', 'failures'], onEnter: () => setJudge('strict'), bet: { q: 'Шесть успешных прогонов на чекпойнт полностью исправят порядок?', options: ['да, данных стало больше', 'нет, без исходов провала останется ошибка', 'метрики не изменятся'], answer: () => 1 }, action, criteria: [{ label: 'Самостоятельно выбраны 6 прогонов и только успехи', test: (r) => r && r.rollouts === 6 && !r.failures }, { label: 'Порядок всё ещё не проходит порог Spearman 0,90', test: (r) => r && r.metrics.spearman < .90 }], hint: 'Повышай число прогонов, не добавляя неудачи.', explain: (r) => `Покрытие помогло, но Spearman остался ${fmt(r.metrics.spearman, 3)}. Переходы рядом с провалом не объясняют модели, что весь эпизод закончился плохо.` },
      { short: 'Неудачи', title: 'Верни автономные неудачи в обучение', text: 'Сохрани найденные шесть прогонов и сам добавь провальные эпизоды. Добейся высокой ранговой корреляции и нулевого тяжёлого нарушения порядка.', controls: ['rollouts', 'failures'], onEnter: () => setJudge('strict'), bet: { q: 'Что сильнее исправит модель?', options: ['ещё только успехи', 'неудачи текущих политик', 'мягкий судья без новых данных'], answer: () => 1 }, action, criteria: [{ label: 'Использованы 6 прогонов вместе с неудачами', test: (r) => r && r.rollouts === 6 && r.failures }, { label: 'Spearman не ниже 0,90', test: (r) => r && r.metrics.spearman >= .90 }, { label: 'MMRV не выше 0,05', test: (r) => r && r.metrics.mmrv <= .05 }], explain: (r) => `Spearman вырос до ${fmt(r.metrics.spearman, 3)}, MMRV — ${fmt(r.metrics.mmrv, 3)}. Модель увидела состояния и исходы, которые создают сами политики.` },
      { short: 'Свободно', final: true, title: 'Свободный режим: проверь состав опыта и судью', text: 'Меняй число прогонов, наличие неудач и строгость судьи. Сверяй не только Pearson, но и порядок карточек и MMRV.', controls: 'all', action, onEnter: () => { setRollouts(2); setFailures(1); setJudge('soft'); } },
    ];
    ctl = Missions.mount($('#examMis'), missions, { reset() { setRollouts(0); setFailures(0); setJudge('strict'); }, state }, { controls: { rollouts: '#rolloutWrap', failures: '#failureWrap', judge: '#judgeWrap' }, scene: '#examCv' });
    reset();
  }

  function labScreen() {
    let k = 4, budget = 80, result = L.simulateScreen(k, budget, 75), revealed = false, ctl, screenRaf = 0, screenProgress = 1;
    function setK(v) { k = +v; $('#kCtl').value = k; $('#kValue').textContent = k; reset(); }
    function setBudget(v) { budget = +v; setSeg('budgetCtl', budget); reset(); }
    function state() { return Object.assign({ k, budget }, result); }
    function orderedRows() { return L.SCREEN_ROWS.slice().sort((a, b) => b.modelScore - a.modelScore || a.id.localeCompare(b.id)); }
    function selectedRow() { const id = revealed ? Object.entries(result.chosen).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : result.top[0]; return L.SCREEN_ROWS.find((x) => x.id === id); }
    function path2(path) { const out = []; for (let i = 0; i < path.length; i += 4) out.push(path[i], path[i + 1]); return out; }
    function drawLive() {
      const selected = selectedRow(), root = $('#screenCandidates'); root.innerHTML = ''; orderedRows().forEach((x) => { const s = document.createElement('span'); s.textContent = x.id; s.classList.toggle('admitted', result.top.includes(x.id)); s.classList.toggle('true-best', revealed && x.id === result.best); s.classList.toggle('chosen', revealed && x.id === selected.id); root.appendChild(s); });
      const st = L.SCREEN_STARTS[0], world = L.L71.world({ layout: 'base', cup: st.cup, hand: st.hand, seed: st.seed, noise: false }), run = L.L71.evalReal(selected.theta, { starts: [st], layout: 'base' }).runs[0], path = path2(run.path), V = TableDraw.view($('#screenTableCv'), { W: 360, margin: .06 }); TableDraw.table(V, world, { grid: true });
      if (revealed) { const n = Math.max(2, Math.floor(path.length / 2 * screenProgress) * 2), shown = path.slice(0, n); TableDraw.path(V, shown, { kind: 'real', lw: 3 }); TableDraw.cup(V, shown[shown.length - 2], shown[shown.length - 1], { tipped: run.tip, fallen: run.fall }); $('#screenTableTitle').textContent = `чаще выбран ${selected.id} · ${run.ok ? 'успех' : 'провал'}`; }
      else { TableDraw.cup(V, st.cup[0], st.cup[1], {}); $('#screenTableTitle').textContent = `лидер модели ${selected.id} · ещё не запущен`; }
    }
    function drawChart() {
      const cv = $('#screenCv'), dpr = devicePixelRatio || 1, W = cv.clientWidth || 720, H = Math.max(250, Math.min(330, W * .43)); cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, W, H); c.fillStyle = HeroKit.css('--surface-2'); c.fillRect(0, 0, W, H); const rows = L.SCREEN_ROWS, pad = W < 560 ? 18 : 34, gap = W < 560 ? 3 : 5, bw = (W - 2 * pad - gap * 19) / 20, max = 500;
      c.fillStyle = HeroKit.css('--ink-3'); c.font = `${W < 560 ? 9 : 11}px sans-serif`; c.fillText('как часто выбран чекпойнт, из 500 отборов', pad, 18);
      c.fillStyle = HeroKit.css('--e2e'); c.fillRect(pad, 34, 16, 2); c.fillStyle = HeroKit.css('--ink-3'); c.font = '10px sans-serif'; c.fillText('прошли фильтр модели мира', pad + 22, 38); c.fillStyle = HeroKit.css('--good'); c.fillRect(Math.min(W - 155, pad + 190), 34, 16, 2); c.fillStyle = HeroKit.css('--ink-3'); c.fillText(revealed ? `настоящий лучший: ${result.best}` : 'настоящий лучший: скрыт до запуска', Math.min(W - 133, pad + 212), 38);
      rows.forEach((x, i) => { const n = revealed ? (result.chosen[x.id] || 0) : 0, h = n / max * (H - 112), xx = pad + i * (bw + gap), yy = H - 55 - h; c.fillStyle = x.id === result.best ? HeroKit.css('--good') : HeroKit.css('--screen'); c.globalAlpha = .85; c.beginPath(); c.roundRect(xx, yy, bw, h, Math.min(4, bw / 2)); c.fill(); c.globalAlpha = 1; c.save(); c.translate(xx + bw / 2, H - 48); c.rotate(-Math.PI / 2); c.fillStyle = HeroKit.css('--ink-3'); c.font = `${W < 560 ? 8 : 9.5}px var(--mono)`; c.textAlign = 'right'; c.fillText(x.id, 0, 3); c.restore(); if (result.top.includes(x.id)) { c.strokeStyle = HeroKit.css('--e2e'); c.lineWidth = 1.2; c.strokeRect(xx - 1, 47, bw + 2, H - 100); } });
    }
    function draw() { drawLive(); drawChart(); }
    function render() { $('#twoStageRate').textContent = revealed ? pct(result.hitRate, 1) : '—'; $('#allRobotRate').textContent = revealed ? pct(result.allRobotRate, 1) : '—'; $('#budgetLine').innerHTML = `<span>модель проверяет 20</span><span>робот: ${result.trialsEach} попыток на кандидата</span>`; draw(); }
    function reset() { cancelAnimationFrame(screenRaf); result = L.simulateScreen(k, budget, 75); revealed = false; screenProgress = 1; $('#screenStatus').textContent = 'ожидает запуска'; $('#screenRead').textContent = 'Оранжевые карточки прошли фильтр модели мира. Настоящий лучший откроется только после запуска на столе.'; render(); }
    async function run() { cancelAnimationFrame(screenRaf); result = L.simulateScreen(k, budget, 75); revealed = true; screenProgress = 0; $('#screenStatus').textContent = 'идёт настоящая проверка'; $('#screenRead').textContent = result.top.includes(result.best) ? `Настоящий лучший ${result.best} допущен. По ${result.trialsEach} попыток на кандидата; теперь влияет шум настоящей оценки.` : `Настоящий лучший ${result.best} не прошёл фильтр модели мира и не может быть выбран ни в одном повторе.`; render(); const t0 = performance.now(); return await new Promise((resolve) => { function tick(t) { screenProgress = Math.min(1, (t - t0) / (HeroKit.reduced() ? 1 : 750)); drawLive(); if (screenProgress < 1) screenRaf = requestAnimationFrame(tick); else { $('#screenStatus').textContent = 'разыграно 500 отборов'; resolve(state()); } } screenRaf = requestAnimationFrame(tick); }); }
    $('#kCtl').oninput = () => setK($('#kCtl').value); $('#budgetCtl').onclick = (e) => { const b = e.target.closest('button'); if (b) setBudget(b.dataset.v); }; window.addEventListener('resize', draw); App.on('theme', draw);
    const action = { label: 'Разыграть 500 отборов', run };
    const missions = [
      { short: 'Узко', title: 'Пропусти на робот только одного лидера модели', text: 'Дай первому месту весь настоящий бюджет. Проверь, может ли большая точность проверки исправить ошибку первого этапа.', onEnter: () => { setK(1); setBudget(80); }, bet: { q: 'Один кандидат с 80 попытками надёжнее всех остальных вариантов?', options: ['да, у него больше попыток', 'нет, модель могла отсеять лучшего', 'равно варианту без модели'], answer: () => 1 }, action, criteria: [{ label: 'Настоящий лучший не прошёл фильтр', test: (r) => r && !r.top.includes(r.best) }, { label: 'Доля верного выбора равна нулю', test: (r) => r && r.hitRate === 0 }], explain: () => 'Настоящий лучший P06 занял не первое место в модели. Дополнительные попытки лидера не могут вернуть уже отсеянного кандидата.' },
      { short: 'Граница', title: 'Найди минимальный достаточный допуск', text: 'Граница осталась на одном кандидате. Передвигай её сам и запускай отбор, пока настоящий лучший впервые не войдёт в набор, а двухступенчатый вариант не обгонит деление бюджета между всеми двадцатью.', controls: ['k'], onEnter: () => setBudget(80), bet: { q: 'Двухступенчатый отбор обгонит деление бюджета между всеми двадцатью?', options: ['да', 'нет', 'всегда будет ровно'], answer: (r) => r && r.hitRate > r.allRobotRate ? 0 : 1 }, action, criteria: [{ label: 'Найден первый достаточный допуск: k = 4', test: (r) => r && r.k === 4 }, { label: 'Настоящий лучший прошёл фильтр', test: (r) => r && r.top.includes(r.best) }, { label: 'Двухступенчатый отбор лучше варианта «все на робот»', test: (r) => r && r.hitRate > r.allRobotRate }], hint: 'Увеличивай k по одному и после каждого изменения запускай 500 отборов.', explain: (r) => `Фильтр оставил четыре кандидата и по ${r.trialsEach} настоящих попыток каждому. Лучший найден в ${pct(r.hitRate, 1)} отборов против ${pct(r.allRobotRate, 1)} без модели мира.` },
      { short: 'Слишком широко', title: 'Пропусти на робот все двадцать', text: 'Граница осталась на найденном значении. Сам доведи k до двадцати, не меняя бюджет, и проверь, что на каждого кандидата остаётся мало попыток, а шум выбора растёт.', controls: ['k'], onEnter: () => setBudget(80), bet: { q: 'Чем больше k, тем надёжнее отбор?', options: ['да', 'нет, у каждой политики остаётся меньше попыток', 'k не влияет'], answer: () => 1 }, action, criteria: [{ label: 'На стол допущены все 20 кандидатов', test: (r) => r && r.k === 20 }, { label: 'На кандидата осталось не больше четырёх попыток', test: (r) => r && r.trialsEach <= 4 }, { label: 'Доля верного выбора ниже, чем при k = 4', test: (r) => r && r.hitRate < .45 }], explain: (r) => `При k = 20 каждому досталось ${r.trialsEach} попытки. Настоящий лучший выбран в ${pct(r.hitRate, 1)} повторов: ошибка фильтра исчезла, но вырос статистический шум.` },
      { short: 'Свободно', final: true, title: 'Свободный режим: распредели бюджет', text: 'Меняй k и общий бюджет. Ищи область, где лучший проходит фильтр, а настоящих попыток на кандидата ещё достаточно.', controls: 'all', action, onEnter: () => { setK(6); setBudget(120); } },
    ];
    ctl = Missions.mount($('#screenMis'), missions, { reset() { setK(1); setBudget(80); }, state }, { controls: { k: '#kWrap', budget: '#budgetWrap' }, scene: '#screenLive' }); reset();
  }

  const Q = [
    { q: 'Что должна сохранять модель мира, если её используют для выбора чекпойнта?', o: ['Точный цвет каждого пикселя', 'Относительный порядок политик', 'Одинаковую задержку робота и GPU'], a: 1, e: 'Для отбора достаточно надёжно ранжировать кандидатов; точные проценты успеха могут быть смещены.' },
    { q: 'Почему ошибка действий на отложенных кадрах — слабая проверка политики?', o: ['Она слишком дорогая', 'Она не замыкает контур и не посещает состояния самой политики', 'Она всегда равна нулю'], a: 1, e: 'Собственные ошибки политики меняют следующие наблюдения. Проверка по записанным кадрам этого не воспроизводит.' },
    { q: 'Что учитывает MMRV в отличие от обычного ранга?', o: ['Размер модели', 'Величину реального разрыва между перепутанными политиками', 'Число кадров в ролике'], a: 1, e: 'Перестановка далёких по успеху политик штрафуется сильнее, чем перестановка почти равных.' },
    { q: 'Какие данные сильнее исправили оптимистичную модель в лаборатории?', o: ['Ещё успешные демонстрации', 'Автономные прогоны текущих политик вместе с неудачами', 'Сыгранные оператором ошибки'], a: 1, e: 'Нужны состояния и исходы, которые создают сами проверяемые политики.' },
    { q: 'Почему нельзя всегда пропускать на робот только первое место модели?', o: ['Робот не умеет исполнять лидера', 'Ошибка модели может навсегда отсеять настоящий лучший чекпойнт', 'Первое место всегда самое медленное'], a: 1, e: 'При k = 1 реальная проверка не может исправить ошибку предварительного ранга.' },
    { q: 'Почему слишком большое k тоже плохо при фиксированном бюджете?', o: ['Модель мира перестаёт работать', 'На каждого кандидата остаётся мало настоящих попыток', 'MMRV становится отрицательным'], a: 1, e: 'Шум наблюдаемой доли успеха растёт, когда бюджет делится между большим числом кандидатов.' },
    { q: 'Когда воображаемая траектория становится пригодной демонстрацией?', o: ['Сразу после генерации', 'После проверки инструкции, физики и исполнимости действий', 'Только если она длиннее настоящей'], a: 1, e: 'Генеративная модель может нарушать контакт и постоянство предметов, поэтому нужен фильтр.' },
    { q: 'Зачем при RL в модели мира всё ещё нужны настоящие траектории?', o: ['Только для красивого видео', 'Чтобы обновлять модель на состояниях текущей политики и подтверждать итог', 'Чтобы замедлить обучение'], a: 1, e: 'Оптимизатор находит лазейки модели; реальные прогоны раскрывают их и возвращают физическую привязку.' },
  ];
  function quiz() {
    const box = $('#quizBox'), perms = [[1, 0, 2], [2, 1, 0], [0, 2, 1], [1, 2, 0], [2, 0, 1], [0, 1, 2], [1, 0, 2], [2, 1, 0]]; let answered = 0, correct = 0;
    Q.forEach((q, qi) => { const card = document.createElement('div'); card.className = 'card q-card'; const h = document.createElement('h4'), n = document.createElement('span'), t = document.createElement('span'); n.className = 'qn'; n.textContent = `${qi + 1}.`; t.textContent = q.q; h.append(n, t); const opts = document.createElement('div'), exp = document.createElement('div'); opts.className = 'q-opts'; exp.className = 'q-exp'; exp.hidden = true; const pm = perms[qi]; pm.forEach((oi) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'q-opt'; b.textContent = q.o[oi]; b.onclick = () => { if (card.dataset.done) return; card.dataset.done = '1'; const good = oi === q.a; b.classList.add(good ? 'correct' : 'incorrect'); if (!good) opts.children[pm.indexOf(q.a)].classList.add('correct'); exp.innerHTML = `<strong>${good ? 'Верно.' : 'Не совсем.'}</strong> ${q.e}`; exp.hidden = false; answered++; if (good) correct++; $('#quizScore').textContent = answered === Q.length ? `Итог: ${correct} из ${Q.length}. ${correct >= 6 ? 'Можно идти дальше.' : 'Вернись к разделам, где были ошибки.'}` : `Отвечено ${answered} из ${Q.length}`; }; opts.appendChild(b); }); card.append(h, opts, exp); box.appendChild(card); });
  }

  architecture(); charts(); labExam(); labScreen(); quiz(); window.__lessonReady = true;
})();
