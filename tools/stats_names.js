// Названия миссий и задач для отчёта статистики (tools/stats.py): открывает опубликованные уроки
// и записывает в tools/stats_names.json, какой раздел у каждой лаборатории и как называются её миссии.
// Перезапускать после изменения миссий: node tools/stats_names.js
const { launch, sleep } = require('./cdp');
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../site/config.json'), 'utf8'));
(async () => {
  const B = await launch({ w: 1440, h: 900 });
  const out = {};
  for (const { file } of cfg.PUBLISHED) {
    const p = await B.page('file://' + path.resolve(__dirname, '../site/' + file), { width: 1440, height: 900, light: true });
    await p.waitFor('document.readyState === "complete"'); await sleep(1200);
    const slug = path.basename(file, '.html');
    out[slug] = JSON.parse(await p.eval(`JSON.stringify((() => {
      const sec = (el) => { const s = el.closest('section[id]'); return s ? s.id : ''; };
      const missions = {};
      document.querySelectorAll('.m-card').forEach((c) => { const root = c.parentElement; if (!root.id) return;
        missions[root.id] = { sec: sec(root), names: [...root.querySelectorAll('.m-steps li span')].map((s) => s.textContent.trim()), first: (c.querySelector('h3') || {}).textContent || '' }; });
      const st = document.querySelectorAll('#stepper [role="tab"]');
      if (st.length) missions.lab1 = { sec: sec(st[0]), names: [...st].map((b) => b.textContent.replace(/\\s+/g, ' ').replace(/^[0-9∞]+/, '').trim()) };
      const tasks = {};
      document.querySelectorAll('.t16-task[id]').forEach((t) => { if (/Task$/.test(t.id)) { const h = document.querySelector('#' + t.id.replace(/Task$/, 'Head') + ' h4') || t.querySelector('h4'); tasks[t.id] = { sec: sec(t), name: h ? h.textContent.trim() : t.id }; } });
      return { missions, tasks };
    })())`));
    await p.close?.();
  }
  fs.writeFileSync(path.resolve(__dirname, 'stats_names.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('tools/stats_names.json:', Object.keys(out).length, 'уроков,', Object.values(out).reduce((a, x) => a + Object.keys(x.missions).length, 0), 'лабораторий');
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
