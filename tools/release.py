#!/usr/bin/env python3
"""Субботние выпуски курса: подготовка в пятницу, выкладка в субботу в 09:00 по Москве функцией mr-release
по таймеру (server/release/index.py). Порядок работы — заметка «Курс Physical AI — выпуски по субботам».

  python3 tools/release.py stage 2026-10-10    собрать сайт на 09:00 10.10 и положить его в бакет выпусков
                                               вместе с постом releases/2026-10-10.txt; пост приходит автору
                                               в Telegram на просмотр; выпуск пока не одобрен
  python3 tools/release.py approve 2026-10-10  автор посмотрел уроки и пост и согласился: выпуск выйдет сам
  python3 tools/release.py status              какие выпуски подготовлены, одобрены и выложены
  python3 tools/release.py dry 2026-10-10      что функция сделает в день выпуска (ничего не меняет)
  python3 tools/release.py refresh             пересобрать сайт в подготовленных, ещё не вышедших выпусках;
                                               tools/deploy.sh вызывает это сам, чтобы правки, выложенные после
                                               пятницы, не откатились в субботу
Какие страницы выходят в выпуске — записи PUBLISHED в site/config.json с полем "date" (site/published.py).
Файл поста releases/<дата>.txt: первая строка «title: …», строка «---», затем текст в HTML-разметке Telegram
(<b>, <i>, <a href="…">, <blockquote>), видимый текст — не длиннее 4096 знаков.
"""
import datetime, html, json, os, pathlib, re, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'site'))
from published import MSK, release_moment  # noqa: E402

