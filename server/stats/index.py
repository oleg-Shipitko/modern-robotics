"""Анонимная статистика страниц modernrobotics.ru — функции Yandex Cloud Functions (Python 3.12).

handler — публичная функция mr-stats. POST, тело — JSON строкой (navigator.sendBeacon шлёт text/plain):
    {"p": "1-5-diffusion-policy", "e": ["open:phone", "ref:telegram", "sec:lab", "mis:labMis:0:done"]}
  Прибавляет по единице к счётчикам «день, страница, событие». Принимается только со страниц сайта
  (заголовок Origin); неизвестные страницы и имена событий отбрасываются.
  Отзыв в конце урока — та же точка: {"p": "...", "fb": {"r": "good|mid|bad"}} прибавляет оценку к суммам
  урока (событие fb:good и т. п.), а {"p": "...", "fb": {"r": "...", "t": "текст"}} сохраняет текст отзыва
  в таблицу feedback — без имени, контактов и адреса.
report — закрытая функция mr-stats-report: вызывается через yc с правами владельца каталога.
  Тело: {"days": 7}. Ответ: суммы за последние дни [{"day", "page", "ev", "n"}] и тексты отзывов
  [{"day", "page", "r", "t", "at"}].

О читателях ничего не хранится: ни IP, ни cookies, ни идентификаторов — только суммы по дням
(день — по московскому времени). Таблица stats лежит в той же базе YDB, что и счётчик «спасибо»,
и создаётся при первом запросе. Переменные окружения: YDB_ENDPOINT, YDB_DATABASE, SITE.
Выкладка — deploy.sh рядом, отчёт — tools/stats.py.
"""
import base64
import datetime
import json
import os
import re
import time
import uuid

import ydb
import ydb.iam

TABLE = 'stats'
SITE = os.environ.get('SITE', 'modernrobotics.ru')
ORIGINS = {f'{s}://{h}' for s in ('https', 'http') for h in (SITE, 'www.' + SITE)}
MSK = datetime.timezone(datetime.timedelta(hours=3))
PAGE = re.compile(r'^(index|test|glossariy|\d-\d{1,2}-[a-z0-9-]{1,60}|proverka-chasti-\d)$')     # test — проверка после выкладки
EVENT = re.compile(r'^(open:(phone|desk)'
                   r'|ref:(direct|site|telegram|linkedin|google|yandex|github|vk|habr|other)'
                   r'|sec:[a-z][a-zA-Z0-9-]{0,30}'
                   r'|t:(2|10|30)'
                   r'|quiz:\d{1,2}/\d{1,2}'
                   r'|mis:[a-zA-Z][a-zA-Z0-9]{0,30}:\d{1,2}:(seen|done|r[1-5])'
                   r'|task:[a-zA-Z][a-zA-Z0-9]{0,30}:done'
                   r'|chk:\d{1,2}:(ok|no))$')     # chk — задания проверки в конце части
MAX_EVENTS = 60
LIMIT, WINDOW = 30, 60      # с одного адреса — не больше 30 пачек в минуту; учёт только в памяти экземпляра
MAX_DAYS = 120
FB_TABLE = 'feedback'
RATINGS = ('good', 'mid', 'bad')
MAX_TEXT = 1000

SELECT = f'''DECLARE $day AS Utf8; DECLARE $page AS Utf8; DECLARE $evs AS List<Utf8>;
SELECT ev, n FROM {TABLE} WHERE day = $day AND page = $page AND ev IN $evs;'''
UPSERT = f'''DECLARE $rows AS List<Struct<day: Utf8, page: Utf8, ev: Utf8, n: Uint64>>;
UPSERT INTO {TABLE} SELECT day, page, ev, n FROM AS_TABLE($rows);'''
SCAN = f'''DECLARE $from AS Utf8;
SELECT day, page, ev, n FROM {TABLE} WHERE day >= $from;'''
FB_INSERT = f'''DECLARE $day AS Utf8; DECLARE $id AS Utf8; DECLARE $page AS Utf8; DECLARE $r AS Utf8; DECLARE $t AS Utf8; DECLARE $at AS Utf8;
UPSERT INTO {FB_TABLE} (day, id, page, r, t, at) VALUES ($day, $id, $page, $r, $t, $at);'''
FB_SCAN = f'''DECLARE $from AS Utf8;
SELECT day, page, r, t, at FROM {FB_TABLE} WHERE day >= $from;'''

