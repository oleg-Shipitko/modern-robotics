// Урок 7.3: детерминированное обучение видеотокенизатора и моделей латентных действий.
// node tools/l73-train.js [папка] → /tmp/l73work/out/models.json
const fs = require('fs'), path = require('path');
const L = require('../lessons/l73/engine.js'), E = L.L71;
const dir = process.argv[2] || '/tmp/l73work/out'; fs.mkdirSync(dir, { recursive: true });
const cfg = {
  data: { n: 320, T: 24, seed: 11 },
  tok: { model: { H: 48, D: 4, Hg: 32, H2: 24, seed: 3 }, train: { steps: 5000, bs: 32, lr: .002, px: 48, seed: 5, every: 250 } },
  genie: { model: { K: 8, A: 2, C: 8, D: 4, Hd: 64, seed: 7 }, train: { steps: 8000, bs: 32, lr: .001, warm: 1800, seed: 9, every: 250 } },
};
const t0 = Date.now(), vids = L.videos(cfg.data), frames = vids.flatMap(v => v.frames);
console.log(`данные: ${vids.length} роликов, ${frames.length} кадров`);
const T = L.tokenizer(cfg.tok.model);
E.finish(L.trainTokenizer(T, frames, cfg.tok.train), e => process.stdout.write(`${e.step}:${e.loss.toFixed(4)} `));
console.log(`\nтокенизатор: ${((Date.now()-t0)/1000).toFixed(0)} с`);
const seqs = vids.map(v => ({ Z: v.frames.map(f => L.encode(T, f)), look: v.looks }));
const M = L.genie(cfg.genie.model);
E.finish(L.trainGenie(M, seqs, cfg.genie.train), e => process.stdout.write(`${e.step}:${e.loss.toFixed(4)}/${e.used} `));
console.log(`\nмодель: ${((Date.now()-t0)/1000).toFixed(0)} с`);
const net = m => m.L.map(x => ({ w: Array.from(x.w), b: Array.from(x.bias) }));
const dec = {}; for (const k of T.dec.keys) dec[k] = Array.from(T.dec.P[k]);
const out = { cfg, tok: { S: { mu:Array.from(T.S.mu), sd:Array.from(T.S.sd) }, zmu:Array.from(T.zmu), zsd:Array.from(T.zsd), enc:net(T.enc), dec },
  genie: { main: { model:cfg.genie.model, lam:net(M.lam), dyn:net(M.dyn), book:Array.from(M.book), steps:M.steps } } };
fs.writeFileSync(path.join(dir, 'models.json'), JSON.stringify(out));
console.log(`готово → ${dir}/models.json`);
