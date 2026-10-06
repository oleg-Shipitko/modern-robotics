"""Субботний выпуск курса modernrobotics.ru — функция Yandex Cloud Functions mr-release (Python 3.12).

Выпуск готовит tools/release.py: кладёт в закрытый бакет RELEASES папку <дата>/
    site/…          сайт, собранный на дату выпуска, с заголовками Content-Type и Cache-Control;
    release.json    {"date", "title", "pages", "preview", "post", "approved"}; post — текст поста
                    в HTML-разметке Telegram, approved — автор посмотрел выпуск и согласился.
Таймер в субботу в 06:00 UTC (09:00 по Москве) вызывает функцию. Она берёт выпуск на сегодняшнюю
дату по Москве и, если он одобрен, делает два шага:
    1. копирует <дата>/site/* в бакет сайта SITE_BUCKET и проверяет, что новые страницы открываются;
    2. публикует пост в канале CHANNEL от имени бота.
После каждого шага пишет отметку <дата>/site.done.json или <дата>/post.done.json. Таймер повторяет
вызов через 15 и 30 минут: сделанное не повторяется, недоделанное доделывается. Пост уходит только
после того, как сайт выложен. Итог и ошибки бот присылает автору в личные сообщения (ADMIN_CHAT).
Нет выпуска на сегодня — функция ничего не делает и автору не пишет.

Ручной вызов: yc serverless function invoke mr-release --data '{...}'
    {"date": "2026-10-10", "dry": true}   что будет сделано, без изменений;
    {"date": "2026-10-10", "now": true}   выложить выпуск сейчас, не дожидаясь его даты;
    {"action": "preview", "date": "…"}    прислать пост автору: так он будет выглядеть в канале;
    {"action": "ping"}                    проверить доступ к бакетам, Lockbox и Telegram;
    {"action": "chats"}                   кто писал боту — так находится ADMIN_CHAT.
Токен бота лежит в Lockbox (секрет SECRET_ID, ключ token) и читается при каждом вызове: замена
токена не требует новой версии функции. К бакетам и Lockbox функция ходит с IAM-токеном своего
сервисного аккаунта, статических ключей нет.
Переменные окружения: RELEASES, SITE_BUCKET, SITE_URL, CHANNEL, SECRET_ID, ADMIN_CHAT (необязательно).
Выкладка — deploy.sh рядом, проверка логики без облака — test_index.py.
"""
import datetime
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

RELEASES = os.environ.get('RELEASES', 'modernrobotics-releases')
SITE_BUCKET = os.environ.get('SITE_BUCKET', 'modernrobotics.ru')
SITE_URL = os.environ.get('SITE_URL', 'https://modernrobotics.ru').rstrip('/')
CHANNEL = os.environ.get('CHANNEL', '')
SECRET_ID = os.environ.get('SECRET_ID', '')
ADMIN_CHAT = os.environ.get('ADMIN_CHAT', '')
S3 = 'https://storage.yandexcloud.net'
LOCKBOX = 'https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/{}/payload'
TELEGRAM = 'https://api.telegram.org'
MSK = datetime.timezone(datetime.timedelta(hours=3))
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


class Fail(Exception):
    """Ошибка шага выпуска: текст уходит в ответ функции и автору."""


# ---------- HTTP ----------
def http(method, url, headers=None, body=None, timeout=20):
    """Запрос без исключений на 4xx/5xx: (код, тело). Сетевая ошибка — код 0."""
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, str(getattr(e, 'reason', e)).encode()


# ---------- Object Storage ----------
def s3(method, bucket, key, iam, query=None, body=None, headers=None):
    url = f'{S3}/{bucket}/' + urllib.parse.quote(key, safe='/-_.~')
    if query:
        url += '?' + urllib.parse.urlencode(query)
    return http(method, url, {'X-YaCloud-SubjectToken': iam, **(headers or {})}, body)


def s3_list(bucket, prefix, iam):
    """Ключи объектов с префиксом (постранично, по 1000)."""
    keys, cont = [], None
    while True:
        q = {'list-type': '2', 'prefix': prefix}
        if cont:
            q['continuation-token'] = cont
        code, body = s3('GET', bucket, '', iam, q)
        if code != 200:
            raise Fail(f'не читается список {bucket}/{prefix}: {code} {body[:200]!r}')
        tree = ET.fromstring(body)
        tag = lambda el: el.tag.rsplit('}', 1)[-1]  # noqa: E731 — пространство имён S3 не важно
        for el in tree:
            if tag(el) == 'Contents':
                keys += [c.text for c in el if tag(c) == 'Key']
        trunc = next((el.text for el in tree if tag(el) == 'IsTruncated'), 'false')
        cont = next((el.text for el in tree if tag(el) == 'NextContinuationToken'), None)
        if trunc != 'true' or not cont:
            return keys


def s3_json(bucket, key, iam):
    """JSON-объект из бакета или None, если его нет."""
    code, body = s3('GET', bucket, key, iam)
    if code == 404:
        return None
    if code != 200:
        raise Fail(f'не читается {bucket}/{key}: {code} {body[:200]!r}')
    return json.loads(body)


