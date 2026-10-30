"""Export unit names, model counts and base sizes from 40kdc-data into the planner's catalogue.
Usage: python3 tools/units_export.py <path to 40kdc-data> data/units-40kdc.json"""
import json, glob, os, sys
repo, out = sys.argv[1], sys.argv[2]
def arr(x): return x if isinstance(x, list) else next(v for v in x.values() if isinstance(v, list))
def code(b):
    b = b or {}; s = b.get('shape')
    if s == 'round' and b.get('diameter'): return 'r%g' % b['diameter']
    if s in ('oval', 'flying-base') and b.get('width') and b.get('length'):
        w, l = sorted((b['width'], b['length']), reverse=True); return 'o%gx%g' % (w, l)
    if s == 'hull': return 'h'
    return ''
facs, units = [], []
for f in sorted(glob.glob(os.path.join(repo, 'data/core/*/units.json'))):
    fid = f.split(os.sep)[-2]; fi = len(facs); facs.append(fid)
    comp = {}
    cf = os.path.join(os.path.dirname(f), 'unit-compositions.json')
    if os.path.exists(cf):
        for c in arr(json.load(open(cf))): comp[c['unit_id']] = c['models']
    for u in arr(json.load(open(f))):
        if u.get('is_legend'): continue
        mc = u.get('model_count') or {}
        e = [u['name'], fi, code(u.get('base_size_mm')), mc.get('min') or 1, mc.get('max') or mc.get('min') or 1]
        ms = comp.get(u['id']) or []
        if len(ms) > 1 or (ms and ms[0]['name'] != u['name']):
            e.append([[m['name'], m.get('min', 0), m.get('max', 0), code(m.get('base_size_mm'))] for m in ms])
        units.append(e)
s = json.dumps({'src': 'wn-mitch/40kdc-data', 'factions': facs, 'units': units}, separators=(',', ':'), ensure_ascii=False)
open(out, 'w', encoding='utf-8').write(s)
print(len(units), 'units,', len(s), 'bytes')
