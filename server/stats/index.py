"""Анонимная статистика страниц modernrobotics.ru — функции Yandex Cloud Functions (Python 3.12).

handler — публичная функция mr-stats. POST, тело — JSON строкой (navigator.sendBeacon шлёт text/plain):
    {"p": "1-5-diffusion-policy", "e": ["open:phone", "ref:telegram", "sec:lab", "mis:labMis:0:done"]}
  Прибавляет по единице к счётчикам «день, страница, событие». Принимается только со страниц сайта
  (заголовок Origin); неизвестные страницы и имена событий отбрасываются.
report — закрытая функция mr-stats-report: вызывается через yc с правами владельца каталога.
  Тело: {"days": 7}. Ответ: строки за последние дни [{"day", "page", "ev", "n"}].

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

import ydb
import ydb.iam

TABLE = 'stats'
SITE = os.environ.get('SITE', 'modernrobotics.ru')
ORIGINS = {f'{s}://{h}' for s in ('https', 'http') for h in (SITE, 'www.' + SITE)}
MSK = datetime.timezone(datetime.timedelta(hours=3))
PAGE = re.compile(r'^(index|test|\d-\d{1,2}-[a-z0-9-]{1,60})$')     # test — проверка после выкладки
EVENT = re.compile(r'^(open:(phone|desk)'
                   r'|ref:(direct|site|telegram|linkedin|google|yandex|github|vk|habr|other)'
                   r'|sec:[a-z][a-zA-Z0-9-]{0,30}'
                   r'|t:(2|10|30)'
                   r'|quiz:\d{1,2}/\d{1,2}'
                   r'|mis:[a-zA-Z][a-zA-Z0-9]{0,30}:\d{1,2}:(seen|done|r[1-5])'
                   r'|task:[a-zA-Z][a-zA-Z0-9]{0,30}:done)$')
MAX_EVENTS = 60
LIMIT, WINDOW = 30, 60      # с одного адреса — не больше 30 пачек в минуту; учёт только в памяти экземпляра
MAX_DAYS = 120

SELECT = f'''DECLARE $day AS Utf8; DECLARE $page AS Utf8; DECLARE $evs AS List<Utf8>;
SELECT ev, n FROM {TABLE} WHERE day = $day AND page = $page AND ev IN $evs;'''
UPSERT = f'''DECLARE $rows AS List<Struct<day: Utf8, page: Utf8, ev: Utf8, n: Uint64>>;
UPSERT INTO {TABLE} SELECT day, page, ev, n FROM AS_TABLE($rows);'''
SCAN = f'''DECLARE $from AS Utf8;
SELECT day, page, ev, n FROM {TABLE} WHERE day >= $from;'''

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


def create_table(session):
    col = lambda name, t: ydb.Column(name, ydb.OptionalType(t))  # noqa: E731
    session.create_table(
        os.environ['YDB_DATABASE'] + '/' + TABLE,
        ydb.TableDescription()
        .with_column(col('day', ydb.PrimitiveType.Utf8))
        .with_column(col('page', ydb.PrimitiveType.Utf8))
        .with_column(col('ev', ydb.PrimitiveType.Utf8))
        .with_column(col('n', ydb.PrimitiveType.Uint64))
        .with_primary_keys('day', 'page', 'ev'))


def run(callee):
    def with_table(session):
        try:
            return callee(session)
        except ydb.issues.SchemeError:  # первый запрос: таблицы ещё нет
            create_table(session)
            return callee(session)
    return pool().retry_operation_sync(with_table)


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


def scan(since):
    """Все строки начиная с дня since. Сканирующий запрос — без ограничения в 1000 строк."""
    q = ydb.ScanQuery(SCAN, {'$from': ydb.PrimitiveType.Utf8})
    out = []
    for part in driver().table_client.scan_query(q, {'$from': since}):
        out += [{'day': r.day, 'page': r.page, 'ev': r.ev, 'n': int(r.n or 0)} for r in part.result_set.rows]
    return out


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
        got = clean(json.loads(body_of(event)))
    except ValueError:
        got = None
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
    try:
        rows = scan(since)
    except ydb.issues.SchemeError:
        rows = []
    return reply(200, {'since': since, 'today': today(), 'rows': rows})
