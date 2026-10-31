import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { rendreSvg, REGLES_TEXTE, REGLES_SVG, verifierChemin, verifierPlacement, verifierPlacementChemin } from '../dist/server/graphe.js';
import { forme, arc, graphe, preparer, reference, negatif, hostile, points, croisements, entrelaces } from './svg-fixtures.mjs';

function parser(svg) {
  const doc = new DOMParser({ onError: (niveau, message) => {
    // U+FFFD est un caractère XML valide ; xmldom signale sa présence par heuristique.
    if (niveau === 'warning' && message.startsWith('Unicode replacement character detected')) return;
    throw new Error(`${niveau}: ${message}`);
  } }).parseFromString(svg, 'image/svg+xml');
  assert.equal(doc.documentElement.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(doc.documentElement.localName, 'svg');
  return doc;
}
const elements = (root, nom) => [...root.getElementsByTagName(nom)];
const classe = (root, nom) => elements(root, '*').filter(e => e.getAttribute('class')?.split(' ').includes(nom));
const box = e => Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number(e.getAttribute(k))]));
function separes(a, b, marge = 0) {
  return a.x + a.width <= b.x - marge || b.x + b.width <= a.x - marge || a.y + a.height <= b.y - marge || b.y + b.height <= a.y - marge;
}
function etiquettesLibres(doc, spatial) {
  const boites = classe(doc, 'fond-libelle').map(box);
  const formes = Object.values(spatial.sommets).map(pl => ({ x: pl.p.x, y: pl.p.y, width: pl.forme.dx, height: pl.forme.dy }));
  for (const [i, a] of boites.entries()) {
    for (const b of formes) assert.ok(separes(a, b, REGLES_SVG.margeLibelle - 1e-7), 'libellé trop près d’une forme');
    for (const b of boites.slice(i + 1)) assert.ok(separes(a, b, REGLES_SVG.margeLibelle - 1e-7), 'libellés superposés');
  }
  return boites;
}
function contient(doc, b, marge = REGLES_SVG.marge) {
  const [x, y, dx, dy] = doc.documentElement.getAttribute('viewBox').split(' ').map(Number);
  assert.ok(b.x >= x + marge - 1e-7 && b.y >= y + marge - 1e-7 && b.x + b.width <= x + dx - marge + 1e-7 && b.y + b.height <= y + dy - marge + 1e-7,
    `hors viewBox : ${JSON.stringify(b)}`);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('svg-croisements-halos-couleurs-et-geometrie-preservee', () => {
  const { spatial, textes, arcs, svg } = croisements(); const doc = parser(svg);
  assert.deepEqual(verifierChemin(spatial, 1e-12), []);
  assert.deepEqual(verifierPlacement(spatial), []);
  assert.deepEqual(verifierPlacementChemin(spatial), []);
  const avant = structuredClone(spatial);
  assert.equal(rendreSvg(freeze(spatial), textes, arcs), svg);
  assert.deepEqual(spatial, avant);
  const halos = classe(doc, 'halo-croisement'); const dessus = classe(doc, 'dessus-croisement');
  assert.equal(halos.length, 3); assert.equal(dessus.length, 3);
  assert.equal(classe(doc, 'croisements')[0].getAttribute('aria-hidden'), 'true');
  for (const [i, p] of dessus.entries()) {
    assert.equal(p.getAttribute('data-crossing-for'), `h${i}`);
    assert.equal(Number(p.getAttribute('data-x')), 100);
    assert.equal(Number(p.getAttribute('data-y')), (i + 1) * 80);
    assert.equal(p.getAttribute('d'), `M 95 ${(i + 1) * 80} L 105 ${(i + 1) * 80}`);
    assert.equal(p.getAttribute('d'), halos[i].getAttribute('d'));
    assert.equal(Number(halos[i].getAttribute('stroke-width')), 7);
    assert.equal(p.hasAttribute('marker-end'), false, 'aucune flèche ajoutée aux croisements');
    assert.equal(p.getAttribute('class'), `dessus-croisement${i < 2 ? ` branche-${i === 0 ? 'oui' : 'non'}` : ''}`);
    contient(doc, { x: 95, y: (i + 1) * 80 - 3.5, width: 10, height: 7 });
  }
  // Les vraies polylignes, leurs ports et leurs flèches restent les références.
  classe(doc, 'chemin').forEach((p, i) => {
    assert.deepEqual(p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number),
      points(spatial, spatial.chemins[i]).flatMap(p => [p.x, p.y]));
    assert.ok(p.hasAttribute('marker-end'));
  });
});

