"""Проверка логики функции без облака: YDB заменена поддельной таблицей в памяти.
Запуск: pip install -r requirements.txt && python3 test_index.py
"""
import os
import types

os.environ.setdefault('YDB_DATABASE', '/local/db')
import ydb  # noqa: E402
import index  # noqa: E402


class FakeDB:
    def __init__(self):
        self.table = None          # None — таблицы ещё нет
        self.abort_next_commit = False
        self.created = 0


class FakeTx:
    def __init__(self, db):
        self.db, self.writes = db, {}

    def execute(self, q, params, commit_tx=False):
        if q.startswith('DECLARE $id AS Utf8; SELECT'):
            row = self.db.table.get(params['$id'])
            rows = [types.SimpleNamespace(n=row)] if row is not None else []
        else:
            self.writes[params['$id']] = params['$n']
            rows = []
        if commit_tx:
            if self.db.abort_next_commit:
                self.db.abort_next_commit = False
                raise ydb.issues.Aborted('Transaction locks invalidated')
            self.db.table.update(self.writes)
        return [types.SimpleNamespace(rows=rows)]


class FakeSession:
    def __init__(self, db):
        self.db = db

    def prepare(self, q):
        if self.db.table is None:
            raise ydb.issues.SchemeError('Cannot find table')
        return q

    def transaction(self, mode=None):
        return FakeTx(self.db)

    def create_table(self, path, desc):
        assert path == '/local/db/thanks'
        self.db.table, self.db.created = {}, self.db.created + 1


class FakePool:
    def __init__(self, db):
        self.db = db

    def retry_operation_sync(self, callee):
        for _ in range(5):
            try:
                return callee(FakeSession(self.db))
            except ydb.issues.Aborted:
                continue
        raise RuntimeError('retries exhausted')


fails = []


def ok(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        fails.append(msg)


def call(method, k=None, origin=None, ip='1.2.3.4'):
    ev = {'httpMethod': method, 'headers': {'Origin': origin} if origin else {},
          'queryStringParameters': {'k': k} if k else {}, 'requestContext': {'identity': {'sourceIp': ip}}}
    r = index.handler(ev, None)
    import json
    return r['statusCode'], (json.loads(r['body']) if r['body'] else None), r['headers']


db = FakeDB()
index._pool = FakePool(db)
SITE = 'https://modernrobotics.ru'

code, body, h = call('GET')
ok(code == 200 and body == {'n': 0} and db.created == 1, 'первый GET создаёт таблицу и отдаёт 0')
ok(call('POST')[0] == 403, 'POST без Origin отклонён')
ok(call('POST', origin='https://evil.example')[0] == 403, 'POST с чужого сайта отклонён')
code, body, h = call('POST', origin=SITE)
ok(code == 200 and body == {'n': 1} and h['Access-Control-Allow-Origin'] == SITE, 'POST с сайта: 1, CORS для сайта')
ok(call('POST', origin='https://www.modernrobotics.ru', ip='5.6.7.8')[1] == {'n': 2}, 'POST с www: 2')
ok(call('GET')[1] == {'n': 2}, 'GET после POST видит 2 (кэш обновлён)')
index._cache.clear()
ok(call('GET')[1] == {'n': 2}, 'GET из базы: 2')
db.abort_next_commit = True
ok(call('POST', origin=SITE, ip='9.9.9.9')[1] == {'n': 3}, 'конфликт транзакции: повтор, прибавилось ровно одно')
ok(db.table == {'course': 3}, 'в базе course = 3')
ok(call('POST', k='test', origin=SITE, ip='7.7.7.7')[1] == {'n': 1} and db.table['course'] == 3, 'счётчик test отдельный')
ok(call('GET', k='evil')[0] == 400, 'неизвестный счётчик — 400')
code, body, h = call('OPTIONS', origin=SITE)
ok(code == 204 and 'POST' in h['Access-Control-Allow-Methods'], 'OPTIONS — 204 с разрешёнными методами')
ok(call('GET', origin='https://other.example')[2]['Access-Control-Allow-Origin'] == '*', 'GET читается с любого сайта')
codes = [call('POST', origin=SITE, ip='3.3.3.3')[0] for _ in range(index.LIMIT + 1)]
ok(codes[:-1] == [200] * index.LIMIT and codes[-1] == 429, f'{index.LIMIT + 1}-е спасибо за минуту с одного адреса — 429')
ok(call('POST', origin=SITE, ip='4.4.4.4')[0] == 200, 'другой адрес не задет')


class Broken:
    def retry_operation_sync(self, callee):
        raise ydb.issues.Unavailable('no db')


index._pool, saved = Broken(), index._pool
index._cache.clear()
ok(call('GET')[0] == 503, 'база недоступна — 503, без падения')
index._pool = saved

print('Готово.' if not fails else f'Ошибок: {len(fails)}')
raise SystemExit(1 if fails else 0)
