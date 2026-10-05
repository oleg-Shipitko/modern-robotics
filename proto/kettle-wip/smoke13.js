const { launch, sleep } = require(process.env.HOME + '/Documents/robotics-course/tools/cdp.js');
const path = require('path');
const URL0 = 'file://' + process.env.HOME + '/Documents/robotics-course/site/lessons/1-3-multimodalnost-deystviy.html';
(async () => {
  const B = await launch({ w: 1440, h: 1000 });
  const p = await B.page(URL0, { width: 1440, height: 1000, light: true });
  await p.waitFor('window.__lessonReady === true', 60000);
  await sleep(500);
  for (const id of ['top', 'kettle', 'mean', 'modes', 'models', 'lab', 'seams']) {
    await p.shotEl('/tmp/kc/shots/s13-' + id + '.png', '#' + id, 0);
  }
  console.log('logs:', p.logs.join(' | ') || 'нет');
  await B.close();
})().catch((e) => { console.error(e); process.exit(1); });
