import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ErreurGeometrie, genererConnexions, creerPlacement, calculerDestination,
  verifierChemin, verifierPlacement, verifierPlacementChemin, segmentIntersecteRectangle,
} from '../dist/server/graphe.js';
import { importerFichierDiagramme } from '../dist/server/importer.js';

const forme = (id = 'a', type = 'rectangle', dx = 100, dy = 40) => ({ id, type, dx, dy, label: id, metadata: {} });
const arc = (id, debut = 'a', fin = 'b', extras = {}) => ({ id, debut, fin, label: '', metadata: {}, ...extras });
const pas = (type, distance) => ({ type, distance });
const chemin = (arcId = 'arc-1', extras = {}) => ({ arcId, debut: 'a', fin: 'b', idx: 1,
  listeDePas: [pas('horizontal', 20)], ...extras });
function graphe() {
  return { sommets: {
    a: creerPlacement(forme('a', 'rectangle', 10, 10), { x: 0, y: 0 }),
    b: creerPlacement(forme('b', 'rectangle', 10, 10), { x: 30, y: 0 }),
  }, chemins: [chemin()] };
}
const verificateurs = [g => verifierChemin(g, 0), verifierPlacement, verifierPlacementChemin];
function diagnostic(fn, code, fragment) {
  assert.throws(fn, e => {
    assert.ok(e instanceof ErreurGeometrie);
    assert.equal(e.code, code);
    assert.ok(e.chemin.includes(fragment), `${e.chemin} doit contenir ${fragment}`);
    assert.ok(e.message.includes(code) && e.message.includes(e.chemin));
    return true;
  });
}
function contour(pl) {
  for (const c of pl.connexions) {
    assert.ok(c.x >= pl.p.x && c.x <= pl.p.x + pl.forme.dx);
    assert.ok(c.y >= pl.p.y && c.y <= pl.p.y + pl.forme.dy);
    assert.ok(c.x === pl.p.x || c.x === pl.p.x + pl.forme.dx || c.y === pl.p.y || c.y === pl.p.y + pl.forme.dy);
  }
  assert.equal(new Set(pl.connexions.map(c => JSON.stringify(c))).size, pl.connexions.length);
}

test('connexions-losange-absolues', () => {
  const f = forme('d', 'losange', 80, 30);
  const p = { x: 17, y: -11 };
  const before = structuredClone({ f, p });
  const pl = creerPlacement(f, p, [arc('e', 'd', 'b', { sourceAnchor: { side: 'left', ratio: 0 } })]);
  assert.deepEqual(pl.connexions, [{ x: 57, y: -11 }, { x: 97, y: 4 }, { x: 57, y: 19 }, { x: 17, y: 4 }]);
  assert.deepEqual({ f, p }, before);
  pl.p.x = 999;
  assert.equal(p.x, 17);
});

test('connexions-ovale-absolues', () => {
  assert.deepEqual(genererConnexions(forme('o', 'ovale', 30, 80), { x: -25, y: 13 }),
    [{ x: -10, y: 13 }, { x: 5, y: 53 }, { x: -10, y: 93 }, { x: -25, y: 53 }]);
});

test('connexions-rectangle-ancres-multiples', () => {
  const arcs = [
    arc('e1', 'a', 'b', { sourceAnchor: { side: 'right', ratio: 0.2 }, sourceHandle: 'left' }),
    arc('e2', 'b', 'a', { targetAnchor: { side: 'right', ratio: 0.8 } }),
    arc('e3', 'a', 'b', { sourceAnchor: { side: 'right', ratio: 0.2 } }),
    arc('etranger', 'b', 'c', { sourceAnchor: { side: 'left', ratio: 0 } }),
  ];
  const before = structuredClone(arcs);
  const pl = creerPlacement(forme(), { x: 10, y: -20 }, arcs);
  assert.deepEqual(pl.connexions, [{ x: 60, y: -20 }, { x: 110, y: -12 }, { x: 110, y: 12 },
    { x: 60, y: 20 }, { x: 10, y: 0 }]);
  contour(pl);
  assert.deepEqual(arcs, before);
  assert.deepEqual(creerPlacement(forme(), pl.p, [...arcs].reverse()).connexions, pl.connexions);
});

