// Превью страницы «Карта идей» для мессенджеров и соцсетей: RU и EN, 1200×630.
const { launch, sleep } = require('./cdp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const fonts = 'file://' + path.join(ROOT, 'site/assets/fonts/fonts.css');
const ru = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/shared/ideas-map.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/shared/ideas-map.en.json'), 'utf8'));
const ruNode = new Map(ru.nodes.map((n) => [n.id, n]));
const enNode = new Map(en.nodes.map((n) => [n.id, n]));
const ruLane = new Map(ru.lanes.map((n) => [n.id, n]));
const enLane = new Map(en.lanes.map((n) => [n.id, n]));
const firstYear = Math.min(...ru.nodes.map((n) => n.year));
const lastYear = Math.max(...ru.nodes.map((n) => n.year));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const node = (id, lang) => esc((lang === 'en' ? enNode : ruNode).get(id).title);
const lane = (id, lang) => esc((lang === 'en' ? enLane : ruLane).get(id).title);

function chip(id, lang, x, cls) {
  return `<span class="chip ${cls}" style="left:${x}%">${node(id, lang)}</span>`;
}

function card(lang) {
  const english = lang === 'en';
  const title = english ? 'Course ideas map' : 'Карта идей курса';
  const lead = english
    ? 'How the key methods of robotics evolved — from the Kalman filter to π0.7'
    : 'Как развивались ключевые методы робототехники — от фильтра Калмана до π0.7';
  const works = english ? 'works' : 'работы';
  const themes = english ? 'themes' : 'тем';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><link rel="stylesheet" href="${fonts}">
<style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}body{background:#f6f5f1;color:#0b0b0b;font-family:Inter,system-ui,sans-serif;position:relative}.bar{position:absolute;inset:0 0 auto;height:10px;background:linear-gradient(90deg,#2a78d6,#4a3aa7 54%,#eb6834)}.head{position:absolute;left:72px;right:72px;top:48px}.kicker{color:#6b6a65;font-size:20px;font-weight:760;letter-spacing:.075em;text-transform:uppercase;margin-bottom:9px}h1{font-size:68px;line-height:1.02;letter-spacing:-.04em;font-weight:830;margin:0 0 10px}p{font-size:25px;line-height:1.3;color:#45443f;margin:0;max-width:1020px}.stats{position:absolute;right:72px;top:58px;padding:12px 18px;border:1px solid #d5d2ca;border-radius:999px;background:#fff;font-size:17px;font-weight:720;color:#56544e}.map{position:absolute;left:72px;right:72px;top:250px;height:296px;border:1px solid #d9d6cf;border-radius:24px;background:#fff;box-shadow:0 16px 38px rgba(31,29,24,.10);overflow:hidden}.years{position:absolute;left:194px;right:24px;top:17px;height:24px;color:#7b7870;font:650 14px/1 Inter,system-ui,sans-serif}.years span{position:absolute;transform:translateX(-50%)}.years::after{content:"";position:absolute;left:0;right:0;bottom:0;border-bottom:1px solid #ddd9d1}.lane{position:absolute;left:0;right:0;height:74px;border-top:1px solid #ebe8e1}.lane.classic{top:48px}.lane.imitation{top:122px}.lane.language{top:196px}.lane-name{position:absolute;left:24px;top:25px;width:148px;font-size:17px;font-weight:780;line-height:1.05}.track{position:absolute;left:194px;right:24px;top:0;height:74px}.grid{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(12.5% - 1px),#efede8 calc(12.5% - 1px),#efede8 12.5%)}.rail{position:absolute;top:37px;height:2px;border-radius:2px;opacity:.38}.rail.a{left:8%;right:10%}.rail.b{left:24%;right:5%}.rail.c{left:34%;right:7%}.chip{position:absolute;top:20px;transform:translateX(-50%);height:32px;display:grid;place-items:center;padding:0 13px;border-radius:9px;background:#fff;font-size:14px;font-weight:760;white-space:nowrap;z-index:2}.classic .lane-name{color:#6c5849}.imitation .lane-name{color:#78630b}.language .lane-name{color:#332696}.chip.classic{border:1.5px solid #a58a74;background:#faf7f3}.chip.imitation{border:1.5px solid #b99d35;background:#fcfaf0}.chip.language{border:1.5px solid #6656c7;background:#f7f5ff}.rail.classic{background:#a58a74}.rail.imitation{background:#b99d35}.rail.language{background:#6656c7}.foot{position:absolute;left:72px;right:72px;bottom:27px;display:flex;justify-content:space-between;color:#6b6a65;font-size:18px;font-weight:670}
</style></head><body><div class="bar"></div><div class="head"><div class="kicker">Modern Robotics ${english ? 'and' : 'и'} Physical AI</div><h1>${title}</h1><p>${lead}</p></div><div class="stats">${ru.nodes.length} ${works} · ${ru.lanes.length} ${themes} · ${firstYear}–${lastYear}</div>
<div class="map"><div class="years"><span style="left:4%">1959</span><span style="left:25%">2011</span><span style="left:43%">2017</span><span style="left:67%">2022</span><span style="left:96%">2026</span></div>
<div class="lane classic"><div class="lane-name">${lane('classic', lang)}</div><div class="track"><div class="grid"></div><i class="rail classic a"></i>${chip('kalman', lang, 5, 'classic')}${chip('rrt-star', lang, 26, 'classic')}${chip('mpc-cheetah', lang, 46, 'classic')}</div></div>
<div class="lane imitation"><div class="lane-name">${lane('imitation', lang)}</div><div class="track"><div class="grid"></div><i class="rail imitation b"></i>${chip('dagger', lang, 25, 'imitation')}${chip('diffusion-policy', lang, 70, 'imitation')}${chip('pi05', lang, 91, 'imitation')}</div></div>
<div class="lane language"><div class="lane-name">${lane('language', lang)}</div><div class="track"><div class="grid"></div><i class="rail language c"></i>${chip('transformer', lang, 43, 'language')}${chip('rt1', lang, 68, 'language')}${chip('openvla', lang, 87, 'language')}</div></div></div>
<div class="foot"><span>modernrobotics.ru${english ? '/en' : ''}/karta-idey.html</span><span>${english ? 'Oleg Shipitko' : 'Олег Шипитько'}</span></div></body></html>`;
}

(async () => {
  const B = await launch({ w: 1200, h: 630 });
  try {
    for (const [lang, name] of [['ru', 'og-ideas-map.png'], ['en', 'og-ideas-map-en.png']]) {
      const tmp = path.join(ROOT, 'shots', `og-ideas-map-${lang}.html`);
      fs.writeFileSync(tmp, card(lang));
      const p = await B.page('file://' + tmp, { width: 1200, height: 630, light: true });
      await p.waitFor('document.readyState === "complete" && document.fonts.status === "loaded"');
      await sleep(300);
      const out = path.join(ROOT, 'site/assets', name);
      await p.shot(out);
      console.log('готово:', out, fs.statSync(out).size, 'байт');
    }
  } finally {
    await B.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
