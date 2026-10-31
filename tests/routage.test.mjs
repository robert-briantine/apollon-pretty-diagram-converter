import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importerFichierDiagramme } from '../dist/server/importer.js';
import {
  computeSpatialGraphe, calculerPlacements, calculerDestination, ErreurRoutage, REGLES_ROUTAGE,
  verifierChemin, verifierPlacement, verifierPlacementChemin, segmentIntersecteRectangle,
} from '../dist/server/graphe.js';

const forme = (id, extras = {}) => ({ id, type: 'rectangle', dx: 120, dy: 60, label: id,
  metadata: { origine: { id } }, ...extras });
const arc = (id, debut, fin, extras = {}) => ({ id, debut, fin, label: `Libellé ${id}\nété`, metadata: {}, ...extras });
const graphe = (formes, arretes = []) => ({ sommets: Object.fromEntries(formes.map(f => [f.id, f])), arretes, metadata: {} });
const epsilon = 1e-7;
function points(r, c) {
  const resultat = [r.sommets[c.debut].connexions[c.idx]];
  for (const pas of c.listeDePas) resultat.push(calculerDestination(resultat.at(-1), [pas]));
  return resultat;
}
function degagement(pl, p, q) {
  const d = REGLES_ROUTAGE.degagement - epsilon;
  assert.ok(
    (Math.abs(p.y - pl.p.y) < epsilon && Math.abs(q.x - p.x) < epsilon && p.y - q.y >= d) ||
    (Math.abs(p.x - pl.p.x - pl.forme.dx) < epsilon && Math.abs(q.y - p.y) < epsilon && q.x - p.x >= d) ||
    (Math.abs(p.y - pl.p.y - pl.forme.dy) < epsilon && Math.abs(q.x - p.x) < epsilon && q.y - p.y >= d) ||
    (Math.abs(p.x - pl.p.x) < epsilon && Math.abs(q.y - p.y) < epsilon && p.x - q.x >= d),
    `Dégagement normal insuffisant : ${JSON.stringify({ p, q, pl })}`);
}
/** Oracle indépendant : reconstruit tous les segments et contrôle aussi les
 * sources/cibles que verifierPlacementChemin exclut par contrat. */
function verifier(g, r = computeSpatialGraphe(g)) {
  assert.deepEqual(Object.keys(r.sommets).sort(), Object.keys(g.sommets).sort());
  assert.equal(r.chemins.length, g.arretes.length);
  assert.deepEqual(r.chemins.map(c => c.arcId), g.arretes.map(a => a.id));
  assert.deepEqual(verifierChemin(r, REGLES_ROUTAGE.toleranceCarree), []);
  assert.deepEqual(verifierPlacement(r), []);
  assert.deepEqual(verifierPlacementChemin(r), []);
  for (const [i, c] of r.chemins.entries()) {
    const a = g.arretes[i];
    assert.equal(c.debut, a.debut); assert.equal(c.fin, a.fin);
    assert.equal(g.arretes.find(a => a.id === c.arcId).label, a.label);
    const source = r.sommets[c.debut]; const cible = r.sommets[c.fin];
    assert.ok(Number.isInteger(c.idx) && c.idx >= 0 && c.idx < source.connexions.length);
    assert.ok(c.listeDePas.length > 0);
    for (const p of c.listeDePas) {
      assert.ok(['horizontal', 'vertical'].includes(p.type));
      assert.ok(Number.isFinite(p.distance) && p.distance !== 0);
    }
    const poly = points(r, c);
    assert.deepEqual(calculerDestination(poly[0], c.listeDePas), poly.at(-1));
    assert.ok(cible.connexions.some(p => (p.x - poly.at(-1).x) ** 2 + (p.y - poly.at(-1).y) ** 2 <= REGLES_ROUTAGE.toleranceCarree));
    degagement(source, poly[0], poly[1]);
    degagement(cible, poly.at(-1), poly.at(-2));
    for (const [id, pl] of Object.entries(r.sommets)) {
      if (pl.forme.type !== 'rectangle') assert.equal(pl.connexions.length, 4);
      const marge = id === c.debut || id === c.fin ? 0 : REGLES_ROUTAGE.marge;
      for (let j = 1; j < poly.length; j++) {
        assert.equal(segmentIntersecteRectangle(poly[j - 1], poly[j],
          pl.p.x - marge + epsilon, pl.p.y - marge + epsilon,
          pl.forme.dx + 2 * marge - 2 * epsilon, pl.forme.dy + 2 * marge - 2 * epsilon), false,
        `${c.arcId} traverse la boîte de ${id}, marge comprise`);
      }
    }
  }
  return r;
}
function freeze(obj) {
  if (obj && typeof obj === 'object') { Object.values(obj).forEach(freeze); Object.freeze(obj); }
  return obj;
}
function diagnostic(fn, code, arcId) {
  assert.throws(fn, e => {
    assert.ok(e instanceof ErreurRoutage);
    assert.equal(e.diagnostic.code, code);
    assert.ok(e.message.includes(e.diagnostic.chemin));
    assert.ok(e.diagnostic.essais <= REGLES_ROUTAGE.maxEssais);
    if (arcId) assert.equal(e.diagnostic.arcId, arcId);
    return true;
  });
}