test('connexions-rectangle-incidents-et-handles', () => {
  const arcs = [arc('sortie1'), arc('sortie2'), arc('entree', 'b', 'a'), arc('boucle', 'a', 'a'),
    arc('handle1', 'a', 'b', { sourceHandle: 'left' }),
    arc('handle2', 'b', 'a', { targetHandle: 'left' }),
    arc('ancre', 'a', 'b', { sourceAnchor: { side: 'bottom', ratio: 0.5 } })];
  const pl = creerPlacement(forme('a', 'rectangle', 120, 60), { x: 12, y: 8 }, arcs);
  assert.deepEqual(pl.connexions.filter(p => p.y === 8), [{ x: 52, y: 8 }, { x: 92, y: 8 }]);
  assert.deepEqual(pl.connexions.filter(p => p.y === 68),
    [{ x: 36, y: 68 }, { x: 60, y: 68 }, { x: 72, y: 68 }, { x: 84, y: 68 }]);
  assert.deepEqual(pl.connexions.filter(p => p.x === 12), [{ x: 12, y: 28 }, { x: 12, y: 48 }]);
  contour(pl);
});

test('connexions-rectangle-coins-dedupliques', () => {
  const arcs = [arc('haut', 'a', 'b', { sourceAnchor: { side: 'top', ratio: 1 } }),
    arc('droite', 'b', 'a', { targetAnchor: { side: 'right', ratio: 0 } }),
    arc('bas', 'a', 'b', { sourceAnchor: { side: 'bottom', ratio: 0 } }),
    arc('gauche', 'a', 'b', { sourceAnchor: { side: 'left', ratio: 1 } })];
  const pl = creerPlacement(forme(), { x: -10, y: 7 }, arcs);
  assert.deepEqual(pl.connexions, [{ x: 90, y: 7 }, { x: -10, y: 47 }]);
  contour(pl);
  assert.deepEqual(genererConnexions(forme(), { x: -10, y: 7 }),
    [{ x: 40, y: 7 }, { x: 90, y: 27 }, { x: 40, y: 47 }, { x: -10, y: 27 }]);
});

test('connexions-diagnostics-invalides', () => {
  for (const ratio of [NaN, Infinity, -0.1, 1.1]) {
    diagnostic(() => genererConnexions(forme(), { x: 0, y: 0 },
      [arc('e', 'a', 'b', { sourceAnchor: { side: 'right', ratio } })]), 'ANCRE_INVALIDE', 'sourceAnchor');
  }
  diagnostic(() => creerPlacement(forme(), { x: NaN, y: 0 }), 'NOMBRE_NON_FINI', '.p.x');
  diagnostic(() => creerPlacement(forme('a', 'rectangle', 0), { x: 0, y: 0 }), 'DIMENSION_INVALIDE', 'dx');
  diagnostic(() => creerPlacement(forme('a', 'triangle'), { x: 0, y: 0 }), 'FORME_INVALIDE', 'type');
});

test('destination-pas-signes-et-immuabilite', () => {
  const p = Object.freeze({ x: 7, y: -11 });
  const liste = Object.freeze([pas('horizontal', 12), pas('vertical', 15),
    pas('horizontal', -5), pas('vertical', -3), pas('horizontal', 0)].map(Object.freeze));
  assert.deepEqual(calculerDestination(p, liste), { x: 14, y: 1 });
  assert.deepEqual(calculerDestination(p, []), p);
  assert.notEqual(calculerDestination(p, []), p);
});

test('chemin-connexion-source-et-arrivees', () => {
  const g = graphe();
  assert.deepEqual(verifierChemin(g, 0), []);
  // Même origine de boîte mais mauvaise connexion source.
  g.chemins[0].idx = 0;
  assert.deepEqual(verifierChemin(g, 0), [g.chemins[0]]);
  // Arrivée sur le haut de b avec plusieurs pas signés.
  g.chemins[0].listeDePas = [pas('vertical', -5), pas('horizontal', 40),
    pas('horizontal', -10), pas('vertical', 5)];
  assert.deepEqual(verifierChemin(g, 0), []);
  g.chemins.push(chemin('arc-parallele', { listeDePas: [pas('horizontal', 19)] }));
  assert.deepEqual(verifierChemin(g, 0).map(c => c.arcId), ['arc-parallele']);
});

