#!/usr/bin/env node
'use strict';

// Сравнивает форму уроков по исходным HTML. Это не проверка качества текста,
// а воспроизводимый замер объёма и набора обязательных элементов.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LESSONS = path.join(ROOT, 'lessons');
const ids = fs.readdirSync(LESSONS)
  .filter((id) => /^l\d\d$/.test(id))
  .filter((id) => fs.existsSync(path.join(LESSONS, id, 'lesson.html')))
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

function textOf(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|thinsp|ensp|emsp);/g, ' ')
    .replace(/&(?:laquo|raquo|quot);/g, '"')
    .replace(/&(?:mdash|ndash);/g, '–')
    .replace(/&#(?:x[0-9a-f]+|\d+);/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

function count(re, s) { return (s.match(re) || []).length; }
function countClass(html, name) {
  return [...html.matchAll(/\bclass=(?:"([^"]*)"|'([^']*)')/gi)]
    .filter((m) => (m[1] || m[2] || '').split(/\s+/).includes(name)).length;
}
function median(xs) {
  const a = xs.slice().sort((x, y) => x - y), n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}
function lessonNo(id) { return `${Number(id[1])}.${Number(id[2])}`; }
function stats(id) {
  const html = fs.readFileSync(path.join(LESSONS, id, 'lesson.html'), 'utf8');
  const text = textOf(html);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return {
    id,
    lesson: lessonNo(id),
    title: h1 ? textOf(h1[1]).replace(/\s+/g, ' ').trim() : '',
    words: (text.match(/[\p{L}\p{N}]+(?:[.,][\p{N}]+)?(?:[-–—][\p{L}\p{N}]+)*/gu) || []).length,
    sections: count(/<section\b/gi, html),
    paragraphs: count(/<p\b/gi, html),
    labs: countClass(html, 'lab'),
    animations: count(/data-anim=/gi, html),
    charts: Math.max(countClass(html, 'stat-fig'), count(/data-chart=/gi, html)),
    deep: count(/<details\s+class="[^"]*\bdeep\b/gi, html),
    quiz: /id="quiz"/.test(html) ? 1 : 0,
    bridge: /class="[^"]*\bbridge-note\b/.test(html) ? 1 : 0,
  };
}

const rows = ids.map(stats);
const before = rows.filter((r) => Number(r.id.slice(1)) <= 72);
const targetIds = ['l73', 'l74', 'l75', 'l82', 'l83', 'l84', 'l85', 'l86', 'l87', 'l88'];
const targets = rows.filter((r) => targetIds.includes(r.id));
const neighbors = rows.filter((r) => r.id === 'l71' || r.id === 'l72');
const fields = ['words', 'sections', 'paragraphs', 'labs', 'animations', 'charts', 'deep'];
const summary = Object.fromEntries(fields.map((f) => [f, {
  previousMedian: median(before.map((r) => r[f])),
  neighborMedian: median(neighbors.map((r) => r[f])),
} ]));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ methodology: 'Visible text and structural tags in lessons/lXX/lesson.html; scripts, styles and comments excluded.', previous: before, targets, summary }, null, 2));
} else {
  console.log('урок\tслова\tразделы\tабзацы\tлабы\tанимации\tдиаграммы\tпод капотом\tназвание');
  for (const r of rows) console.log([r.lesson, r.words, r.sections, r.paragraphs, r.labs, r.animations, r.charts, r.deep, r.title].join('\t'));
  console.log('\nмедианы до 7.3 / медианы 7.1–7.2');
  for (const f of fields) console.log(`${f}: ${summary[f].previousMedian} / ${summary[f].neighborMedian}`);
}
