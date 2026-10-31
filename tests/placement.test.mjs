import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importerFichierDiagramme } from '../dist/server/importer.js';
import {
  calculerPlacements, genererConnexions, creerPlacement, verifierPlacement,
  dimensionnerForme, mesurerTexte, REGLES_TEXTE, REGLES_PLACEMENT,
} from '../dist/server/graphe.js';

const forme = (id, extras = {}) => ({ id, type: 'rectangle', dx: 120, dy: 60,
  label: id, metadata: { origine: { id } }, ...extras });
const arc = (debut, fin, i = 0, extras = {}) => ({ id: `${debut}-${fin}-${i}`, debut, fin,
  label: 'oui', metadata: {}, ...extras });
const graphe = (formes, arcs = []) => ({ sommets: Object.fromEntries(formes.map(f => [f.id, f])), arretes: arcs, metadata: {} });
const epsilon = 1e-8;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function valide(g) {
  const r = calculerPlacements(g);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(Object.keys(r.sommets).sort(), Object.keys(g.sommets).sort());
  assert.deepEqual(Object.keys(r.textes).sort(), Object.keys(g.sommets).sort());
  assert.equal(Object.hasOwn(r, 'chemins'), false, 'ce résultat ne prétend pas fournir des chemins');
  assert.deepEqual(verifierPlacement({ sommets: r.sommets, chemins: [] }), []);
  for (const [id, pl] of Object.entries(r.sommets)) {
    assert.equal(pl.forme.id, id);
    assert.ok(Number.isFinite(pl.p.x) && Number.isFinite(pl.p.y));
    assert.ok(Number.isFinite(pl.forme.dx) && pl.forme.dx >= g.sommets[id].dx);
    assert.ok(Number.isFinite(pl.forme.dy) && pl.forme.dy >= g.sommets[id].dy);
    assert.ok(pl.p.x >= REGLES_PLACEMENT.margeExterieure);
    assert.ok(pl.p.y >= REGLES_PLACEMENT.margeExterieure);
    assert.ok(r.cadre.dx - pl.p.x - pl.forme.dx >= REGLES_PLACEMENT.margeExterieure - epsilon);
    assert.ok(r.cadre.dy - pl.p.y - pl.forme.dy >= REGLES_PLACEMENT.margeExterieure - epsilon);
    assert.deepEqual(pl.connexions, genererConnexions(pl.forme, pl.p, g.arretes));
    if (pl.forme.type !== 'rectangle') assert.equal(pl.connexions.length, 4);
  }
  // Boîtes fermées : impose un vrai couloir, pas seulement l'absence de recouvrement.
  const liste = Object.values(r.sommets);
  for (let i = 0; i < liste.length; i++) for (const q of liste.slice(i + 1)) {
    const p = liste[i];
    const dx = Math.max(q.p.x - p.p.x - p.forme.dx, p.p.x - q.p.x - q.forme.dx);
    const dy = Math.max(q.p.y - p.p.y - p.forme.dy, p.p.y - q.p.y - q.forme.dy);
    assert.ok(dx >= REGLES_PLACEMENT.espaceHorizontal - epsilon || dy >= REGLES_PLACEMENT.espaceVertical - epsilon);
  }
  return r;
}
function sous(a, b) {
  assert.ok(b.p.y - a.p.y - a.forme.dy >= REGLES_PLACEMENT.espaceVertical - epsilon);
}
function verifierTexte(pl, texte) {
  const { zoneUtile: z, largeur, hauteur } = texte;
  const { dx, dy, type } = pl.forme;
  assert.ok(z.dx >= largeur + 2 * REGLES_TEXTE.margeInterne - epsilon);
  assert.ok(z.dy >= hauteur + 2 * REGLES_TEXTE.margeInterne - epsilon);
  assert.ok(Math.abs(z.p.x + z.dx / 2 - dx / 2) < epsilon);
  assert.ok(Math.abs(z.p.y + z.dy / 2 - dy / 2) < epsilon);
  for (const x of [z.p.x, z.p.x + z.dx]) for (const y of [z.p.y, z.p.y + z.dy]) {
    const nx = Math.abs((x - dx / 2) / (dx / 2));
    const ny = Math.abs((y - dy / 2) / (dy / 2));
    if (type === 'losange') assert.ok(nx + ny <= 1 + epsilon);
    else if (type === 'ovale') assert.ok(nx * nx + ny * ny <= 1 + epsilon);
    else assert.ok(nx <= 1 && ny <= 1);
  }
  assert.deepEqual(texte.largeurs, texte.lignes.map(mesurerTexte));
  assert.equal(hauteur, texte.lignes.length * REGLES_TEXTE.interligne);
}

