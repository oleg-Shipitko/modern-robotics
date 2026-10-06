"""Проверка логики функций без облака: YDB заменена поддельной таблицей в памяти.
Запуск: pip install -r requirements.txt && python3 test_index.py
"""
import base64
import json
import os
import types

os.environ.setdefault('YDB_DATABASE', '/local/db')
import ydb  # noqa: E402
import index  # noqa: E402


class FakeDB:
    def __init__(self):
        self.table = None          # None — таблицы ещё нет
        self.fb = None             # тексты отзывов: None — таблицы ещё нет
        self.abort_next_commit = False


class FakeTx:
    def __init__(self, db):
        self.db, self.writes = db, {}

    def execute(self, q, params, commit_tx=False):
        rows = []
        if q.startswith('DECLARE $day AS Utf8; DECLARE $id'):
            self.db.fb.append({k[1:]: v for k, v in params.items()})
        elif 'SELECT ev, n' in q:
            for e in params['$evs']:
                n = self.db.table.get((params['$day'], params['$page'], e))
                if n is not None:
                    rows.append(types.SimpleNamespace(ev=e, n=n))
        else:
            for r in params['$rows']:
                self.writes[(r['day'], r['page'], r['ev'])] = r['n']
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
        if ('feedback' in q and self.db.fb is None) or ('feedback' not in q and self.db.table is None):
            raise ydb.issues.SchemeError('Cannot find table')
        return q

    def transaction(self, mode=None):
        return FakeTx(self.db)

    def create_table(self, path, desc):
        assert path in ('/local/db/stats', '/local/db/feedback')
        if path.endswith('stats'):
            self.db.table = {}
        else:
            self.db.fb = []


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


def post(body, origin='https://modernrobotics.ru', ip='1.2.3.4', b64=False):
    raw = json.dumps(body) if not isinstance(body, str) else body
    ev = {'httpMethod': 'POST', 'headers': {'Origin': origin}, 'requestContext': {'identity': {'sourceIp': ip}},
          'body': base64.b64encode(raw.encode()).decode() if b64 else raw, 'isBase64Encoded': b64}
    r = index.handler(ev, None)
    return r['statusCode'], json.loads(r['body'] or 'null')