test('routage-diagram-reference', async () => {
  const url = new URL('../diagram.json', import.meta.url);
  const avant = await readFile(url, 'utf8');
  const g = await importerFichierDiagramme(url);
  const snapshot = structuredClone(g);
  const r = verifier(freeze(g));
  assert.equal(Object.keys(r.sommets).length, 18);
  assert.equal(r.chemins.length, 24);
  assert.equal(new Set(r.chemins.map(c => c.arcId)).size, 24);
  assert.deepEqual(structuredClone(g), snapshot);
  assert.equal(await readFile(url, 'utf8'), avant);
});

test('routage-trajet-direct', () => {
  const g = graphe([forme('a'), forme('b')], [arc('direct', 'a', 'b')]);
  const r = verifier(g);
  assert.deepEqual(r.chemins[0].listeDePas, [{ type: 'vertical', distance: 80 }]);
});

test('routage-obstacle-interpose', () => {
  const g = graphe(['a', 'b', 'c'].map(id => forme(id)),
    [arc('ab', 'a', 'b'), arc('bc', 'b', 'c'), arc('ac', 'a', 'c')]);
  const r = verifier(g);
  const poly = points(r, r.chemins.find(c => c.arcId === 'ac'));
  const obstacle = r.sommets.b;
  assert.ok(poly.some(p => p.x <= obstacle.p.x - REGLES_ROUTAGE.marge ||
    p.x >= obstacle.p.x + obstacle.forme.dx + REGLES_ROUTAGE.marge));
  assert.ok(poly.length >= 5);
});

test('routage-embranchement-convergence', () => {
  const g = graphe(['a', 'b', 'c', 'd'].map(id => forme(id)),
    [arc('ab', 'a', 'b'), arc('ac', 'a', 'c'), arc('bd', 'b', 'd'), arc('cd', 'c', 'd')]);
  const r = verifier(g);
  const entrees = r.chemins.filter(c => c.fin === 'd').map(c => points(r, c).at(-1));
  assert.notDeepEqual(entrees[0], entrees[1]);
});

test('routage-cycle-retour', () => {
  const g = graphe(['a', 'b', 'c'].map(id => forme(id)),
    [arc('ab', 'a', 'b'), arc('bc', 'b', 'c'), arc('retour', 'c', 'a')]);
  const r = verifier(g);
  const retour = points(r, r.chemins.find(c => c.arcId === 'retour'));
  assert.ok(retour.some(p => p.x < r.sommets.b.p.x || p.x > r.sommets.b.p.x + r.sommets.b.forme.dx));
  assert.ok(retour.at(-1).y < retour[0].y);
});

test('routage-boucles-sur-soi', () => {
  for (const type of ['rectangle', 'losange', 'ovale']) {
    const g = graphe([forme('a', { type })], [arc('boucle', 'a', 'a')]);
    const r = verifier(g);
    const poly = points(r, r.chemins[0]);
    assert.notDeepEqual(poly[0], poly.at(-1));
    assert.ok(poly.length >= 5);
  }
});

