// Смоук-тест английской версии: каждая собранная страница из site/en/ (страницы сайта и уроки) открывается
// в headless Chrome; проверяются чистая консоль, <html lang="en">, переключатель языка «RU», hreflang-ссылки
// ru/en/x-default и количество кириллицы в видимом тексте (порог — 20 символов, больше — ✗).
//   node tools/en_pages.js              все страницы site/en/
//   node tools/en_pages.js 0-1 index    только страницы, в имени которых есть «0-1» или «index»
// Выход с кодом 1, если хотя бы одна страница не прошла. Сборка: MR_LANG=en python3 lessons/build.py all; python3 site/build.py
const { launch, sleep } = require('./cdp');
const fs = require('fs');
const path = require('path');
const EN = path.resolve(__dirname, '../site/en');
const MAX_CYR = 20;
const filters = process.argv.slice(2);
const pages = [...fs.readdirSync(EN).filter((f) => f.endsWith('.html')).map((f) => path.join(EN, f)),
  ...(fs.existsSync(path.join(EN, 'lessons')) ? fs.readdirSync(path.join(EN, 'lessons')).filter((f) => f.endsWith('.html')).map((f) => path.join(EN, 'lessons', f)) : [])]
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)));
if (!pages.length) { console.log('в site/en/ нет собранных страниц'); process.exit(1); }
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  let bad = 0;
  for (const file of pages) {
    const name = path.relative(EN, file);
    const p = await B.page('file://' + file, { width: 1440, height: 1000, light: true });
    await p.waitFor('document.readyState === "complete"', 30000);
    await sleep(1500);
    // уроки с лабораториями объявляют готовность (window.__lessonReady) после обучения сетей — ждём, если объявили
    const hasFlag = await p.eval(`document.documentElement.innerHTML.includes('__lessonReady')`);
    if (hasFlag) { try { await p.waitFor('window.__lessonReady === true', 90000); } catch (e) { /* не дождались — проверяем как есть */ } }
    // название канала «Продакт роботов» в английской версии намеренно остаётся по-русски — его не считаем
    const info = JSON.parse(await p.eval(`const TXT = document.body.innerText.split('Продакт роботов').join(''); JSON.stringify({
      lang: document.documentElement.lang,
      sw: (document.querySelector('.topbar-lang, .lang-btn, .lang-link') || {}).textContent || '',
      swHref: (document.querySelector('.topbar-lang, .lang-btn, .lang-link') || {}).getAttribute ? document.querySelector('.topbar-lang, .lang-btn, .lang-link').getAttribute('href') : '',
      hl: ['ru', 'en', 'x-default'].map((h) => !!document.querySelector('link[rel="alternate"][hreflang="' + h + '"]')),
      cyr: (TXT.match(/[А-Яа-яЁё]/g) || []).length,
      sample: ((TXT.match(/[^\\n]{0,30}[А-Яа-яЁё][^\\n]{0,30}/g) || []).slice(0, 3)),
      sw2: document.documentElement.scrollWidth,
    })`));
    const is404 = name === '404.html'; // у 404 hreflang не ставится: страница показывается по любому адресу
    const problems = [];
    if (info.lang !== 'en') problems.push(`lang="${info.lang}"`);
    if (info.sw.trim() !== 'RU') problems.push(`переключатель: «${info.sw.trim() || 'нет'}»`);
    if (!is404 && !info.hl.every(Boolean)) problems.push('hreflang: ' + info.hl.map((v, i) => (v ? '' : ['ru', 'en', 'x-default'][i])).filter(Boolean).join(', ') + ' нет');
    if (info.cyr > MAX_CYR) problems.push(`кириллица в тексте: ${info.cyr} символов (${info.sample.map((s) => `«${s.trim()}»`).join(', ')})`);
    // 404 подключает стили и скрипты от корня сайта (/assets/…): по file:// они не находятся, на сайте — да
    const logs = is404 ? p.logs.filter((l) => !l.includes('ERR_FILE_NOT_FOUND')) : p.logs;
    if (logs.length) problems.push('консоль: ' + logs.join(' | '));
    if (info.sw2 > 1440) problems.push('горизонтальная прокрутка ' + info.sw2);
    if (problems.length) bad++;
    console.log(`${problems.length ? '✗' : '✓'} ${name}: кириллица ${info.cyr}, переключатель → ${info.swHref}${problems.length ? '\n    ' + problems.join('\n    ') : ''}`);
    await p.S('Target.closeTarget', { targetId: (await p.S('Target.getTargetInfo')).targetInfo.targetId }).catch(() => {});
  }
  await B.close();
  console.log(`${pages.length - bad} из ${pages.length} страниц в порядке`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
