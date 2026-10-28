// Вшивает модели лаборатории 2 (результат tools/l72-train.js) в lessons/l72/engine.js между /*@@DATA@@*/ и /*@@/DATA@@*/.
// node tools/l72-embed.js [папка]   — по умолчанию /tmp/l72work/out.
// Веса — восьмибитные: у каждого выхода слоя свой масштаб (наибольший модуль веса / 127), смещения и масштабы — float32;
// нормировка пикселей — float32. Урок и тест работают с теми же восьмибитными весами (L72.lab2Models()).
const fs = require('fs'), path = require('path');
const L = require('../lessons/l72/engine.js');
const dir = process.argv[2] || '/tmp/l72work/out';
const file = path.resolve(__dirname, '../lessons/l72/engine.js');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const rep = rd('rep.json'), pix = rd('pix.json'), norm = rd('norm.json');
/** Матрица rows × cols (индекс i·cols + j) → восьмибитные значения и масштаб на столбец. */
function quant(w, rows, cols) {
  const s = new Array(cols).fill(0), q = new Int8Array(rows * cols);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) s[j] = Math.max(s[j], Math.abs(w[i * cols + j]));
  const sf = Float32Array.from(s.map((v) => (v || 1e-8) / 127));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) q[i * cols + j] = Math.max(-127, Math.min(127, Math.round(w[i * cols + j] / sf[j])));
  return { q: L.packI8(q), s: L.L71.packF32(Array.from(sf)) };
}
const encQ = (e, nin, H, D) => ({ W1: quant(e[0], nin, H), b1: L.L71.packF32(e[1]), W2: quant(e[2], H, D), b2: L.L71.packF32(e[3]) });
const netQ = (layers, sizes) => layers.map((l, i) => ({ w: quant(l.w, sizes[i], sizes[i + 1]), b: L.L71.packF32(l.b) }));
const nin = L.RES * L.RES * 3, rm = rep.model, pm = pix.model;
const data = {
  hash: { rep: rep.hash, pix: pix.hash, norm: norm.hash },
  norm: { mu: L.L71.packF32(norm.mu), sd: L.L71.packF32(norm.sd) },
  rep: { model: rm, enc: encQ(rep.enc, nin, rm.H, rm.D), pred: netQ(rep.pred, [rm.D + 2, 32, rm.D]) },
  pix: { model: pm, enc: encQ(pix.enc, nin, pm.H, pm.D), dyn: netQ(pix.dyn, [pm.D + 2, 32, pm.D]), dec: netQ(pix.dec, [pm.D, pm.H, nin]) },
};
let src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('/*@@DATA@@*/') + '/*@@DATA@@*/'.length, b = src.indexOf('/*@@/DATA@@*/');
if (a < 12 || b < 0) { console.error('в engine.js нет меток /*@@DATA@@*/ … /*@@/DATA@@*/'); process.exit(1); }
const txt = JSON.stringify(data);
src = src.slice(0, a) + txt + src.slice(b);
fs.writeFileSync(file, src);
console.log(`вшито: модель представлений (хэш ${rep.hash}), модель кадров (хэш ${pix.hash}); DATA ${(txt.length / 1024).toFixed(1)} КБ, engine.js ${(src.length / 1024).toFixed(1)} КБ`);