test('routage-arcs-paralleles', () => {
  for (const type of ['rectangle', 'losange', 'ovale']) {
    const g = graphe([forme('a', { type }), forme('b', { type })],
      [arc('p1', 'a', 'b'), arc('p2', 'a', 'b'), arc('p3', 'a', 'b')]);
    const r = verifier(g);
    assert.equal(new Set(r.chemins.map(c => JSON.stringify(points(r, c)))).size, 3,
      'les pistes évitent de superposer intégralement les arcs parallèles');
  }
});

test('routage-paralleles-32px-hors-ports-communs-des-trois-formes', () => {
  for (const type of ['rectangle', 'losange', 'ovale']) {
    const g = graphe([forme('a', { type }), forme('b', { type })],
      [arc('p1', 'a', 'b'), arc('p2', 'a', 'b'), arc('p3', 'a', 'b')]);
    const r = verifier(g);
    const milieu = (r.sommets.a.p.y + r.sommets.a.forme.dy + r.sommets.b.p.y) / 2;
    // Mesure une coupe entre les formes, hors des 24 px de dégagement
    // nécessairement partagés aux quatre ports d'un losange ou d'un ovale.
    const pistes = r.chemins.map(c => {
      const poly = points(r, c);
      const index = poly.findIndex((p, i) => i > 0 && p.x === poly[i - 1].x &&
        Math.min(p.y, poly[i - 1].y) < milieu && Math.max(p.y, poly[i - 1].y) > milieu);
      assert.ok(index > 0);
      return poly[index].x;
    }).sort((a, b) => a - b);
    assert.equal(pistes.length, 3);
    assert.ok(pistes[1] - pistes[0] >= 32 && pistes[2] - pistes[1] >= 32,
      `${type} : les pistes parallèles doivent être séparées d'au moins 32 px`);
  }
});

test('routage-reference-proximite-32px-reduite-et-trajets-courts', async () => {
  const g = await importerFichierDiagramme(new URL('../diagram.json', import.meta.url));
  const r = verifier(g, computeSpatialGraphe(g, { dispositionCompacte: true }));
  const segments = r.chemins.map(c => {
    const p = points(r, c);
    return p.slice(1).map((b, i) => ({ a: p[i], b }));
  });
  let proche = 0; let tresProche = 0;
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    for (const s of segments[i]) for (const t of segments[j]) {
      const horizontal = s.a.y === s.b.y;
      if (horizontal !== (t.a.y === t.b.y)) continue;
      const axe = horizontal ? 'x' : 'y'; const fixe = horizontal ? 'y' : 'x';
      const ecart = Math.abs(s.a[fixe] - t.a[fixe]);
      if (ecart <= epsilon || ecart >= 32 - epsilon) continue;
      const commun = Math.max(0, Math.min(Math.max(s.a[axe], s.b[axe]), Math.max(t.a[axe], t.b[axe])) -
        Math.max(Math.min(s.a[axe], s.b[axe]), Math.min(t.a[axe], t.b[axe])));
      proche += commun;
      if (ecart < 16 - epsilon) tresProche += commun;
    }
  }
  // Avant cet agrandissement : 3585 px de côtoiement à moins de 32 px.
  // Les ports imposés restent prioritaires ; on ne promet pas une séparation
  // minimale universelle que ces ancres ne permettraient pas de respecter.
  assert.ok(proche <= 3585 * .35, `${proche} px : réduction d'au moins 65 % attendue sous 32 px`);
  assert.ok(tresProche <= 800, 'conserver aussi la réduction précédente des portions distantes de moins de 16 px');
  const longueur = r.chemins.reduce((s, c) => s + c.listeDePas.reduce((s, p) => s + Math.abs(p.distance), 0), 0);
  // Le doublement de l'écart et l'interdiction de recouper ses dégagements
  // peuvent coûter un détour ; la réduction de 25 % reste requise.
  assert.ok(longueur <= 24055.333333333332 * .75,
    'espacer les pistes et éviter les auto-intersections conserve au moins 25 % de réduction de longueur');
  console.log(`espacement-routage ${JSON.stringify({ proche, tresProche, longueur })}`);
});

