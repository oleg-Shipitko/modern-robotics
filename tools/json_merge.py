#!/usr/bin/env python3
"""Добавить записи в общий JSON-словарь под блокировкой — для агентов, которые переводят уроки параллельно.

    python3 tools/json_merge.py lessons/shared/glossary.en.json new.json   # список записей {id, t, d, a}
    python3 tools/json_merge.py lessons/shared/i18n.en.json new.json       # словарь «русская строка → перевод»

Файл читается и пишется под эксклюзивной блокировкой, поэтому одновременные вызовы не затирают
записи друг друга. Новые записи добавляются в конец; запись с уже существующим id (или ключом)
не меняется, если не указан --replace, — о расхождении скрипт пишет. Формат как у словарей курса:
отступ 1, кириллица без экранирования, перевод строки в конце.
"""
import fcntl
import json
import os
import sys


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    replace = '--replace' in sys.argv
    if len(args) != 2:
        sys.exit(__doc__)
    target, src = args
    new = json.load(open(src, encoding='utf-8'))
    with open(target + '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cur = json.load(open(target, encoding='utf-8'))
        added, same, diff = 0, 0, []
        if isinstance(cur, list):
            if isinstance(new, dict):
                new = [new]
            pos = {e['id']: i for i, e in enumerate(cur)}
            for e in new:
                i = pos.get(e['id'])
                if i is None:
                    pos[e['id']] = len(cur); cur.append(e); added += 1
                elif cur[i] == e:
                    same += 1
                else:
                    diff.append(e['id'])
                    if replace:
                        cur[i] = e
        else:
            for k, v in new.items():
                if k not in cur:
                    cur[k] = v; added += 1
                elif cur[k] == v:
                    same += 1
                else:
                    diff.append(k)
                    if replace:
                        cur[k] = v
        tmp = target + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(json.dumps(cur, indent=1, ensure_ascii=False) + '\n')
        os.replace(tmp, target)
    print(f'{target}: добавлено {added}, уже были {same}, расходятся {len(diff)}'
          + (' (заменены)' if diff and replace else '') + (': ' + ', '.join(diff[:20]) if diff else ''))


if __name__ == '__main__':
    main()
