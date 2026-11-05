#!/usr/bin/env node
'use strict';

// Воспроизводимый аудит текстовой и структурной формы всех подготовленных уроков.
// Не оценивает научную корректность: для неё нужны досье и первоисточники.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'lessons');

const ids = fs.readdirSync(DIR)
  .filter((id) => /^l\d\d$/.test(id))
  .filter((id) => fs.existsSync(path.join(DIR, id, 'lesson.html')))
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

function decode(s) {
  return s
    .replace(/&nbsp;|&thinsp;|&ensp;|&emsp;/g, ' ')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, h, d) => String.fromCodePoint(parseInt(h || d, h ? 16 : 10)))
    .replace(/&[a-z]+;/gi, ' ');
}
function strip(html) {
  return decode(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
const words = (s) => strip(s).match(/[\p{L}\p{N}]+(?:[.,][\p{N}]+)?(?:[-–—][\p{L}\p{N}]+)*/gu) || [];
const sentences = (s) => strip(s).split(/(?<=[.!?])\s+(?=[А-ЯA-ZЁ«])/u).filter(Boolean);
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map((m) => strip(m[1])).filter(Boolean);
const classes = (html, name) => [...html.matchAll(/\bclass=(?:"([^"]*)"|'([^']*)')/gi)].filter((m) => (m[1] || m[2] || '').split(/\s+/).includes(name)).length;
const median = (a) => { const x = a.slice().sort((u, v) => u - v), n = x.length; return n % 2 ? x[(n - 1) / 2] : (x[n / 2 - 1] + x[n / 2]) / 2; };
const mean = (a) => a.length ? a.reduce((u, v) => u + v, 0) / a.length : 0;
const cleanHeading = (s) => s.replace(/^\d+(?:\.\d+)?\s*[·.]?\s*/, '').trim();

function proseParagraphs(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const stack = [{ tag: '#', prose: false, figure: false }], result = [];
  let current = null;
  for (const token of src.match(/<[^>]+>|[^<]+/g) || []) {
    if (!token.startsWith('<')) { if (current) current.text += ' ' + token; continue; }
    const close = /^<\/\s*([\w-]+)/.exec(token);
    if (close) {
      if (close[1].toLowerCase() === 'p' && current) { const t = strip(current.text); if (t) result.push(t); current = null; }
      while (stack.length > 1) { const x = stack.pop(); if (x.tag === close[1].toLowerCase()) break; }
      continue;
    }
    if (/^<!/.test(token)) continue;
    const open = /^<\s*([\w-]+)([\s\S]*?)\/?\s*>$/.exec(token); if (!open) continue;
    const tag = open[1].toLowerCase(), attrs = open[2], cm = /\bclass=(?:"([^"]*)"|'([^']*)')/i.exec(attrs), cs = (cm ? (cm[1] || cm[2]) : '').split(/\s+/);
    const parent = stack.at(-1), entry = { tag, prose: parent.prose || cs.includes('prose'), figure: parent.figure || tag === 'figure' };
    if (tag === 'p' && entry.prose && !entry.figure) current = { text: '' };
    if (!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !/\/>$/.test(token)) stack.push(entry);
  }
  return result;
}

function data(id) {
  const html = fs.readFileSync(path.join(DIR, id, 'lesson.html'), 'utf8');
  const all = strip(html), ps = tags(html, 'p'), ss = sentences(html), prosePs = proseParagraphs(html), proseText = prosePs.join(' '), proseSs = sentences(proseText), h2 = tags(html, 'h2').map(cleanHeading);
  const h1 = tags(html, 'h1')[0] || '';
  const lead = [...html.matchAll(/<[^>]*class="[^"]*\blead\b[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi)].map((m) => strip(m[1]))[0] || '';
  const labHeads = [...html.matchAll(/<div\s+class="[^"]*\blab-badge\b[^"]*"[^>]*>[\s\S]*?<\/div>\s*<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => strip(m[1]));
  const bridge = [...html.matchAll(/<div\s+class="[^"]*\bbridge-note\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => strip(m[1])).at(-1) || '';
  const pw = ps.map((p) => words(p).length), sw = ss.map((s) => words(s).length), ppw = prosePs.map((p) => words(p).length), psw = proseSs.map((s) => words(s).length);
  return {
    id, lesson: `${Number(id[1])}.${Number(id[2])}`, title: h1,
    words: words(html).length, paragraphs: ps.length, sections: (html.match(/<section\b/gi) || []).length,
    sentences: ss.length, meanSentenceWords: +mean(sw).toFixed(1), meanParagraphWords: +mean(pw).toFixed(1),
    shortParagraphShare: +(pw.filter((n) => n < 18).length / Math.max(1, pw.length)).toFixed(2),
    proseParagraphs: prosePs.length, meanProseSentenceWords: +mean(psw).toFixed(1), meanProseParagraphWords: +mean(ppw).toFixed(1),
    shortProseShare: +(ppw.filter((n) => n < 18).length / Math.max(1, ppw.length)).toFixed(2),
    labs: classes(html, 'lab'), sceneCards: classes(html, 'scene-card'), guideCards: classes(html, 'guide-card'), deep: classes(html, 'deep'),
    animations: (html.match(/data-anim=/gi) || []).length, charts: classes(html, 'stat-fig'), formulas: (html.match(/\\\(|\\\[/g) || []).length,
    recall: /id="recall"/.test(html), quiz: /id="quiz"/.test(html), finale: /id="finale"/.test(html), bridge: !!bridge,
    firstPersonPlural: (all.match(/(?<!\p{L})(?:мы|нам|наш(?:а|и|е|у|их|его|ей)?)(?!\p{L})/giu) || []).length,
    secondPerson: (all.match(/(?<!\p{L})(?:ты|тебе|тебя|твой|твоя|твои|твоё|твоего|твоей|твою)(?!\p{L})/giu) || []).length,
    forbiddenHeadings: h2.filter((x) => /^(Проблема|Причина|Идея|Решение)$/i.test(x)),
    sloganHits: (all.match(/не просто[^.!?]{0,80},?\s*а/giu) || []).length,
    codeBare: id === 'l73' ? (all.match(/(?<!\p{L})код(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?!\p{L})/giu) || []).length : undefined,
    lead, headings: h2, labHeadings: labHeads, bridgeText: bridge,
  };
}

const targetIds = ['l73', 'l74', 'l75', 'l82', 'l83', 'l84', 'l85', 'l86', 'l87', 'l88'];
const rows = ids.map(data), previous = rows.filter((r) => Number(r.id.slice(1)) <= 72), targets = rows.filter((r) => targetIds.includes(r.id));
const numeric = ['words', 'paragraphs', 'sections', 'sentences', 'meanSentenceWords', 'meanParagraphWords', 'shortParagraphShare', 'proseParagraphs', 'meanProseSentenceWords', 'meanProseParagraphWords', 'shortProseShare', 'labs', 'sceneCards', 'guideCards', 'deep', 'animations', 'charts', 'formulas'];
const prevalence = ['recall', 'quiz', 'finale', 'bridge'].map((k) => [k, previous.filter((r) => r[k]).length, previous.length]);
const summary = Object.fromEntries(numeric.map((k) => [k, { median: median(previous.map((r) => r[k])), min: Math.min(...previous.map((r) => r[k])), max: Math.max(...previous.map((r) => r[k])) }]));

if (process.argv.includes('--transitions')) {
  for (const id of targetIds) {
    const html = fs.readFileSync(path.join(DIR, id, 'lesson.html'), 'utf8'), starts = [...html.matchAll(/<section\b[^>]*>/gi)];
    console.log(`\n# ${id}`);
    for (let i = 0; i < starts.length; i++) {
      const block = html.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : html.length), heading = tags(block, 'h2')[0] || tags(block, 'h1')[0] || '(без заголовка)', ps = tags(block, 'p');
      console.log(`\n## ${cleanHeading(heading)}`);
      console.log(`начало: ${ps[0] || '—'}`);
      console.log(`конец: ${ps.at(-1) || '—'}`);
    }
  }
} else if (process.argv.includes('--outlines')) {
  for (const r of rows) {
    console.log(`\n## ${r.lesson} · ${r.title}`);
    console.log(`lead: ${r.lead || '—'}`);
    console.log(`sections: ${r.headings.join(' → ')}`);
    console.log(`labs: ${r.labHeadings.join(' | ') || '—'}`);
    console.log(`bridge: ${r.bridgeText || '—'}`);
  }
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ methodology: 'Visible Russian lesson HTML; scripts, styles and comments excluded.', previous, targets, summary, prevalence }, null, 2));
} else {
  console.log('урок\tслова\tразделы\tабзацы\tср. предложение\tср. абзац prose\tлабы\tscene/guide\tdeep\tanim\tcharts\trecall/quiz/bridge');
  for (const r of rows) console.log([r.lesson, r.words, r.sections, r.paragraphs, r.meanSentenceWords, r.meanProseParagraphWords, r.labs, `${r.sceneCards}/${r.guideCards}`, r.deep, r.animations, r.charts, `${+r.recall}/${+r.quiz}/${+r.bridge}`].join('\t'));
  console.log('\nмедианы всего курса до 7.3');
  for (const k of numeric) console.log(`${k}: ${summary[k].median} (${summary[k].min}…${summary[k].max})`);
  console.log('\nраспространённость обязательных компонентов');
  for (const [k, n, total] of prevalence) console.log(`${k}: ${n}/${total}`);
}
