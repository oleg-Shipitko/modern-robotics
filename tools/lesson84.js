// Урок 8.4 «Контроль качества»: расчёты движка, миссии через интерфейс,
// анимация, квиз, KaTeX, глоссарий и адаптивность. Снимки: shots/l84-*.png.
const path = require('path');
const { launch, sleep } = require('./cdp');
const E = require('../lessons/l84/engine.js');
const out = (n) => path.resolve(__dirname, '../shots/' + n);
const url = 'file://' + path.resolve(__dirname, '../site/lessons/8-4-kontrol-kachestva.html');
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };
const J = JSON.parse;
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ').replace(/\u2212/g, '-').replace(/\s+/g, ' ').trim();
const finish = () => { console.log(bad ? `ИТОГ: ${bad} проверок не прошли` : 'ИТОГ: все проверки прошли'); process.exit(bad ? 1 : 0); };

async function viaUI(p, mis, bet) {
  return p.eval(`(async () => {
    const root = document.querySelector('${mis}');
    const bets = root.querySelectorAll('.m-bet .opts .btn');
    if (bets.length && ${bet == null ? 'false' : 'true'}) bets[${bet || 0}].click();
    const go = root.querySelector('.g-go'); if (go) go.click();
    for (let i = 0; i < 500 && root.classList.contains('m-busy'); i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 80));
    const crit = [...root.querySelectorAll('.m-crit li')].map((li) => li.className);
    return JSON.stringify({ ok: crit.length > 0 && crit.every((c) => c === 'ok'), crit, out: (root.querySelector('.g-out:not([hidden])') || {}).textContent || '' });
  })()`, true).then(J).then((r) => Object.assign(r, { out: sp(r.out) }));
}
const next = (p, mis) => p.eval(`(() => { const b=document.querySelector('${mis} .g-next'); if(!b||b.hidden)return false; b.click(); return true; })()`);
const text = (p, sel) => p.eval(`document.querySelector('${sel}').textContent`).then(sp);
const shot = async (p, id, sel, name) => { await p.eval(`document.getElementById('${id}').scrollIntoView({behavior:'instant'});true`); await sleep(250); await p.shotEl(out(name), sel, 5); };

const traffic = E.evaluate('traffic'), balanced = E.evaluate('balanced'), stress = E.evaluate('stress');
const c40 = E.compare(40, true), c120 = E.compare(120, true), u40 = E.compare(40, false);
console.log(`движок: смесь ${traffic.base}:${traffic.cand}, поровну ${balanced.base}:${balanced.cand}, стресс ${stress.base}:${stress.cand}; 40 пар [${(100*c40.lo).toFixed(1)}; ${(100*c40.hi).toFixed(1)}], 120 пар [${(100*c120.lo).toFixed(1)}; ${(100*c120.hi).toFixed(1)}]`);
check(traffic.base === 79 && traffic.cand === 87, 'рабочая смесь: 79 → 87');
check(balanced.base === 80 && balanced.cand === 77 && balanced.rows[3].base === 19 && balanced.rows[3].cand === 14, 'план поровну: 80 → 77, новый предмет 19 → 14');
check(stress.base === 63 && stress.cand === 53, 'стресс-тест: 63 → 53');
check(c40.lo < 0 && c40.hi > 0 && c120.lo > 0, '40 пар недостаточно, 120 пар дают интервал выше нуля');
check(u40.diff > .1, 'разные старты на 40 попытках дают случайный разрыв больше 10 п.п.');
check(!E.release('fast', Object.keys(E.GATES)).pass && E.release('stable', Object.keys(E.GATES)).pass, 'полный договор останавливает A и пропускает B');