_driver = None
_pool = None
_hits = {}


def driver():
    global _driver
    if _driver is None:
        _driver = ydb.Driver(endpoint=os.environ['YDB_ENDPOINT'], database=os.environ['YDB_DATABASE'],
                             credentials=ydb.iam.MetadataUrlCredentials())
        _driver.wait(fail_fast=True, timeout=5)
    return _driver


def pool():
    global _pool
    if _pool is None:
        _pool = ydb.SessionPool(driver())
    return _pool


def col(name, t):
    return ydb.Column(name, ydb.OptionalType(t))


def create_table(session):
    session.create_table(
        os.environ['YDB_DATABASE'] + '/' + TABLE,
        ydb.TableDescription()
        .with_column(col('day', ydb.PrimitiveType.Utf8))
        .with_column(col('page', ydb.PrimitiveType.Utf8))
        .with_column(col('ev', ydb.PrimitiveType.Utf8))
        .with_column(col('n', ydb.PrimitiveType.Uint64))
        .with_primary_keys('day', 'page', 'ev'))


def create_fb_table(session):
    desc = ydb.TableDescription()
    for name in ('day', 'id', 'page', 'r', 't', 'at'):
        desc = desc.with_column(col(name, ydb.PrimitiveType.Utf8))
    session.create_table(os.environ['YDB_DATABASE'] + '/' + FB_TABLE, desc.with_primary_keys('day', 'id'))


def run(callee, create=create_table):
    def with_table(session):
        try:
            return callee(session)
        except ydb.issues.SchemeError:  # первый запрос: таблицы ещё нет
            create(session)
            return callee(session)
    return pool().retry_operation_sync(with_table)


def save_text(day, page, r, t):
    """Текст отзыва: случайный id вместо чего-либо о читателе, время — только чтобы показать свежие сверху."""
    at = datetime.datetime.now(MSK).strftime('%Y-%m-%dT%H:%M')
    def callee(session):
        session.transaction(ydb.SerializableReadWrite()).execute(
            session.prepare(FB_INSERT), {'$day': day, '$id': uuid.uuid4().hex, '$page': page, '$r': r, '$t': t, '$at': at}, commit_tx=True)
        return 1
    return run(callee, create_fb_table)


def add(day, page, evs):
    """Прибавить по единице к каждому событию. Чтение и запись в одной транзакции:
    при одновременных пачках YDB повторит её, и ни одно событие не потеряется."""
    def callee(session):
        tx = session.transaction(ydb.SerializableReadWrite())
        rows = tx.execute(session.prepare(SELECT), {'$day': day, '$page': page, '$evs': evs})[0].rows
        cur = {r.ev: r.n or 0 for r in rows}
        tx.execute(session.prepare(UPSERT),
                   {'$rows': [{'day': day, 'page': page, 'ev': e, 'n': cur.get(e, 0) + 1} for e in evs]},
                   commit_tx=True)
        return len(evs)
    return run(callee)


def scan(since, text=SCAN, row=lambda r: {'day': r.day, 'page': r.page, 'ev': r.ev, 'n': int(r.n or 0)}):
    """Все строки начиная с дня since. Сканирующий запрос — без ограничения в 1000 строк."""
    q = ydb.ScanQuery(text, {'$from': ydb.PrimitiveType.Utf8})
    out = []
    for part in driver().table_client.scan_query(q, {'$from': since}):
        out += [row(r) for r in part.result_set.rows]
    return out


def scan_fb(since):
    return scan(since, FB_SCAN, lambda r: {'day': r.day, 'page': r.page, 'r': r.r, 't': r.t, 'at': r.at})


def allowed(addr):
    if not addr:
        return True
    now = time.time()
    if len(_hits) > 10000:
        _hits.clear()
    recent = [t for t in _hits.get(addr, ()) if now - t < WINDOW]
    _hits[addr] = recent + [now] if len(recent) < LIMIT else recent
    return len(recent) < LIMIT


