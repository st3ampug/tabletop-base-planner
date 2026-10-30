"""Port of 40kdc-data's terrain resolver (tools/src/terrain/resolve.ts) + helpers."""
import json, math
def fp_verts(fp):
    t = fp['type']
    if t == 'rectangle': return [(0,0),(fp['width'],0),(fp['width'],fp['height']),(0,fp['height'])]
    if t == 'right-triangle': return [(0,0),(fp['width'],0),(0,fp['height'])]
    return [(p['x'],p['y']) for p in fp['points']]
def centroid(v):
    a2=cx=cy=0.0; n=len(v)
    for i in range(n):
        ax,ay=v[i]; bx,by=v[(i+1)%n]; cr=ax*by-bx*ay; a2+=cr; cx+=(ax+bx)*cr; cy+=(ay+by)*cr
    if a2==0: return (sum(p[0] for p in v)/n, sum(p[1] for p in v)/n)
    return (cx/(3*a2), cy/(3*a2))
def orient(p, rot, mirror='none'):
    x,y=p
    if mirror=='horizontal': x=-x
    elif mirror=='vertical': y=-y
    r=math.radians(rot); c,s=math.cos(r),math.sin(r)
    return (c*x-s*y, s*x+c*y)
def place(pts, c, pos, rot, mirror='none'):
    out=[]
    for p in pts:
        o=orient((p[0]-c[0],p[1]-c[1]),rot,mirror); out.append((o[0]+pos[0],o[1]+pos[1]))
    return out
def load(repo):
    L=json.load(open(repo+'/data/core/terrain-layouts.json')); T={t['id']:t for t in json.load(open(repo+'/data/core/terrain-templates.json'))}
    D={d['id']:d for d in json.load(open(repo+'/data/core/deployment-patterns.json'))}
    return L,T,D
def area_local(tpl, T):
    """Area template -> centroid-local footprint + parts (features and walls) in the same frame."""
    v=fp_verts(tpl['footprint']); c=centroid(v)
    fp=[(x-c[0],y-c[1]) for x,y in v]; parts=[]
    def walls_of(t, pos, rot, mir):
        cc=centroid(fp_verts(t['footprint']))
        return [dict(pts=place([(p['x'],p['y']) for p in w['points']], cc, pos, rot, mir), th=w.get('thickness',0.5)) for w in (t.get('walls') or [])]
    own=[dict(pts=[(p['x']-c[0],p['y']-c[1]) for p in w['points']], th=w.get('thickness',0.5)) for w in (tpl.get('walls') or [])]
    for f in tpl.get('features') or []:
        ft=T[f['template']]; fv=fp_verts(ft['footprint']); pos=(f['position']['x'],f['position']['y']); rot=f.get('rotation_degrees',0); mir=f.get('mirror','none')
        parts.append(dict(name=ft.get('name',''), cat=ft.get('terrain_category'), roof=bool(ft.get('has_roof')), poly=place(fv, centroid(fv), pos, rot, mir), walls=walls_of(ft,pos,rot,mir)))
    return fp, parts, own
