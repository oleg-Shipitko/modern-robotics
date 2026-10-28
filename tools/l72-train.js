// Урок 7.2, лаборатория 2: обучение в Node модели кадров и модели представлений на записях толчков Ады.
// node tools/l72-train.js [папка]   — по умолчанию /tmp/l72work/out; пишет rep.json и pix.json (веса float64, хэши, настройки).
// Дальше: node tools/l72-embed.js [папка] — вшивает веса в lessons/l72/engine.js (восьмибитными, с масштабами по выходам).
// Один поток, около двух минут. Всё с зёрнами: повторный запуск даёт те же веса бит в бит (сверка — по хэшам в JSON).
const fs = require('fs'), path = require('path');
const L = require('../lessons/l72/engine.js'), L71 = L.L71;
const dir = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '/tmp/l72work/out';
fs.mkdirSync(dir, { recursive: true });
const C = L.LAB2;   // настройки обучения — в движке, чтобы урок, тест и обучение брали одни и те же числа
const t0 = Date.now();
const data = L.pushRecords(C.data), S = L.normStats(data); L.prep(data, S);
console.log(`записи: ${C.data.n} записей, ${data.length} толчков, ${((Date.now() - t0) / 1000).toFixed(1)} с`);
const H = (arrs) => L71.hashNums([].concat(...arrs.map((a) => Array.from(a))));
const encW = (E) => [E.W1, E.b1, E.W2, E.b2];
const netW = (m) => [].concat(...m.L.map((l) => [l.w, l.bias]));
// модель представлений (JEPA)
let t1 = Date.now();
const J = L.jepa(C.rep.model);
L71.finish(L.trainJepa(J, data, C.rep.train), (ev) => { if (ev.step % 1000 === 0) process.stdout.write(`${ev.step}:${ev.loss.toFixed(3)}/${ev.spread.toFixed(2)} `); });
const repHash = H(encW(J.enc).concat(netW(J.pred)));
console.log(`\nмодель представлений: ${((Date.now() - t1) / 1000).toFixed(0)} с, хэш ${repHash}`);
fs.writeFileSync(path.join(dir, 'rep.json'), JSON.stringify({ model: C.rep.model, train: C.rep.train, hash: repHash, enc: encW(J.enc).map((a) => Array.from(a)), pred: J.pred.L.map((l) => ({ w: Array.from(l.w), b: Array.from(l.bias) })) }));
// модель кадров
t1 = Date.now();
const P = L.pixModel(C.pix.model);
L71.finish(L.trainPix(P, data, C.pix.train), (ev) => { if (ev.step % 1000 === 0) process.stdout.write(`${ev.step}:${ev.loss.toFixed(4)} `); });
const pixHash = H(encW(P.enc).concat(netW(P.dyn), netW(P.dec)));
console.log(`\nмодель кадров: ${((Date.now() - t1) / 1000).toFixed(0)} с, хэш ${pixHash}`);
fs.writeFileSync(path.join(dir, 'pix.json'), JSON.stringify({ model: C.pix.model, train: C.pix.train, hash: pixHash, enc: encW(P.enc).map((a) => Array.from(a)),
  dyn: P.dyn.L.map((l) => ({ w: Array.from(l.w), b: Array.from(l.bias) })), dec: P.dec.L.map((l) => ({ w: Array.from(l.w), b: Array.from(l.bias) })) }));
fs.writeFileSync(path.join(dir, 'norm.json'), JSON.stringify({ mu: Array.from(S.mu), sd: Array.from(S.sd), hash: H([S.mu, S.sd]) }));
console.log(`готово за ${((Date.now() - t0) / 1000).toFixed(0)} с → ${dir}`);
