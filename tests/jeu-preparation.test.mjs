// Recettes de préparation conservées, désormais découvertes par npm test.
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('preparation-scene-deux-chargements-identiques', () => {
  execFileSync('python3', ['-c', String.raw`import json
from pathlib import Path
p=Path('docs/jeu/scene-reference.json')
a=json.loads(p.read_text()); b=json.loads(p.read_text())
assert a==b and a is not b
expected=[
('joueur-01','joueur',0,0,'actif'),('decor-01','decor',-180,-80,'actif'),
('caisse-01','objet-destructible',120,60,'actif'),('caisse-detruite','objet-destructible',180,100,'detruit'),
('tir-ennemi-01','projectile',148,60,'actif'),('tir-joueur-01','projectile',40,-20,'actif'),
('boss-est','boss',1000,0,'actif'),('boss-ouest','boss',-900,100,'actif'),
('mere-nord','vaisseau-mere',0,-1200,'actif'),('mere-lointaine','vaisseau-mere',1800,1000,'actif'),
('decor-bord','decor',2380,0,'actif'),('caisse-bord','objet-destructible',0,2380,'actif'),
('tir-inactif','projectile',90,0,'inactif')]
snapshot=lambda s:[(e['id'],e['category'],e['position']['x'],e['position']['y'],e['state']) for e in s['entities']]
assert snapshot(a)==snapshot(b)==expected
assert len({e['id'] for e in a['entities']})==13
assert a['playerId']=='joueur-01' and a['planet']=={'center':{'x':0,'y':0},'radius':2400}
print('PASS : deux chargements, 13 entites, positions, categories et etats connus')
`], { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
});

test('preparation-proprietes-independantes-des-sprites', () => {
  execFileSync('python3', ['-c', String.raw`import json,math
from pathlib import Path
entities=json.loads(Path('docs/jeu/scene-reference.json').read_text())['entities']
by_id={e['id']:e for e in entities}
for e in entities:
 assert set(e)=={'id','category','position','dimensions','state','destructible','projectileOrigin'}
 assert e['category'] in {'joueur','decor','objet-destructible','projectile','boss','vaisseau-mere'}
 assert e['state'] in {'actif','inactif','detruit'} and type(e['destructible']) is bool
 assert all(type(n) in (int,float) and math.isfinite(n) for n in e['position'].values())
 assert set(e['position'])=={'x','y'} and set(e['dimensions'])=={'width','height'}
 assert all(type(n) in (int,float) and math.isfinite(n) and n>0 for n in e['dimensions'].values())
 o=e['projectileOrigin']
 if e['category']=='projectile':
  assert set(o)=={'faction','emitterId'} and o['faction'] in {'ennemi','joueur','neutre'} and o['emitterId']
 else: assert o is None
crate,decor,shot=(by_id[k] for k in ['caisse-01','decor-01','tir-ennemi-01'])
assert crate['destructible'] and crate['projectileOrigin'] is None
assert not decor['destructible'] and decor['category']=='decor'
assert not shot['destructible'] and shot['category']=='projectile'
assert shot['projectileOrigin']=={'faction':'ennemi','emitterId':'boss-ouest'}
assert by_id['tir-joueur-01']['projectileOrigin']['faction']=='joueur'
assert {e['category'] for e in entities}=={'joueur','decor','objet-destructible','projectile','boss','vaisseau-mere'}
print('PASS : contrat valide, destructibilite et origine explicites, aucune apparence requise')
`], { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
});

test('preparation-conversions-monde-ecran-oracles', () => {
  execFileSync('python3', ['-c', String.raw`import json,math
from pathlib import Path
cases=json.loads(Path('docs/jeu/conversions-reference.json').read_text())
assert {c['id'] for c in cases}=={'centre','negatifs','caisse','hors-champ','camera-deplacee','zoom-double','viewport-decale','petite-fenetre','bord-planete'}
for c in cases:
 cam,v,w,s=(c[k] for k in ['camera','viewport','world','screen'])
 assert cam['zoom']>0 and v['width']>0 and v['height']>0
 for axis,size in [('x','width'),('y','height')]:
  projected=v[axis]+v[size]/2+(w[axis]-cam[axis])*cam['zoom']
  inverse=cam[axis]+(s[axis]-v[axis]-v[size]/2)/cam['zoom']
  assert math.isclose(projected,s[axis],abs_tol=1e-9),(c['id'],axis,projected)
  assert math.isclose(inverse,w[axis],abs_tol=1e-9),(c['id'],axis,inverse)
  for dpr in (1,2):
   assert math.isclose(projected*dpr/dpr,s[axis],abs_tol=1e-9)
print('PASS : 9 oracles, projection/inverse, axes, zoom et viewport CSS')
`], { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
});

test('preparation-scenarios-visibilite-distances-et-planete', () => {
  execFileSync('python3', ['-c', String.raw`import json,copy,math
from pathlib import Path
root=Path('docs/jeu')
data=json.loads((root/'scenarios.json').read_text())
base=json.loads((root/data['reference']).read_text())
pristine=copy.deepcopy(base)
assert len(data['scenarios'])==12 and len({s['id'] for s in data['scenarios']})==12
assert data['windows']=={'large':{'width':1280,'height':720,'hudWidth':240},'etroite':{'width':360,'height':800,'hudWidth':72},'grande':{'width':1920,'height':1080,'hudWidth':240}}
for s in data['scenarios']:
 entities=copy.deepcopy(base['entities']); known={e['id'] for e in entities}
 assert set(s['overrides'])<=known
 if s['include']!='all':
  assert set(s['include'])<=known
  entities=[e for e in entities if e['id'] in s['include']]
 for e in entities: e.update(copy.deepcopy(s['overrides'].get(e['id'],{})))
 win=data['windows'][s['window']]; cam=s['camera']
 width=win['width']-win['hudWidth']; height=win['height']
 assert width>0 and height>0 and cam['zoom']>0
 def visible(e):
  x=width/2+(e['position']['x']-cam['x'])*cam['zoom']
  y=height/2+(e['position']['y']-cam['y'])*cam['zoom']
  w=e['dimensions']['width']*cam['zoom']; h=e['dimensions']['height']*cam['zoom']
  return e['state']=='actif' and x+w/2>0 and x-w/2<width and y+h/2>0 and y-h/2<height
 player=next(e for e in entities if e['id']==base['playerId'])
 candidates=[e for e in entities if e['category'] in ('boss','vaisseau-mere') and e['state']=='actif']
 shown=sorted(e['id'] for e in candidates if visible(e))
 distance=lambda e:math.hypot(e['position']['x']-player['position']['x'],e['position']['y']-player['position']['y'])
 target=None if shown or not candidates else min(candidates,key=lambda e:(distance(e),e['id']))['id']
 assert shown==s['expected']['visibleMajorIds'],(s['id'],shown)
 assert target==s['expected']['arrowTargetId'],(s['id'],target)
 for point in s['expected'].get('planetPoints',[]):
  p=point['position']; center=base['planet']['center']
  assert ((p['x']-center['x'])**2+(p['y']-center['y'])**2<=base['planet']['radius']**2)==point['inside']
 if s['id']=='catalogue':
  assert {e['category'] for e in entities if visible(e)}=={'joueur','decor','objet-destructible','projectile','boss','vaisseau-mere'}
 if s['id']=='amas-dense':
  near=[e for e in entities if visible(e) and 120<=e['position']['x']<=160 and 45<=e['position']['y']<=80]
  assert sum(e['category']=='objet-destructible' for e in near)==2
  assert sum(e['category']=='projectile' for e in near)==3
 assert base==pristine
print('PASS : 12 scenarios, 3 fenetres, amas, cibles, tangence, distances et disque')
`], { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
});