test('placements-diagram-reference', async () => {
  const url = new URL('../diagram.json', import.meta.url);
  const avant = await readFile(url, 'utf8');
  const g = await importerFichierDiagramme(url);
  const snapshot = structuredClone(g);
  const r = valide(freeze(g));
  assert.equal(Object.keys(r.sommets).length, 18);
  Object.entries(r.sommets).forEach(([id, pl]) => verifierTexte(pl, r.textes[id]));
  assert.deepEqual(structuredClone(g), snapshot);
  assert.deepEqual(calculerPlacements(g), r);
  assert.equal(await readFile(url, 'utf8'), avant);
});

test('placements-chaine', () => {
  const g = graphe(['a', 'b', 'c'].map(id => forme(id)), [arc('a', 'b'), arc('b', 'c')]);
  const { sommets: s } = valide(g);
  sous(s.a, s.b); sous(s.b, s.c);
  assert.equal(s.a.p.x, s.b.p.x); assert.equal(s.b.p.x, s.c.p.x);
});

test('placements-embranchement-convergence', () => {
  const g = graphe(['a', 'b', 'c', 'd', 'e'].map(id => forme(id)),
    [arc('a', 'b'), arc('a', 'c'), arc('b', 'd'), arc('d', 'e'), arc('c', 'e')]);
  const { sommets: s } = valide(g);
  sous(s.a, s.b); sous(s.a, s.c); sous(s.b, s.d); sous(s.d, s.e); sous(s.c, s.e);
  assert.equal(s.b.p.y, s.c.p.y);
  assert.ok(s.c.p.x - s.b.p.x - s.b.forme.dx >= REGLES_PLACEMENT.espaceHorizontal);
});

test('placements-cycle-et-boucles', () => {
  const g = graphe(['avant', 'a', 'b', 'c', 'apres'].map(id => forme(id)),
    [arc('avant', 'a'), arc('a', 'b'), arc('b', 'c'), arc('c', 'a'), arc('c', 'apres'),
      arc('b', 'b'), arc('a', 'b', 1)]);
  const snapshot = structuredClone(g);
  const { sommets: s } = valide(g);
  for (const id of ['a', 'b', 'c']) { sous(s.avant, s[id]); sous(s[id], s.apres); }
  sous(s.a, s.b); sous(s.b, s.c);
  assert.deepEqual(g, snapshot, 'cycle, boucle et arc parallèle restent dans le graphe');
});

test('placements-sommet-isole', () => {
  const r = valide(graphe([forme('seul', { type: 'ovale' })]));
  assert.deepEqual(r.sommets.seul.p, { x: 48, y: 48 });
  assert.equal(r.sommets.seul.connexions.length, 4);
});

test('placements-composantes-deconnectees', () => {
  const g = graphe(['a', 'b', 'c', 'd', 'e', 'f'].map(id => forme(id)),
    [arc('a', 'b'), arc('c', 'd'), arc('d', 'c'), arc('f', 'f')]);
  const { sommets: s } = valide(g);
  const groupes = [['a', 'b'], ['c', 'd'], ['e'], ['f']];
  for (let i = 1; i < groupes.length; i++) {
    const droite = Math.max(...groupes[i - 1].map(id => s[id].p.x + s[id].forme.dx));
    const gauche = Math.min(...groupes[i].map(id => s[id].p.x));
    assert.ok(gauche - droite >= REGLES_PLACEMENT.espaceComposantes);
  }
});

test('placements-graphe-vide', () => {
  const r = valide(graphe([]));
  assert.deepEqual(r.sommets, {});
  assert.ok(r.cadre.dx > 0 && r.cadre.dy > 0);
});

test('placements-positions-superposees-negatives', () => {
  const g = graphe(['a', 'b', 'c', 'd'].map(id => forme(id, { position: { x: -200, y: -300 } })),
    [arc('a', 'b'), arc('a', 'c'), arc('b', 'd'), arc('c', 'd')]);
  const snapshot = structuredClone(g);
  const { sommets: s } = valide(g);
  assert.deepEqual(s.a.p, { x: 48, y: 48 });
  sous(s.a, s.b); sous(s.a, s.c); sous(s.b, s.d); sous(s.c, s.d);
  assert.deepEqual(g, snapshot);
});

