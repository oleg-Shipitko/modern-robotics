// Вшивает результаты tools/l61-train.js (JSON из /tmp/l61/out) в lessons/l61/engine.js между /*@@DATA@@*/ и /*@@/DATA@@*/.
// node tools/l61-embed.js /tmp/l61/out fwd fwdFall noSmooth noAir full512 fixed
// В DATA остаются только перечисленные политики, в том порядке, в каком они названы. Если JSON для политики нет,
// а в движке она уже вшита, запись переносится как есть (так сохраняются политики, обученные раньше).
const fs = require('fs'), path = require('path');
const E = require('../lessons/l61/engine.js');
const dir = process.argv[2], ids = process.argv.slice(3);
const file = path.resolve(__dirname, '../lessons/l61/engine.js');
let src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('/*@@DATA@@*/') + '/*@@DATA@@*/'.length, b = src.indexOf('/*@@/DATA@@*/');
const old = JSON.parse(src.slice(a, b)).policies || {};
const policies = {}, from = [];
for (const id of ids) {
  const f = path.join(dir, id + '.json');
  if (fs.existsSync(f)) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    policies[id] = { preset: r.preset, cmdFixed: r.cmdFixed, terminate: r.terminate, iters: r.iters, nenv: r.nenv, seed: r.seed, secs: r.secs, logstd: r.logstd.map((v) => +v.toFixed(4)), pi: E.packB64(r.pi),
      hist: r.hist.filter((h, i) => i % 10 === 0 || i === r.hist.length - 1).map((h) => ({ it: h.it, r: h.r, falls: h.falls, eps: h.eps })) };
    from.push(id + ' (новая)');
  } else if (old[id]) { policies[id] = old[id]; from.push(id + ' (прежняя)'); }
  else { console.error('нет ни ' + f + ', ни вшитой политики ' + id); process.exit(1); }
}
const data = JSON.stringify({ policies });
src = src.slice(0, a) + data + src.slice(b);
fs.writeFileSync(file, src);
console.log('вшито:', from.join(', '), '; размер DATA', (b - a) / 1024 | 0, 'КБ →', (data.length / 1024) | 0, 'КБ');