test('routage-rectangle-connexions-meme-cote', () => {
  const g = graphe(['a', 'b', 'c', 'd'].map(id => forme(id)),
    ['a', 'b', 'c'].map((id, i) => arc(`entree-${id}`, id, 'd', { targetAnchor: { side: 'top', ratio: (i + 1) / 4 } })));
  const r = verifier(g); const d = r.sommets.d;
  const arrivees = r.chemins.map(c => points(r, c).at(-1));
  assert.equal(new Set(arrivees.map(p => p.x)).size, 3);
  assert.ok(arrivees.every(p => Math.abs(p.y - d.p.y) < epsilon));
  assert.deepEqual(arrivees.map(p => (p.x - d.p.x) / d.forme.dx), [0.25, 0.5, 0.75]);
});

test('routage-preferences-ancres-handles', () => {
  const g = graphe([forme('a'), forme('b')], [arc('ancre', 'a', 'b', {
    sourceHandle: 'left', sourceAnchor: { side: 'right', ratio: 0.25 },
    targetHandle: 'left', targetAnchor: { side: 'right', ratio: 0.75 },
  })]);
  const r = verifier(g); const p = points(r, r.chemins[0]);
  for (const [id, ratio, pt] of [['a', 0.25, p[0]], ['b', 0.75, p.at(-1)]]) {
    assert.equal(pt.x, r.sommets[id].p.x + r.sommets[id].forme.dx);
    assert.equal(pt.y, r.sommets[id].p.y + r.sommets[id].forme.dy * ratio);
  }
  const handles = graphe([forme('a'), forme('b')], [arc('handles', 'a', 'b', { sourceHandle: 'left', targetHandle: 'right' })]);
  const h = verifier(handles); const ph = points(h, h.chemins[0]);
  assert.equal(ph[0].x, h.sommets.a.p.x);
  assert.equal(ph.at(-1).x, h.sommets.b.p.x + h.sommets.b.forme.dx);
});

test('routage-points-importes-valides', () => {
  const g = graphe([forme('a'), forme('b')], [arc('points', 'a', 'b')]);
  const { sommets: s } = calculerPlacements(g);
  const depart = s.a.connexions.find(p => p.y === s.a.p.y + s.a.forme.dy);
  const arrivee = s.b.connexions.find(p => p.y === s.b.p.y);
  const hints = [{ x: depart.x, y: depart.y + 24 }, { x: depart.x + 250, y: depart.y + 24 },
    { x: depart.x + 250, y: arrivee.y - 24 }, { x: arrivee.x, y: arrivee.y - 24 }];
  g.arretes[0].points = [depart, ...hints, arrivee];
  const r = verifier(g);
  assert.deepEqual(points(r, r.chemins[0]), [depart, ...hints, arrivee]);
});

test('routage-points-preferent-ports-lateraux', () => {
  const g = graphe([forme('a'), forme('b')], [arc('points', 'a', 'b')]);
  const { sommets: s } = calculerPlacements(g);
  const depart = s.a.connexions.find(p => p.x === s.a.p.x + s.a.forme.dx);
  const arrivee = s.b.connexions.find(p => p.x === s.b.p.x + s.b.forme.dx);
  const hints = [depart, { x: depart.x + 60, y: depart.y }, { x: arrivee.x + 60, y: arrivee.y }, arrivee];
  g.arretes[0].points = hints;
  const r = verifier(g);
  assert.deepEqual(points(r, r.chemins[0]), hints);
});

test('routage-indications-incoherentes-recalculees', () => {
  const base = graphe(['a', 'b', 'c'].map(id => forme(id)),
    [arc('ab', 'a', 'b'), arc('bc', 'b', 'c'), arc('ac', 'a', 'c')]);
  const attendu = verifier(base);
  const s = attendu.sommets;
  const depart = points(attendu, attendu.chemins[2])[0];
  for (const hints of [
    [{ x: 1, y: 3 }], // segments diagonaux
    [{ x: depart.x, y: s.b.p.y + 30 }], // traverse l'obstacle
    [{ x: depart.x, y: s.a.p.y + 30 }], // traverse la source
    [{ x: NaN, y: 0 }],
  ]) {
    const g = structuredClone(base); g.arretes[2].points = hints;
    assert.deepEqual(verifier(g), attendu);
  }
});