test('placements-indications-compatibles', () => {
  const g = graphe([forme('a', { position: { x: 100, y: 100 } }),
    forme('b', { position: { x: 140, y: 400 } }), forme('c', { position: { x: 900, y: 120 } })], [arc('a', 'b')]);
  const { sommets: s } = valide(g);
  for (const id of Object.keys(s)) assert.deepEqual(s[id].p, g.sommets[id].position);
  const negatif = graphe([forme('a', { position: { x: -100, y: -50 } }),
    forme('b', { position: { x: -100, y: 200 } })], [arc('a', 'b')]);
  const { sommets: n } = valide(negatif);
  assert.equal(n.b.p.y - n.a.p.y, 250, 'une translation conserve les écarts compatibles');
});

test('placements-libelles-longs-multilignes', () => {
  const label = 'Décision très détaillée avec des accents : été, œuvre, à Noël\n\n' + 'Extraordinairement'.repeat(12) + '\n';
  const g = graphe(['rectangle', 'losange', 'ovale'].map(type => forme(type, { type, dx: 20, dy: 10, label })));
  const r = valide(g);
  for (const [id, pl] of Object.entries(r.sommets)) {
    const t = r.textes[id];
    verifierTexte(pl, t);
    assert.ok(pl.forme.dx > 20 && pl.forme.dy > 10);
    assert.ok(t.lignes.length > 5);
    assert.equal(t.lignes.join(''), label.replaceAll('\n', ''), 'aucun caractère du libellé perdu');
    assert.ok(t.lignes.includes(''));
    assert.equal(t.lignes.at(-1), '');
    assert.equal(pl.forme.label, label);
  }
});

test('texte-graphemes-et-coupures', () => {
  const label = 'Été e\u0301 '.repeat(12) + '👩‍💻界'.repeat(20) + '\r\n\tFin';
  const { forme: f, texte: t } = dimensionnerForme(forme('unicode', { dx: 10, dy: 10, label }));
  assert.equal(mesurerTexte('é'), mesurerTexte('e\u0301'));
  assert.equal(mesurerTexte('界'), 2 * REGLES_TEXTE.avance);
  assert.equal(mesurerTexte('👩‍💻'), 2 * REGLES_TEXTE.avance);
  assert.ok(t.lignes.every(l => !l.startsWith('\u0301') && !l.startsWith('\u200d')));
  assert.equal(t.lignes.join(''), label.replace('\r\n', '').replace('\t', '    '));
  verifierTexte({ forme: f }, t);
  const vide = dimensionnerForme(forme('vide', { label: '', dx: 500, dy: 400 }));
  assert.deepEqual(vide.texte.lignes, []);
  assert.equal(vide.forme.dx, 500); assert.equal(vide.forme.dy, 400);
});

test('placements-marges-limites-boites', () => {
  const g = graphe([
    forme('a', { dx: 1000, dy: 800, position: { x: 48, y: 48 } }),
    forme('b', { type: 'losange', position: { x: 1048, y: 48 } }),
    forme('c', { type: 'ovale', position: { x: 48, y: 848 } }),
    forme('d', { position: { x: 1048, y: 848 } }),
  ], [arc('a', 'c'), arc('b', 'd'), arc('a', 'd')]);
  const { sommets: s } = valide(g);
  assert.equal(s.b.p.x, s.a.p.x + s.a.forme.dx + REGLES_PLACEMENT.espaceHorizontal);
  sous(s.a, s.c); sous(s.b, s.d);
});

test('placements-determinisme-et-immuabilite', () => {
  const g = graphe(['c', 'a', 'b'].map(id => forme(id, { label: 'Libellé à composer '.repeat(4),
    position: { x: -40, y: -50 } })), [arc('a', 'b'), arc('a', 'c'), arc('c', 'a')]);
  const snapshot = structuredClone(g);
  const r = valide(freeze(g));
  assert.deepEqual(calculerPlacements(g), r);
  const inverse = { ...g, sommets: Object.fromEntries(Object.entries(g.sommets).reverse()), arretes: [...g.arretes].reverse() };
  assert.deepEqual(calculerPlacements(inverse), r, 'ordre JSON et ordre des arcs sans influence');
  r.sommets.a.forme.metadata.origine.id = 'modifié';
  r.sommets.a.forme.position.x = 999;
  assert.deepEqual(g, snapshot, 'le résultat ne partage pas les métadonnées ni les positions');
});