test('chemin-tolerance-distance-carree', () => {
  const g = graphe();
  g.chemins[0].listeDePas = [pas('horizontal', 22), pas('vertical', 1)];
  // Distance à la connexion gauche de b : sqrt(5), distance au carré : 5.
  assert.deepEqual(verifierChemin(g, 5 - 1e-12), [g.chemins[0]]);
  assert.deepEqual(verifierChemin(g, 5), []);
  assert.deepEqual(verifierChemin(g, 5 + 1e-12), []);
  assert.deepEqual(verifierChemin(g, 3), [g.chemins[0]], 'le seuil ne représente pas une distance linéaire');
  for (const [ecart, conflit] of [[2 - 1e-10, false], [2, false], [2 + 1e-10, true]]) {
    g.chemins[0].listeDePas = [pas('horizontal', 20 + ecart)];
    assert.deepEqual(verifierChemin(g, 4), conflit ? [g.chemins[0]] : []);
  }
  for (const epsilon of [-1, NaN, Infinity, -Infinity]) {
    diagnostic(() => verifierChemin(g, epsilon), 'TOLERANCE_INVALIDE', 'epsilon');
  }
});

test('placements-separes-tangents-superposes', () => {
  for (const [x, y, conflit] of [[11, 0, false], [0, 11, false], [10, 0, true],
    [0, 10, true], [10, 10, true], [9, 9, true], [0, 0, true], [-10, -10, true]]) {
    const g = graphe();
    g.chemins = [];
    g.sommets.b = creerPlacement(forme('b', 'rectangle', 10, 10), { x, y });
    assert.deepEqual(verifierPlacement(g), conflit ? [['a', 'b']] : [], `${x},${y}`);
    g.sommets = { b: g.sommets.b, a: g.sommets.a };
    assert.deepEqual(verifierPlacement(g), conflit ? [['b', 'a']] : []);
  }
  const g = graphe();
  g.chemins = [];
  g.sommets.b = creerPlacement(forme('b', 'ovale', 2, 2), { x: 4, y: 4 });
  assert.deepEqual(verifierPlacement(g), [['a', 'b']], 'les boîtes englobantes sont vérifiées');
});

test('segments-interieur-bords-contacts-deux-sens', () => {
  const cas = [
    [{ x: 0, y: 25 }, { x: 40, y: 25 }, true],
    [{ x: 25, y: 0 }, { x: 25, y: 40 }, true],
    [{ x: 0, y: 20 }, { x: 40, y: 20 }, false],
    [{ x: 30, y: 0 }, { x: 30, y: 40 }, false],
    [{ x: 0, y: 25 }, { x: 20, y: 25 }, false],
    [{ x: 25, y: 0 }, { x: 25, y: 20 }, false],
    [{ x: 0, y: 20 }, { x: 20, y: 20 }, false],
    [{ x: 20, y: 25 }, { x: 30, y: 25 }, true],
    [{ x: 25, y: 25 }, { x: 40, y: 25 }, true],
    [{ x: 25, y: 25 }, { x: 25, y: 25 }, true],
    [{ x: 0, y: 0 }, { x: 40, y: 40 }, true],
    [{ x: 10, y: 30 }, { x: 30, y: 10 }, false], // touche seulement le coin
  ];
  for (const [p, q, attendu] of cas) {
    for (const [debut, fin] of [[p, q], [q, p]]) {
      assert.equal(segmentIntersecteRectangle(debut, fin, 20, 20, 10, 10), attendu, JSON.stringify([debut, fin]));
      // Exerce aussi le vérificateur complet avec une boîte tierce.
      const g = { sommets: {
        a: { p: debut, forme: forme('a', 'rectangle', 1, 1), connexions: [debut] },
        b: { p: fin, forme: forme('b', 'rectangle', 1, 1), connexions: [fin] },
        tiers: creerPlacement(forme('tiers', 'rectangle', 10, 10), { x: 20, y: 20 }),
      }, chemins: [chemin('passage', { idx: 0, listeDePas: debut.y === fin.y
        ? [pas('horizontal', fin.x - debut.x)] : [pas('vertical', fin.y - debut.y)] })] };
      // Les deux cas diagonaux concernent seulement l'utilitaire de segment.
      if (debut.x === fin.x || debut.y === fin.y) {
        assert.deepEqual(verifierPlacementChemin(g), attendu ? [['passage', 'tiers']] : []);
      }
    }
  }
});

test('placement-chemin-exclusions-paralleles-deduplication', () => {
  const g = graphe();
  g.chemins[0].listeDePas = [pas('horizontal', -5), pas('horizontal', 40)];
  assert.deepEqual(verifierPlacementChemin(g), [], 'source et destination traversées sont exclues');
  g.sommets.tiers = creerPlacement(forme('tiers', 'rectangle', 4, 4), { x: 18, y: 3 });
  g.chemins[0].listeDePas.push(pas('horizontal', -40), pas('horizontal', 40));
  g.chemins.push({ ...g.chemins[0], arcId: 'arc-2' });
  assert.deepEqual(verifierPlacementChemin(g), [['arc-1', 'tiers'], ['arc-2', 'tiers']]);
  // Une boucle exclut également son unique source/cible.
  const boucle = graphe();
  boucle.chemins = [chemin('boucle', { fin: 'a', listeDePas: [pas('horizontal', -10), pas('horizontal', 10)] })];
  assert.deepEqual(verifierPlacementChemin(boucle), []);
});