test('routage-formes-cardinales-et-coins', () => {
  for (const type of ['losange', 'ovale', 'rectangle']) {
    const g = graphe([forme('a', { type }), forme('b', { type })], [arc('coin', 'a', 'b', {
      sourceAnchor: { side: 'right', ratio: 0 }, targetAnchor: { side: 'left', ratio: 1 },
    })]);
    const r = verifier(g); const p = points(r, r.chemins[0]);
    assert.equal(p[0].x, r.sommets.a.p.x + r.sommets.a.forme.dx);
    assert.equal(p.at(-1).x, r.sommets.b.p.x);
    if (type !== 'rectangle') {
      assert.equal(p[0].y, r.sommets.a.p.y + r.sommets.a.forme.dy / 2);
      assert.equal(p.at(-1).y, r.sommets.b.p.y + r.sommets.b.forme.dy / 2);
    }
  }
});

test('routage-degagements-source-cible-tous-cotes', () => {
  for (const sourceHandle of ['top', 'right', 'bottom', 'left']) {
    for (const targetHandle of ['top', 'right', 'bottom', 'left']) {
      for (const type of ['rectangle', 'losange', 'ovale']) {
        const g = graphe([forme('a', { type }), forme('b', { type })],
          [arc('ab', 'a', 'b', { sourceHandle, targetHandle })]);
        verifier(g);
      }
    }
  }
});

test('routage-echec-controle-budget', { timeout: 3000 }, () => {
  const g = graphe([forme('a'), forme('b')], [arc('ab', 'a', 'b')]);
  const snapshot = structuredClone(g);
  diagnostic(() => computeSpatialGraphe(g, { maxEtats: 1 }), 'BUDGET_ROUTAGE_DEPASSE', 'ab');
  diagnostic(() => computeSpatialGraphe(g, { maxNoeudsGrille: 1 }), 'GRILLE_TROP_GRANDE');
  assert.deepEqual(g, snapshot);
  verifier(g); // le calcul reprend correctement après un échec
});

test('routage-repli-et-limite-essais', { timeout: 3000 }, () => {
  const g = graphe([forme('a', { type: 'ovale' })], [arc('boucle', 'a', 'a', { sourceHandle: 'right', targetHandle: 'right' })]);
  diagnostic(() => computeSpatialGraphe(g, { maxEssais: 1 }), 'ROUTAGE_IMPOSSIBLE', 'boucle');
  verifier(g, computeSpatialGraphe(g, { maxEssais: 2 }));
});

test('routage-determinisme-et-immuabilite', async () => {
  const g = await importerFichierDiagramme(new URL('../diagram.json', import.meta.url));
  const snapshot = structuredClone(g);
  const r = verifier(freeze(g));
  assert.deepEqual(computeSpatialGraphe(g), r);
  const inverse = { ...g, sommets: Object.fromEntries(Object.entries(g.sommets).reverse()), arretes: [...g.arretes].reverse() };
  const autre = computeSpatialGraphe(inverse);
  assert.deepEqual(autre.sommets, r.sommets);
  assert.deepEqual(autre.chemins, [...r.chemins].reverse());
  const id = Object.keys(r.sommets)[0];
  r.sommets[id].forme.metadata.modification = true;
  r.sommets[id].forme.position.x = 999;
  r.sommets[id].connexions[0].x = 999;
  assert.deepEqual(structuredClone(g), snapshot);
});

test('routage-diagnostics-entrees', () => {
  const g = graphe([forme('a'), forme('b')], [arc('ab', 'a', 'b')]);
  for (const options of [{ maxEtats: 0 }, { maxEtats: NaN }, { maxEssais: 3 }, { maxEssais: 1.5 }, { maxNoeudsGrille: Infinity }]) {
    diagnostic(() => computeSpatialGraphe(g, options), 'OPTION_INVALIDE');
  }
  diagnostic(() => computeSpatialGraphe({ ...g, arretes: [g.arretes[0], g.arretes[0]] }), 'ARC_INVALIDE');
  diagnostic(() => computeSpatialGraphe({ ...g, arretes: [arc('absent', 'a', 'inconnu')] }), 'REFERENCE_ABSENTE');
  const invalide = structuredClone(g); invalide.sommets.a.dx = 0;
  diagnostic(() => computeSpatialGraphe(invalide), 'DIMENSION_INVALIDE');
});