test('placements-connexions-apres-deplacement-redimensionnement', () => {
  const g = graphe(['rectangle', 'losange', 'ovale'].map(type => forme(type, { type,
    dx: 10, dy: 10, label: 'Texte très long à conserver\nsur plusieurs lignes', position: { x: -10, y: -20 } })),
  [arc('rectangle', 'losange', 0, { sourceAnchor: { side: 'right', ratio: 0.2 } }),
    arc('rectangle', 'ovale', 0, { sourceAnchor: { side: 'right', ratio: 0.8 } }), arc('ovale', 'rectangle')]);
  const r = valide(g);
  for (const [id, pl] of Object.entries(r.sommets)) {
    const ancien = creerPlacement(g.sommets[id], g.sommets[id].position, g.arretes);
    assert.notDeepEqual(pl.p, ancien.p);
    assert.ok(pl.forme.dx > ancien.forme.dx && pl.forme.dy > ancien.forme.dy);
    assert.notDeepEqual(pl.connexions, ancien.connexions);
    assert.deepEqual(pl.connexions, genererConnexions(pl.forme, pl.p, g.arretes));
  }
  const rect = r.sommets.rectangle;
  assert.ok(rect.connexions.some(p => p.x === rect.p.x + rect.forme.dx && p.y === rect.p.y + rect.forme.dy * 0.2));
  assert.ok(rect.connexions.some(p => p.x === rect.p.x + rect.forme.dx && p.y === rect.p.y + rect.forme.dy * 0.8));
});

test('placements-diagnostics-entrees-invalides', () => {
  const cas = [
    [g => { g.sommets.a.dx = 0; }, 'DIMENSION_INVALIDE', 'dx'],
    [g => { g.sommets.a.dy = Infinity; }, 'NOMBRE_NON_FINI', 'dy'],
    [g => { g.sommets.a.position = { x: NaN, y: 0 }; }, 'NOMBRE_NON_FINI', 'x'],
    [g => { g.sommets.a.type = 'triangle'; }, 'FORME_INVALIDE', 'sommets'],
    [g => { g.sommets.a.id = 'autre'; }, 'SOMMET_INVALIDE', 'sommets'],
    [g => { g.sommets.a.label = 42; }, 'SOMMET_INVALIDE', 'sommets'],
    [g => { g.arretes[0].fin = '__proto__'; }, 'REFERENCE_ABSENTE', 'fin'],
    [g => { g.arretes[0].sourceAnchor = { side: 'right', ratio: 2 }; }, 'ANCRE_INVALIDE', 'sourceAnchor'],
    [g => { g.sommets.a.position = { x: 1.7e308, y: 0 }; g.sommets.a.dx = 1.7e308; }, 'NOMBRE_NON_FINI', 'xMax'],
    [g => { g.sommets.a.position = { x: -1.7e308, y: 0 }; g.sommets.b.position = { x: 1.7e308, y: 0 }; }, 'NOMBRE_NON_FINI', 'x'],
    [g => { g.sommets.a.position = { x: 1e20, y: 0 }; }, 'PRECISION_INSUFFISANTE', 'margeDroite'],
  ];
  for (const [modifier, code, fragment] of cas) {
    const g = graphe([forme('a'), forme('b')], [arc('a', 'b')]);
    modifier(g);
    const snapshot = structuredClone(g);
    const r = calculerPlacements(freeze(g));
    assert.equal(r.ok, false);
    assert.equal(r.diagnostic.code, code);
    assert.ok(r.diagnostic.chemin.includes(fragment));
    assert.ok(r.diagnostic.message.includes(code));
    assert.equal(Object.hasOwn(r, 'sommets'), false, 'pas de placements partiels après échec');
    assert.deepEqual(g, snapshot);
  }
});

test('placements-identifiants-speciaux', () => {
  const ids = ['__proto__', 'constructor', 'toString', '10', '2'];
  const g = graphe(ids.map(id => forme(id)), ids.slice(1).map((id, i) => arc(ids[i], id)));
  const r = valide(g);
  ids.forEach(id => assert.ok(Object.hasOwn(r.sommets, id) && Object.hasOwn(r.textes, id)));
});

test('placements-graphes-generes-reproductibles', () => {
  let seed = 5281;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let scenario = 0; scenario < 30; scenario++) {
    const n = 3 + random(30);
    const formes = Array.from({ length: n }, (_, i) => forme(`n${i}`, {
      type: ['rectangle', 'losange', 'ovale'][random(3)], dx: 10 + random(400), dy: 10 + random(200),
      position: { x: random(500) - 250, y: random(500) - 250 }, label: 'État composé\n'.repeat(random(5)),
    }));
    const arcs = Array.from({ length: n * 2 }, (_, i) => arc(`n${random(n)}`, `n${random(n)}`, i));
    const g = graphe(formes, arcs);
    const r = valide(g);
    assert.deepEqual(calculerPlacements(g), r);
    for (const [id, pl] of Object.entries(r.sommets)) verifierTexte(pl, r.textes[id]);
  }
});

