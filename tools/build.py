"""Build the planner: inject the layout data and unit catalogue into the source page.
Usage: python3 tools/build.py OUTDIR
Writes OUTDIR/index.html (standalone page, also used for GitHub Pages)
and OUTDIR/tabletop-base-planner.page.html (body only, for hosting inside Claude)."""
import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); out = sys.argv[1]
src = open(os.path.join(root, 'src/app.src.html'), encoding='utf-8').read()
def inject(s, start, end, path):
    data = json.dumps(json.load(open(os.path.join(root, path))), separators=(',', ':'), ensure_ascii=False)
    a, b = s.index(start), s.index(end) + len(end); return s[:a] + data + s[b:]
page = inject(src, '/*MAPS*/', '/*END*/', 'data/layouts-40kdc.json')
page = inject(page, '/*UNITS*/', '/*ENDUNITS*/', 'data/units-40kdc.json')
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'tabletop-base-planner.page.html'), 'w', encoding='utf-8').write(page)
head, body = page.split('</style>', 1)
full = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Plan Warhammer 40,000 deployments with true-size bases on the 11th-edition terrain layouts.">\n'
        + head + '</style>\n</head>\n<body>' + body + '\n</body>\n</html>\n')
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(full)
print('built', len(full), 'bytes')