test('routage-vide-isoles-identifiants-speciaux', () => {
  assert.deepEqual(verifier(graphe([])), { sommets: {}, chemins: [] });
  const g = graphe(['__proto__', 'constructor', 'toString', 'isolé'].map(id => forme(id)),
    [arc('__proto__', '__proto__', 'constructor'), arc('constructor', 'constructor', 'toString')]);
  const r = verifier(g);
  assert.equal(Object.keys(r.sommets).length, 4);
  assert.equal(r.chemins.length, 2);
});

test('routage-graphes-generes-reproductibles', () => {
  let graine = 123456;
  const entier = n => { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return graine % n; };
  for (let i = 0; i < 16; i++) {
    const formes = Array.from({ length: 3 + entier(5) }, (_, j) => forme(`n${j}`, {
      type: ['rectangle', 'losange', 'ovale'][entier(3)], dx: 80 + entier(80), dy: 40 + entier(80),
      position: { x: entier(300) - 150, y: entier(300) - 150 },
    }));
    const arcs = Array.from({ length: 5 + entier(7) }, (_, j) => arc(`a${j}`,
      formes[entier(formes.length)].id, formes[entier(formes.length)].id));
    const g = graphe(formes, arcs);
    const r = verifier(g);
    assert.deepEqual(computeSpatialGraphe(g), r);
  }
});

test('routage-sans-demi-tour-degagements-et-points-importes', () => {
  const sansDemiTour = r => {
    for (const c of r.chemins) for (let i = 1; i < c.listeDePas.length; i++) {
      assert.notEqual(c.listeDePas[i - 1].type, c.listeDePas[i].type,
        `${c.arcId} : un segment ne doit pas se prolonger puis revenir sur lui-même en T`);
    }
  };
  for (const type of ['rectangle', 'losange', 'ovale']) {
    for (const sourceHandle of ['top', 'right', 'bottom', 'left']) {
      for (const targetHandle of ['top', 'right', 'bottom', 'left']) {
        const g = graphe([forme('a', { type }), forme('b', { type })], [arc('ab', 'a', 'b', { sourceHandle, targetHandle })]);
        sansDemiTour(verifier(g));
      }
    }
    const g = graphe([forme('a', { type }), forme('b', { type })], [arc('ab', 'a', 'b', { sourceHandle: 'right', targetHandle: 'right' })]);
    const normal = verifier(g);
    const p = points(normal, normal.chemins[0]);
    // Un ancien trajet pouvait sortir de 40 px puis revenir de 16 px, sans
    // traverser de boîte : les trois vérificateurs seuls ne détectaient pas ce T.
    g.arretes[0].points = [p[0], { x: p[0].x + 40, y: p[0].y },
      { x: p[0].x + 24, y: p[0].y }, { x: p.at(-1).x + 24, y: p.at(-1).y }, p.at(-1)];
    const before = structuredClone(g);
    const recalcul = verifier(g);
    sansDemiTour(recalcul);
    assert.deepEqual(recalcul, normal, 'le détour importé en impasse doit être recalculé');
    assert.deepEqual(g, before);
  }
});