test('placements-ports-libres-32px-texte-centre-et-ancres-fixes', () => {
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const g = graphe([forme('a', { label: 'Été\nAction' }), forme('b')],
      Array.from({ length: 5 }, (_, i) => arc('a', 'b', i, { sourceHandle: side, targetHandle: side })));
    const snapshot = structuredClone(g);
    const r = valide(freeze(g));
    const pl = r.sommets.a;
    const horizontal = side === 'top' || side === 'bottom';
    const ports = pl.connexions.filter(p => horizontal
      ? p.y === pl.p.y + (side === 'bottom' ? pl.forme.dy : 0)
      : p.x === pl.p.x + (side === 'right' ? pl.forme.dx : 0));
    const positions = ports.map(p => horizontal ? p.x : p.y).sort((a, b) => a - b);
    assert.equal(positions.length, 5);
    for (let i = 1; i < positions.length; i++) assert.ok(positions[i] - positions[i - 1] >= 32 - epsilon);
    verifierTexte(pl, r.textes.a);
    assert.deepEqual(r.textes.a.lignes, dimensionnerForme(g.sommets.a).texte.lignes,
      'la réservation des ports ne recompose pas les lignes');
    assert.deepEqual(structuredClone(g), snapshot);
    const fixe = structuredClone(g);
    fixe.arretes.forEach((a, i) => { a.sourceAnchor = { side, ratio: .48 + i * .01 }; });
    const rf = valide(fixe); const pf = rf.sommets.a;
    assert.equal(horizontal ? pf.forme.dx : pf.forme.dy,
      horizontal ? dimensionnerForme(fixe.sommets.a).forme.dx : dimensionnerForme(fixe.sommets.a).forme.dy,
      'les ratios imposés peuvent rester rapprochés sans gonfler la forme');
    verifierTexte(pf, rf.textes.a);
  }
});

test('placements-presentation-large-centres-alignes-et-connexions-regenerees', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `n${String(i).padStart(2, '0')}`);
  const g = graphe(ids.map((id, i) => forme(id, {
    type: ['rectangle', 'losange', 'ovale'][i % 3], dx: 100 + i % 4 * 20, dy: 60 + i % 3 * 20,
    position: { x: 0, y: i * 120 },
  })), ids.slice(1).map((id, i) => arc(ids[i], id, i)));
  const snapshot = structuredClone(g);
  const r = calculerPlacements(freeze(g), true);
  assert.equal(r.ok, true);
  assert.deepEqual(verifierPlacement({ sommets: r.sommets, chemins: [] }), []);
  const centresX = new Set(); const centresY = new Set();
  const liste = Object.values(r.sommets);
  for (const pl of liste) {
    centresX.add(pl.p.x + pl.forme.dx / 2); centresY.add(pl.p.y + pl.forme.dy / 2);
    assert.deepEqual(pl.connexions, genererConnexions(pl.forme, pl.p, g.arretes));
    verifierTexte(pl, r.textes[pl.forme.id]);
  }
  assert.ok(centresX.size >= 3 && centresX.size <= 6);
  assert.ok(centresY.size <= 4, 'les hauteurs différentes partagent les mêmes centres de rang');
  assert.equal(centresX.size * centresY.size, liste.length, 'grille pleine sans décalages en escalier');
  assert.ok(r.cadre.dx / r.cadre.dy >= 1.6 && r.cadre.dx / r.cadre.dy <= 2.5);
  for (const [i, a] of liste.entries()) for (const b of liste.slice(i + 1)) {
    const dx = Math.max(a.p.x - b.p.x - b.forme.dx, b.p.x - a.p.x - a.forme.dx);
    const dy = Math.max(a.p.y - b.p.y - b.forme.dy, b.p.y - a.p.y - a.forme.dy);
    assert.ok(dx >= 112 - epsilon || dy >= 56 - epsilon, 'couloirs préservés entre les formes');
  }
  assert.deepEqual(calculerPlacements(g, true), r);
  const inverse = { ...g, sommets: Object.fromEntries(Object.entries(g.sommets).reverse()), arretes: [...g.arretes].reverse() };
  assert.deepEqual(calculerPlacements(inverse, true), r);
  assert.deepEqual(structuredClone(g), snapshot);
});
