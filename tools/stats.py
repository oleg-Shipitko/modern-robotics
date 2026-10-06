#!/usr/bin/env python3
"""Отчёт по анонимной статистике курса (server/stats).

  python3 tools/stats.py                 последние 7 дней: сводка по урокам, где бросают, трудные миссии
  python3 tools/stats.py --days 30       за 30 дней
  python3 tools/stats.py --lesson 1.5    подробно по уроку: все разделы, миссии и задачи
  python3 tools/stats.py --file rows.json   из файла, без облака (формат как у отчёта функции)
  python3 tools/stats.py --note          записать отчёт в заметку Obsidian «Курс Physical AI — статистика»
  python3 tools/stats.py --demo          пример отчёта на выдуманных числах — чтобы посмотреть формат

Данные берёт у закрытой функции mr-stats-report через yc (yc должен быть настроен на облако курса).
Названия разделов — из собранных уроков site/lessons, названия миссий — из tools/stats_names.json
(обновить: node tools/stats_names.js).
"""
import argparse, collections, datetime, json, pathlib, random, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / 'site/config.json').read_text(encoding='utf-8'))
NAMES_FILE = ROOT / 'tools/stats_names.json'
NOTE = pathlib.Path.home() / 'Documents/Obsidian Vault/Курс Physical AI — статистика.md'
NAMES = json.loads(NAMES_FILE.read_text(encoding='utf-8')) if NAMES_FILE.exists() else {}
SOURCES = {'telegram': 'Telegram', 'linkedin': 'LinkedIn', 'google': 'Google', 'yandex': 'Яндекс', 'github': 'GitHub',
           'vk': 'ВКонтакте', 'habr': 'Хабр', 'other': 'другие сайты', 'direct': 'без источника'}


def pct(a, b):
    return f'{round(100 * a / b)}%' if b else '—'


def times(n):
    k = n % 100
    return f'{n} раз' if 11 <= k <= 14 or n % 10 not in (2, 3, 4) else f'{n} раза'


def ru(x, nd=1):
    return f'{x:.{nd}f}'.replace('.', ',')


def lessons():
    """Опубликованные уроки по порядку: slug, номер, название, разделы [(id, заголовок)]."""
    out = []
    for p in CFG.get('PUBLISHED', []):
        f = ROOT / 'site' / p['file']
        slug = f.stem
        html = f.read_text(encoding='utf-8') if f.exists() else ''
        t = re.search(r'<title>(.*?)</title>', html, flags=re.S)
        title = t.group(1).split(' — ')[0].strip() if t else p['n']
        secs = []
        for m in re.finditer(r'<section[^>]*\bid="([a-z][a-zA-Z0-9-]*)"[^>]*>(.*?)</section>', html, flags=re.S):
            h = re.search(r'<h2[^>]*>(.*?)</h2>', m.group(2), flags=re.S)
            label = re.search(r'aria-label="([^"]*)"', m.group(0)[:300])
            secs.append((m.group(1), re.sub(r'<[^>]+>', '', h.group(1)).strip() if h else label.group(1) if label else 'Начало урока'))
        out.append({'slug': slug, 'n': p['n'], 'title': title, 'secs': secs})
    return out