test('svg-croisements-excluent-ports-coudes-et-paralleles', () => {
  // La verticale touche ici l'extrémité ou le coude de l'autre chemin.
  // Un repère ferait croire à tort à un croisement sans connexion.
  for (const pas of [
    [{ type: 'horizontal', distance: 200 }],
    [{ type: 'horizontal', distance: 200 }, { type: 'vertical', distance: 160 }],
    [{ type: 'horizontal', distance: 420 }],
  ]) {
    const { spatial, textes, arcs } = croisements();
    spatial.chemins = [spatial.chemins[0], spatial.chemins[3]];
    const autre = spatial.chemins[1];
    // Connexion verticale déplacée à x=100, y=80 pour le contact au port.
    if (pas.length === 1 && pas[0].distance === 420) {
      spatial.sommets.haut.connexions[2] = { x: 100, y: 80 };
    } else spatial.chemins[0].listeDePas = pas;
    const doc = parser(rendreSvg(spatial, textes, [arcs[0], arcs[3]]));
    assert.equal(classe(doc, 'dessus-croisement').length, 0);
    assert.equal(classe(doc, 'halo-croisement').length, 0);
    // Deux segments parallèles proches ne sont jamais décorés.
    autre.listeDePas = [{ type: 'horizontal', distance: 420 }];
    assert.equal(classe(parser(rendreSvg(spatial, textes, [arcs[0], arcs[3]])), 'halo-croisement').length, 0);
  }
});

test('svg-diagram-xml-complet-conditions-en-legende', async () => {
  const { g, spatial, textes, svg } = await reference();
  const doc = parser(svg);
  const noeuds = classe(doc, 'noeud'); const arcs = classe(doc, 'arc'); const labels = classe(doc, 'libelle-arc');
  assert.equal(noeuds.length, 18); assert.equal(arcs.length, 24); assert.equal(labels.length, 12);
  for (const [id, pl] of Object.entries(spatial.sommets)) {
    const n = noeuds.find(n => n.getAttribute('data-node-id') === id);
    assert.ok(n); assert.equal(elements(n, 'title')[0].textContent, pl.forme.label);
    assert.deepEqual(elements(n, 'tspan').map(t => t.textContent), textes[id].lignes);
  }
  for (const a of g.arretes) {
    const n = arcs.find(n => n.getAttribute('data-arc-id') === a.id);
    const l = labels.find(n => n.getAttribute('data-label-for') === a.id);
    assert.ok(n); assert.equal(elements(n, 'title')[0].textContent, a.label);
    assert.equal(n.getAttribute('aria-label'), a.label);
    if (['oui', 'non'].includes(a.label)) assert.equal(l, undefined, 'condition regroupée dans la légende');
    else { assert.ok(l); assert.equal(elements(l, 'text')[0].textContent, a.label); }
  }
  assert.equal(classe(doc, 'texte-arc').filter(t => t.textContent === 'oui').length, 0);
  assert.equal(classe(doc, 'texte-arc').filter(t => t.textContent === 'non').length, 0);
  assert.deepEqual(classe(doc, 'texte-legende').map(t => t.textContent), ['Oui', 'Non']);
  assert.equal(classe(doc, 'branche-oui').filter(p => p.getAttribute('class').startsWith('chemin')).length, 6);
  assert.equal(classe(doc, 'branche-non').filter(p => p.getAttribute('class').startsWith('chemin')).length, 6);
});