test('routage-reference-croisements-reduits-et-absence-de-jonctions-ambigues', async () => {
  const g = await importerFichierDiagramme(new URL('../diagram.json', import.meta.url));
  const r = verifier(g, computeSpatialGraphe(g, { dispositionCompacte: true }));
  const traces = r.chemins.map(c => points(r, c));
  const segments = p => p.slice(1).map((b, i) => ({ a: p[i], b }));
  let longueurCommune = 0; let contacts = 0;
  const croisements = new Set();
  const min = (s, axe) => Math.min(s.a[axe], s.b[axe]);
  const max = (s, axe) => Math.max(s.a[axe], s.b[axe]);
  for (const c of r.chemins) for (let k = 1; k < c.listeDePas.length; k++) {
    assert.notEqual(c.listeDePas[k - 1].type, c.listeDePas[k].type, 'aucun demi-tour dans le diagramme');
  }
  // Oracle géométrique sur les polylignes finales : les étapes de grille ne
  // comptent pas plusieurs fois un même croisement entre deux arcs.
  for (let i = 0; i < traces.length; i++) for (let j = i + 1; j < traces.length; j++) {
    for (const s of segments(traces[i])) for (const t of segments(traces[j])) {
      const horizontal = Math.abs(s.a.y - s.b.y) < epsilon;
      const autreHorizontal = Math.abs(t.a.y - t.b.y) < epsilon;
      if (horizontal === autreHorizontal) {
        const fixe = horizontal ? 'y' : 'x'; const axe = horizontal ? 'x' : 'y';
        if (Math.abs(s.a[fixe] - t.a[fixe]) < epsilon) {
          longueurCommune += Math.max(0, Math.min(max(s, axe), max(t, axe)) - Math.max(min(s, axe), min(t, axe)));
        }
      } else {
        const h = horizontal ? s : t; const v = horizontal ? t : s;
        const x = v.a.x; const y = h.a.y;
        if (x < min(h, 'x') - epsilon || x > max(h, 'x') + epsilon || y < min(v, 'y') - epsilon || y > max(v, 'y') + epsilon) continue;
        if (x > min(h, 'x') + epsilon && x < max(h, 'x') - epsilon && y > min(v, 'y') + epsilon && y < max(v, 'y') - epsilon) {
          croisements.add(`${i}/${j}/${x.toFixed(5)}/${y.toFixed(5)}`);
        } else contacts++;
      }
    }
  }
  assert.ok(longueurCommune < epsilon, 'aucun tronçon partagé entre arcs sur la référence');
  assert.equal(contacts, 0, 'aucune jonction en T entre arcs ni croisement sur un coude');
  assert.ok(croisements.size <= 25, `${croisements.size} croisements ; au plus la moitié des 50 du rendu précédent`);
  console.log(`qualite-routage ${JSON.stringify({ croisements: croisements.size, contacts, longueurCommune })}`);
  const inverse = { ...g, sommets: Object.fromEntries(Object.entries(g.sommets).reverse()), arretes: [...g.arretes].reverse() };
  const autre = computeSpatialGraphe(inverse, { dispositionCompacte: true });
  assert.deepEqual(autre.sommets, r.sommets);
  assert.deepEqual(autre.chemins, [...r.chemins].reverse());
});

test('routage-presentation-large-coudes-reduits-longueur-bornee-et-ancres', async () => {
  const g = await importerFichierDiagramme(new URL('../diagram.json', import.meta.url));
  const snapshot = structuredClone(g);
  const r = verifier(freeze(g), computeSpatialGraphe(g, { dispositionCompacte: true }));
  const longueurs = r.chemins.map(c => c.listeDePas.reduce((s, pas) => s + Math.abs(pas.distance), 0));
  const total = longueurs.reduce((s, l) => s + l, 0);
  // Mesure du rendu précédent : 24 055,33 px pour les 24 polylignes.
  // Contrôle le résultat réel, pas le coût approximatif du placement.
  assert.ok(total <= 24055.333333333332 * .75, `${total} px : réduction d’au moins 25 % attendue`);
  // Le format plus large allonge certains retours ; on borne ce compromis
  // sans abandonner la réduction totale, les ancres, ni la simplicité des arcs.
  assert.ok(Math.max(...longueurs) <= 3200, 'retours bornés malgré la largeur accrue');
  const coudes = r.chemins.map(c => c.listeDePas.length - 1);
  assert.ok(coudes.reduce((s, n) => s + n, 0) <= 75, 'au moins 19 % de coudes en moins que les 93 précédents');
  assert.ok(Math.max(...coudes) <= 7, 'aucune flèche à huit coudes comme auparavant');
  assert.ok(longueurs.filter(l => l > 1000).length <= 6, 'moins de grands détours que les neuf précédents');
  for (const [i, c] of r.chemins.entries()) {
    const a = g.arretes[i]; const poly = points(r, c);
    for (const source of [true, false]) {
      const ancre = source ? a.sourceAnchor : a.targetAnchor;
      const handle = source ? a.sourceHandle : a.targetHandle;
      const side = ancre?.side ?? (['top', 'right', 'bottom', 'left'].includes(handle) ? handle : source ? 'bottom' : 'top');
      const pl = r.sommets[source ? a.debut : a.fin]; const p = source ? poly[0] : poly.at(-1);
      const horizontal = side === 'top' || side === 'bottom';
      assert.ok(Math.abs((horizontal ? p.y - pl.p.y : p.x - pl.p.x) -
        (side === 'bottom' ? pl.forme.dy : side === 'right' ? pl.forme.dx : 0)) < epsilon,
      `${a.id} : le côté ${side} doit être conservé`);
      if (ancre && pl.forme.type === 'rectangle') {
        assert.ok(Math.abs((horizontal ? (p.x - pl.p.x) / pl.forme.dx : (p.y - pl.p.y) / pl.forme.dy) - ancre.ratio) < epsilon);
      }
    }
  }
  assert.deepEqual(structuredClone(g), snapshot);
  console.log(`longueur-routage ${JSON.stringify({ total, maximum: Math.max(...longueurs), longs: longueurs.filter(l => l > 1000).length })}`);
});