def fetch(days):
    try:
        r = subprocess.run(['yc', 'serverless', 'function', 'invoke', 'mr-stats-report', '--data', json.dumps({'days': days})],
                           capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        sys.exit('Нет yc. Установи Yandex Cloud CLI или возьми данные из файла: --file rows.json')
    if r.returncode:
        sys.exit('yc не смог вызвать mr-stats-report:\n' + r.stderr.strip())
    data = json.loads(r.stdout)
    if isinstance(data, dict) and isinstance(data.get('body'), str):
        data = json.loads(data['body'])
    return data


def demo(days):
    """Выдуманные, но правдоподобные числа на настоящей структуре уроков — только чтобы показать формат отчёта."""
    rnd = random.Random(7)
    today = datetime.date.today()
    rows = []
    def put(day, page, ev, n):
        if n > 0:
            rows.append({'day': day, 'page': page, 'ev': ev, 'n': n})
    for d in range(days):
        day = (today - datetime.timedelta(days=days - 1 - d)).isoformat()
        put(day, 'index', 'open:desk', rnd.randint(30, 60)); put(day, 'index', 'open:phone', rnd.randint(20, 45))
        for src, w in (('telegram', 30), ('linkedin', 14), ('direct', 12), ('google', 3), ('yandex', 4), ('github', 2), ('other', 2)):
            put(day, 'index', 'ref:' + src, rnd.randint(w // 2, w))
        audience = rnd.randint(90, 140)
        for k, L in enumerate(lessons()):
            opens = max(3, int(audience * (0.78 ** k) * rnd.uniform(0.85, 1.15)))
            phone = int(opens * rnd.uniform(0.3, 0.45))
            put(day, L['slug'], 'open:phone', phone); put(day, L['slug'], 'open:desk', opens - phone)
            put(day, L['slug'], 'ref:site', int(opens * 0.7)); put(day, L['slug'], 'ref:telegram', int(opens * 0.2))
            reach = 1.0
            drop_at = rnd.randrange(2, max(3, len(L['secs']) - 1))
            for i, (sid, _) in enumerate(L['secs']):
                if i:
                    reach *= rnd.uniform(0.62, 0.72) if i == drop_at else rnd.uniform(0.9, 0.98)
                put(day, L['slug'], 'sec:' + sid, int(opens * reach))
            for t, share in (('2', 0.8), ('10', 0.45), ('30', 0.12)):
                put(day, L['slug'], 't:' + t, int(opens * share * rnd.uniform(0.8, 1.1)))
            labs = NAMES.get(L['slug'], {}).get('missions', {})
            for root, info in labs.items():
                seen = int(opens * rnd.uniform(0.5, 0.75))
                for m, mname in enumerate(info.get('names') or ['']):
                    if mname.startswith('Свобод'):
                        put(day, L['slug'], f'mis:{root}:{m}:seen', seen); continue
                    done = int(seen * rnd.uniform(0.6, 0.97))
                    put(day, L['slug'], f'mis:{root}:{m}:seen', seen); put(day, L['slug'], f'mis:{root}:{m}:done', done)
                    if rnd.random() < 0.6:  # у миссий с кнопкой запуска считаем, с какой попытки прошли
                        first = int(done * rnd.uniform(0.35, 0.85)); put(day, L['slug'], f'mis:{root}:{m}:r1', first)
                        put(day, L['slug'], f'mis:{root}:{m}:r2', (done - first) // 2); put(day, L['slug'], f'mis:{root}:{m}:r3', done - first - (done - first) // 2)
                    seen = int(done * rnd.uniform(0.85, 0.97))
            for tid in NAMES.get(L['slug'], {}).get('tasks', {}):
                put(day, L['slug'], f'task:{tid}:done', int(opens * rnd.uniform(0.2, 0.5)))
            for r, w in (('good', 0.09), ('mid', 0.04), ('bad', 0.015)):
                put(day, L['slug'], 'fb:' + r, int(opens * w * rnd.uniform(0.6, 1.4)))
            scores = collections.Counter(rnd.choices(range(3, 9), weights=(5, 8, 15, 25, 27, 20), k=int(opens * rnd.uniform(0.18, 0.32))))
            for sc, n in scores.items():
                put(day, L['slug'], f'quiz:{sc}/8', n)
    texts = [('1-4-diffuzionnye-modeli', 'mid', 'Неясно, почему в DDIM можно пропускать шаги. В «Под капотом» не хватает одного примера с числами.'),
             ('1-5-diffusion-policy', 'good', 'Лаборатория с десятью прогонами — лучшее место урока. Хорошо бы дать ссылку на код Push-T.'),
             ('0-3-kinematika-i-upravlenie', 'bad', 'Якобиан объяснён слишком быстро, после раздела про сингулярность дальше читать трудно.')]
    fb = [{'day': (today - datetime.timedelta(days=k)).isoformat(), 'page': pg, 'r': r, 't': t, 'at': (today - datetime.timedelta(days=k)).isoformat() + 'T12:00'}
          for k, (pg, r, t) in enumerate(texts)]
    return {'since': (today - datetime.timedelta(days=days - 1)).isoformat(), 'today': today.isoformat(), 'rows': rows, 'feedback': fb}


def analyze(data):
    """Сводит строки «день, страница, событие, n» в то, что показывает отчёт."""
    C = collections.defaultdict(collections.Counter)
    for r in data['rows']:
        if r['page'] != 'test':  # служебная страница проверки после выкладки
            C[r['page']][r['ev']] += int(r['n'])
    opens = lambda c: c['open:phone'] + c['open:desk']  # noqa: E731
    home = C.get('index', collections.Counter())
    refs = collections.Counter()
    for c in C.values():
        for ev, n in c.items():
            if ev.startswith('ref:') and ev != 'ref:site':
                refs[ev[4:]] += n
    A = {'since': data['since'], 'today': data['today'], 'home': (opens(home), home['open:phone']), 'refs': refs, 'lessons': [], 'drops': [], 'hard': []}
    for L in lessons():
        c = C.get(L['slug'], collections.Counter())
        o = opens(c)
        quiz = [(int(m.group(1)), int(m.group(2)), n) for ev, n in c.items() for m in [re.match(r'quiz:(\d+)/(\d+)$', ev)] if m]
        qn = sum(n for *_, n in quiz)
        info = {'L': L, 'opens': o, 'phone': c['open:phone'], 'finale': c['sec:finale'], 'quiz_n': qn,
                'fb': {r: c['fb:' + r] for r in ('good', 'mid', 'bad')},
                'quiz_avg': (sum(s * n for s, _, n in quiz) / qn, quiz[0][1]) if qn else None,
                't': {m: c[f't:{m}'] for m in (2, 10, 30)},
                'secs': [(sid, title, c['sec:' + sid]) for sid, title in L['secs']], 'missions': [], 'tasks': []}
        for (a, ta, na), (b, tb, nb) in zip(info['secs'], info['secs'][1:]):
            if o and na:
                A['drops'].append(((na - nb) / o, L, ta, tb, na, nb, o))
        labs = NAMES.get(L['slug'], {})
        sec_title = dict(L['secs'])
        for root, mi in labs.get('missions', {}).items():
            for k, mname in enumerate(mi.get('names') or [mi.get('first', '')]):
                seen, done = c[f'mis:{root}:{k}:seen'], c[f'mis:{root}:{k}:done']
                tries = [c[f'mis:{root}:{k}:r{t}'] for t in range(1, 6)]
                free = mname.startswith('Свобод')  # свободный режим не проходят — только открывают
                m = {'label': f"{sec_title.get(mi.get('sec'), root)} · {k + 1} «{mname}»", 'seen': seen, 'done': done,
                     'first': pct(tries[0], sum(tries)) if sum(tries) else '', 'free': free}
                if seen:
                    info['missions'].append(m)
                    if seen >= 10 and not free:
                        A['hard'].append((done / seen, L, m))
        for tid, t in labs.get('tasks', {}).items():
            info['tasks'].append({'name': t['name'], 'reach': c['sec:' + t['sec']], 'done': c[f'task:{tid}:done']})
        A['lessons'].append(info)
    best = {}
    for d in sorted(A['drops'], key=lambda x: -x[0]):
        best.setdefault(d[1]['slug'], d)
    A['drops'] = sorted(best.values(), key=lambda x: -x[0])[:5]
    A['hard'] = sorted(A['hard'], key=lambda x: x[0])[:5]
    names = {L['slug']: L['n'] for L in lessons()}
    A['texts'] = sorted(({**f, 'n': names.get(f['page'], f['page'])} for f in data.get('feedback', []) if f['page'] != 'test'),
                        key=lambda f: f.get('at', ''), reverse=True)
    return A


def dm(d):
    return datetime.date.fromisoformat(d).strftime('%d.%m')


def lname(L):
    return L['n'] + ' ' + L['title'].split(' ', 1)[-1]


RATING = {'good': 'всё понятно', 'mid': 'местами сложно', 'bad': 'многое непонятно'}


def clear(x):
    """«Понятно»: доля ответов «Всё понятно» среди оценок урока."""
    total = sum(x['fb'].values())
    return f"{pct(x['fb']['good'], total)} из {total}" if total else '—'


def one_line(t):
    return re.sub(r'\s+', ' ', t).replace('[[', '[ [').strip()


def qavg(x):
    return f'{ru(x["quiz_avg"][0])} из {x["quiz_avg"][1]}' if x['quiz_avg'] else '—'


def mis_text(m):
    if m['free']:
        return f"{m['label']}: открыли {m['seen']}"
    return f"{m['label']}: открыли {m['seen']}, прошли {m['done']} ({pct(m['done'], m['seen'])})" + (f", с первого запуска {m['first']}" if m['first'] else '')


def sources(A):
    total = sum(A['refs'].values())
    return ', '.join(f'{SOURCES.get(k, k)} {pct(n, total)}' for k, n in A['refs'].most_common()) if total else 'данных пока нет'


def report(data, only=None):
    """Текст для терминала и чата."""
    A = analyze(data)
    out = [f"Статистика modernrobotics.ru с {dm(A['since'])} по {dm(A['today'])}", '']
    if only:
        sel = [x for x in A['lessons'] if x['L']['n'] == only]
        if not sel:
            sys.exit(f'Урок {only} не опубликован')
        x = sel[0]; o = x['opens']
        out += [f"{x['L']['title']}: открыли {times(o)}, с телефона {pct(x['phone'], o)}, "
                f"на экране ≥2 мин {pct(x['t'][2], o)}, ≥10 мин {pct(x['t'][10], o)}, ≥30 мин {pct(x['t'][30], o)}", '',
                'До каких разделов дочитали:']
        out += [f"    {title:<52}{pct(n, o):>6}" for _, title, n in x['secs']]
        out += ['', 'Миссии и задачи:'] + ['    ' + mis_text(m) for m in x['missions']]
        out += [f"    задача «{t['name']}»: дошли до раздела {t['reach']}, решили {t['done']} ({pct(t['done'], t['reach'])})" for t in x['tasks']]
        out += ['', f"Квиз: прошли {x['quiz_n']}, средний балл {qavg(x)}." if x['quiz_n'] else 'Квиз: никто не прошёл.']
        fb = x['fb']; total = sum(fb.values())
        out += ['', f"Оценки: всё понятно {fb['good']}, местами сложно {fb['mid']}, многое непонятно {fb['bad']}." if total else 'Оценок пока нет.']
        out += [f"    {dm(f['day'])} · {RATING.get(f['r'], f['r'])} — {one_line(f['t'])}" for f in A['texts'] if f['page'] == x['L']['slug']]
        return '\n'.join(out)
    out.append(f"Главная: открыли {times(A['home'][0])}, с телефона {pct(A['home'][1], A['home'][0])}.")
    out.append('Откуда пришли (главная и уроки, без переходов внутри сайта): ' + sources(A))
    out += ['', f"{'Урок':<46}{'Открыли':>8}{'Телефон':>9}{'До итогов':>11}{'Квиз':>7}{'Ср. балл':>10}{'≥10 мин':>9}{'Понятно':>12}"]
    for x in A['lessons']:
        o = x['opens']
        out.append(f"{lname(x['L'])[:44]:<46}{o:>8}{pct(x['phone'], o):>9}{pct(x['finale'], o):>11}{x['quiz_n']:>7}{qavg(x):>10}{pct(x['t'][10], o):>9}{clear(x):>12}")
    out += ['', 'Где чаще всего бросают (самый большой спад между соседними разделами):']
    out += [f"    {L['n']}: «{ta}» — {pct(na, o)}, следующий раздел «{tb}» — {pct(nb, o)}" for _, L, ta, tb, na, nb, o in A['drops']]
    out += ['', 'Миссии, которые проходят реже всего:'] + [f"    {L['n']} " + mis_text(m) for _, L, m in A['hard']]
    out += ['', f"Отзывы ({len(A['texts'])}, свежие сверху):"] + [f"    {dm(f['day'])} · {f['n']} · {RATING.get(f['r'], f['r'])} — {one_line(f['t'])}" for f in A['texts'][:10]]
    out += ['', 'Подробно по уроку: python3 tools/stats.py --lesson 1.5']
    return '\n'.join(out)


def note(data, demo_mode=False):
    """Заметка для Obsidian: сводка сверху, подробности по урокам — в свёрнутых блоках."""
    A = analyze(data)
    now = datetime.datetime.now().strftime('%d.%m.%Y %H:%M')
    cell = lambda t: str(t).replace('|', '/')  # noqa: E731
    out = ['---', 'tags:', '  - robotics', '  - course', '  - physical-ai', 'type: course-stats', f'updated: {datetime.date.today().isoformat()}',
           'related:', '  - "[[Курс Physical AI — уроки к запуску]]"', '  - "[[Курс Physical AI — идеи улучшений]]"', '---',
           '# Курс Physical AI — статистика', '']
    if demo_mode:
        out += ['> [!warning] Пример на выдуманных числах', '> Так будет выглядеть заметка. Настоящие данные появятся после выкладки статистики.', '']
    out += [f"Обновлено {now}. Данные с {dm(A['since'])} по {dm(A['today'])}; статистика собирается с 06.10.2026. Обновить — попросить Claude «обнови статистику» "
            f"(или `python3 tools/stats.py --note`). Это анонимные суммы: одно открытие страницы — одно «открыли», уникальных читателей сайт не считает.", '',
            f"**Главная:** открыли {times(A['home'][0])}, с телефона {pct(A['home'][1], A['home'][0])}.  ",
            f"**Откуда пришли** (главная и уроки, без переходов внутри сайта): {sources(A)}.", '',
            '## Уроки', '', '| Урок | Открыли | С телефона | До итогов | Квиз | Средний балл | ≥10 минут | Понятно |', '|---|---:|---:|---:|---:|---:|---:|---:|']
    for x in A['lessons']:
        o = x['opens']
        out.append(f"| {cell(lname(x['L']))} | {o} | {pct(x['phone'], o)} | {pct(x['finale'], o)} | {x['quiz_n']} | {qavg(x)} | {pct(x['t'][10], o)} | {clear(x)} |")
    out += ['', '«Понятно» — доля ответов «Всё понятно» на вопрос в конце урока «Урок был понятен?» и сколько всего ответили.']
    out += ['', '## Отзывы', 'Тексты из конца уроков, свежие сверху. Ответить на них нельзя: читатели не оставляют контактов.', '']
    out += [f"- {dm(f['day'])} · **{f['n']}** · {RATING.get(f['r'], f['r'])} — {one_line(f['t'])}" for f in A['texts']] or ['- отзывов пока нет']
    out += ['', '## Где чаще всего бросают', 'Самый большой спад между соседними разделами урока.', '']
    out += [f"- **{L['n']}**: «{ta}» — {pct(na, o)}, следующий раздел «{tb}» — {pct(nb, o)}" for _, L, ta, tb, na, nb, o in A['drops']] or ['- данных пока нет']
    out += ['', '## Миссии, которые проходят реже всего', 'Среди миссий, которые открыли не меньше 10 раз.', '']
    out += [f"- **{L['n']}** " + mis_text(m) for _, L, m in A['hard']] or ['- данных пока нет']
    out += ['', '## По урокам', '']
    for x in A['lessons']:
        o = x['opens']
        out += [f"> [!info]- {lname(x['L'])} — открыли {times(o)}",
                f"> С телефона {pct(x['phone'], o)}; вкладка на экране ≥2 мин {pct(x['t'][2], o)}, ≥10 мин {pct(x['t'][10], o)}, ≥30 мин {pct(x['t'][30], o)}.",
                '>', '> **До каких разделов дочитали**', '>', '> | Раздел | Дочитали |', '> |---|---:|']
        out += [f"> | {cell(title)} | {pct(n, o)} |" for _, title, n in x['secs']]
        if x['missions'] or x['tasks']:
            out += ['>', '> **Миссии и задачи**', '>']
            out += ['> - ' + mis_text(m) for m in x['missions']]
            out += [f"> - задача «{t['name']}»: дошли до раздела {t['reach']}, решили {t['done']} ({pct(t['done'], t['reach'])})" for t in x['tasks']]
        out += ['>', f"> **Квиз:** прошли {x['quiz_n']}, средний балл {qavg(x)}." if x['quiz_n'] else '> **Квиз:** никто не прошёл.']
        fb = x['fb']
        out += [f"> **Оценки:** всё понятно {fb['good']}, местами сложно {fb['mid']}, многое непонятно {fb['bad']}." if sum(fb.values()) else '> **Оценок пока нет.**', '']
    return '\n'.join(out) + '\n'


def main():
    ap = argparse.ArgumentParser(description='Отчёт по анонимной статистике курса')
    ap.add_argument('--days', type=int, default=7)
    ap.add_argument('--lesson')
    ap.add_argument('--file')
    ap.add_argument('--demo', action='store_true')
    ap.add_argument('--note', action='store_true', help='записать заметку «Курс Physical AI — статистика» в Obsidian')
    a = ap.parse_args()
    if a.demo:
        data = demo(a.days)
        if not a.note:
            print('ПРИМЕР НА ВЫДУМАННЫХ ЧИСЛАХ — только чтобы показать, как выглядит отчёт\n')
    elif a.file:
        data = json.loads(pathlib.Path(a.file).read_text(encoding='utf-8'))
    else:
        data = fetch(a.days)
    if a.note:
        NOTE.write_text(note(data, a.demo), encoding='utf-8')
        print('Заметка обновлена:', NOTE)
    else:
        print(report(data, a.lesson))


if __name__ == '__main__':
    main()
