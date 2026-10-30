"""Build the planner: bundle the script modules and inject the layout data and unit catalogue into the source page.
Usage: python3 tools/build.py OUTDIR
Writes OUTDIR/index.html (standalone page, also used for GitHub Pages)
and OUTDIR/tabletop-base-planner.page.html (body only, for hosting inside Claude).

The modules in src/ use ES import/export to declare what they share. The page must stay one self-contained
file, so the build strips the import and export statements and concatenates the modules, in MODULES order,
into the single script scope of src/app.src.html. Function declarations are hoisted, so only code that runs
while the script loads depends on that order; keep it when adding a module."""
import glob, json, os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); out = sys.argv[1]
MODULES = ['core.js', 'maps.js', 'state.js', 'geometry.js', 'sight.js', 'render.js', 'ui/pointer.js', 'ui/actions.js', 'ui/panel.js',
           'armies.js', 'import.js', 'ui/watch.js', 'ui/saveload.js', 'ui/boards.js', 'ui/keyboard.js', 'ui/help.js', 'main.js']
IMPORT = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*\n", re.M)
EXPORT = re.compile(r"^export\s*\{([^}]*)\};[ \t]*\n", re.M)
names = lambda s: [n.strip() for n in s.split(',') if n.strip()]

def bundle():
    srcdir = os.path.join(root, 'src')
    found = sorted(os.path.relpath(p, srcdir).replace(os.sep, '/') for p in glob.glob(os.path.join(srcdir, '**', '*.js'), recursive=True))
    if found != sorted(MODULES): sys.exit('build.py: MODULES and src/**/*.js differ: %s' % sorted(set(found) ^ set(MODULES)))
    code = {m: open(os.path.join(srcdir, m), encoding='utf-8').read() for m in MODULES}
    exports = {m: [n for e in EXPORT.findall(code[m]) for n in names(e)] for m in MODULES}
    errs = []
    for m in MODULES:
        for n in exports[m]:
            if not re.search(r'(?:\bfunction\s+|\b(?:const|let)\s+|,\s*)' + re.escape(n) + r'\s*[=(]', code[m]):
                errs.append('%s exports %s but does not declare it' % (m, n))
        for imported, path in IMPORT.findall(code[m]):
            dep = os.path.normpath(os.path.join(os.path.dirname(m), path)).replace(os.sep, '/')
            if dep not in exports: errs.append('%s imports from %s, which is not a module' % (m, path)); continue
            errs += ['%s imports %s, which %s does not export' % (m, n, dep) for n in names(imported) if n not in exports[dep]]
    parts = []
    for m in MODULES:
        body = EXPORT.sub('', IMPORT.sub('', code[m])).strip('\n')
        if re.search(r'^\s*(import|export)\b', body, re.M): errs.append('%s: write imports and exports as "import { a } from \'./x.js\';" and "export { a };"' % m)
        parts.append('// src/' + m + '\n' + body)
    if errs: sys.exit('build.py:\n  ' + '\n  '.join(errs))
    return '\n\n'.join(parts)

src = open(os.path.join(root, 'src/app.src.html'), encoding='utf-8').read()
def inject(s, start, end, text):
    a, b = s.index(start), s.index(end) + len(end); return s[:a] + text + s[b:]
def data(path): return json.dumps(json.load(open(os.path.join(root, path), encoding='utf-8')), separators=(',', ':'), ensure_ascii=False)
page = src.replace('/*MODULES*/', bundle())
page = inject(page, '/*MAPS*/', '/*END*/', data('data/layouts-40kdc.json'))
page = inject(page, '/*UNITS*/', '/*ENDUNITS*/', data('data/units-40kdc.json'))
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'tabletop-base-planner.page.html'), 'w', encoding='utf-8').write(page)
head, body = page.split('</style>', 1)
full = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Plan Warhammer 40,000 deployments with true-size bases on the 11th-edition terrain layouts.">\n'
        + head + '</style>\n</head>\n<body>' + body + '\n</body>\n</html>\n')
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(full)
print('built', len(full), 'bytes')
