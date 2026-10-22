#!/usr/bin/env python3
"""Строки с кириллицей в JS урока — для перевода. Печатает заготовку словаря i18n.en.json
(ключ — содержимое строкового литерала без кавычек, значение — пустое) или сверяет существующий словарь.
Запуск: python3 tools/i18n_extract.py l13            — заготовка (JSON в stdout)
        python3 tools/i18n_extract.py l13 --check    — какие литералы не переведены / лишние ключи
        python3 tools/i18n_extract.py shared          — общие файлы lessons/shared/*.js и l01/ui-core.js
        python3 tools/i18n_extract.py site            — скрипты сайта site/assets/hero/*.js → словарь site/i18n.en.json
Литералы: '…', "…", `…` (шаблонные — целиком, с ${…} как есть). Комментарии пропускаются. Регулярные
выражения с кириллицей (/…/) не трогаем — их переводят отдельно, если они влияют на текст.
Сборки (lessons/build.py, site/build.py) берут отсюда literals(), load_dict() и translate_js()."""
import json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'lessons'
SITE = ROOT.parent / 'site'
SHARED = ['shared/missions.js', 'shared/cards.js', 'shared/check.js', 'shared/thanks.js', 'shared/feedback.js',
          'shared/glossary.js', 'shared/recall.js', 'shared/progress.js', 'shared/guide.js', 'shared/kit.js',
          'shared/anim.js', 'shared/stats-chart.js', 'shared/drive-lab.js', 'shared/kettle-draw.js', 'shared/drive-core.js', 'shared/kettle-core.js',
          'shared/arm-core.js', 'shared/actuator-core.js', 'shared/mpc-core.js', 'l01/ui-core.js']
SITE_JS = ['assets/hero/modes.js', 'assets/hero/cspace.js', 'assets/hero/walk.js']  # kit.js и thanks.js — копии из shared
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

def load_dict(path):
    """Словарь переводов из JSON-файла: только заполненные значения; пустой словарь, если файла нет."""
    path = pathlib.Path(path)
    if not path.exists():
        return {}
    return {k: v for k, v in json.loads(path.read_text(encoding='utf-8')).items() if v}

def translate_js(js, *dicts):
    """Подстановка переводов в JS: точная замена литерала вместе с кавычками ('…', "…", `…`); шаблонные
    литералы — целиком, ${…} в них переводчик сохраняет как есть. Если ключ есть в нескольких словарях,
    побеждает первый. Длинные ключи заменяются раньше коротких: иначе короткий литерал внутри ${…}
    шаблона (например 'Гибрид') переводился бы первым, шаблон менялся и его собственный ключ уже не находился.
    Если в переводе встречается кавычка самого литерала без экранирования, она экранируется."""
    merged = {}
    for d in dicts:
        for k, v in d.items():
            merged.setdefault(k, v)
    for k in sorted(merged, key=len, reverse=True):
        v = merged[k]
        for q in ('"', "'", '`'):
            lit = q + k + q
            if lit in js:
                # кавычку литерала внутри перевода экранируем; в шаблонных литералах — нет: обратные кавычки
                # там бывают только в коде внутри ${…} (вложенный шаблон), и его трогать нельзя
                val = v if q == '`' else re.sub(r'(?<!\\)' + q, lambda m: '\\' + q, v)
                js = js.replace(lit, q + val + q)
    return js

def keys_for(files, base=ROOT):
    keys = []
    for f in files:
        p = base / f
        if not p.exists(): continue
        for lit in literals(p.read_text(encoding='utf-8')):
            if (CYR.search(lit) or lit in ('ru-RU',)) and lit not in keys:
                keys.append(lit)
    return keys

def main():
    key = sys.argv[1] if len(sys.argv) > 1 else 'l01'
    check = '--check' in sys.argv
    base = ROOT
    if key == 'shared':
        files, dict_path = SHARED, ROOT / 'shared/i18n.en.json'
    elif key == 'site':
        files, dict_path, base = SITE_JS, SITE / 'i18n.en.json', SITE
    else:
        files = sorted(str(p.relative_to(ROOT)) for p in (ROOT / key).glob('*.js'))
        dict_path = ROOT / key / 'i18n.en.json'
    keys = keys_for(files, base)
    if not check:
        print(json.dumps({k: '' for k in keys}, ensure_ascii=False, indent=1)); return
    d = json.loads(dict_path.read_text(encoding='utf-8')) if dict_path.exists() else {}
    missing = [k for k in keys if not d.get(k)]
    # лишний ключ — тот, которого нет среди литералов вовсе; ключи без кириллицы (например, '2,0' → '2.0'
    # в подписях оси) допустимы, если такой литерал есть в коде
    every = set()
    for f in files:
        fp = (base / f) if key == 'site' else (ROOT / f)
        if fp.exists(): every.update(literals(fp.read_text(encoding='utf-8')))
    extra = [k for k in d if k not in keys and k not in every]
    print(f'{key}: литералов с кириллицей {len(keys)}, переведено {len(keys) - len(missing)}, не переведено {len(missing)}, лишних ключей {len(extra)}')
    for k in missing[:40]: print('  НЕТ:', k[:120])
    for k in extra[:10]: print('  ЛИШНИЙ:', k[:120])
    sys.exit(1 if missing else 0)

if __name__ == '__main__':
    main()