def reply(code, body, headers=None):
    return {'statusCode': code, 'isBase64Encoded': False,
            'headers': {'Content-Type': 'application/json', 'Cache-Control': 'no-store', **(headers or {})},
            'body': json.dumps(body, ensure_ascii=False) if body is not None else ''}


def body_of(event):
    body = event.get('body') or ''
    if event.get('isBase64Encoded'):
        body = base64.b64decode(body).decode('utf-8', 'replace')
    return body


def clean(data):
    """Страница и список известных событий без повторов; иначе None."""
    if not isinstance(data, dict):
        return None
    page, evs = data.get('p'), data.get('e')
    if not isinstance(page, str) or not PAGE.match(page) or not isinstance(evs, list):
        return None
    good = sorted({e for e in evs[:MAX_EVENTS * 2] if isinstance(e, str) and EVENT.match(e)})[:MAX_EVENTS]
    return page, good


def today():
    return datetime.datetime.now(MSK).strftime('%Y-%m-%d')


def handler(event, context):
    method = (event.get('httpMethod') or 'GET').upper()
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    origin = headers.get('origin', '')
    cors = {'Access-Control-Allow-Origin': origin if origin in ORIGINS else '*', 'Vary': 'Origin'}
    if method == 'OPTIONS':
        return reply(204, None, {**cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Max-Age': '86400'})
    if method != 'POST':
        return reply(405, {'error': 'method'}, cors)
    if origin not in ORIGINS:
        return reply(403, {'error': 'origin'}, cors)
    ip = ((event.get('requestContext') or {}).get('identity') or {}).get('sourceIp') \
        or headers.get('x-forwarded-for', '').split(',')[0].strip()
    if not allowed(ip):
        return reply(429, {'error': 'too many'}, cors)
    try:
        data = json.loads(body_of(event))
    except ValueError:
        data = None
    if isinstance(data, dict) and 'fb' in data:
        return feedback(data, cors)
    got = clean(data)
    if got is None:
        return reply(400, {'error': 'bad request'}, cors)
    page, evs = got
    if not evs:
        return reply(200, {'n': 0}, cors)
    try:
        n = add(today(), page, evs)
    except Exception as e:  # база недоступна: на сайте это ни на что не влияет
        print('stats error:', repr(e))
        return reply(503, {'error': 'unavailable'}, cors)
    return reply(200, {'n': n}, cors)


def feedback(data, cors):
    page, fb = data.get('p'), data.get('fb')
    if not isinstance(page, str) or not PAGE.match(page) or page == 'index' or not isinstance(fb, dict) or fb.get('r') not in RATINGS:
        return reply(400, {'error': 'bad request'}, cors)
    t = fb.get('t')
    if t is not None and not isinstance(t, str):
        return reply(400, {'error': 'bad request'}, cors)
    t = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', (t or '')).strip()[:MAX_TEXT]
    try:
        if t:
            save_text(today(), page, fb['r'], t)
        else:
            add(today(), page, ['fb:' + fb['r']])
    except Exception as e:
        print('feedback error:', repr(e))
        return reply(503, {'error': 'unavailable'}, cors)
    return reply(200, {'ok': True}, cors)


def report(event, context):
    data = event
    if isinstance(event, dict) and 'httpMethod' in event:
        try:
            data = json.loads(body_of(event) or '{}')
        except ValueError:
            data = {}
    days = data.get('days', 7) if isinstance(data, dict) else 7
    days = max(1, min(int(days) if str(days).isdigit() else 7, MAX_DAYS))
    since = (datetime.datetime.now(MSK) - datetime.timedelta(days=days - 1)).strftime('%Y-%m-%d')
    out = {'since': since, 'today': today(), 'rows': [], 'feedback': []}
    try:
        out['rows'] = scan(since)
    except ydb.issues.SchemeError:  # таблицы ещё нет — данных тоже
        pass
    try:
        out['feedback'] = scan_fb(since)
    except ydb.issues.Error as e:  # таблица отзывов появляется с первым текстом; суммы показываем и без неё
        print('feedback scan:', repr(e))
    return reply(200, out)
