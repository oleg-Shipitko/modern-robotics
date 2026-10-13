#!/usr/bin/env python3
"""Строки с кириллицей в JS урока — для перевода. Печатает заготовку словаря i18n.en.json
(ключ — содержимое строкового литерала без кавычек, значение — пустое) или сверяет существующий словарь.
Запуск: python3 tools/i18n_extract.py l13            — заготовка (JSON в stdout)
        python3 tools/i18n_extract.py l13 --check    — какие литералы не переведены / лишние ключи
        python3 tools/i18n_extract.py shared          — общие файлы lessons/shared/*.js и l01/ui-core.js
Литералы: '…', "…", `…` (шаблонные — целиком, с ${…} как есть). Комментарии пропускаются. Регулярные
выражения с кириллицей (/…/) не трогаем — их переводят отдельно, если они влияют на текст."""
import json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'lessons'
SHARED = ['shared/missions.js', 'shared/cards.js', 'shared/check.js', 'shared/thanks.js', 'shared/feedback.js',
          'shared/glossary.js', 'shared/recall.js', 'shared/progress.js', 'shared/guide.js', 'shared/kit.js',
          'shared/anim.js', 'shared/drive-lab.js', 'shared/kettle-draw.js', 'shared/drive-core.js', 'shared/kettle-core.js',
          'shared/arm-core.js', 'shared/actuator-core.js', 'shared/mpc-core.js', 'l01/ui-core.js']
CYR = re.compile(r'[А-Яа-яЁё]')

def literals(src):
    """Содержимое строковых литералов в порядке появления (без кавычек, с экранированием как в исходнике)."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i); i = n if j < 0 else j + 1; continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in ('"', "'", '`'):
            q = c; j = i + 1; buf = []
            while j < n:
                d = src[j]
                if d == '\\' and j + 1 < n:
                    buf.append(src[j:j + 2]); j += 2; continue
                if q == '`' and d == '$' and j + 1 < n and src[j + 1] == '{':  # ${…} целиком, с вложенными строками
                    depth, k = 0, j
                    while k < n:
                        if src[k] == '{': depth += 1
                        elif src[k] == '}':
                            depth -= 1
                            if depth == 0: break
                        k += 1
                    buf.append(src[j:k + 1]); j = k + 1; continue
                if d == q: break
                if d == '\n' and q != '`': break
                buf.append(d); j += 1
            out.append(''.join(buf)); i = j + 1; continue
        i += 1
    return out

def keys_for(files):
    keys = []
    for f in files:
        p = ROOT / f
        if not p.exists(): continue
        for lit in literals(p.read_text(encoding='utf-8')):
            if (CYR.search(lit) or lit in ('ru-RU',)) and lit not in keys:
                keys.append(lit)
    return keys

def main():
    key = sys.argv[1] if len(sys.argv) > 1 else 'l01'
    check = '--check' in sys.argv
    if key == 'shared':
        files, dict_path = SHARED, ROOT / 'shared/i18n.en.json'
    else:
        files = sorted(str(p.relative_to(ROOT)) for p in (ROOT / key).glob('*.js'))
        dict_path = ROOT / key / 'i18n.en.json'
    keys = keys_for(files)
    if not check:
        print(json.dumps({k: '' for k in keys}, ensure_ascii=False, indent=1)); return
    d = json.loads(dict_path.read_text(encoding='utf-8')) if dict_path.exists() else {}
    missing = [k for k in keys if not d.get(k)]
    extra = [k for k in d if k not in keys]
    print(f'{key}: литералов с кириллицей {len(keys)}, переведено {len(keys) - len(missing)}, не переведено {len(missing)}, лишних ключей {len(extra)}')
    for k in missing[:40]: print('  НЕТ:', k[:120])
    for k in extra[:10]: print('  ЛИШНИЙ:', k[:120])
    sys.exit(1 if missing else 0)

if __name__ == '__main__':
    main()
