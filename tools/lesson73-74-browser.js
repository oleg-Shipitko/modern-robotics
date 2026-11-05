// Браузерная проверка уроков 7.3–7.4: геометрия, миссии, анимации,
// адаптивность, reduced motion, квизы, консоль и контрольные снимки.
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const out = (name) => path.join(SHOTS, name);
const urls = {
  l71: 'file://' + path.join(ROOT, 'site/lessons/7-1-world-models-dreamer.html'),
  l72: 'file://' + path.join(ROOT, 'site/lessons/7-2-jepa-v-jepa-2.html'),
  l73: 'file://' + path.join(ROOT, 'site/lessons/7-3-generativnye-modeli-mira.html'),
  l74: 'file://' + path.join(ROOT, 'site/lessons/7-4-world-action-models.html'),
};
let passed = 0, failed = 0;
const metrics = { generatedAt: new Date().toISOString(), pages: {}, widths: {}, states: {} };
function check(ok, message) {
  if (ok) { passed++; console.log('✓', message); }
  else { failed++; console.error('✗', message); }
}
const J = (s) => JSON.parse(s);

async function ready(page) {
  await page.waitFor('window.__lessonReady === true', 60000);
  await sleep(500);
}

async function layout(page) {
  return J(await page.eval(`JSON.stringify((() => {
    const rect = (e) => { const r = e.getBoundingClientRect(); return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), width: +r.width.toFixed(1), top: +r.top.toFixed(1) }; };
    const narrow = [...document.querySelectorAll('.section > .wrap > .prose, .section > .wrap > .stat-fig')].map(rect);
    const flows = [...document.querySelectorAll('.flow-card')].map(rect);
    const aligned = [...document.querySelectorAll('.flow-card, .section > .wrap > .stat-fig')].map((f) => {
      const p = f.closest('.prose') || f.closest('.wrap')?.querySelector(':scope > .prose');
      return p ? Math.abs(rect(f).left - rect(p).left) : 0;
    });
    const missionOrder = [...document.querySelectorAll('.lab')].map((lab) => {
      const top = lab.querySelector('.guide-card .m-top'), scene = lab.querySelector('.scene-card'), bottom = lab.querySelector('.guide-card .m-bottom');
      if (!top || !scene || !bottom) return null;
      return { top: rect(top).top, scene: rect(scene).top, bottom: rect(bottom).top };
    }).filter(Boolean);
    return {
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      hero: rect(document.querySelector('.hero .wrap')),
      labs: [...document.querySelectorAll('.lab')].map(rect),
      narrow,
      flows,
      aligned,
      quiz: rect(document.querySelector('#quiz > .prose')),
      finale: rect(document.querySelector('#finale > .prose')),
      overflowLabs: [...document.querySelectorAll('.lab')].filter((l) => l.scrollWidth > l.clientWidth + 1 || [...l.querySelectorAll('.card')].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > l.getBoundingClientRect().right + 1)).length,
      overflowFigures: [...document.querySelectorAll('.flow-card,.stat-fig')].filter((f) => f.scrollWidth > f.clientWidth + 1).length,
      missionOrder,
    };
  })())`));
}

function checkLayout(m, label, mobile) {
  check(m.scrollWidth <= m.viewport, `${label}: нет горизонтальной прокрутки (${m.scrollWidth}/${m.viewport} px)`);
  check(m.hero.width <= 1182 && m.labs.every((x) => x.width <= 1182), `${label}: шапка и лаборатории не шире 1180 px`);
  check(m.narrow.every((x) => x.width <= 822) && m.flows.every((x) => x.width <= 1182 && (mobile || x.width > 1000)) && m.aligned.every((x) => x <= 1.1), `${label}: текст и диаграммы в колонке 820 px, а анимированные схемы используют полную ширину`);
  check(m.quiz.width <= 722 && m.finale.width <= 722 && Math.abs(m.quiz.left - (m.viewport - m.quiz.width) / 2) <= 2 && Math.abs(m.finale.left - (m.viewport - m.finale.width) / 2) <= 2, `${label}: квиз и финал в центрированной колонке 720 px`);
  check(!m.overflowLabs && !m.overflowFigures, `${label}: лаборатории, схемы и диаграммы не выходят из карточек`);
  if (mobile) check(m.missionOrder.length === 2 && m.missionOrder.every((x) => x.top < x.scene && x.scene < x.bottom), `${label}: условие миссии над сценой, действие и результат под сценой`);
}

