// Проверка общих компонентов: миссии (ставка, действие, критерии, живая проверка) и карточки.
const { launch, sleep } = require('./cdp');
const path = require('path');
(async () => {
  const B = await launch({ w: 1200, h: 900 });
  const p = await B.page('file://' + path.resolve(__dirname, '../proto/missions-demo.html'), { width: 1200, height: 900, light: true });
  await p.waitFor('window.__ready === true', 20000);
  const q = (s) => p.eval(s);
  console.log('кнопка заблокирована до ставки:', await q('document.querySelector("#guide .g-go").disabled'), '| компенсация скрыта:', await q('document.querySelector("#wrapC").hidden'));
  await q('document.querySelectorAll("#guide .m-bet .opts button")[1].click()');
  await q('document.querySelector("#guide .g-go").click()'); await sleep(400);
  console.log('после k=2:', await q('[...document.querySelectorAll("#guide .m-crit li")].map(l => l.className).join(",")'), '|', await q('document.querySelector("#guide .g-out").textContent'), '| журнал:', await q('document.querySelector("#guide .m-log").textContent'));
  await q(`(() => { const k = document.querySelector("#k"); k.value = 8; k.dispatchEvent(new Event("input")); })()`);
  await q('document.querySelector("#guide .g-go").click()'); await sleep(400);
  console.log('после k=8:', await q('[...document.querySelectorAll("#guide .m-crit li")].map(l => l.className).join(",")'), '|', await q('document.querySelector("#guide .g-out").textContent'), '| ставка:', await q('[...document.querySelectorAll("#guide .m-bet button")].map(b => b.className).join(" / ")'));
  await q('document.querySelector("#guide .g-next").click()'); await sleep(100);
  console.log('миссия 2, компенсация видна:', !(await q('document.querySelector("#wrapC").hidden')));
  await q(`(() => { const k = document.querySelector("#k"); k.value = 7; k.dispatchEvent(new Event("input")); })()`);
  console.log('k=7 без компенсации:', await q('[...document.querySelectorAll("#guide .m-crit li")].map(l => l.className).join(",")'), 'next hidden', await q('document.querySelector("#guide .g-next").hidden'));
  await q(`(() => { const c = document.querySelector("#c"); c.checked = true; c.dispatchEvent(new Event("change")); })()`);
  console.log('после компенсации:', await q('[...document.querySelectorAll("#guide .m-crit li")].map(l => l.className).join(",")'), '|', await q('document.querySelector("#guide .g-out").textContent'), 'next hidden', await q('document.querySelector("#guide .g-next").hidden'));
  await q('document.querySelector("#guide .g-next").click()'); await sleep(100);
  console.log('свободный режим:', await q('document.querySelector("#guide .g-kicker").textContent'));
  // карточки: перетаскивание мышью через CDP
  const box = async (sel) => p.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await q('document.querySelector("#sortBox").scrollIntoView({block: "center"})'); await sleep(200);
  async function drag(from, to) {
    const a = await box(from), b = await box(to);
    await p.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let t = 1; t <= 8; t++) await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * t / 8, y: a.y + (b.y - a.y) * t / 8, button: 'left' });
    await p.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(100);
  }
  await drag('[data-id=a]', '[data-zone=qdd]');
  await drag('[data-id=b]', '[data-zone=tendon]');
  // тап: карточка, потом корзина
  await q('document.querySelector("[data-id=c]").dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, clientX: 1, clientY: 1}))');
  await q('document.querySelector("[data-id=c]").dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 1, clientY: 1}))');
  await q('document.querySelector("[data-zone=hd]").click()'); await sleep(100);
  console.log('разложено:', await q('[...document.querySelectorAll(".c-zone")].map(z => z.dataset.zone + ":" + [...z.querySelectorAll(".c-card")].map(c => c.dataset.id).join("")).join(" ")'));
  await q('document.querySelector("#sortBox .c-bar .btn.primary").click()'); await sleep(100);
  console.log('проверка:', await q('document.querySelector("#sortBox .c-out").textContent'));
  await p.shot(path.resolve(__dirname, '../shots/missions-demo.png'));
  console.log('логи:', p.logs.join(' | ') || 'нет');
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