def main():
    db = FakeDB()
    index._pool = FakePool(db)
    day = index.today()
    ok = 0

    def check(cond, msg):
        nonlocal ok
        assert cond, msg
        ok += 1
        print('  ✓', msg)

    code, body = post({'p': '1-5-diffusion-policy', 'e': ['open:desk', 'ref:telegram', 'sec:lab', 'sec:lab', 'mis:labMis:0:done', 'mis:labMis:0:r2']})
    check(code == 200 and body['n'] == 5 and db.table[(day, '1-5-diffusion-policy', 'sec:lab')] == 1, 'первая пачка: таблица создана, повтор внутри пачки не считается дважды')
    post({'p': '1-5-diffusion-policy', 'e': ['open:desk', 'quiz:6/8']}, ip='5.6.7.8')
    check(db.table[(day, '1-5-diffusion-policy', 'open:desk')] == 2 and db.table[(day, '1-5-diffusion-policy', 'quiz:6/8')] == 1, 'вторая пачка прибавляет к тем же счётчикам')
    code, body = post({'p': '1-5-diffusion-policy', 'e': ['open:desk', 'name:Иван', 'sec:<script>', 'ref:evil.com', 't:5', 42]})
    check(code == 200 and body['n'] == 1 and not any('Иван' in k[2] or 'evil' in k[2] for k in db.table), 'неизвестные события отброшены, известные посчитаны')
    check(post({'p': '../etc', 'e': ['open:desk']})[0] == 400, 'чужая страница — 400')
    check(post('не json')[0] == 400, 'тело не JSON — 400')
    check(post({'p': 'index', 'e': ['open:phone']}, origin='https://evil.example')[0] == 403, 'запрос не с сайта — 403')
    code, _ = post({'p': 'index', 'e': ['open:phone', 'ref:linkedin']}, b64=True)
    check(code == 200 and db.table[(day, 'index', 'ref:linkedin')] == 1, 'тело в base64 (так его иногда передаёт платформа) разбирается')
    db.abort_next_commit = True
    post({'p': 'index', 'e': ['open:phone']})
    check(db.table[(day, 'index', 'open:phone')] == 2, 'транзакция прервана конфликтом — повтор, событие не потеряно')
    r = index.handler({'httpMethod': 'GET', 'headers': {}}, None)
    check(r['statusCode'] == 405, 'GET на публичной функции не отдаёт данные — 405')
    codes = [post({'p': 'index', 'e': ['open:desk']}, ip='9.9.9.9')[0] for _ in range(index.LIMIT + 3)]
    check(codes.count(429) == 3, f'с одного адреса больше {index.LIMIT} пачек в минуту — 429')
    code, body = post({'p': 'proverka-chasti-0', 'e': ['open:desk', 'chk:3:ok', 'chk:14:no', 'quiz:12/14', 'chk:3:maybe']}, ip='6.6.6.6')
    check(code == 200 and body['n'] == 4 and db.table[(day, 'proverka-chasti-0', 'chk:14:no')] == 1, 'страница проверки части: задания и итог принимаются, лишнее отброшено')
    big = {'p': 'index', 'e': [f'sec:s{k}' for k in range(200)]}
    check(post(big, ip='8.8.8.8')[1]['n'] == index.MAX_EVENTS, f'в пачке не больше {index.MAX_EVENTS} событий')

    # отзыв в конце урока
    code, _ = post({'p': '1-5-diffusion-policy', 'fb': {'r': 'mid'}}, ip='7.7.7.1')
    check(code == 200 and db.table[(day, '1-5-diffusion-policy', 'fb:mid')] == 1, 'оценка урока прибавляется к его суммам')
    code, _ = post({'p': '1-5-diffusion-policy', 'fb': {'r': 'mid', 't': '  Не понял шаг 3.\x00\x07 Можно пример?  ' + 'x' * 2000}}, ip='7.7.7.2')
    row = (db.fb or [{}])[0]
    check(code == 200 and row.get('t', '').startswith('Не понял шаг 3. Можно пример?') and len(row['t']) == index.MAX_TEXT and row['r'] == 'mid' and len(row['id']) == 32,
          'текст отзыва сохранён: без служебных символов, не длиннее 1000 знаков, со случайным id')
    check(db.table[(day, '1-5-diffusion-policy', 'fb:mid')] == 1, 'текст не считается второй оценкой')
    check(set(row) == {'day', 'id', 'page', 'r', 't', 'at'}, 'в отзыве нет ничего о читателе: только день, урок, оценка, текст и время')
    check(post({'p': '1-5-diffusion-policy', 'fb': {'r': 'отлично'}}, ip='7.7.7.3')[0] == 400, 'неизвестная оценка — 400')
    check(post({'p': 'index', 'fb': {'r': 'good'}}, ip='7.7.7.4')[0] == 400, 'отзыв о главной не принимается — 400')
    check(post({'p': '1-5-diffusion-policy', 'fb': {'r': 'good', 't': 42}}, ip='7.7.7.5')[0] == 400, 'текст не строкой — 400')

    index.scan_fb = lambda since: [{'day': f['day'], 'page': f['page'], 'r': f['r'], 't': f['t'], 'at': f['at']} for f in db.fb if f['day'] >= since]
    index.scan = lambda since: [{'day': k[0], 'page': k[1], 'ev': k[2], 'n': v} for k, v in sorted(db.table.items()) if k[0] >= since]
    rep = json.loads(index.report({'days': 7}, None)['body'])
    check(rep['today'] == day and any(r['ev'] == 'quiz:6/8' for r in rep['rows']), 'отчёт по вызову из yc отдаёт строки за 7 дней')
    check(len(rep['feedback']) == 1 and rep['feedback'][0]['r'] == 'mid', 'отчёт отдаёт и тексты отзывов')
    rep2 = json.loads(index.report({'httpMethod': 'POST', 'body': '{"days": "abc"}'}, None)['body'])
    check(rep2['rows'] == rep['rows'], 'отчёт по HTTP с плохим числом дней — берёт 7')
    print(f'Все проверки прошли: {ok}')


if __name__ == '__main__':
    main()
