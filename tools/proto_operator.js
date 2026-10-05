// Проверка прототипа лабы «Ты — оператор»: демонстрации → обучение → 10 поездок → DAgger → запись своей поездки мышью.
const { launch, sleep } = require('./cdp');
const path = require('path');
const URL0 = 'file://' + path.resolve(__dirname, '../proto/lab-operator.html');
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lab'); await sleep(300);
  const hist = () => p.eval('Array.from(document.querySelectorAll("#history li")).map(l => l.textContent).join(" | ")');
  const waitIdle = async () => { await p.eval('document.querySelector("#scene").scrollIntoView({block: "center", behavior: "instant"})'); await p.waitFor('window.__lab.st.mode === "idle"', 60000); };
  await p.click('#btnDemos'); await sleep(100);
  await p.click('#btnTrain'); await waitIdle();
  await p.click('[data-pred="4–7"]'); await p.click('#btnRun'); await sleep(200); await waitIdle();
  console.log('BC 10 демо:', await hist());
  await p.shotEl(path.resolve(__dirname, '../shots/proto-operator-bc.png'), '.lab', 6);
  await p.eval('document.querySelector("[name=view][value=heat]").click()'); await sleep(300);
  await p.shotEl(path.resolve(__dirname, '../shots/proto-operator-heat.png'), '.scene-card', 6);
  await p.eval('document.querySelector("[name=view][value=traj]").click()');
  await p.click('#btnDagger'); await sleep(300); await p.waitFor('window.__lab.st.mode === "train" || /Итерация DAgger/.test(document.querySelector("#labMsg").textContent)', 60000); await waitIdle();
  await p.click('#btnRun'); await sleep(200); await waitIdle();
  console.log('после DAgger:', await hist());
  await p.shotEl(path.resolve(__dirname, '../shots/proto-operator-dagger.png'), '.scene-card', 6);
  // своя поездка: ведём курсор по маршруту учителя с упреждением
  await p.click('#btnClear'); await p.click('#btnRecord'); await p.eval('document.querySelector("#scene").scrollIntoView({block: "center", behavior: "instant"})'); await sleep(300);
  const r = await p.eval('(() => { const b = document.querySelector("#scene").getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / 600 }; })()');
  const PATH = await p.eval('window.__lab.D.PATH');
  for (let i = 0; i < 400; i++) {
    const st = await p.eval('(() => { const d = window.__lab.st.drive; return d ? { x: d.s.x, y: d.s.y } : null; })()');
    if (!st) break;
    // ближайшая точка маршрута и точка впереди
    let bi = 0, bd = 1e9; PATH.forEach((q, k) => { const d = (q[0] - st.x) ** 2 + (q[1] - st.y) ** 2; if (d < bd) { bd = d; bi = k; } });
    const t = PATH[Math.min(PATH.length - 1, bi + 6)];
    await p.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + t[0] * r.s, y: r.y + t[1] * r.s });
    await sleep(60);
  }
  await sleep(300);
  console.log('своя поездка:', await p.eval('document.querySelector("#labMsg").textContent'), '| демонстраций:', await p.eval('window.__lab.st.demos.length'));
  console.log('логи:', p.logs.join(' | ') || 'нет');
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