test('routage-compact-cycle-entrelace-court-deterministe-et-immuable', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `n${String(i).padStart(2, '0')}`);
  // L'ordre vertical importé éloigne volontairement les voisins du cycle.
  const ordre = Array.from({ length: 6 }, (_, i) => [i, i + 6]).flat();
  const g = graphe(ids.map((id, i) => forme(id, { position: { x: 0, y: i * 100 } })),
    ordre.map((v, i) => arc(`a${i}`, ids[v], ids[ordre[(i + 1) % ids.length]], {
      sourceHandle: 'right', targetHandle: 'left',
    })));
  const snapshot = structuredClone(g);
  const r = verifier(freeze(g), computeSpatialGraphe(g, { dispositionCompacte: true }));
  const total = r.chemins.reduce((s, c) => s + c.listeDePas.reduce((l, pas) => l + Math.abs(pas.distance), 0), 0);
  assert.ok(total < 4800, `${total} px : les voisins du cycle doivent rester proches`);
  for (const c of r.chemins) {
    const p = points(r, c);
    assert.equal(p[0].x, r.sommets[c.debut].p.x + r.sommets[c.debut].forme.dx);
    assert.equal(p.at(-1).x, r.sommets[c.fin].p.x);
  }
  const inverse = { ...g, sommets: Object.fromEntries(Object.entries(g.sommets).reverse()), arretes: [...g.arretes].reverse() };
  const autre = computeSpatialGraphe(inverse, { dispositionCompacte: true });
  assert.deepEqual(autre.sommets, r.sommets);
  assert.deepEqual(autre.chemins, [...r.chemins].reverse());
  assert.deepEqual(structuredClone(g), snapshot);
});

test('routage-reference-corps-hors-degagements-et-sans-auto-intersection', async () => {
  const g = await importerFichierDiagramme(new URL('../diagram.json', import.meta.url));
  for (const dispositionCompacte of [true, false]) {
    const r = verifier(g, computeSpatialGraphe(g, { dispositionCompacte }));
    for (const c of r.chemins) {
      const poly = points(r, c);
      const segments = poly.slice(1).map((b, i) => ({ a: poly[i], b }));
      for (let i = 0; i < segments.length; i++) for (let j = i + 2; j < segments.length; j++) {
        const s = segments[i]; const t = segments[j];
        const h = s.a.y === s.b.y ? s : t; const v = h === s ? t : s;
        if (h.a.y !== h.b.y || v.a.x !== v.b.x) continue;
        const x = v.a.x; const y = h.a.y;
        const croise = x > Math.min(h.a.x, h.b.x) + epsilon && x < Math.max(h.a.x, h.b.x) - epsilon &&
          y > Math.min(v.a.y, v.b.y) + epsilon && y < Math.max(v.a.y, v.b.y) - epsilon;
        assert.equal(croise, false, `${c.arcId} : le corps ne doit pas recouper ses propres dégagements ou une autre portion du trajet`);
      }
    }
  }
});
