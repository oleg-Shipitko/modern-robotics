#!/usr/bin/env python3
"""Собирает урок в один самодостаточный HTML-файл.
Запуск: python3 lessons/build.py l01   (или l11, или all)
Результат — в site/lessons/.
"""
import pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parent
LESSONS = {
    # урок: (файл, css-файлы, {маркер: js-файлы})
    'l01': ('0-1-dve-paradigmy.html', ['l01/lesson.css'], {
        '/*@@SIM@@*/': ['l01/sim.js'],
        '/*@@UI@@*/': ['l01/ui-core.js', 'l01/ui-scene.js', 'l01/ui-lab1.js', 'l01/ui-lab2.js', 'l01/ui-labs.js', 'l01/ui-extras.js', 'l01/ui-main.js'],
    }),
    'l02': ('0-2-ustroystvo-robota.html', ['l01/lesson.css', 'shared/lab.css', 'l02/l02.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/actuator-core.js', 'l02/engine-l02.js', 'shared/missions.js', 'shared/cards.js', 'l02/ui-l02.js'],
    }),
    'l03': ('0-3-kinematika-i-upravlenie.html', ['l01/lesson.css', 'shared/lab.css', 'l03/l03.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/arm-core.js', 'shared/mpc-core.js', 'shared/missions.js', 'shared/cards.js', 'l03/ui-l03.js'],
    }),
    'l11': ('1-1-behavior-cloning.html', ['l01/lesson.css', 'shared/lab.css', 'l11/l11.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/drive-core.js', 'shared/drive-lab.js', 'shared/missions.js', 'shared/cards.js', 'l11/ui-l11.js'],
    }),
    'l12': ('1-2-dagger.html', ['l01/lesson.css', 'shared/lab.css', 'l12/l12.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/drive-core.js', 'shared/drive-lab.js', 'shared/missions.js', 'shared/cards.js', 'l12/ui-l12.js'],
    }),
    'l04': ('0-4-otsenka-sostoyaniya-i-planirovanie.html', ['l01/lesson.css', 'shared/lab.css', 'l04/l04.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l04/engine.js', 'l04/data-l04.js', 'l04/ui-l04.js'],
    }),
    'l13': ('1-3-multimodalnost-deystviy.html', ['l01/lesson.css', 'shared/lab.css', 'l13/l13.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/kettle-core.js', 'shared/kettle-draw.js', 'shared/missions.js', 'shared/cards.js', 'l13/ui-l13.js'],
    }),
    'l14': ('1-4-diffuzionnye-modeli.html', ['l01/lesson.css', 'shared/lab.css', 'l14/l14.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l14/engine.js', 'l14/ui-l14.js'],
    }),
    'l15': ('1-5-diffusion-policy.html', ['l01/lesson.css', 'shared/lab.css', 'l15/l15.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/kettle-core.js', 'shared/kettle-draw.js', 'shared/missions.js', 'shared/cards.js', 'l15/ui-l15.js'],
    }),
    'l16': ('1-6-transformer.html', ['l01/lesson.css', 'shared/lab.css', 'l16/l16.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l16/engine.js', 'l16/ui-l16.js'],
    }),
    'l17': ('1-7-act.html', ['l01/lesson.css', 'shared/lab.css', 'l17/l17.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l17/engine.js', 'l17/ui-l17.js'],
    }),
    'l18': ('1-8-flow-matching.html', ['l01/lesson.css', 'shared/lab.css', 'l18/l18.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/missions.js', 'shared/cards.js', 'l18/engine.js', 'l18/ui-l18.js'],
    }),
    # глоссарий: все термины из shared/glossary.json, без отзыва и «спасибо»
    'gl': ('glossariy.html', ['l01/lesson.css', 'gl/gl.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'gl/ui-gl.js'],
    }),
    # проверки в конце частей: без отзыва и «спасибо» в конце
    'c0': ('proverka-chasti-0.html', ['l01/lesson.css', 'shared/lab.css', 'c0/c0.css'], {
        '/*@@JS@@*/': ['l01/ui-core.js', 'shared/kit.js', 'shared/arm-core.js', 'c0/ui-c0.js'],
    }),
}
import json, re, urllib.parse, html as _html
CFG = json.loads((root.parent / 'site' / 'config.json').read_text(encoding='utf-8'))
SITE_URL = CFG.get('SITE_URL', '').rstrip('/')
def add_og(page, name):
    """Превью ссылок для мессенджеров и соцсетей: заголовок и описание берём из самого урока."""
    if 'og:title' in page or not SITE_URL:
        return page
    t = re.search(r'<title>(.*?)</title>', page, flags=re.S)
    d = re.search(r'<meta name="description" content="([^"]*)">', page)
    if not t or not d:
        return page
    title = t.group(1).strip()
    url = f'{SITE_URL}/lessons/{name}'
    tags = (f'<meta property="og:type" content="article">\n<meta property="og:site_name" content="Modern Robotics и Physical AI">\n'
            f'<meta property="og:title" content="{title}">\n<meta property="og:description" content="{d.group(1)}">\n'
            f'<meta property="og:url" content="{url}">\n<meta property="og:image" content="{SITE_URL}/assets/og.png">\n'
            f'<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n'
            f'<meta property="og:locale" content="ru_RU">\n<meta name="twitter:card" content="summary_large_image">\n'
            f'<link rel="canonical" href="{url}">\n')
    return page.replace(d.group(0), d.group(0) + '\n' + tags, 1)
