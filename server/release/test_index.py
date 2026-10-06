"""Проверка логики mr-release без облака: Object Storage, Lockbox, Telegram и сайт подменены словарями.
Запуск: python3 test_index.py
"""
import json
import os
import types
import urllib.parse

os.environ.update(RELEASES='rel', SITE_BUCKET='site', SITE_URL='https://example.ru', CHANNEL='@chan',
                  SECRET_ID='sec', ADMIN_CHAT='42')
import index  # noqa: E402

TOKEN = '123:SECRET'


class Cloud:
    def __init__(self):
        self.objs = {}            # (бакет, ключ) -> (байты, заголовки)
        self.sent = []            # (chat_id, text)
        self.tg_down = False
        self.lockbox = {'token': TOKEN}
        self.site_broken = set()
        self.iam_seen = set()

    def http(self, method, url, headers=None, body=None, timeout=20):
        headers = headers or {}
        u = urllib.parse.urlsplit(url)
        if url.startswith(index.S3):
            self.iam_seen.add(headers.get('X-YaCloud-SubjectToken'))
            bucket, _, key = u.path.lstrip('/').partition('/')
            key = urllib.parse.unquote(key)
            q = dict(urllib.parse.parse_qsl(u.query))
            if method == 'GET' and q.get('list-type'):
                keys = sorted(k for (b, k) in self.objs if b == bucket and k.startswith(q['prefix']))
                xml = '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' + ''.join(
                    f'<Contents><Key>{k}</Key></Contents>' for k in keys) + '<IsTruncated>false</IsTruncated></ListBucketResult>'
                return 200, xml.encode()
            if method in ('GET', 'HEAD'):
                o = self.objs.get((bucket, key))
                return (200, o[0]) if o else (404, b'<Error>NoSuchKey</Error>')
            if method == 'PUT' and 'x-amz-copy-source' in headers:
                sb, _, sk = headers['x-amz-copy-source'].lstrip('/').partition('/')
                o = self.objs.get((sb, urllib.parse.unquote(sk)))
                if not o:
                    return 404, b'<Error>NoSuchKey</Error>'
                self.objs[(bucket, key)] = o
                return 200, b'<CopyObjectResult/>'
            if method == 'PUT':
                self.objs[(bucket, key)] = (body, headers)
                return 200, b''
        if url.startswith('https://payload.lockbox'):
            assert headers['Authorization'] == 'Bearer IAM'
            return 200, json.dumps({'entries': [{'key': k, 'textValue': v} for k, v in self.lockbox.items()]}).encode()
        if url.startswith(index.TELEGRAM):
            if self.tg_down:
                return 0, b'timed out'
            if url == index.TELEGRAM + '/':
                return 200, b'<html>'
            assert f'/bot{TOKEN}/' in url
            data = json.loads(body)
            if url.endswith('/sendMessage'):
                self.sent.append((data['chat_id'], data['text']))
                return 200, json.dumps({'ok': True, 'result': {'message_id': 100 + len(self.sent)}}).encode()
            if url.endswith('/getMe'):
                return 200, b'{"ok": true, "result": {"username": "mr_bot"}}'
            if url.endswith('/getUpdates'):
                return 200, json.dumps({'ok': True, 'result': [{'message': {'chat': {'id': 42, 'type': 'private', 'first_name': 'Олег'}}},
                                                              {'message': {'chat': {'id': -5, 'type': 'channel'}}}]}).encode()
        if url.startswith('https://example.ru/'):
            page = u.path.lstrip('/')
            if page in self.site_broken:
                return 404, b''
            o = self.objs.get(('site', page))
            return (200, o[0]) if o else (404, b'')
        raise AssertionError('неожиданный запрос ' + url)


ctx = types.SimpleNamespace(token={'access_token': 'IAM'})
TIMER = {'messages': [{'details': {'trigger_id': 't1', 'payload': ''}}]}


def call(ev):
    r = index.handler(ev, ctx)
    return r['statusCode'], json.loads(r['body'])


def stage(cloud, date, approved=True, post='<b>Новая часть</b> курса', pages=('lessons/new.html',)):
    big = b'<html>' + b'x' * 2000 + b'</html>'
    cloud.objs[('rel', f'{date}/site/index.html')] = (big, {})
    cloud.objs[('rel', f'{date}/site/lessons/new.html')] = (big, {})
    cloud.objs[('rel', f'{date}/release.json')] = (json.dumps({
        'date': date, 'title': 'Часть 2', 'pages': list(pages), 'preview': 'https://example.ru/lessons/new.html',
        'post': post, 'approved': approved}).encode(), {})


ok = 0
def check(name, cond):
    global ok
    assert cond, name
    ok += 1
    print('  ✓', name)


index.time.sleep = lambda s: None
today = index.today_msk()

