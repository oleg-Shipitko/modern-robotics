// Проверка ввода мышью и касанием в интерактивах первого экрана (CDP Input.*).
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../site/index.html');
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const mouse = (p, type, x, y) => p.S('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
  const rectOf = (p, sel, i) => p.eval(`(() => { const r = document.querySelectorAll(${JSON.stringify(sel)})[${i || 0}].getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  // 1. Мультимодальность: тянем препятствие мышью
  let p = await B.page(URL0 + '?hero=modes', { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__hero && window.__hero()'); await sleep(500);
  let r = await rectOf(p, '.hd-cv');
  const s = r.w / 500, ox = r.x + 250 * s, oy = r.y + 205 * s;
  await mouse(p, 'mousePressed', ox, oy);
  for (let i = 1; i <= 6; i++) { await mouse(p, 'mouseMoved', ox + i * 5, oy + i * 6); await sleep(30); }
  await mouse(p, 'mouseReleased', ox + 30, oy + 36);
  console.log('мультимодальность, после перетаскивания:', await p.eval('JSON.stringify(window.__hero().state())'));
  // 2. C-space: клик в рабочей зоне задаёт цель; перетаскивание в C-space двигает руку
  p = await B.page(URL0 + '?hero=cspace', { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__hero && window.__hero()'); await sleep(500);
  r = await rectOf(p, '.hd-cv', 0); const s2 = r.w / 280;
  const before = await p.eval('JSON.stringify(window.__hero().state())');
  await mouse(p, 'mousePressed', r.x + (140 + 0.0 * 128) * s2, r.y + (140 - 0.8 * 128) * s2);
  await mouse(p, 'mouseReleased', r.x + (140 + 0.0 * 128) * s2, r.y + (140 - 0.8 * 128) * s2);
  await sleep(200);
  console.log('C-space: до клика', before, '→ после', await p.eval('JSON.stringify(window.__hero().state())'));
  const r2 = await rectOf(p, '.hd-cv', 1), s3 = r2.w / 280;
  await mouse(p, 'mousePressed', r2.x + (30 + 121) * s3, r2.y + (8 + 60) * s3);
  await mouse(p, 'mouseMoved', r2.x + (30 + 150) * s3, r2.y + (8 + 80) * s3);
  await mouse(p, 'mouseReleased', r2.x + (30 + 150) * s3, r2.y + (8 + 80) * s3);
  console.log('C-space: ручное управление', await p.eval('JSON.stringify(window.__hero().state())'));
  // 3. Равновесие: клик слева от робота толкает вправо; касание пальцем на мобильном
  p = await B.page(URL0 + '?hero=walk', { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__hero && window.__hero()'); await sleep(300);
  r = await rectOf(p, '.hd-cv'); const s4 = r.w / 500;
  await mouse(p, 'mousePressed', r.x + 200 * s4, r.y + 160 * s4); await mouse(p, 'mouseReleased', r.x + 200 * s4, r.y + 160 * s4);
  await sleep(120);
  console.log('равновесие: после клика слева', await p.eval('JSON.stringify(window.__hero().state())'));
  p = await B.page(URL0 + '?hero=modes', { width: 390, height: 844, dpr: 2, mobile: true, light: true });
  await p.waitFor('window.__hero && window.__hero()'); await sleep(300);
  await p.eval('document.querySelector(".hd-cv").scrollIntoView({block: "center", behavior: "instant"})'); await sleep(800);
  r = await rectOf(p, '.hd-cv'); const s5 = r.w / 500, tx = r.x + 250 * s5, ty = r.y + 205 * s5;
  const y0 = await p.eval('scrollY');
  await p.S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  for (let i = 1; i <= 5; i++) { await p.S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx - i * 4, y: ty - i * 8 }] }); await sleep(30); }
  await p.S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('мобильный, касание препятствия:', await p.eval('JSON.stringify(window.__hero().state().O)'), 'прокрутка', y0, '→', await p.eval('scrollY'));
  console.log('логи:', p.logs.join(' | ') || 'нет');
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