FEEDBACK = ('  <div class="fb" data-fb>\n'
            '    <div class="fb-q">Урок был понятен?</div>\n'
            '    <div class="fb-opts" role="group" aria-label="Насколько понятен урок"><button type="button" data-r="good" aria-pressed="false">Всё понятно</button>'
            '<button type="button" data-r="mid" aria-pressed="false">Местами сложно</button><button type="button" data-r="bad" aria-pressed="false">Многое непонятно</button></div>\n'
            '    <div class="fb-saved" hidden aria-live="polite">✓ Оценка записана. Если хочешь, напиши, что осталось непонятным, — это необязательно.</div>\n'
            '    <div class="fb-more" hidden><label for="fbText">Что осталось непонятным или что стоит улучшить?</label>'
            '<textarea id="fbText" maxlength="1000" rows="3"></textarea>'
            '<div class="fb-row"><button type="button" class="fb-send">Отправить</button><span class="fb-note">Отзыв сохраняется без имени и контактов, поэтому ответить на него не получится.</span></div></div>\n'
            '    <div class="fb-done" hidden aria-live="polite">Спасибо, отзыв записан.</div>\n'
            '    <div class="fb-bug">Нашли ошибку или неточность? <a href="{issue}" target="_blank" rel="noopener">Сообщить на GitHub</a></div>\n'
            '  </div>\n')
THANKS = ('<section class="thanks-end" aria-label="Отзыв и спасибо">\n'
          '{feedback}'
          '  <div class="thanks" data-thanks data-channel="{channel}"><span class="thanks-text">Урок пригодился? Скажи спасибо — так автор узнает, что курс читают.</span></div>\n'
          '</section>\n')
def issue_url(page, name):
    """Ссылка «Сообщить на GitHub»: новая задача с названием урока и шаблоном текста."""
    t = re.search(r'<title>(.*?)</title>', page, flags=re.S)
    title = t.group(1).split(' — ')[0].strip() if t else name
    body = f'Урок: {title} — {SITE_URL}/lessons/{name}\nРаздел: \nЧто не так: \nКак правильно, если знаешь: \n'
    return f"{CFG.get('REPO', '').rstrip('/')}/issues/new?title={urllib.parse.quote(title + ': ')}&body={urllib.parse.quote(body)}"