# 1. Таймер без выпуска: ничего не делает и никому не пишет
c = Cloud(); index.http = c.http
code, r = call(TIMER)
check('нет выпуска — ничего не происходит', code == 200 and r['status'].startswith('нет выпуска') and not c.sent)

# 2. Выпуск не одобрен: на сайт ничего не уходит, автор получает сообщение
stage(c, today, approved=False)
code, r = call(TIMER)
check('неодобренный выпуск не выкладывается', ('site', 'lessons/new.html') not in c.objs)
check('об неодобренном выпуске пишет автору', len(c.sent) == 1 and c.sent[0][0] == '42' and 'не одобрен' in c.sent[0][1])

# 3. Пробный прогон ничего не меняет
c = Cloud(); index.http = c.http; stage(c, today)
code, r = call({'date': today, 'dry': True})
check('пробный прогон: план без изменений', r['status'] == 'пробный прогон' and ('site', 'index.html') not in c.objs and not c.sent)

# 4. Таймер: сайт, проверка страниц, пост, отметки, итог автору
code, r = call(TIMER)
check('сайт скопирован', ('site', 'lessons/new.html') in c.objs and ('site', 'index.html') in c.objs)
check('пост ушёл в канал', ('@chan', '<b>Новая часть</b> курса') in c.sent)
check('отметки выполнения записаны', ('rel', f'{today}/site.done.json') in c.objs and ('rel', f'{today}/post.done.json') in c.objs)
check('итог прислан автору', any(ch == '42' and 'пост опубликован: https://t.me/chan/' in t for ch, t in c.sent))
check('в Object Storage ходит с IAM-токеном', c.iam_seen == {'IAM'})

# 5. Повтор таймера ничего не повторяет и молчит
n = len(c.sent)
code, r = call(TIMER)
check('повторный вызов ничего не повторяет', len(c.sent) == n and all('уже' in s for s in r['steps']))

# 6. Telegram недоступен: сайт выложен, пост — при следующем вызове
c = Cloud(); index.http = c.http; stage(c, today); c.tg_down = True
code, r = call(TIMER)
check('без Telegram — ошибка, но сайт уже выложен', code == 500 and ('rel', f'{today}/site.done.json') in c.objs and ('rel', f'{today}/post.done.json') not in c.objs)
check('токен не попадает в текст ошибки', TOKEN not in json.dumps(r, ensure_ascii=False))
c.tg_down = False
code, r = call(TIMER)
check('следующий вызов доделывает пост', code == 200 and ('@chan', '<b>Новая часть</b> курса') in c.sent and ('rel', f'{today}/post.done.json') in c.objs)
check('сайт второй раз не копируется', any('уже выложен' in s for s in r['steps']))

# 7. Страница не открылась после копирования — пост не публикуется
c = Cloud(); index.http = c.http; stage(c, today); c.site_broken.add('lessons/new.html')
code, r = call(TIMER)
check('страница не открылась — пост не уходит', code == 500 and not any(ch == '@chan' for ch, _ in c.sent) and 'не открываются' in r['error'])

# 8. Выпуск на другую дату не выкладывается без now
c = Cloud(); index.http = c.http; stage(c, '2030-01-05')
code, r = call({'date': '2030-01-05'})
check('чужая дата без now — ничего не выложено', ('site', 'index.html') not in c.objs and 'now' in r['status'])
code, r = call({'date': '2030-01-05', 'now': True})
check('с now — выложено', ('site', 'index.html') in c.objs and r['status'] == 'готово')

# 9. Выпуск без поста: только сайт
c = Cloud(); index.http = c.http; stage(c, today, post='')
code, r = call(TIMER)
check('выпуск без поста: сайт есть, в канал ничего', ('site', 'index.html') in c.objs and not any(ch == '@chan' for ch, _ in c.sent))

# 10. Предпросмотр поста автору, ping, chats, плохая дата
c = Cloud(); index.http = c.http; stage(c, '2030-01-05')
code, r = call({'action': 'preview', 'date': '2030-01-05'})
check('предпросмотр уходит автору, а не в канал', [ch for ch, _ in c.sent] == ['42', '42'] and c.sent[1][1] == '<b>Новая часть</b> курса')
code, r = call({'action': 'chats'})
check('chats показывает личные чаты', r['chats'] == [{'id': 42, 'name': 'Олег'}])
c.objs[('site', 'index.html')] = (b'x', {})
code, r = call({'action': 'ping'})
check('ping', r['site'] == 'ok' and r['bot'] == '@mr_bot' and r['releases'] == 'ok')
code, r = call({'date': '10.10.2026'})
check('дата не по формату — 400', code == 400)
c.lockbox = {}
code, r = call({'action': 'preview', 'date': '2030-01-05'})
check('нет токена — понятная ошибка', code == 500 and 'token' in r['error'])
print(f'ИТОГ: все проверки прошли ({ok})')