(async () => {
  const B = await launch({ w: 1300, h: 1000 });
  try {
    console.log('компьютер');
    const p = await B.page(url, { width: 1280, height: 1000, light: true });
    await p.waitFor('window.__lessonReady === true', 30000); await sleep(500);
    check((await text(p, '#heroMis')) === '9 миссий с целью', 'число миссий в шапке: ' + await text(p, '#heroMis'));
    check((await p.eval(`document.querySelectorAll('#recall .rc-q').length`)) === 3, 'разминка по уроку 8.3: три вопроса');
    check((await p.eval(`document.querySelectorAll('.lab').length`)) === 3, 'три лаборатории');
    check((await p.eval(`document.querySelectorAll('.scene-card').length`)) === 3 && (await p.eval(`document.querySelectorAll('.guide-card').length`)) === 3, 'общий движок лабораторий: scene-card + guide-card');
    check((await p.eval(`L84.QA_LEVELS.length`)) === 5, 'пять уровней лестницы доказательств');
    const frames = await p.eval(`(() => { const cv=document.querySelector('canvas[data-anim="qa-flow"]'), a=[]; [1.2,5.8,10.8].forEach((t)=>{Anim.seek(cv,t);a.push(cv.toDataURL())}); return new Set(a).size; })()`);
    check(frames === 3, 'одно полотно постепенно накапливает результаты');
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="qa-flow"]'),10.8);true`); await shot(p, 'contract', '#contract .flow-card', 'l84-flow.png');

    console.log('лаборатория 1');
    check((await text(p, '#mResult')).includes('одинаковые старты'), 'до ставки известен протокол, но не результаты');
    let r = await viaUI(p, '#mMis', 1);
    check(r.ok && r.out.includes('+8,0 п.п.') && r.out.includes('2 раза'), 'миссия 1: рабочая смесь — ' + r.out.slice(0, 100));
    await next(p, '#mMis');
    r = await viaUI(p, '#mMis', 1);
    check(r.ok && r.out.includes('Общий вывод сменился') && r.out.includes('20 п.п.'), 'миссия 2: план поровну — ' + r.out.slice(0, 100));
    await next(p, '#mMis');
    r = await viaUI(p, '#mMis');
    check(r.ok && r.out.includes('-10,0 п.п.') && r.out.includes('-20,0 п.п.'), 'миссия 3: стресс-тест — ' + r.out.slice(0, 100));
    await shot(p, 'matrix', '#matrix .lab', 'l84-matrix.png');

    console.log('лаборатория 2');
    check((await text(p, '#uResult')).includes('Первый пакет'), 'интервалы не выданы до запуска');
    r = await viaUI(p, '#uMis', 1);
    check(r.ok && r.out.includes('Двух процентов') && r.out.includes('недостаточно'), 'миссия 1: интервал 40 пар — ' + r.out.slice(0, 120));
    await next(p, '#uMis');
    r = await viaUI(p, '#uMis');
    check(r.ok && r.out.includes('120 парах') && r.out.includes('целиком выше нуля'), 'миссия 2: накоплено 120 пар — ' + r.out.slice(0, 120));
    await next(p, '#uMis');
    r = await viaUI(p, '#uMis');
    check(r.ok && r.out.includes('Разрыв вырос до +17,5 п.п.'), 'миссия 3: разные старты дают +17,5 п.п. — ' + r.out.slice(0, 110));
    await shot(p, 'uncertainty', '#uncertainty .lab', 'l84-uncertainty.png');

    console.log('лаборатория 3');
    r = await viaUI(p, '#rMis', 0);
    check(r.ok && r.out.includes('Договор пропустил кандидата'), 'миссия 1: одно среднее пропускает A — ' + r.out.slice(0, 100));
    await next(p, '#rMis');
    await p.eval(`document.querySelectorAll('#rGates input').forEach((x)=>{if(!x.checked){x.checked=true;x.dispatchEvent(new Event('change',{bubbles:true}));}});true`);
    r = await viaUI(p, '#rMis');
    check(r.ok && r.out.includes('2 опасных действия') && r.out.includes('435 мс'), 'миссия 2: полный договор останавливает A — ' + r.out.slice(0, 110));
    await next(p, '#rMis');
    r = await viaUI(p, '#rMis');
    check(r.ok && r.out.includes('Кандидат B') && r.out.includes('заранее замороженного договора'), 'миссия 3: тот же договор пропускает B — ' + r.out.slice(0, 110));
    await shot(p, 'release', '#release .lab', 'l84-release.png');

    const stackGeo = await p.eval(`JSON.stringify({stack:document.querySelector('.qa-stack-card').getBoundingClientRect().width,text:document.querySelector('#levels .prose').getBoundingClientRect().width,layout:document.querySelector('#qaStack').dataset.layout})`).then(J);
    check(stackGeo.stack > stackGeo.text + 200 && stackGeo.layout === 'w', 'лестница доказательств полноширинная');
    await p.eval(`window.__l84.mis.levels.show('limited');true`);
    check((await text(p, '#qaStackDetail')).includes('Ограниченный выпуск'), 'уровень открывает границы доказательства');
    await shot(p, 'levels', '#levels .qa-stack-card', 'l84-levels.png');

    await p.eval(`document.querySelectorAll('#quizBox .q-card').forEach((c)=>c.querySelector('.q-opt').click());true`);
    check(/^Итог: \d из 8/.test(await text(p, '#quizScore')), 'квиз: ' + await text(p, '#quizScore'));
    check((await p.eval(`document.querySelectorAll('.katex').length`)) >= 8 && (await p.eval(`document.querySelectorAll('.katex-error').length`)) === 0, 'KaTeX без ошибок');
    check((await p.eval(`[...document.querySelectorAll('.gl')].filter((e)=>getComputedStyle(e).display!=='inline').length`)) === 0, 'подсказки глоссария строчные');
    check(!p.logs.length, 'консоль компьютера: ' + (p.logs.join(' | ') || 'чисто'));

    await p.eval(`document.documentElement.dataset.theme='dark';window.dispatchEvent(new Event('resize'));true`); await sleep(450);
    await p.eval(`Anim.seek(document.querySelector('canvas[data-anim="qa-flow"]'),10.8);true`); await shot(p, 'contract', '#contract .flow-card', 'l84-flow-dark.png');
    await shot(p, 'uncertainty', '#uncertainty .lab', 'l84-uncertainty-dark.png');
    check(!p.logs.length, 'консоль после тёмной темы: ' + (p.logs.join(' | ') || 'чисто'));

    console.log('телефон');
    const m = await B.page(url, { width: 390, height: 844, dpr: 2, mobile: true, light: true });
    await m.waitFor('window.__lessonReady === true', 30000); await sleep(500);
    check((await m.eval('document.documentElement.scrollWidth')) <= 390, 'телефон: ширина ' + await m.eval('document.documentElement.scrollWidth'));
    const wide = await m.eval(`[...document.querySelectorAll('.lab')].filter((l)=>{const p=l.closest('.wrap')||l.parentElement;return l.scrollWidth>p.clientWidth+1||[...l.querySelectorAll('.card')].some((c)=>c.scrollWidth>c.clientWidth+1)}).length`);
    check(wide === 0, 'ни одна лаборатория не шире карточки: ' + wide);
    check((await m.eval(`document.querySelector('canvas[data-anim="qa-flow"]').dataset.layout`)) === 'n', 'схема использует узкую раскладку');
    await m.eval(`Anim.seek(document.querySelector('canvas[data-anim="qa-flow"]'),10.8);true`);
    check((await m.eval(`document.querySelector('#qaStack').dataset.layout`)) === 'n', 'лестница доказательств имеет мобильную раскладку');
    for (const [id, sel, name] of [['contract', '#contract .flow-card', 'l84-m-flow.png'], ['matrix', '#matrix .lab', 'l84-m-matrix.png'], ['uncertainty', '#uncertainty .lab', 'l84-m-uncertainty.png'], ['release', '#release .lab', 'l84-m-release.png'], ['levels', '#levels .qa-stack-card', 'l84-m-levels.png']]) await shot(m, id, sel, name);
    check(!m.logs.length, 'консоль телефона: ' + (m.logs.join(' | ') || 'чисто'));

    console.log('промежуточные ширины');
    for (const width of [1024, 768, 720, 640, 360]) {
      const q = await B.page(url, { width, height: 900, light: true, mobile: width <= 390 });
      await q.waitFor('window.__lessonReady === true', 30000); await sleep(180);
      const geo = await q.eval(`JSON.stringify({scroll:document.documentElement.scrollWidth,labs:[...document.querySelectorAll('.lab')].every((l)=>l.scrollWidth<=l.clientWidth+1),maxLab:Math.max(...[...document.querySelectorAll('.lab')].map((l)=>l.getBoundingClientRect().width)),prose:document.querySelector('#paired .prose').getBoundingClientRect().width,quiz:document.querySelector('#quiz .prose').getBoundingClientRect().width})`).then(J);
      check(geo.scroll <= width && geo.labs && geo.maxLab <= 1180.5 && geo.prose <= 820.5 && geo.quiz <= 720.5, `${width}px: без переполнения, лаборатории ≤1180, текст ≤820, квиз ≤720`);
      check(!q.logs.length, `${width}px: консоль ` + (q.logs.join(' | ') || 'чисто'));
    }

    console.log('уменьшенное движение');
    const rm = await B.page('about:blank', { width: 900, height: 700, light: true });
    await rm.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    await rm.S('Page.navigate', { url }); await rm.waitFor('window.__lessonReady === true', 30000); await sleep(350);
    const still = await rm.eval(`(async()=>{const c=document.querySelector('canvas[data-anim="qa-flow"]'),a=c.toDataURL();await new Promise(r=>setTimeout(r,350));return JSON.stringify({same:a===c.toDataURL(),button:!!document.querySelector('.anim-play')});})()`, true).then(J);
    check(still.same && still.button, 'prefers-reduced-motion: схема неподвижна и есть кнопка запуска');
    check(!rm.logs.length, 'консоль при уменьшенном движении: ' + (rm.logs.join(' | ') || 'чисто'));
  } finally { await B.close(); }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