def add_thanks(page, name):
    """Конец урока: отзыв (shared/feedback.*) и кнопка «Сказать спасибо» с общим счётчиком (shared/thanks.*, адрес — THANKS_API в config.json)."""
    js = (root / 'shared/thanks.js').read_text(encoding='utf-8')
    assert '</script' not in js
    fb = FEEDBACK.format(issue=_html.escape(issue_url(page, name), quote=True))
    page = page.replace('</main>', THANKS.format(feedback=fb, channel=_html.escape(CFG.get('CHANNEL', ''), quote=True)) + '</main>', 1)
    return page.replace('</body>', f'<script>\nwindow.MR_THANKS_API = {json.dumps(CFG.get("THANKS_API", ""))};\n{js}</script>\n</body>', 1)
def add_stats(page):
    """Анонимная статистика (shared/stats.js, адрес — STATS_API в config.json), отзыв (feedback.js) и прогресс в браузере (progress.js)."""
    js = '\n'.join((root / 'shared' / f).read_text(encoding='utf-8') for f in ('stats.js', 'feedback.js', 'progress.js', 'recall.js', 'glossary.js'))
    assert '</script' not in js
    return page.replace('</body>', f'<script>\nwindow.MR_STATS_API = {json.dumps(CFG.get("STATS_API", ""))};\n{js}</script>\n</body>', 1)
# ---------- Глоссарий: подсказки к терминам при первом упоминании (shared/glossary.*) ----------
GLOSSARY = json.loads((root / 'shared/glossary.json').read_text(encoding='utf-8'))
SKIP_TAGS = {'a', 'h1', 'h2', 'h3', 'h4', 'button', 'label', 'code', 'pre', 'script', 'style', 'summary', 'svg', 'canvas', 'select', 'textarea', 'figcaption'}
_gl_info = None
def gl_info():
    """Для каждого термина: номер и файл урока, где он вводится, и название раздела."""
    global _gl_info
    if _gl_info is None:
        _gl_info, titles = {}, {}
        for g in GLOSSARY:
            name = LESSONS[g['l']][0]
            if g['l'] not in titles:
                src = (root / g['l'] / 'lesson.html').read_text(encoding='utf-8')
                titles[g['l']] = {m.group(1): re.sub(r'<[^>]+>', '', h.group(1)).strip()
                                  for m in re.finditer(r'<section[^>]*\bid="([a-z][a-zA-Z0-9-]*)"[^>]*>(.*?)</section>', src, flags=re.S)
                                  for h in [re.search(r'<h2[^>]*>(.*?)</h2>', m.group(2), flags=re.S)] if h}
            _gl_info[g['id']] = {'t': g['t'], 'en': g['en'], 'd': g['d'], 'k': g['l'], 'n': '.'.join(name.split('-')[:2]),
                                 'href': f"{name}#{g['sec']}", 'st': titles[g['l']].get(g['sec'], '')}
    return _gl_info
def glossarize(page, key):
    """Первое упоминание каждого термина в тексте урока (абзацы и списки внутри разделов, не в заголовках, ссылках,
    формулах и кнопках) оборачивается в <span class="gl">; данные о найденных терминах кладутся в урок как JSON."""
    a, b = page.find('<main>'), page.find('</main>')
    if a < 0 or b < 0:
        return page
    pats = sorted(((g, re.compile(r'(?<![\w-])(?:' + g['a'].replace(' ', r'(?:\s|&nbsp;)+') + r')(?![\w-])', re.I))
                   for g in GLOSSARY if not g.get('only') or key in g['only']), key=lambda x: -len(x[0]['a']))
    used, out, section_ok, prose, skip, katex = {}, [], False, 0, 0, 0
    for part in re.split(r'(<[^>]+>)', page[a:b]):
        if part.startswith('<'):
            m = re.match(r'<(/?)([a-zA-Z0-9]+)', part)
            if m:
                close, tag = m.group(1) == '/', m.group(2).lower()
                if tag == 'section':
                    section_ok = not close and 'class="section' in part
                elif katex:
                    katex += -1 if (close and tag == 'span') else 1 if (tag == 'span' and not part.endswith('/>')) else 0
                elif tag == 'span' and not close and 'katex' in part:
                    katex = 1
                elif tag in ('p', 'li'):
                    prose += -1 if close else 1
                elif tag in SKIP_TAGS:
                    skip += -1 if close else 1
            out.append(part)
            continue
        if not (section_ok and prose > 0 and skip == 0 and katex == 0) or not part.strip():
            out.append(part)
            continue
        spans = []
        for g, rx in pats:
            if g['id'] in used:
                continue
            for m in rx.finditer(part):
                if all(m.end() <= x or m.start() >= y for x, y, _ in spans):
                    spans.append((m.start(), m.end(), g['id'])); used[g['id']] = True
                    break
        for x, y, gid in sorted(spans, reverse=True):
            part = part[:x] + f'<span class="gl" data-gl="{gid}" tabindex="0">{part[x:y]}</span>' + part[y:]
        out.append(part)
    if not used:
        return page
    info = gl_info()
    data = {gid: {**info[gid], 'here': info[gid]['k'] == key} for gid in used}
    tag = '<script type="application/json" id="glData">' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + '</script>\n'
    return page[:a] + ''.join(out) + tag + page[b:]