async function mission(page, root, bet) {
  return J(await page.eval(`(async () => {
    const root = document.querySelector(${JSON.stringify(root)});
    const bets = root.querySelectorAll('.m-bet .opts .btn');
    if (${bet == null ? 'false' : 'true'} && bets[${bet || 0}]) bets[${bet || 0}].click();
    root.querySelector('.g-go').click();
    for (let i = 0; i < 1200 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    const criteria = [...root.querySelectorAll('.m-crit li')].map((x) => x.className);
    return JSON.stringify({ criteria, ok: criteria.length > 0 && criteria.every((x) => x === 'ok') });
  })()`, true));
}

async function quiz(page, label) {
  const q = J(await page.eval(`JSON.stringify((() => {
    const cards = [...document.querySelectorAll('#quizBox .q-card')];
    cards.forEach((c) => c.querySelector('.q-opt').click());
    return { cards: cards.length, options: cards.map((c) => c.querySelectorAll('.q-opt').length), explanations: cards.filter((c) => { const e = c.querySelector('.q-exp'); return e && !e.hidden && e.textContent.length > 40; }).length, score: document.getElementById('quizScore').textContent };
  })())`));
  check(q.cards === 8 && q.options.every((n) => n === 3) && q.explanations === 8 && /8/.test(q.score), `${label}: восемь вопросов, по три ответа и объяснение после выбора`);
}

async function desktop73(B) {
  const page = await B.page(urls.l73, { width: 1280, height: 900, light: true });
  await ready(page);
  const m = await layout(page); metrics.pages.l73Desktop = m; checkLayout(m, '7.3 · 1280 px', false);
  const prints = [];
  for (const [i, t] of [0.8, 3.4, 6.4, 8.4].entries()) {
    prints.push(await page.eval(`(() => { const c = document.querySelector('canvas[data-anim="genie"]'); Anim.seek(c, ${t}); const d = c.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 11) h = (h * 31 + d.charCodeAt(i)) >>> 0; return h; })()`));
    await page.shotEl(out(`l73-genie-${i + 1}.png`), '#actions .flow-card', 6);
    if (i === 2) await page.shotEl(out('l73-genie.png'), '#actions .flow-card', 6);
  }
  metrics.states.l73GenieHashes = prints;
  check(new Set(prints).size === prints.length, '7.3: четыре смысловых состояния схемы Genie визуально различаются');

  await page.eval(`(() => { const X = L73.models(), M = X.g.main, T = X.T, k = [...Array(M.K)].findIndex((_, i) => L73.buttonEffect(M, T, i).still); document.querySelectorAll('#latentKeys button')[k].click(); return k; })()`);
  let r = await mission(page, '#playMis', 1);
  check(r.ok, '7.3 · лаборатория 1: первая миссия проходится через поиск паузы, без перебора всех карточек');
  await page.shotEl(out('l73-lab1.png'), '#play .lab', 6);

  await page.eval(`(() => { const s = document.getElementById('clipTime'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#diagTree .diag-options .btn').click(); document.getElementById('clipMark').click(); return true; })()`);
  r = await mission(page, '#judgeMis', 0);
  check(r.ok, '7.3 · лаборатория 2: знакомый ролик проверяется диагностикой последнего кадра');
  await page.shotEl(out('l73-lab2.png'), '#judge .lab', 6);
  await quiz(page, '7.3');
  await page.eval(`document.documentElement.dataset.theme='dark'; App.emit('theme','dark'); window.dispatchEvent(new Event('resize')); true`); await sleep(300);
  await page.shotEl(out('l73-genie-dark.png'), '#actions .flow-card', 6);
  check(!page.logs.length, '7.3 · компьютер: консоль чистая' + (page.logs.length ? ` — ${page.logs.join(' | ')}` : ''));
}

