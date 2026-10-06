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
            '    <div class="fb-more" hidden><label for="fbText">Что осталось непонятным или что стоит улучшить? Необязательно.</label>'
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
    js = '\n'.join((root / 'shared' / f).read_text(encoding='utf-8') for f in ('stats.js', 'feedback.js', 'progress.js', 'recall.js'))
    assert '</script' not in js
    return page.replace('</body>', f'<script>\nwindow.MR_STATS_API = {json.dumps(CFG.get("STATS_API", ""))};\n{js}</script>\n</body>', 1)
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
    css = '\n'.join((root / f).read_text(encoding='utf-8') for f in css_files + ['shared/thanks.css', 'shared/feedback.css', 'shared/recall.css'])
    assert '/*@@CSS@@*/' in html
    html = html.replace('/*@@CSS@@*/', css)
    for marker, files in js_map.items():
        js = '\n'.join((root / f).read_text(encoding='utf-8') for f in files)
        assert '</script' not in js, 'в JS не должно быть закрывающего тега script'
        assert marker in html, marker
        html = html.replace(marker, js)
    html = add_og(html, name)
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