def build(key):
    name, css_files, js_map = LESSONS[key]
    html = (root / key / 'lesson.html').read_text(encoding='utf-8')
    if '\\(' in html or '\\[' in html:  # формулы KaTeX рендерим сразу в HTML, в браузер — только стили и шрифты
        r = subprocess.run(['node', str(root.parent / 'tools/katex_render.js'), key], input=html, capture_output=True, text=True, encoding='utf-8')
        if r.returncode:
            sys.exit(r.stderr.strip())
        html = r.stdout
        html = html.replace('<link rel="stylesheet" href="../assets/fonts/fonts.css">',
                            '<link rel="stylesheet" href="../assets/fonts/fonts.css">\n<link rel="stylesheet" href="../assets/katex/katex.min.css">', 1)
    if key.startswith('l'):
        html = glossarize(html, key)
    if key == 'gl':
        info = gl_info()
        html = html.replace('@@GLOSSARY_JSON@@', json.dumps([{**info[g['id']], 'id': g['id']} for g in GLOSSARY], ensure_ascii=False).replace('</', '<\\/'))
    css = '\n'.join((root / f).read_text(encoding='utf-8') for f in css_files + ['shared/thanks.css', 'shared/feedback.css', 'shared/recall.css', 'shared/glossary.css'])
    assert '/*@@CSS@@*/' in html
    html = html.replace('/*@@CSS@@*/', css)
    for marker, files in js_map.items():
        js = '\n'.join((root / f).read_text(encoding='utf-8') for f in files)
        assert '</script' not in js, 'в JS не должно быть закрывающего тега script'
        assert marker in html, marker
        html = html.replace(marker, js)
    html = add_og(html, name)
    if key != 'gl':  # путь в глоссарий: ссылка в верхней панели (на широких экранах) и в подвале
        assert '<button class="theme-btn"' in html and '</footer>' in html, key
        html = html.replace('<button class="theme-btn"', '<a class="topbar-gl" href="glossariy.html">Глоссарий</a>\n    <button class="theme-btn"', 1)
        html = html.replace('</footer>', '  <p class="foot-gl"><a href="glossariy.html">Глоссарий курса</a> — термины с определениями и ссылками на уроки.</p>\n</footer>', 1)
    if key.startswith('l'):
        html = add_thanks(html, name)
    html = add_stats(html)
    out = root.parent / 'site' / 'lessons' / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'OK {out.relative_to(root.parent)} ({out.stat().st_size/1024:.0f} КБ)')
keys = list(LESSONS) if (len(sys.argv) > 1 and sys.argv[1] == 'all') else [sys.argv[1] if len(sys.argv) > 1 else 'l01']
for k in keys:
    if not (root / k / 'lesson.html').exists():
        print(f'— {k}: урок ещё не собран, пропускаю'); continue
    build(k)
