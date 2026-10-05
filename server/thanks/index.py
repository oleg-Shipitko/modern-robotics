"""Счётчик «Сказать спасибо» для modernrobotics.ru — функция Yandex Cloud Functions (Python 3.12).

GET  — текущее число: {"n": 128}
POST — прибавить одно спасибо и вернуть новое число. Принимается только со страниц сайта (заголовок Origin).
?k=test — отдельный счётчик для проверки после выкладки, на сайте не показывается.

Число лежит в YDB serverless: таблица thanks, одна строка на счётчик; таблица создаётся при первом запросе.
О людях ничего не хранится. Переменные окружения: YDB_ENDPOINT, YDB_DATABASE, SITE (домен сайта).
Выкладка — deploy.sh рядом.
"""
import json
import os
import time

import ydb
import ydb.iam

TABLE = 'thanks'
KEYS = ('course', 'test')
SITE = os.environ.get('SITE', 'modernrobotics.ru')
ORIGINS = {f'{s}://{h}' for s in ('https', 'http') for h in (SITE, 'www.' + SITE)}
LIMIT, WINDOW = 20, 60      # с одного адреса — не больше 20 спасибо в минуту (учёт в памяти экземпляра, не в базе)
CACHE_S = 10                # GET отдаёт число из памяти, если оно свежее 10 секунд: меньше чтений базы

SELECT = f'DECLARE $id AS Utf8; SELECT n FROM {TABLE} WHERE id = $id;'
UPSERT = f'DECLARE $id AS Utf8; DECLARE $n AS Uint64; UPSERT INTO {TABLE} (id, n) VALUES ($id, $n);'

_pool = None
_hits = {}
_cache = {}


def pool():
    global _pool
    if _pool is None:
        driver = ydb.Driver(endpoint=os.environ['YDB_ENDPOINT'], database=os.environ['YDB_DATABASE'],
                            credentials=ydb.iam.MetadataUrlCredentials())
        driver.wait(fail_fast=True, timeout=5)
        _pool = ydb.SessionPool(driver)
    return _pool


def create_table(session):
    session.create_table(
        os.environ['YDB_DATABASE'] + '/' + TABLE,
        ydb.TableDescription()
        .with_column(ydb.Column('id', ydb.OptionalType(ydb.PrimitiveType.Utf8)))
        .with_column(ydb.Column('n', ydb.OptionalType(ydb.PrimitiveType.Uint64)))
        .with_primary_key('id'))


def run(callee):
    def with_table(session):
        try:
            return callee(session)
        except ydb.issues.SchemeError:  # первый запрос: таблицы ещё нет
            create_table(session)
            return callee(session)
    return pool().retry_operation_sync(with_table)


def value(rows):
    return (rows[0].n or 0) if rows else 0


def read(key):
    def callee(session):
        tx = session.transaction(ydb.OnlineReadOnly())
        return value(tx.execute(session.prepare(SELECT), {'$id': key}, commit_tx=True)[0].rows)
    return run(callee)


def bump(key):
    def callee(session):  # чтение и запись в одной транзакции: при одновременных нажатиях YDB повторит её, ни одно не потеряется
        tx = session.transaction(ydb.SerializableReadWrite())
        n = value(tx.execute(session.prepare(SELECT), {'$id': key})[0].rows) + 1
        tx.execute(session.prepare(UPSERT), {'$id': key, '$n': n}, commit_tx=True)
        return n
    return run(callee)


def allowed(addr):
    if not addr:
        return True
    now = time.time()
    if len(_hits) > 10000:
        _hits.clear()
    recent = [t for t in _hits.get(addr, ()) if now - t < WINDOW]
    _hits[addr] = recent + [now] if len(recent) < LIMIT else recent
    return len(recent) < LIMIT


def reply(code, body, headers):
    return {'statusCode': code, 'isBase64Encoded': False,
            'headers': {'Content-Type': 'application/json', 'Cache-Control': 'no-store', **headers},
            'body': json.dumps(body) if body is not None else ''}


def handler(event, context):
    method = (event.get('httpMethod') or 'GET').upper()
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    origin = headers.get('origin', '')
    key = (event.get('queryStringParameters') or {}).get('k') or 'course'
    cors = {'Access-Control-Allow-Origin': origin if origin in ORIGINS else '*', 'Vary': 'Origin'}
    if method == 'OPTIONS':
        return reply(204, None, {**cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Max-Age': '86400'})
    if key not in KEYS:
        return reply(400, {'error': 'unknown counter'}, cors)
    try:
        if method == 'GET':
            hit = _cache.get(key)
            if hit and time.time() - hit[0] < CACHE_S:
                return reply(200, {'n': hit[1]}, cors)
            n = read(key)
        elif method == 'POST':
            if origin not in ORIGINS:
                return reply(403, {'error': 'origin'}, cors)
            ip = ((event.get('requestContext') or {}).get('identity') or {}).get('sourceIp') \
                or headers.get('x-forwarded-for', '').split(',')[0].strip()
            if not allowed(ip):
                return reply(429, {'error': 'too many'}, cors)
            n = bump(key)
        else:
            return reply(405, {'error': 'method'}, cors)
    except Exception as e:  # база недоступна: сайт просто не покажет число
        print('thanks error:', repr(e))
        return reply(503, {'error': 'unavailable'}, cors)
    _cache[key] = (time.time(), n)
    return reply(200, {'n': n}, cors)