async function desktop74(B) {
  const page = await B.page(urls.l74, { width: 1280, height: 900, light: true });
  await ready(page);
  const m = await layout(page); metrics.pages.l74Desktop = m; checkLayout(m, '7.4 · 1280 px', false);
  const prints = [];
  for (const [i, t] of [0.7, 1.8, 3.0, 4.2].entries()) {
    const hash = await page.eval(`(() => { const c = document.getElementById('wamFlow'); Anim.seek(c, ${t}); const d = c.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 11) h = (h * 31 + d.charCodeAt(i)) >>> 0; return h; })()`);
    prints.push(hash);
    await page.shotEl(out(`l74-wam-${i + 1}.png`), '#classes .flow-card', 6);
  }
  await page.shotEl(out('l74-wam.png'), '#classes .flow-card', 6);
  metrics.states.l74WamHashes = prints;
  check(new Set(prints).size === 4, '7.4: четыре фазы общей схемы WAM визуально различаются');

  let r = await mission(page, '#compareMis', 1);
  check(r.ok, '7.4 · лаборатория 1: три контура проходят знакомый путь рядом');
  await page.eval(`(() => { document.querySelector('#compareMis .g-next').click(); document.querySelector('#shareCtl button[data-v="25"]').click(); return true; })()`);
  r = await mission(page, '#compareMis', 1);
  check(r.ok, '7.4 · лаборатория 1: два контура одной WAM получают одинаковое видео и общий путь');
  await page.eval(`(() => { document.querySelector('#compareMis .g-next').click(); const v = L74.minimumBias('detour', L74.minimumShare('detour')); document.querySelector('#biasCtl button[data-v="' + v + '"]').click(); return true; })()`);
  r = await mission(page, '#compareMis', 1);
  check(r.ok, '7.4 · лаборатория 1: ошибка привода отделяет разомкнутый контур от обратной связи той же WAM');
  await page.shotEl(out('l74-lab1.png'), '#three .lab', 6);

  await page.eval(`(() => { for (const c of L74.CALIBRATION.filter((x) => x.pipe === 'idm')) { const row = document.querySelector('#calRows .cal-row[data-id="' + c.id + '"]'); [...row.querySelectorAll('.prob button')].find((b) => b.textContent === (c.outcome ? '90%' : '10%')).click(); } return true; })()`);
  r = await mission(page, '#trustMis', null);
  check(r.ok, '7.4 · лаборатория 2: вероятность выставляется по каждой последовательности, ошибка Брайера считается');
  await page.shotEl(out('l74-lab2.png'), '#trust .lab', 6);
  await quiz(page, '7.4');
  await page.eval(`document.documentElement.dataset.theme='dark'; App.emit('theme','dark'); window.dispatchEvent(new Event('resize')); true`); await sleep(300);
  await page.shotEl(out('l74-wam-dark.png'), '#classes .flow-card', 6);
  check(!page.logs.length, '7.4 · компьютер: консоль чистая' + (page.logs.length ? ` — ${page.logs.join(' | ')}` : ''));
}