test('geometrie-configuration-valide-et-vide', () => {
  const g = graphe();
  const before = structuredClone(g);
  for (const verifier of verificateurs) {
    assert.deepEqual(verifier(g), []);
    assert.deepEqual(verifier({ sommets: {}, chemins: [] }), []);
  }
  assert.deepEqual(g, before);
});

test('geometrie-diagnostics-references-et-indices', () => {
  for (const verifier of verificateurs) {
    for (const extremite of ['debut', 'fin']) {
      for (const id of ['absent', 'constructor', '__proto__']) {
        const g = graphe();
        g.chemins[0][extremite] = id;
        diagnostic(() => verifier(g), 'REFERENCE_ABSENTE', extremite);
      }
    }
    for (const idx of [-1, 4, 0.5, NaN, Infinity]) {
      const g = graphe();
      g.chemins[0].idx = idx;
      diagnostic(() => verifier(g), 'INDICE_CONNEXION_INVALIDE', 'arc-1');
    }
  }
});

test('geometrie-diagnostics-nombres-et-pas', () => {
  const mutations = [
    [g => { g.sommets.a.p.x = NaN; }, 'NOMBRE_NON_FINI', '.p.x'],
    [g => { g.sommets.b.forme.dy = Infinity; }, 'NOMBRE_NON_FINI', '.forme.dy'],
    [g => { g.sommets.b.forme.dx = -1; }, 'DIMENSION_INVALIDE', '.forme.dx'],
    [g => { g.sommets.b.connexions[0].y = -Infinity; }, 'NOMBRE_NON_FINI', '.connexions[0].y'],
    [g => { g.sommets.b.connexions = []; }, 'CONNEXIONS_INVALIDES', '.connexions'],
    [g => { g.chemins[0].listeDePas[0].distance = NaN; }, 'NOMBRE_NON_FINI', 'arc-1'],
    [g => { g.chemins[0].listeDePas[0].type = 'diagonal'; }, 'PAS_INVALIDE', 'arc-1'],
  ];
  for (const verifier of verificateurs) {
    for (const [modifier, code, chemin] of mutations) {
      const g = graphe();
      modifier(g);
      diagnostic(() => verifier(g), code, chemin);
    }
  }
  diagnostic(() => calculerDestination({ x: Infinity, y: 0 }, []), 'NOMBRE_NON_FINI', 'depart.x');
  diagnostic(() => calculerDestination({ x: 1e308, y: 0 }, [pas('horizontal', 1e308)]), 'NOMBRE_NON_FINI', 'destination.x');
  diagnostic(() => creerPlacement(forme('a', 'rectangle', 1e308), { x: 1e308, y: 0 }), 'NOMBRE_NON_FINI', 'xMax');
});

test('geometrie-identifiants-speciaux', () => {
  const g = graphe();
  g.sommets = Object.fromEntries([['__proto__', g.sommets.a], ['constructor', g.sommets.b]]);
  g.chemins[0].debut = '__proto__';
  g.chemins[0].fin = 'constructor';
  for (const verifier of verificateurs) assert.deepEqual(verifier(g), []);
});

test('connexions-integration-diagramme-reference', async () => {
  const g = await importerFichierDiagramme(new URL('../diagram.json', import.meta.url));
  const before = structuredClone(g);
  assert.equal(Object.keys(g.sommets).length, 18);
  for (const f of Object.values(g.sommets)) {
    const pl = creerPlacement(f, f.position, g.arretes);
    assert.deepEqual(pl.p, f.position);
    if (f.type === 'rectangle') contour(pl);
    else {
      assert.equal(pl.connexions.length, 4);
      assert.deepEqual(pl.connexions, [
        { x: pl.p.x + f.dx / 2, y: pl.p.y }, { x: pl.p.x + f.dx, y: pl.p.y + f.dy / 2 },
        { x: pl.p.x + f.dx / 2, y: pl.p.y + f.dy }, { x: pl.p.x, y: pl.p.y + f.dy / 2 },
      ]);
    }
  }
  // structuredClone normalise le prototype du dictionnaire à prototype nul.
  assert.deepEqual(structuredClone(g), before);
  assert.equal(Object.getPrototypeOf(g.sommets), null);
});