REL = 's3://modernrobotics-releases'
EP = ['--endpoint-url', 'https://storage.yandexcloud.net']
FN = 'mr-release'
ENV = {**os.environ, 'AWS_PROFILE': os.environ.get('AWS_PROFILE', 'mr'), 'YC_CLI_INITIALIZATION_SILENCE': 'true'}
ENV.pop('MR_ASOF', None)
CFG = json.loads((ROOT / 'site/config.json').read_text(encoding='utf-8'))
SITE_URL = CFG['SITE_URL'].rstrip('/')
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TG_TAGS = {'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'blockquote', 'tg-spoiler', 'span'}


def now():
    return datetime.datetime.now(MSK)


def run(cmd, env=None, **kw):
    return subprocess.run(cmd, check=True, env=env or ENV, **kw)


def s3_get_json(key):
    r = subprocess.run(['aws', 's3', 'cp', f'{REL}/{key}', '-', *EP], env=ENV, capture_output=True, text=True)
    if r.returncode == 0:
        return json.loads(r.stdout)
    if '404' in r.stderr or 'Not Found' in r.stderr or 'NoSuchKey' in r.stderr:
        return None
    sys.exit(f'Бакет выпусков недоступен: {r.stderr.strip()}')


def s3_put_json(key, data):
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    run(['aws', 's3', 'cp', f.name, f'{REL}/{key}', *EP, '--content-type', 'application/json; charset=utf-8', '--only-show-errors'])
    os.unlink(f.name)


def staged_dates():
    r = subprocess.run(['aws', 's3', 'ls', f'{REL}/', *EP], env=ENV, capture_output=True, text=True)
    if r.returncode:
        return None
    return sorted(m.group(1) for m in re.finditer(r'PRE (\d{4}-\d{2}-\d{2})/', r.stdout))


def invoke(data):
    r = subprocess.run(['yc', 'serverless', 'function', 'invoke', FN, '--data', json.dumps(data)], env=ENV, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'Функция {FN} не ответила: {r.stderr.strip()}')
    d = json.loads(r.stdout)
    return json.loads(d['body']) if isinstance(d.get('body'), str) else d


def check_date(day):
    if not DATE.match(day or ''):
        sys.exit('дата в формате ГГГГ-ММ-ДД, например 2026-10-10')
    return day


def read_post(day):
    f = ROOT / 'releases' / f'{day}.txt'
    if not f.exists():
        sys.exit(f'нет файла поста {f.relative_to(ROOT)}')
    head, sep, body = f.read_text(encoding='utf-8').partition('\n---\n')
    m = re.match(r'title:\s*(.+)', head.strip())
    if not sep or not m:
        sys.exit(f'{f.relative_to(ROOT)}: первая строка «title: …», затем строка «---» и текст поста')
    post = body.strip()
    bad = sorted(set(re.findall(r'</?([a-z-]+)', post)) - TG_TAGS)
    if bad:
        sys.exit('в посте теги, которых Telegram не понимает: ' + ', '.join(bad))
    visible = html.unescape(re.sub(r'<[^>]+>', '', post))
    if len(visible) > 4096:
        sys.exit(f'пост длиннее 4096 знаков: {len(visible)}')
    for url in re.findall(r'href="([^"]+)"', post):
        if not url.startswith('https://'):
            sys.exit(f'в посте ссылка не на https: {url}')
    return m.group(1).strip(), post


def build(day, out):
    """Сайт на 09:00 дня выпуска; после сборки рабочая папка site/ возвращается к текущему моменту."""
    run([sys.executable, str(ROOT / 'tools/assemble.py'), str(out)], env={**ENV, 'MR_ASOF': day})
    run([sys.executable, str(ROOT / 'lessons/build.py'), 'all'], stdout=subprocess.DEVNULL)
    run([sys.executable, str(ROOT / 'site/build.py')], stdout=subprocess.DEVNULL)


def upload_site(day):
    out = ROOT / 'dist-release' / day
    build(day, out)
    run([str(ROOT / 'tools/s3sync.sh'), f'{out}/', f'{REL}/{day}/site'], stdout=subprocess.DEVNULL)


def stage(day):
    check_date(day)
    if release_moment(day) <= now():
        sys.exit(f'выпуск {day} уже должен был выйти — подготовить его заранее нельзя')
    new = [p for p in CFG['PUBLISHED'] if p.get('date') == day]
    if not new:
        sys.exit(f'в site/config.json нет страниц с "date": "{day}"')
    title, post = read_post(day)
    old = s3_get_json(f'{day}/release.json')
    upload_site(day)
    rel = {'date': day, 'title': title, 'pages': [p['file'] for p in new] + ['index.html'],
           'preview': f'{SITE_URL}/{new[0]["file"]}', 'post': post, 'approved': False,
           'staged_at': now().isoformat(timespec='seconds')}
    s3_put_json(f'{day}/release.json', rel)
    print(f'Выпуск {day} «{title}» подготовлен: ' + ', '.join(p['n'] for p in new))
    if old and old.get('approved'):
        print('Выпуск был одобрен раньше; после новой подготовки его нужно одобрить снова.')
    try:
        print('Пост на просмотр автору:', invoke({'action': 'preview', 'date': day}).get('status') or 'не отправлен')
    except SystemExit as e:
        print('Пост на просмотр не отправлен:', e)
    print(f'Одобрить после просмотра: python3 tools/release.py approve {day}')


def approve(day):
    check_date(day)
    rel = s3_get_json(f'{day}/release.json')
    if not rel:
        sys.exit(f'выпуск {day} не подготовлен: python3 tools/release.py stage {day}')
    rel['approved'], rel['approved_at'] = True, now().isoformat(timespec='seconds')
    s3_put_json(f'{day}/release.json', rel)
    print(f'Выпуск {day} «{rel["title"]}» одобрен: выйдет {day[8:10]}.{day[5:7]} в 09:00 по Москве, пост — в канале.')


def status():
    dates = staged_dates()
    if dates is None:
        sys.exit('Бакет выпусков недоступен (server/release/deploy.sh ещё не запускался?)')
    if not dates:
        print('Подготовленных выпусков нет')
    for day in dates:
        rel = s3_get_json(f'{day}/release.json') or {}
        site, post = s3_get_json(f'{day}/site.done.json'), s3_get_json(f'{day}/post.done.json')
        state = ('выложен' if site else 'одобрен' if rel.get('approved') else 'ждёт одобрения')
        extra = f', пост: {post["url"]}' if post else ''
        print(f'{day}  {rel.get("title", "?")}: {state}{extra}')


def refresh():
    dates = staged_dates()
    if dates is None:
        print('Бакет выпусков недоступен — пересобирать нечего')
        return
    pending = [d for d in dates if release_moment(d) > now() and not s3_get_json(f'{d}/site.done.json')]
    for day in pending:
        upload_site(day)
        print(f'Выпуск {day}: сайт пересобран с последними правками, одобрение и пост не менялись')


if __name__ == '__main__':
    cmd, arg = (sys.argv[1:] + ['', ''])[:2]
    if cmd == 'stage':
        stage(arg)
    elif cmd == 'approve':
        approve(arg)
    elif cmd == 'status':
        status()
    elif cmd == 'dry':
        print(json.dumps(invoke({'date': check_date(arg), 'dry': True}), ensure_ascii=False, indent=2))
    elif cmd == 'refresh':
        refresh()
    else:
        sys.exit(__doc__)
