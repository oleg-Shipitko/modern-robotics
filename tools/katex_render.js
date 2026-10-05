// Формулы уроков рендерятся при сборке, в браузере KaTeX не нужен — только стили и шрифты (site/assets/katex).
// В исходнике урока: \( … \) — формула в строке, \[ … \] — отдельной строкой.
// Читает HTML из stdin, пишет в stdout. Внутри <script>, <style>, <pre>, <code>, <textarea> и комментариев ничего не меняет.
// Ошибка в формуле останавливает сборку и показывает формулу.
const katex = require('./vendor/katex/katex.min.js');
const fs = require('fs');

const src = fs.readFileSync(0, 'utf8');
const name = process.argv[2] || 'урок';
const PROTECT = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<textarea[\s\S]*?<\/textarea>|<!--[\s\S]*?-->)/gi;
const MACROS = {
  '\\E': '\\mathbb{E}',
  '\\argmin': '\\operatorname*{arg\\,min}',
  '\\T': '^{\\mathsf{T}}',
};
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, '\u00a0').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
let count = 0;
function render(tex, displayMode) {
  try {
    count++;
    return katex.renderToString(decode(tex).trim(), {
      displayMode, throwOnError: true, macros: { ...MACROS },
      strict: (code) => (code === 'unicodeTextInMathMode' ? 'ignore' : 'warn'),
    });
  } catch (e) {
    console.error(`${name}: ошибка в формуле ${displayMode ? '\\[' : '\\('} ${tex.trim()} ${displayMode ? '\\]' : '\\)'}\n  ${e.message}`);
    process.exit(1);
  }
}
const out = src.split(PROTECT).map((part, i) => {
  if (i % 2 === 1) return part; // защищённый кусок
  return part
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => render(t, true))
    // знак препинания после формулы в строке не должен уезжать на новую строку
    .replace(/\\\(([\s\S]+?)\\\)([,.;:!?…)»]+)?/g, (_, t, punct) => (punct ? `<span class="nobr">${render(t, false)}${punct}</span>` : render(t, false)));
}).join('');
process.stdout.write(out);
console.error(`${name}: формул ${count}`);
