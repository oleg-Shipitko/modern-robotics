// Вшивает результат tools/l73-train.js в lessons/l73/engine.js.
const fs = require('fs'), path = require('path');
const L = require('../lessons/l73/engine.js'), dir = process.argv[2] || '/tmp/l73work/out';
const d = JSON.parse(fs.readFileSync(path.join(dir, 'models.json'), 'utf8'));
const pack = a => L.L71.packF32(a), net = q => q.map(x => ({ w:pack(x.w), b:pack(x.b) }));
const dec={}; for(const [k,v] of Object.entries(d.tok.dec)) dec[k]=pack(v);
const genie={}; for(const [k,v] of Object.entries(d.genie)) genie[k]={model:v.model,lam:net(v.lam),dyn:net(v.dyn),book:pack(v.book),steps:v.steps};
const hash = L.L71.hashNums([].concat(...d.genie.main.dyn.map(x=>x.w), d.genie.main.book));
const data={cfg:d.cfg,hash,tok:{S:{mu:pack(d.tok.S.mu),sd:pack(d.tok.S.sd)},zmu:pack(d.tok.zmu),zsd:pack(d.tok.zsd),enc:net(d.tok.enc),dec},genie};
const file=path.resolve(__dirname,'../lessons/l73/engine.js'); let src=fs.readFileSync(file,'utf8');
const a=src.indexOf('/*@@DATA@@*/')+12,b=src.indexOf('/*@@/DATA@@*/'); if(a<12||b<0) throw Error('нет меток DATA');
const txt=JSON.stringify(data); src=src.slice(0,a)+txt+src.slice(b); fs.writeFileSync(file,src);
console.log(`вшито ${(txt.length/1024).toFixed(1)} КБ, hash ${hash}`);