test('svg-formes-connexions-et-fleches', async () => {
  const { g, spatial, svg } = await reference(); const doc = parser(svg);
  const n = classe(doc, 'noeud');
  for (const [id, pl] of Object.entries(spatial.sommets)) {
    const node = n.find(e => e.getAttribute('data-node-id') === id);
    const shape = classe(node, 'forme')[0];
    const cx = pl.p.x + pl.forme.dx / 2; const cy = pl.p.y + pl.forme.dy / 2;
    if (pl.forme.type === 'rectangle') {
      assert.equal(shape.tagName, 'rect'); assert.deepEqual(box(shape), { x: pl.p.x, y: pl.p.y, width: pl.forme.dx, height: pl.forme.dy });
    } else if (pl.forme.type === 'ovale') {
      assert.equal(shape.tagName, 'ellipse');
      assert.deepEqual(['cx', 'cy', 'rx', 'ry'].map(k => Number(shape.getAttribute(k))), [cx, cy, pl.forme.dx / 2, pl.forme.dy / 2]);
    } else {
      assert.equal(shape.tagName, 'polygon');
      assert.deepEqual(shape.getAttribute('points').split(' ').map(Number), [cx, pl.p.y, pl.p.x + pl.forme.dx, cy, cx, pl.p.y + pl.forme.dy, pl.p.x, cy]);
    }
  }
  const arcs = classe(doc, 'arc');
  for (const c of spatial.chemins) {
    const path = elements(arcs.find(e => e.getAttribute('data-arc-id') === c.arcId), 'path')[0];
    const coords = path.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
    const p = points(spatial, c);
    assert.deepEqual(coords, p.flatMap(p => [p.x, p.y]));
    assert.ok(spatial.sommets[c.fin].connexions.some(q => Math.hypot(q.x - p.at(-1).x, q.y - p.at(-1).y) < 1e-6));
    const label = g.arretes.find(a => a.id === c.arcId).label;
    const markerId = path.getAttribute('marker-end').match(/^url\(#([^\)]+)\)$/)[1];
    assert.match(markerId, label === 'oui' || label === 'non' ? new RegExp(`^fleche-${label}(?:-\\d+)?$`) : /^fleche(?:-piste-\d+)?$/);
    const marker = elements(doc, 'marker').find(e => e.getAttribute('id') === markerId);
    assert.equal(path.getAttribute('style'), `stroke: ${elements(marker, 'path')[0].getAttribute('fill')}`);
  }
  for (const marker of elements(doc, 'marker')) {
    assert.equal(marker.getAttribute('orient'), 'auto');
    assert.equal(marker.getAttribute('markerUnits'), 'userSpaceOnUse');
    assert.equal(marker.getAttribute('refX'), '20'); assert.equal(marker.getAttribute('refY'), '8');
    assert.match(elements(marker, 'path')[0].getAttribute('d'), /L 20 8/);
  }
});

test('svg-libelles-personnalises-sans-collision-et-legende-hors-geometrie', async () => {
  const { g, spatial, textes, svg } = await reference();
  const doc = parser(svg);
  assert.equal(classe(doc, 'fond-libelle').length, 0, 'aucune étiquette oui/non répétée');
  assert.equal(classe(doc, 'rappel').length, 0, 'aucun rappel de condition résiduel');
  const legendes = classe(doc, 'fond-legende').map(box);
  assert.equal(legendes.length, 2);
  legendes.forEach(b => contient(doc, { x: b.x - 1, y: b.y - 1, width: b.width + 2, height: b.height + 2 }));
  const arcs = structuredClone(g.arretes);
  ['Retour\nÉté', 'non disponible', 'oui/non'].forEach((label, i) => { arcs[i].label = label; });
  const personnalise = parser(rendreSvg(spatial, textes, arcs));
  const labels = etiquettesLibres(personnalise, spatial);
  assert.equal(labels.length, 3, 'les autres libellés restent affichés');
  for (const [i, label] of ['RetourÉté', 'non disponible', 'oui/non'].entries()) {
    const groupe = classe(personnalise, 'libelle-arc').find(e => e.getAttribute('data-label-for') === arcs[i].id);
    assert.equal(elements(groupe, 'text')[0].textContent, label);
  }
  for (const pl of Object.values(spatial.sommets)) {
    legendes.forEach(l => assert.ok(separes(l, { x: pl.p.x, y: pl.p.y, width: pl.forme.dx, height: pl.forme.dy }, 8)));
  }
  for (const c of spatial.chemins) {
    const p = points(spatial, c);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const segment = { x: Math.min(a.x, b.x) - 3, y: Math.min(a.y, b.y) - 3, width: Math.abs(a.x - b.x) + 6, height: Math.abs(a.y - b.y) + 6 };
      [...labels, ...legendes].forEach(label => assert.ok(separes(label, segment), 'un libellé ou la légende masque un chemin'));
    }
  }
  labels.forEach(b => contient(personnalise, { x: b.x - 1, y: b.y - 1, width: b.width + 2, height: b.height + 2 }));
});

test('svg-texte-placement-multiligne', () => {
  const label = 'Décision à Noël, été e\u0301 et 👩‍💻界\n\n' + 'Extraordinairement'.repeat(8) + '\n';
  const { spatial, textes, svg } = preparer(graphe(['rectangle', 'losange', 'ovale'].map(type => forme(type, { type, dx: 20, dy: 10, label }))));
  const doc = parser(svg);
  for (const n of classe(doc, 'noeud')) {
    const id = n.getAttribute('data-node-id'); const pl = spatial.sommets[id]; const t = textes[id];
    const spans = elements(n, 'tspan');
    assert.deepEqual(spans.map(s => s.textContent), t.lignes);
    assert.ok(spans.length > 5); assert.equal(spans.at(-1).textContent, '');
    for (const [i, span] of spans.entries()) {
      assert.equal(Number(span.getAttribute('x')), pl.p.x + pl.forme.dx / 2);
      if (t.largeurs[i]) {
        assert.equal(Number(span.getAttribute('textLength')), t.largeurs[i]);
        assert.equal(span.getAttribute('lengthAdjust'), 'spacingAndGlyphs');
      }
      if (i) assert.ok(Math.abs(Number(span.getAttribute('y')) - Number(spans[i - 1].getAttribute('y')) - REGLES_TEXTE.interligne) < 1e-6);
    }
  }
});

test('svg-viewbox-negatif-et-detours', () => {
  const { spatial, svg } = negatif(); const doc = parser(svg);
  assert.deepEqual(verifierChemin(spatial, 1e-12), []);
  assert.deepEqual(verifierPlacement(spatial), []); assert.deepEqual(verifierPlacementChemin(spatial), []);
  const [x, y] = doc.documentElement.getAttribute('viewBox').split(' ').map(Number);
  assert.ok(x < -900 && y < -900);
  for (const pl of Object.values(spatial.sommets)) contient(doc, { x: pl.p.x - 1, y: pl.p.y - 1, width: pl.forme.dx + 2, height: pl.forme.dy + 2 });
  for (const c of spatial.chemins) for (const p of points(spatial, c)) contient(doc, { x: p.x - 12, y: p.y - 12, width: 24, height: 24 });
  classe(doc, 'fond-libelle').forEach(e => { const b = box(e); contient(doc, { x: b.x - 1, y: b.y - 1, width: b.width + 2, height: b.height + 2 }); });
});

test('svg-xml-echappement-et-autonomie', () => {
  const { g, svg } = hostile(); const doc = parser(svg);
  assert.match(svg, /&amp;/); assert.match(svg, /&lt;script&gt;/); assert.match(svg, /&quot;/); assert.match(svg, /&apos;/);
  assert.equal(classe(doc, 'noeud')[0].getAttribute('data-node-id'), Object.keys(g.sommets).sort()[0]);
  for (const n of classe(doc, 'noeud')) {
    const id = n.getAttribute('data-node-id');
    assert.equal(n.getAttribute('aria-label'), g.sommets[id].label);
    assert.equal(elements(n, 'title')[0].textContent, g.sommets[id].label);
  }
  const labels = classe(doc, 'libelle-arc')[0];
  assert.equal(labels.getAttribute('data-label-for'), g.arretes[0].id);
  assert.equal(elements(labels, 'text')[0].textContent, g.arretes[0].label.replaceAll('\n', ''));
  const tags = new Set(['svg', 'title', 'desc', 'defs', 'marker', 'path', 'style', 'g', 'rect', 'ellipse', 'polygon', 'text', 'tspan']);
  for (const e of elements(doc, '*')) {
    assert.ok(tags.has(e.tagName), e.tagName);
    for (const attr of [...e.attributes]) assert.ok(!/^on|href$/i.test(attr.name), attr.name);
  }
  assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY/);
  assert.doesNotMatch(elements(doc, 'style')[0].textContent, /@import|url\(/);
  assert.equal(elements(doc, 'style').length, 1); assert.equal(elements(doc, 'marker').length, 3);
});

test('svg-branches-oui-non-casse-espaces-et-arcs-neutres', () => {
  const { spatial, textes } = preparer(graphe([forme('a'), forme('b')], [arc('branche', 'a', 'b')]));
  for (const [label, type, couleur] of [
    ['oui', 'oui', '#4ade80'], [' OUI\n', 'oui', '#4ade80'],
    ['non', 'non', '#f87171'], ['\tNon ', 'non', '#f87171'],
    ['', '', '#94a3b8'], ['oui/non', '', '#94a3b8'], ['sinon', '', '#94a3b8'],
    ['non disponible', '', '#94a3b8'], ['<oui>', '', '#94a3b8'],
  ]) {
    const doc = parser(rendreSvg(spatial, textes, [arc('branche', 'a', 'b', label)]));
    const path = classe(doc, 'chemin')[0];
    const markerId = `fleche${type ? `-${type}` : ''}`;
    assert.equal(path.getAttribute('marker-end'), `url(#${markerId})`, label);
    assert.equal(path.getAttribute('class'), `chemin${type ? ` branche-${type}` : ''}`, label);
    const marker = elements(doc, 'marker').find(e => e.getAttribute('id') === markerId);
    assert.equal(elements(marker, 'path')[0].getAttribute('fill'), couleur);
    assert.equal(classe(doc, 'arc')[0].getAttribute('aria-label'), label);
    assert.deepEqual(classe(doc, 'texte-legende').map(t => t.textContent), type ? [type === 'oui' ? 'Oui' : 'Non'] : []);
    assert.equal(classe(doc, 'libelle-arc').length, type ? 0 : 1);
    if (!type) assert.equal(classe(doc, 'texte-arc')[0].textContent, label);
    const coords = path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.deepEqual(coords, points(spatial, spatial.chemins[0]).flatMap(p => [p.x, p.y]));
  }
});

test('svg-xml-caracteres-invalides', () => {
  const { svg } = preparer(graphe([forme('id\u0000\ud800', { label: 'a\u0000b\ud800c\uffff\r\nÉté' })]));
  const doc = parser(svg);
  assert.equal(classe(doc, 'noeud')[0].getAttribute('data-node-id'), 'id��');
  assert.equal(elements(classe(doc, 'noeud')[0], 'title')[0].textContent, 'a�b�c�\nÉté');
});

test('svg-vide-et-labels-vides', () => {
  const vide = parser(rendreSvg({ sommets: {}, chemins: [] }, {}, []));
  assert.equal(classe(vide, 'noeud').length, 0); assert.equal(classe(vide, 'arc').length, 0);
  assert.deepEqual(vide.documentElement.getAttribute('viewBox').split(' ').map(Number), [-16, -16, 32, 32]);
  const { svg } = preparer(graphe([forme('a', { label: '' }), forme('b', { label: '' })], [arc('vide', 'a', 'b')]));
  const doc = parser(svg);
  assert.equal(classe(doc, 'texte-noeud').length, 2); assert.equal(classe(doc, 'texte-arc').length, 1);
  assert.equal(classe(doc, 'fond-libelle').length, 0);
});

test('svg-arcs-paralleles-boucles-identifiants', () => {
  const { svg, spatial } = preparer(graphe([forme('__proto__'), forme('constructor')], [
    arc('p1', '__proto__', 'constructor', 'Premier'), arc('p2', '__proto__', 'constructor', 'Deuxième'), arc('loop', 'constructor', 'constructor', 'Retour'),
  ]));
  const doc = parser(svg);
  assert.equal(classe(doc, 'arc').length, 3); assert.equal(new Set(classe(doc, 'chemin').map(e => e.getAttribute('d'))).size, 3);
  assert.deepEqual(classe(doc, 'texte-arc').map(e => e.textContent), ['Premier', 'Deuxième', 'Retour']);
  assert.equal(classe(doc, 'noeud')[0].getAttribute('data-node-id'), '__proto__');
  etiquettesLibres(doc, spatial);
});

test('svg-immuabilite-et-determinisme', async () => {
  const { g, spatial, textes, svg } = await reference();
  const avant = structuredClone({ g, spatial, textes });
  freeze(g); freeze(spatial); freeze(textes);
  assert.equal(rendreSvg(spatial, textes, g.arretes), svg); assert.equal(rendreSvg(spatial, textes, [...g.arretes].reverse()), svg);
  assert.deepEqual(structuredClone({ g, spatial, textes }), avant);
  assert.deepEqual(verifierChemin(spatial, 1e-12), []); assert.deepEqual(verifierPlacement(spatial), []); assert.deepEqual(verifierPlacementChemin(spatial), []);
});

test('svg-diagnostics-associations-manquantes', () => {
  const { g, spatial, textes } = preparer(graphe([forme('a'), forme('b')], [arc('ab', 'a', 'b', 'oui')]));
  assert.throws(() => rendreSvg(spatial, {}, g.arretes), /composition/);
  assert.throws(() => rendreSvg(spatial, textes, []), /libellé absent/);
  assert.throws(() => rendreSvg(spatial, textes, [...g.arretes, g.arretes[0]]), /libellé d.arc invalide/);
  assert.throws(() => rendreSvg(spatial, textes, [...g.arretes, arc('extra', 'a', 'b')]), /unique chemin/);
  const mauvais = structuredClone(spatial); mauvais.chemins[0].idx = 999;
  assert.throws(() => rendreSvg(mauvais, textes, g.arretes), /connexion/);
});

test('svg-libelles-denses-repli', () => {
  const { spatial, textes } = preparer(graphe([forme('a'), forme('b')], [arc('ab', 'a', 'b')]));
  const arcs = Array.from({ length: 50 }, (_, i) => arc(`dense-${i}`, 'a', 'b', `Libellé long ${i} : ` + 'été et réflexion '.repeat(5)));
  spatial.chemins = arcs.map(a => ({ ...structuredClone(spatial.chemins[0]), arcId: a.id }));
  const doc = parser(rendreSvg(spatial, textes, arcs));
  assert.equal(classe(doc, 'fond-libelle').length, 50);
  assert.ok(classe(doc, 'rappel').length > 0, 'repli exercé');
  const couches = [...doc.documentElement.childNodes].filter(n => n.nodeType === 1).map(e => e.getAttribute('class'));
  assert.ok(couches.indexOf('rappels') < couches.indexOf('noeuds'));
  assert.ok(couches.indexOf('rappels') < couches.indexOf('libelles'));
  for (const b of etiquettesLibres(doc, spatial)) contient(doc, b);
});

test('svg-arrondis-ports-proches-et-coins', () => {
  for (const ratio of [0, .01, .5, .99, 1]) {
    const { spatial, svg } = preparer(graphe([forme('a'), forme('b')], [
      { ...arc('ab', 'a', 'b'), sourceAnchor: { side: 'bottom', ratio }, targetAnchor: { side: 'top', ratio } },
    ]));
    const doc = parser(svg);
    for (const node of classe(doc, 'noeud')) {
      const shape = classe(node, 'forme')[0];
      const pl = spatial.sommets[node.getAttribute('data-node-id')];
      const radius = Number(shape.getAttribute('rx'));
      assert.ok(radius >= 0 && radius <= 12);
      for (const p of pl.connexions) {
        const x = p.x - pl.p.x; const y = p.y - pl.p.y;
        assert.ok((y === 0 || y === pl.forme.dy) ? x >= radius && x <= pl.forme.dx - radius : y >= radius && y <= pl.forme.dy - radius,
          'tous les ports restent sur le contour rectiligne après arrondi');
      }
      assert.equal(ratio === 0 || ratio === 1 ? radius === 0 : radius > 0, true);
    }
  }
});

// Lit les valeurs exportées, sans reproduire l'algorithme de coloration.
function encresExportees(svg) {
  const doc = parser(svg);
  const encres = Object.fromEntries(classe(doc, 'arc').map(a => {
    const path = classe(a, 'chemin')[0];
    const couleur = path.getAttribute('style').match(/^stroke: (#[0-9a-f]{6})$/)[1];
    const markerId = path.getAttribute('marker-end').match(/^url\(#([^\)]+)\)$/)[1];
    const marker = elements(doc, 'marker').find(e => e.getAttribute('id') === markerId);
    assert.equal(elements(marker, 'path')[0].getAttribute('fill'), couleur, 'pointe assortie au chemin');
    return [a.getAttribute('data-arc-id'), couleur];
  }));
  for (const p of classe(doc, 'dessus-croisement')) {
    assert.equal(p.getAttribute('style'), `stroke: ${encres[p.getAttribute('data-crossing-for')]}`, 'repère assorti à son arc');
  }
  return { doc, encres };
}

test('svg-croisements-six-pistes-distinctes-pointes-reperes-et-contraste', () => {
  const { spatial, svg } = entrelaces();
  const { doc, encres } = encresExportees(svg);
  assert.equal(classe(doc, 'dessus-croisement').length, 15, 'toutes les paires se croisent');
  assert.equal(new Set(Object.values(encres)).size, 6, 'chaque piste a une couleur différente de ses cinq voisines');
  const luminance = hex => {
    const [r, g, b] = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
      .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return r * .2126 + g * .7152 + b * .0722;
  };
  for (const couleur of Object.values(encres)) {
    assert.ok(!['#4ade80', '#f87171'].includes(couleur), 'rouge et vert réservés aux conditions');
    assert.ok((luminance(couleur) + .05) / (luminance('#0b1120') + .05) >= 4.5, 'piste contrastée sur fond sombre');
  }
  classe(doc, 'chemin').forEach((p, i) => assert.deepEqual(
    p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number), points(spatial, spatial.chemins[i]).flatMap(p => [p.x, p.y])));
});

test('svg-croisements-couleurs-stables-conditions-prioritaires-et-arcs-isoles', () => {
  const { spatial, textes, arcs } = entrelaces(6, [' OUI ', 'Non', 'oui', 'non', '', 'oui/non']);
  const avant = structuredClone({ spatial, textes, arcs });
  const { encres, doc } = encresExportees(rendreSvg(freeze(spatial), freeze(textes), freeze(arcs)));
  assert.equal(encres['piste-0'], '#4ade80'); assert.equal(encres['piste-2'], '#bbf7d0');
  assert.equal(encres['piste-1'], '#f87171'); assert.equal(encres['piste-3'], '#fecaca');
  assert.notEqual(encres['piste-4'], encres['piste-5']);
  assert.equal(classe(doc, 'dessus-croisement').length, 15, 'repères conservés entre branches de même condition aux nuances distinctes');
  const inverse = { ...spatial, chemins: [...spatial.chemins].reverse() };
  assert.deepEqual(encresExportees(rendreSvg(inverse, textes, [...arcs].reverse())).encres, encres);
  assert.deepEqual({ spatial, textes, arcs }, avant, 'les entrées restent intactes');
  // Un arc sans croisement ne reçoit aucune couleur superflue, même libellé.
  const isole = entrelaces(1, ['Suite']);
  assert.deepEqual(encresExportees(isole.svg).encres, { 'piste-0': '#94a3b8' });
});

test('svg-croisements-palette-saturee-reduit-les-collisions-sans-rouge-ni-vert', () => {
  const { svg } = entrelaces(7);
  const { doc, encres } = encresExportees(svg);
  assert.equal(classe(doc, 'dessus-croisement').length, 21);
  const couleurs = Object.values(encres);
  assert.equal(new Set(couleurs).size, 6);
  let identiques = 0;
  couleurs.forEach((c, i) => couleurs.slice(i + 1).forEach(d => { if (c === d) identiques++; }));
  assert.equal(identiques, 1, 'une seule paire identique au lieu de 21 avec le gris uniforme');
  assert.ok(couleurs.every(c => !['#4ade80', '#f87171'].includes(c)));
});

test('svg-noeud-final-quatre-ports-entrees-orientees-et-trois-verificateurs', async () => {
  const { importerDiagramme } = await import('../dist/server/importer.js');
  const document = { nodes: [
    ...['top', 'right', 'bottom', 'left'].map(id => ({ id, type: 'activityActionNode', width: 120, height: 60, data: { name: id } })),
    { id: 'fin', type: 'activityFinalNode', width: 30, height: 30, data: { name: 'ActivityFinalNode' } },
  ], edges: ['top', 'right', 'bottom', 'left'].map(side => ({ id: `vers-${side}`, type: 'ActivityControlFlow', source: side, target: 'fin',
    data: { label: side === 'top' ? ' OUI ' : side === 'right' ? 'Non' : '', targetAnchor: { side, ratio: .5 } } })) };
  const before = structuredClone(document);
  const { spatial, svg } = preparer(importerDiagramme(document));
  assert.deepEqual(verifierChemin(spatial, 1e-12), []);
  assert.deepEqual(verifierPlacement(spatial), []);
  assert.deepEqual(verifierPlacementChemin(spatial), []);
  const final = spatial.sommets.fin;
  const { x, y } = final.p; const { dx, dy } = final.forme;
  assert.deepEqual(final.connexions, [{ x: x + dx / 2, y }, { x: x + dx, y: y + dy / 2 },
    { x: x + dx / 2, y: y + dy }, { x, y: y + dy / 2 }]);
  spatial.chemins.forEach((c, i) => assert.deepEqual(points(spatial, c).at(-1), final.connexions[['top', 'right', 'bottom', 'left'].indexOf(c.debut)]));
  const doc = parser(svg);
  const finalSvg = classe(doc, 'noeud').find(n => n.getAttribute('data-node-id') === 'fin');
  assert.equal(finalSvg.getAttribute('aria-label'), 'Fin');
  assert.equal(classe(finalSvg, 'finale').length, 1);
  assert.equal(classe(finalSvg, 'contour-final').length, 1);
  assert.equal(classe(finalSvg, 'texte-noeud')[0].textContent, 'Fin');
  assert.equal(classe(doc, 'chemin').length, 4);
  assert.deepEqual(classe(doc, 'texte-legende').map(e => e.textContent), ['Oui', 'Non']);
  assert.deepEqual(document, before);
});