def s3_put_json(bucket, key, data, iam):
    body = json.dumps(data, ensure_ascii=False, indent=2).encode()
    code, resp = s3('PUT', bucket, key, iam, body=body, headers={'Content-Type': 'application/json; charset=utf-8'})
    if code != 200:
        raise Fail(f'не записывается {bucket}/{key}: {code} {resp[:200]!r}')


def s3_copy(src_bucket, src_key, dst_bucket, dst_key, iam):
    """Копия внутри Object Storage; Content-Type и Cache-Control переходят вместе с объектом."""
    src = '/' + src_bucket + '/' + urllib.parse.quote(src_key, safe='/-_.~')
    code, resp = s3('PUT', dst_bucket, dst_key, iam, body=b'', headers={'x-amz-copy-source': src})
    if code != 200 or b'<Error>' in resp:
        raise Fail(f'не копируется {src_key}: {code} {resp[:200]!r}')


# ---------- Lockbox и Telegram ----------
def bot_token(iam):
    if not SECRET_ID:
        raise Fail('не задан SECRET_ID — секрет с токеном бота')
    code, body = http('GET', LOCKBOX.format(SECRET_ID), {'Authorization': f'Bearer {iam}'}, timeout=10)
    if code != 200:
        raise Fail(f'Lockbox не отдал токен бота: {code} {body[:200]!r}')
    entries = {e['key']: e.get('textValue', '') for e in json.loads(body).get('entries', [])}
    if not entries.get('token'):
        raise Fail('в секрете нет ключа token — токен бота ещё не записан')
    return entries['token']


def tg(bot, method, payload):
    """Вызов Bot API. Токен не попадает ни в ответ, ни в текст ошибки."""
    code, body = http('POST', f'{TELEGRAM}/bot{bot}/{method}', {'Content-Type': 'application/json'},
                      json.dumps(payload, ensure_ascii=False).encode(), timeout=15)
    try:
        data = json.loads(body)
    except ValueError:
        data = {'ok': False, 'description': body[:200].decode(errors='replace')}
    if code == 0:
        data = {'ok': False, 'description': 'Telegram недоступен: ' + body.decode(errors='replace')}
    if not data.get('ok'):
        raise Fail(f'Telegram, {method}: ' + str(data.get('description', code)).replace(bot, '***'))
    return data['result']


def post_payload(rel, chat):
    p = {'chat_id': chat, 'text': rel['post'], 'parse_mode': 'HTML'}
    if rel.get('preview'):
        p['link_preview_options'] = {'url': rel['preview'], 'prefer_large_media': True}
    return p


def notify(bot, text):
    """Сообщение автору; сбой уведомления не должен ломать выпуск."""
    if not ADMIN_CHAT or not bot:
        return False
    try:
        tg(bot, 'sendMessage', {'chat_id': ADMIN_CHAT, 'text': text, 'link_preview_options': {'is_disabled': True}})
        return True
    except Fail as e:
        print('уведомление автору не ушло:', e)
        return False


# ---------- выпуск ----------
def today_msk():
    return datetime.datetime.now(MSK).date().isoformat()


def now_iso():
    return datetime.datetime.now(MSK).isoformat(timespec='seconds')


def check_pages(pages):
    """Новые страницы открываются на сайте — без этого пост не публикуем."""
    bad = []
    for page in pages:
        url = f'{SITE_URL}/{page}'
        for attempt in range(3):
            code, body = http('GET', url + ('&' if '?' in url else '?') + f'v={int(time.time())}', timeout=15)
            if code == 200 and len(body) > 1000:
                break
            time.sleep(2)
        else:
            bad.append(f'{page} ({code})')
    if bad:
        raise Fail('после копирования не открываются: ' + ', '.join(bad))


