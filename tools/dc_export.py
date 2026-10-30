"""Export 40kdc-data Battlemaster layouts to the planner's compact format (GW-app portrait orientation: attacker/red at top)."""
import sys, json, math, re, collections
sys.path.insert(0, sys.argv[1]); import dc
repo, out = sys.argv[2], sys.argv[3]
L,T,D = dc.load(repo)
DISP = {d['id']: d['name'] for d in json.load(open(repo+'/data/core/force-dispositions.json'))}
MM = {m['id']: m for m in json.load(open(repo+'/data/core/mission-matchups.json'))}
r3 = lambda v: round(v, 3)

# one confirmed source defect: generator sits 4.5" outside its area (checked against the GW app screenshot of Purge vs Recon 01)
FIX = {'bm-composite-smallrect-generator-updown-flip-3db57df624': {'feature-1': {'x': -0.069281}}}
fixed = []
for tid, fx in FIX.items():
    for f in T[tid]['features']:
        if f.get('id') in fx:
            assert abs(f['position']['x'] + 4.566281) < 1e-6, 'source changed; re-check the fix'
            f['position'].update(fx[f['id']]); fixed.append(tid)

def dp(pts, eps):
    def rec(a, b):
        ax,ay = pts[a]; bx,by = pts[b]; dx,dy = bx-ax, by-ay; l = math.hypot(dx,dy) or 1e-9
        k, m = -1, 0
        for i in range(a+1, b):
            d = abs((pts[i][0]-ax)*dy - (pts[i][1]-ay)*dx)/l
            if d > m: k, m = i, d
        return rec(a,k)[:-1] + rec(k,b) if m > eps else [a, b]
    return [pts[i] for i in rec(0, len(pts)-1)]
def simplify_closed(poly, eps=0.04):
    n = len(poly)
    if n <= 6: return poly
    c = dc.centroid(poly); i0 = max(range(n), key=lambda i: (poly[i][0]-c[0])**2 + (poly[i][1]-c[1])**2)
    ring = poly[i0:] + poly[:i0] + [poly[i0]]
    far = max(range(len(ring)), key=lambda i: (ring[i][0]-ring[0][0])**2 + (ring[i][1]-ring[0][1])**2)
    return dp(ring[:far+1], eps)[:-1] + dp(ring[far:], eps)[:-1]
def buffer_polyline(pts, th):
    h = th/2; n = len(pts); left = []; right = []
    def nrm(a, b):
        dx,dy = b[0]-a[0], b[1]-a[1]; l = math.hypot(dx,dy); return (-dy/l, dx/l)
    pts = [p for i,p in enumerate(pts) if i == 0 or math.hypot(p[0]-pts[i-1][0], p[1]-pts[i-1][1]) > 1e-6]; n = len(pts)
    for i in range(n):
        if i == 0: m = nrm(pts[0], pts[1]); k = 1
        elif i == n-1: m = nrm(pts[-2], pts[-1]); k = 1
        else:
            a = nrm(pts[i-1], pts[i]); b = nrm(pts[i], pts[i+1]); mx,my = a[0]+b[0], a[1]+b[1]; l = math.hypot(mx,my)
            if l < 1e-6: m = a; k = 1
            else: m = (mx/l, my/l); k = min(1/max(m[0]*a[0]+m[1]*a[1], 1e-6), 3)
        left.append((pts[i][0]+m[0]*h*k, pts[i][1]+m[1]*h*k)); right.append((pts[i][0]-m[0]*h*k, pts[i][1]-m[1]*h*k))
    return left + right[::-1]
def area_name(n):
    n = n.replace('Battlemaster ', '')
    for k,v in (('BigRect','Large ruin area'),('SmallRect','Small area'),('Triangle','Angled ruin area'),('ShortLine','Short strip'),('LongLine','Long strip')):
        if n.startswith(k): return v
    return n
def part_name(n):
    n = n.replace('Battlemaster ', '')
    if n in ('AB','CD','EF','GH','CO'): return 'Ruin walls ' + n
    if n.startswith('Small L') or n == 'Corner': return 'Corner wall'
    if 'Barrier' in n: return 'Barrier'
    return {'Pipes':'Pipes','Generator':'Generator','Tower':'Tower','Ruin Part':'Ruin part'}.get(n, n)

P = lambda x, y: (y, 60 - x)            # board (60x44 landscape) -> portrait with the attacker at the top
ROT = -90
bm = [l for l in L if l['source'] == 'battlemaster-11e']
used = sorted({p['template'] for l in bm for p in l['pieces']}); key = {t: i for i, t in enumerate(used)}
tpl = []
for tid in used:
    t = T[tid]; fp, parts, own = dc.area_local(t, T); assert not own
    ps = []
    for p in parts:
        assert len(p['walls']) <= 1
        solid = buffer_polyline(p['walls'][0]['pts'], p['walls'][0]['th']) if p['walls'] else p['poly']
        d = {'n': part_name(p['name']), 'p': [[r3(x), r3(y)] for x,y in solid]}
        if p['walls']: d['d'] = [[r3(x), r3(y)] for x,y in p['poly']]
        ps.append(d)
    tpl.append({'n': area_name(t['name']), 'f': [[r3(x), r3(y)] for x,y in simplify_closed(fp)], 'parts': ps})
order = ['take-and-hold','disruption','purge-the-foe','priority-assets','reconnaissance']
layouts = []
for l in sorted(bm, key=lambda l: (order.index(MM[l['mission_matchup_id']]['disposition']), order.index(MM[l['mission_matchup_id']]['opponent_disposition']), l['variant'])):
    m = MM[l['mission_matchup_id']]; pcs = []
    for p in l['pieces']:
        assert p['piece_type'] == 'area' and not p.get('mirror') and not p.get('parent_area_id')
        x, y = P(p['position']['x'], p['position']['y']); e = [key[p['template']], r3(x), r3(y), (p.get('rotation_degrees', 0) + ROT) % 360]
        if p.get('objective_role'):
            ox, oy = P(p['objective']['position']['x'], p['objective']['position']['y']); e += [p['objective_role'][0], r3(ox), r3(oy)]
        pcs.append(e)
    layouts.append({'id': l['id'], 'a': m['disposition'], 'b': m['opponent_disposition'], 'v': l['variant'], 'd': l['deployment_pattern_id'], 'p': pcs})
deploy = {}
for did in sorted({l['d'] for l in layouts}):
    zs = []
    for z in D[did]['zones']:
        sh = z['shape']; pts = dc.fp_verts(sh); px, py = z['position']['x'], z['position']['y']
        poly = [P(x+px, y+py) for x,y in pts]
        zs.append({'owner': 'blue' if z['player'] == 'defender' else 'red', 'poly': [[r3(x), r3(y)] for x,y in poly]})
    deploy[did] = {'n': D[did]['name'], 'z': zs}
data = {'src': 'wn-mitch/40kdc-data@709ecd9', 'disp': {k: DISP[k] for k in order}, 'tpl': tpl, 'deploy': deploy, 'layouts': layouts}
s = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
open(out + '/dc-data.json', 'w', encoding='utf-8').write(s)
print('bytes', len(s), 'templates', len(tpl), 'layouts', len(layouts), 'fixed', fixed)
print('fp vertex counts', collections.Counter(len(t['f']) for t in tpl))
print([ (l['id'], l['d']) for l in layouts][:6])
