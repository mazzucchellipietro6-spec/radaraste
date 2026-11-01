# Aiuto per scrivere le traduzioni a mano: unisce un dizionario annidato nel file della lingua.
import json, os, sys
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'i18n', 'locales')
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict): merge(a[k], v)
        else: a[k] = v
    return a
def save(lang, data, kind='ui'):
    path = os.path.join(ROOT, kind, f'{lang}.json')
    cur = json.load(open(path)) if os.path.exists(path) else {}
    merge(cur, data)
    with open(path, 'w') as f: json.dump(cur, f, ensure_ascii=False, indent=1); f.write('\n')
    return path