def release(date, iam, dry=False, auto=False, force_date=False):
    pre = f'{date}/'
    rel = s3_json(RELEASES, pre + 'release.json', iam)
    if rel is None:
        return {'date': date, 'status': 'нет выпуска на эту дату'}
    title = rel.get('title') or date
    if not rel.get('approved'):
        return {'date': date, 'status': 'выпуск не одобрен', 'title': title, 'notify': auto}
    if not dry and not force_date and date != today_msk():
        return {'date': date, 'status': f'выпуск назначен на {date}, сегодня {today_msk()} — для выкладки сейчас нужен "now": true'}
    site_done = s3_json(RELEASES, pre + 'site.done.json', iam)
    post_done = s3_json(RELEASES, pre + 'post.done.json', iam)
    out = {'date': date, 'title': title, 'steps': []}

    if site_done:
        out['steps'].append(f'сайт уже выложен {site_done.get("at")}')
    else:
        keys = [k for k in s3_list(RELEASES, pre + 'site/', iam) if not k.endswith('/')]
        if not keys:
            raise Fail(f'в {RELEASES}/{pre}site/ нет файлов')
        if dry:
            out['steps'].append(f'скопировать на сайт файлов: {len(keys)}; проверить страницы: ' + ', '.join(rel.get('pages', [])))
        else:
            for k in keys:
                s3_copy(RELEASES, k, SITE_BUCKET, k[len(pre + 'site/'):], iam)
            check_pages(rel.get('pages', []))
            s3_put_json(RELEASES, pre + 'site.done.json', {'at': now_iso(), 'files': len(keys)}, iam)
            out['steps'].append(f'сайт выложен, файлов: {len(keys)}')

    if not rel.get('post'):
        out['steps'].append('поста в выпуске нет')
    elif post_done:
        out['steps'].append(f'пост уже опубликован: {post_done.get("url")}')
    elif dry:
        out['steps'].append(f'опубликовать пост в {CHANNEL}: {len(rel["post"])} знаков')
    else:
        bot = bot_token(iam)
        msg = tg(bot, 'sendMessage', post_payload(rel, CHANNEL))
        url = f'https://t.me/{CHANNEL.lstrip("@")}/{msg["message_id"]}' if CHANNEL.startswith('@') else str(msg['message_id'])
        s3_put_json(RELEASES, pre + 'post.done.json', {'at': now_iso(), 'message_id': msg['message_id'], 'url': url}, iam)
        out['steps'].append(f'пост опубликован: {url}')
    out['status'] = 'пробный прогон' if dry else 'готово'
    out['notify'] = not dry and not (site_done and post_done)
    return out


def ping(iam):
    res = {}
    try:
        s3_list(RELEASES, 'none/', iam); res['releases'] = 'ok'
    except Fail as e:
        res['releases'] = str(e)
    code, _ = s3('HEAD', SITE_BUCKET, 'index.html', iam)
    res['site'] = 'ok' if code == 200 else f'код {code}'
    code, body = http('GET', f'{TELEGRAM}/', timeout=10)
    res['telegram'] = f'доступен, код {code}' if code else 'недоступен: ' + body.decode(errors='replace')
    try:
        me = tg(bot_token(iam), 'getMe', {})
        res['bot'] = '@' + me.get('username', '?')
    except Fail as e:
        res['bot'] = str(e)
    return res


def chats(iam):
    """Личные чаты, написавшие боту: id и имя — для ADMIN_CHAT."""
    seen = {}
    for u in tg(bot_token(iam), 'getUpdates', {'allowed_updates': ['message']}):
        c = (u.get('message') or {}).get('chat') or {}
        if c.get('type') == 'private':
            seen[c['id']] = ' '.join(x for x in (c.get('first_name'), c.get('last_name'), c.get('username') and '@' + c['username']) if x)
    return [{'id': k, 'name': v} for k, v in seen.items()]


def handler(event, context):
    ev = event if isinstance(event, dict) else {}
    iam = context.token['access_token']
    auto = bool(ev.get('messages'))  # вызов таймером: {"messages": [{"details": {"trigger_id": …}}]}
    action = 'release' if auto else ev.get('action', 'release')
    date = today_msk() if auto else ev.get('date', today_msk())
    if not DATE.match(str(date)):
        return reply(400, {'error': 'дата в формате ГГГГ-ММ-ДД'})
    bot = None
    try:
        if action == 'ping':
            return reply(200, ping(iam))
        if action == 'chats':
            return reply(200, {'chats': chats(iam)})
        if action == 'preview':
            rel = s3_json(RELEASES, f'{date}/release.json', iam)
            if not rel or not rel.get('post'):
                raise Fail(f'нет поста для выпуска {date}')
            if not ADMIN_CHAT:
                raise Fail('не задан ADMIN_CHAT — кому прислать пост')
            bot = bot_token(iam)
            tg(bot, 'sendMessage', {'chat_id': ADMIN_CHAT, 'text': f'Так пост выпуска {date} будет выглядеть в канале:'})
            tg(bot, 'sendMessage', post_payload(rel, ADMIN_CHAT))
            return reply(200, {'date': date, 'status': 'пост отправлен автору'})
        res = release(date, iam, dry=bool(ev.get('dry')), auto=auto, force_date=bool(ev.get('now')))
        if res.pop('notify', False):
            bot = bot_token(iam)
            if res.get('status') == 'выпуск не одобрен':
                notify(bot, f'Выпуск {date} «{res["title"]}» не одобрен, на сайт ничего не ушло. '
                            'Одобрить: tools/release.py approve ' + date)
            else:
                notify(bot, f'Выпуск {date} «{res["title"]}»:\n' + '\n'.join(res['steps']))
        print(json.dumps(res, ensure_ascii=False))
        return reply(200, res)
    except Fail as e:
        print('ошибка выпуска:', e)
        try:
            notify(bot or bot_token(iam), f'Выпуск {date}: ошибка. {e}')
        except Fail:
            pass
        return reply(500, {'date': date, 'error': str(e)})


def reply(code, data):
    return {'statusCode': code, 'headers': {'Content-Type': 'application/json; charset=utf-8'},
            'body': json.dumps(data, ensure_ascii=False)}
