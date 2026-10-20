// Обучение политик ходьбы Ады для урока 6.1 в Node (тяжёлые сетки PPO), результат — JSON с весами (Float32) и проверкой.
// node tools/l61-train.js <имя> --preset full|fwd|fwdFall [--cmd 0.6] [--noterm] [--iters 300] [--nenv 256] [--seed 1] [--out /tmp/l61/out]
const path = require('path'), fs = require('fs');
const E = require('../lessons/l61/engine.js');
const argv = process.argv.slice(2), name = argv[0];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const preset = opt('preset', 'full'), iters = +opt('iters', 300), nenv = +opt('nenv', 256), seed = +opt('seed', 1), outDir = opt('out', '/tmp/l61/out');
const o = { WEIGHTS: E.PRESETS[preset], TERMINATE: !argv.includes('--noterm'), ITERS: iters, N_ENV: nenv, T: 24, SEED: seed, MB: nenv * 24 / 4 };
if (opt('cmd', null) != null) o.cmdFixed = +opt('cmd');
const t0 = Date.now(), hist = [];
const g = E.trainPPO(o); let r;
while (!(r = g.next()).done) { const h = r.value; hist.push({ it: h.it, ret: +h.ret.toFixed(2), dist: +h.dist.toFixed(2), falls: h.falls, eps: h.eps, r: +h.rMean.toFixed(4), kl: +h.kl.toFixed(4), sigma: +h.sigma.toFixed(3) }); if (h.it % 20 === 0 || h.it === iters - 1) console.log(name, 'it', h.it, 'eps', h.eps, 'falls', h.falls, 'ret', h.ret.toFixed(1), 'dist', h.dist.toFixed(2), 'r', h.rMean.toFixed(3), 'σ', h.sigma.toFixed(3), ((Date.now() - t0) / 1000).toFixed(0) + 's'); }
const A = r.value.A, pi = E.packNet(A.pi), pol = E.netPolicy(E.unpackNet(pi));
const evalAt = (cmd) => { const ev = E.evaluate(pol, Object.assign({}, o, { cmdFixed: cmd, TERMINATE: true, WEIGHTS: E.PRESETS.full }), 6, 777, 400); return { cmd, ok: ev.ok, v: +ev.vMean.toFixed(3), err: +ev.err.toFixed(3), ret: +ev.ret.toFixed(2) }; };
const evalOwn = E.evaluate(pol, Object.assign({}, o, { TERMINATE: o.TERMINATE }), 10, 777, 400);
const res = { name, preset, cmdFixed: o.cmdFixed == null ? null : o.cmdFixed, terminate: o.TERMINATE, iters, nenv, seed, secs: +((Date.now() - t0) / 1000).toFixed(0), pi, logstd: Array.from(A.logstd), hist,
  evalOwn: { ok: evalOwn.ok, v: +evalOwn.vMean.toFixed(3), err: +evalOwn.err.toFixed(3), ret: +evalOwn.ret.toFixed(2), runs: evalOwn.runs.map((x) => ({ cmd: +x.cmd.toFixed(3), v: +x.vMean.toFixed(3), dist: +x.dist.toFixed(2), fell: x.fell, hip: +x.hipMean.toFixed(3), pitch: +x.pitchMean.toFixed(3), tau: +x.tauMean.toFixed(0), ret: +x.ret.toFixed(2) })) },
  evalCmd: [0.2, 0.4, 0.6, 0.8, 1.0].map(evalAt) };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(res));
console.log(name, 'done', res.secs + 's', 'own:', JSON.stringify(res.evalOwn.runs.slice(0, 3)), 'cmd:', JSON.stringify(res.evalCmd));
