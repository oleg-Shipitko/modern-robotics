// Картинка превью ссылок 1200×630 для мессенджеров и соцсетей: site/assets/og.png.
const { launch, sleep } = require('./cdp');
const fs = require('fs'), path = require('path');
const fonts = 'file://' + path.resolve(__dirname, '../site/assets/fonts/fonts.css');
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><link rel="stylesheet" href="${fonts}">
<style>
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { background: #f6f5f1; font-family: Inter, system-ui, sans-serif; color: #0b0b0b; position: relative; }
.bar { position: absolute; left: 0; top: 0; width: 100%; height: 10px; background: linear-gradient(90deg, #2a78d6, #4a3aa7, #eb6834); }
.box { position: absolute; left: 88px; right: 88px; top: 112px; }
.kicker { font-size: 26px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b6a65; margin-bottom: 26px; }
h1 { font-size: 92px; line-height: 1.02; font-weight: 820; letter-spacing: -0.035em; margin: 0 0 30px; }
p { font-size: 32px; line-height: 1.4; color: #3d3c38; margin: 0; max-width: 940px; }
.foot { position: absolute; left: 88px; right: 88px; bottom: 64px; display: flex; justify-content: space-between; font-size: 26px; color: #6b6a65; font-weight: 600; }
</style></head><body><div class="bar"></div>
<div class="box"><div class="kicker">Бесплатный онлайн-курс</div><h1>Modern Robotics<br>и Physical AI</h1>
<p>От классического управления до VLA-моделей и гуманоидов. Лабораторные работы прямо в браузере.</p></div>
<div class="foot"><span>modernrobotics.ru</span><span>Олег Шипитько</span></div></body></html>`;
(async () => {
  const tmp = path.resolve(__dirname, '../shots/og-card.html'); fs.writeFileSync(tmp, html);
  const B = await launch({ w: 1200, h: 630 });
  const p = await B.page('file://' + tmp, { width: 1200, height: 630 });
  await p.waitFor('document.readyState === "complete" && document.fonts.status === "loaded"'); await sleep(400);
  const out = path.resolve(__dirname, '../site/assets/og.png');
  await p.shot(out); console.log('готово:', out, fs.statSync(out).size, 'байт');
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