async function widthSweep(B, id) {
  const page = await B.page(urls[id], { width: 1024, height: 900, light: true });
  metrics.widths[id] = {};
  for (const width of [1024, 768, 720, 640, 390, 360]) {
    await page.S('Emulation.setDeviceMetricsOverride', { width, height: width <= 390 ? 844 : 900, deviceScaleFactor: width <= 640 ? 2 : 1, mobile: width <= 640 });
    await page.eval(`window.__lessonReady=false; location.reload(); true`); await ready(page);
    await page.eval(`document.querySelectorAll('details.deep').forEach((d) => { d.open = true; }); true`); await sleep(100);
    const m = await layout(page); metrics.widths[id][width] = m;
    check(m.scrollWidth <= width && !m.overflowLabs && !m.overflowFigures, `${id.slice(1, 2)}.${id.slice(2)} · ${width} px: нет переполнения страницы, лабораторий и графики`);
  }
  check(!page.logs.length, `${id.slice(1, 2)}.${id.slice(2)} · набор ширин: консоль чистая` + (page.logs.length ? ` — ${page.logs.join(' | ')}` : ''));
}

async function mobile(B, id) {
  const page = await B.page(urls[id], { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await ready(page);
  const m = await layout(page); metrics.pages[`${id}Mobile`] = m; checkLayout(m, `${id.slice(1, 2)}.${id.slice(2)} · телефон 390 px`, true);
  if (id === 'l73') {
    for (const [i, t] of [0.8, 3.4, 6.4, 8.4].entries()) { await page.eval(`Anim.seek(document.querySelector('canvas[data-anim="genie"]'), ${t})`); await page.shotEl(out(`l73-m-genie-${i + 1}.png`), '#actions .flow-card', 4); }
    await page.shotEl(out('l73-m-genie.png'), '#actions .flow-card', 4);
    await page.shotEl(out('l73-m-lab1.png'), '#play .lab', 4);
    await page.shotEl(out('l73-m-lab2.png'), '#judge .lab', 4);
  } else {
    for (const [i, t] of [0.7, 1.8, 3.0, 4.2].entries()) { await page.eval(`Anim.seek(document.getElementById('wamFlow'), ${t}); true`); await page.shotEl(out(`l74-mobile-wam-${i + 1}.png`), '#classes .flow-card', 4); }
    await page.shotEl(out('l74-mobile-wam.png'), '#classes .flow-card', 4);
    await page.shotEl(out('l74-mobile-lab1.png'), '#three .lab', 4);
    await page.shotEl(out('l74-mobile-lab2.png'), '#trust .lab', 4);
  }
  check(!page.logs.length, `${id.slice(1, 2)}.${id.slice(2)} · телефон: консоль чистая` + (page.logs.length ? ` — ${page.logs.join(' | ')}` : ''));
}

async function neighborHeights(B) {
  for (const id of ['l71', 'l72']) {
    for (const [tag, vp] of [['Desktop', { width: 1280, height: 900, light: true }], ['Mobile', { width: 390, height: 844, dpr: 2, mobile: true, light: true }]]) {
      const page = await B.page(urls[id], vp); await ready(page);
      metrics.pages[`${id}${tag}`] = { viewport: vp.width, scrollWidth: await page.eval('document.documentElement.scrollWidth'), height: await page.eval('document.documentElement.scrollHeight') };
    }
  }
}

async function reducedMotion(B, id) {
  const page = await B.page(urls[id], { width: 1280, height: 900, light: true });
  await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.eval(`window.__lessonReady=false; location.reload(); true`); await ready(page);
  const reduced = await page.eval(`HeroKit.reduced()`);
  check(reduced && !page.logs.length, `${id.slice(1, 2)}.${id.slice(2)} · reduced motion: урок загружается, режим распознан, консоль чистая`);
}

(async () => {
  const B = await launch({ w: 1320, h: 950 });
  try {
    await desktop73(B);
    await desktop74(B);
    await widthSweep(B, 'l73');
    await widthSweep(B, 'l74');
    await mobile(B, 'l73');
    await mobile(B, 'l74');
    await neighborHeights(B);
    await reducedMotion(B, 'l73');
    await reducedMotion(B, 'l74');
  } finally {
    fs.writeFileSync(out('audit-7.3-7.4-browser.json'), JSON.stringify(metrics, null, 2) + '\n');
    await B.close();
  }
  console.log(`\n${passed} успешно, ${failed} ошибок`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
