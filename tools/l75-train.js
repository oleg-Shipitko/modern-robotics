// Обучение и упаковка моделей урока 7.5: node tools/l75-train.js
'use strict';
const fs = require('fs'), path = require('path'), L = require('../lessons/l71/engine.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'lessons/l75/model-data.js');
const DEMO = L.records({ n: 24, seed: 75, layout: 'base' }).trans;
const POLICY_BANK = [
  [.12, -.10, 0], [.16, -.10, .03], [.20, -.08, 0], [.24, -.06, .03], [.28, -.04, .06],
  [.32, -.02, 0], [.28, 0, .06], [.36, .02, .03], [.32, .04, .06], [.28, .06, 0],
  [.24, .08, .03], [.20, .10, .06], [.40, 0, .03], [.46, 0, .03], [.52, -.02, 0],
  [.58, .02, .06], [.64, -.04, .03], [.70, .04, 0], [.76, -.06, .06], [.18, .12, .03],
];

function policyData(n, successesOnly) {
  const trans = [], episodes = [];
  POLICY_BANK.forEach((theta, i) => {
    const got = L.collectPolicy(theta, n, 750 + i * 17 + n, L.LAYOUTS.base);
    got.ev.runs.forEach((run) => {
      const failed = !run.ok;
      episodes.push({ failed, n: run.trans.length });
      if (!successesOnly || !failed) trans.push(...run.trans);
    });
  });
  return { trans, episodes };
}

function train(name, extra, seed) {
  const ens = L.ensemble({ k: 3, hidden: [20, 20], seed });
  L.finish(L.trainEnsemble(ens, DEMO.concat(extra), { epochs: 22, bs: 64, lr: .002, seed }));
  return {
    name,
    nets: ens.nets.map(L.packNet),
    fails: ens.fails.map(L.packNet),
    k: ens.k,
    seed: ens.seed,
    n: ens.n,
    npos: ens.npos,
    epochs: ens.epochs,
  };
}

const p2 = policyData(2, false), p6 = policyData(6, false);
const s2 = policyData(2, true), s6 = policyData(6, true);
const data = {
  version: 1,
  training: {
    demoTransitions: DEMO.length,
    demoEpisodes: 24,
    policyBank: POLICY_BANK.length,
    policyEpisodes: { p2: p2.episodes.length, p6: p6.episodes.length },
    failedEpisodes: {
      p2: p2.episodes.filter((x) => x.failed).length,
      p6: p6.episodes.filter((x) => x.failed).length,
    },
  },
  models: {
    demo: train('только демонстрации', [], 75),
    p2all: train('2 прогона на чекпойнт, включая неудачи', p2.trans, 752),
    p6all: train('6 прогонов на чекпойнт, включая неудачи', p6.trans, 74),
    p2success: train('2 прогона на чекпойнт, только успехи', s2.trans, 762),
    p6success: train('6 прогонов на чекпойнт, только успехи', s6.trans, 766),
  },
};

const js = `/* Сгенерировано tools/l75-train.js. Не редактировать вручную. */\n(function(root,factory){const x=factory();if(typeof module!=='undefined'&&module.exports)module.exports=x;else root.L75ModelData=x;})(typeof window!=='undefined'?window:globalThis,function(){return ${JSON.stringify(data)};});\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, js);
console.log(`Записано ${path.relative(ROOT, OUT)}: ${Math.round(Buffer.byteLength(js) / 1024)} КБ`);
console.log(data.training);
