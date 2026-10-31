import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ErreurImportDiagramme, importerDiagramme, importerFichierDiagramme, parserDiagramme,
} from '../dist/server/importer.js';

function node(id = 'a', type = 'activityActionNode') {
  return { id, type, width: 120, height: 60, position: { x: -10, y: 20 }, data: { name: 'Action' } };
}

function edge(id = 'e', source = 'a', target = 'b') {
  return { id, source, target, type: 'ActivityControlFlow', data: { label: 'oui' } };
}

function diagram() {
  return { nodes: [node('a'), node('b')], edges: [edge()] };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function diagnostic(input, code, path) {
  const before = structuredClone(input);
  freeze(input);
  assert.throws(() => importerDiagramme(input), (error) => {
    assert.ok(error instanceof ErreurImportDiagramme);
    assert.equal(error.code, code);
    assert.equal(error.chemin, path);
    assert.ok(error.message.includes(code) && error.message.includes(path));
    return true;
  });
  assert.deepEqual(input, before, 'une entrée rejetée ne doit pas être modifiée');
}

test('diagram-reference', async () => {
  const url = new URL('../diagram.json', import.meta.url);
  const before = await readFile(url, 'utf8');
  const original = JSON.parse(before);
  const g = await importerFichierDiagramme(url);
  assert.equal(Object.keys(g.sommets).length, 18);
  assert.equal(g.arretes.length, 24);
  assert.deepEqual(new Set(Object.keys(g.sommets)), new Set(original.nodes.map(n => n.id)));
  const types = { activityInitialNode: 'ovale', activityActionNode: 'rectangle', activityMergeNode: 'losange' };
  for (const n of original.nodes) {
    const f = g.sommets[n.id];
    assert.equal(f.id, n.id);
    assert.equal(f.type, types[n.type]);
    assert.equal(f.dx, n.width);
    assert.equal(f.dy, n.height);
    assert.equal(f.label, n.type === 'activityInitialNode' ? 'Début' : n.data.name);
    assert.deepEqual(f.position, n.position);
    assert.deepEqual(f.metadata, n);
  }
  assert.deepEqual(g.arretes.map(a => a.id), original.edges.map(e => e.id));
  original.edges.forEach((e, i) => {
    const a = g.arretes[i];
    assert.equal(a.debut, e.source);
    assert.equal(a.fin, e.target);
    assert.equal(a.label, e.data.label ?? '');
    assert.equal(a.sourceHandle, e.sourceHandle);
    assert.equal(a.targetHandle, e.targetHandle);
    assert.deepEqual(a.sourceAnchor, e.data.sourceAnchor);
    assert.deepEqual(a.targetAnchor, e.data.targetAnchor);
    assert.deepEqual(a.points, e.data.points);
    assert.deepEqual(a.metadata, e);
  });
  const { nodes, edges, ...extras } = original;
  assert.deepEqual(g.metadata, extras);
  // Ce cycle de cinq arcs doit rester orienté et fermé après import.
  const cycle = [
    '49950944-cc1c-403f-9fa2-a8a92c5afc0a', '7fa714ee-c6b2-4795-bab1-3087eada86ae',
    '980d2b72-408c-44e7-b2c7-dfc2d9ad38cf', '2026ec34-78d2-4d5c-88a3-94043b0bab6e',
    '1c5ee04a-f4de-4c0d-95b0-34c83cd29d02', '49950944-cc1c-403f-9fa2-a8a92c5afc0a',
  ];
  for (let i = 1; i < cycle.length; i++) {
    assert.ok(g.arretes.some(a => a.debut === cycle[i - 1] && a.fin === cycle[i]));
  }
  assert.equal(await readFile(url, 'utf8'), before, 'le fichier source reste identique');
});

test('formes-et-dimensions', () => {
  const input = { nodes: [node('action'), node('decision', 'activityDecisionNode'),
    node('merge', 'activityMergeNode'), node('initial', 'activityInitialNode')], edges: [] };
  input.nodes[0].width = 12.5;
  input.nodes[0].height = 7.25;
  input.nodes[0].measured = { width: 13, height: 8 };
  const g = importerDiagramme(input);
  assert.deepEqual(Object.values(g.sommets).map(f => f.type), ['rectangle', 'losange', 'losange', 'ovale']);
  assert.equal(g.sommets.action.dx, 12.5);
  assert.equal(g.sommets.action.dy, 7.25);
  assert.deepEqual(g.sommets.action.metadata.measured, { width: 13, height: 8 });
});

test('arcs-paralleles', () => {
  const input = diagram();
  input.edges.push({ ...edge('second'), data: { label: 'non' } });
  const g = importerDiagramme(input);
  assert.deepEqual(g.arretes.map(a => [a.id, a.debut, a.fin, a.label]),
    [['e', 'a', 'b', 'oui'], ['second', 'a', 'b', 'non']]);
});

test('cycle-et-boucle', () => {
  const input = diagram();
  input.edges.push(edge('retour', 'b', 'a'), edge('boucle', 'a', 'a'));
  const g = importerDiagramme(input);
  assert.deepEqual(g.arretes.map(a => [a.id, a.debut, a.fin]),
    [['e', 'a', 'b'], ['retour', 'b', 'a'], ['boucle', 'a', 'a']]);
});

test('noeud-isole', () => {
  const input = diagram();
  input.nodes.push(node('isole'));
  delete input.nodes[2].position;
  delete input.nodes[2].data;
  const g = importerDiagramme(input);
  assert.equal(Object.keys(g.sommets).length, 3);
  assert.equal(g.sommets.isole.id, 'isole');
  assert.equal(g.sommets.isole.label, '');
  assert.equal(g.sommets.isole.position, undefined);
  assert.equal(g.arretes.length, 1);
});

test('tableaux-vides', () => {
  const g = parserDiagramme('{"nodes":[],"edges":[]}');
  assert.deepEqual(Object.keys(g.sommets), []);
  assert.deepEqual(g.arretes, []);
  assert.deepEqual(g.metadata, {});
});

test('libelles-unicode-multilignes', () => {
  const input = diagram();
  input.nodes[0].data.name = 'Décider <&> « été »\nDeuxième ligne\n';
  input.edges[0].data.label = 'oui, confirmé\nà vérifier';
  const g = parserDiagramme(JSON.stringify(input));
  assert.equal(g.sommets.a.label, 'Décider <&> « été »\nDeuxième ligne\n');
  assert.equal(g.arretes[0].label, 'oui, confirmé\nà vérifier');
  delete input.edges[0].data;
  assert.equal(importerDiagramme(input).arretes[0].label, '');
});

test('json-mal-forme', () => {
  for (const input of ['{"nodes": [', '', '{"nodes":[],"edges":[],}']) {
    assert.throws(() => parserDiagramme(input), { name: 'ErreurImportDiagramme', code: 'JSON_INVALIDE', chemin: '$' });
  }
});

test('identifiants-invalides-et-dupliques', () => {
  const duplicateNode = diagram();
  duplicateNode.nodes.push(node('a'));
  diagnostic(duplicateNode, 'IDENTIFIANT_DUPLIQUE', '$.nodes[2].id');
  const duplicateEdge = diagram();
  duplicateEdge.edges.push(edge());
  diagnostic(duplicateEdge, 'IDENTIFIANT_DUPLIQUE', '$.edges[1].id');
  const sharedId = diagram();
  sharedId.edges[0].id = 'a';
  diagnostic(sharedId, 'IDENTIFIANT_DUPLIQUE', '$.edges[0].id');
  for (const id of ['', '  ', 5, null]) {
    const input = diagram();
    input.nodes[0].id = id;
    diagnostic(input, 'IDENTIFIANT_INVALIDE', '$.nodes[0].id');
  }
});

test('references-absentes', () => {
  for (const key of ['source', 'target']) {
    const input = diagram();
    input.edges[0][key] = 'absent';
    diagnostic(input, 'REFERENCE_ABSENTE', `$.edges[0].${key}`);
  }
});

test('dimensions-invalides', () => {
  for (const key of ['width', 'height']) {
    for (const value of [0, -1, Infinity, -Infinity, NaN, '60', null, undefined]) {
      const input = diagram();
      if (value === undefined) delete input.nodes[0][key];
      else input.nodes[0][key] = value;
      diagnostic(input, 'DIMENSION_INVALIDE', `$.nodes[0].${key}`);
    }
    const input = diagram();
    input.nodes[0].measured = { [key]: 0 };
    diagnostic(input, 'DIMENSION_INVALIDE', `$.nodes[0].measured.${key}`);
  }
});

test('types-non-pris-en-charge', () => {
  for (const collection of ['nodes', 'edges']) {
    for (const type of ['inconnu', null, undefined, '__proto__']) {
      const input = diagram();
      if (type === undefined) delete input[collection][0].type;
      else input[collection][0].type = type;
      diagnostic(input, 'TYPE_NON_PRIS_EN_CHARGE', `$.${collection}[0].type`);
    }
  }
});

test('structure-invalide', () => {
  for (const input of [null, [], 'texte', 42]) diagnostic(input, 'STRUCTURE_INVALIDE', '$');
  for (const key of ['nodes', 'edges']) {
    for (const value of [undefined, {}, null, 'tableau']) {
      const input = diagram();
      if (value === undefined) delete input[key];
      else input[key] = value;
      diagnostic(input, 'STRUCTURE_INVALIDE', `$.${key}`);
    }
  }
  const invalidLabel = diagram();
  invalidLabel.nodes[0].data.name = 42;
  diagnostic(invalidLabel, 'STRUCTURE_INVALIDE', '$.nodes[0].data.name');
  const invalidEdgeLabel = diagram();
  invalidEdgeLabel.edges[0].data.label = false;
  diagnostic(invalidEdgeLabel, 'STRUCTURE_INVALIDE', '$.edges[0].data.label');
  for (const key of ['nodes', 'edges']) {
    const input = diagram();
    input[key] = Array(1); // Une entrée objet peut contenir un tableau creux, contrairement à un texte JSON.
    diagnostic(input, 'STRUCTURE_INVALIDE', `$.${key}[0]`);
  }
});

test('indications-spatiales', () => {
  const input = diagram();
  Object.assign(input.edges[0], { sourceHandle: 'bottom', targetHandle: null });
  Object.assign(input.edges[0].data, {
    sourceAnchor: { side: 'top', ratio: 0 }, targetAnchor: { side: 'right', ratio: 1 },
    points: [{ x: -12.5, y: 32 }, { x: 45, y: 32 }], custom: { preserved: true },
  });
  const a = importerDiagramme(input).arretes[0];
  assert.equal(a.sourceHandle, 'bottom');
  assert.equal(a.targetHandle, null);
  assert.deepEqual(a.sourceAnchor, { side: 'top', ratio: 0 });
  assert.deepEqual(a.targetAnchor, { side: 'right', ratio: 1 });
  assert.deepEqual(a.points, input.edges[0].data.points);
  assert.deepEqual(a.metadata, input.edges[0]);
  const malformed = [
    [d => { d.nodes[0].position.x = 'x'; }, '$.nodes[0].position.x'],
    [d => { d.edges[0].sourceHandle = 3; }, '$.edges[0].sourceHandle'],
    [d => { d.edges[0].data.sourceAnchor = { side: 'diagonal', ratio: 0.5 }; }, '$.edges[0].data.sourceAnchor.side'],
    [d => { d.edges[0].data.targetAnchor = { side: 'left', ratio: 1.1 }; }, '$.edges[0].data.targetAnchor.ratio'],
    [d => { d.edges[0].data.points = {}; }, '$.edges[0].data.points'],
    [d => { d.edges[0].data.points = [{ x: 0 }]; }, '$.edges[0].data.points[0].y'],
  ];
  for (const [change, path] of malformed) {
    const d = diagram();
    change(d);
    diagnostic(d, 'STRUCTURE_INVALIDE', path);
  }
});

test('absence-mutation-et-alias', () => {
  const input = diagram();
  input.extra = { nested: ['conserver'] };
  input.edges[0].data.points = [{ x: 0, y: 1 }];
  input.edges[0].data.sourceAnchor = { side: 'left', ratio: 0.5 };
  const before = structuredClone(input);
  const g = importerDiagramme(freeze(input));
  g.sommets.a.position.x = 999;
  g.sommets.a.metadata.position.y = 999;
  g.sommets.a.metadata.data.name = 'modifié';
  g.arretes[0].points[0].x = 999;
  g.arretes[0].sourceAnchor.ratio = 0;
  g.arretes[0].metadata.data.points[0].y = 999;
  g.metadata.extra.nested.push('modifié');
  assert.deepEqual(input, before);
  assert.deepEqual(g.arretes[0].metadata.data.sourceAnchor, { side: 'left', ratio: 0.5 });
});

test('identifiants-et-metadonnees-speciaux', () => {
  const input = diagram();
  input.nodes = [node('__proto__'), node('constructor'), node('toString')];
  input.edges = [edge('special', '__proto__', 'constructor')];
  input.extra = JSON.parse('{"__proto__":{"preserved":true}}');
  const g = importerDiagramme(input);
  assert.equal(Object.keys(g.sommets).length, 3);
  assert.equal(g.sommets.__proto__.id, '__proto__');
  assert.equal(g.sommets.constructor.id, 'constructor');
  assert.equal(g.sommets.toString.id, 'toString');
  assert.deepEqual(g.metadata.extra, input.extra);
  assert.equal(Object.getPrototypeOf(g.metadata.extra), Object.prototype);
  assert.equal(g.arretes[0].debut, '__proto__');
});

test('metadonnees-non-json', () => {
  for (const value of [undefined, NaN, Infinity, 1n]) {
    const input = diagram();
    input.extra = value;
    diagnostic(input, 'JSON_INVALIDE', '$.extra');
  }
  const input = diagram();
  input.extra = input;
  assert.throws(() => importerDiagramme(input), { code: 'JSON_INVALIDE' });
  assert.equal(input.extra, input);
});

test('import-nom-initial-presentation-et-noms-personnalises', () => {
  for (const name of [undefined, '', '  ', 'ActivityInitialNode', 'activityInitialNode', ' ActivityInitialNode ', 'Départ personnalisé\nÉté']) {
    const initial = node('initial', 'activityInitialNode');
    initial.data = name === undefined ? {} : { name };
    const action = node('action', 'activityActionNode');
    action.data.name = 'ActivityInitialNode';
    const input = { nodes: [initial, action], edges: [] };
    const before = structuredClone(input);
    const g = importerDiagramme(input);
    assert.equal(g.sommets.initial.label, name?.startsWith('Départ') ? name : 'Début');
    assert.equal(g.sommets.initial.type, 'ovale');
    assert.equal(g.sommets.action.label, 'ActivityInitialNode', 'la substitution est limitée au nœud initial');
    assert.deepEqual(g.sommets.initial.metadata, initial, 'le nom source reste consultable');
    assert.deepEqual(input, before);
  }
});

test('import-noeud-final-nom-par-defaut-personnalise-et-metadonnees', () => {
  for (const name of [undefined, '', '  ', 'ActivityFinalNode', 'activityFinalNode', ' ActivityFinalNode ', 'Terminé\nÉté & <fin>']) {
    const final = node('final', 'activityFinalNode');
    final.data = name === undefined ? {} : { name };
    const action = node('action'); action.data.name = 'ActivityFinalNode';
    const input = { nodes: [final, action], edges: [] };
    const before = structuredClone(input);
    const g = importerDiagramme(freeze(input));
    assert.equal(g.sommets.final.type, 'ovale');
    assert.equal(g.sommets.final.label, name?.startsWith('Terminé') ? name : 'Fin');
    assert.equal(g.sommets.final.dx, final.width);
    assert.equal(g.sommets.final.dy, final.height);
    assert.deepEqual(g.sommets.final.metadata, final);
    assert.equal(g.sommets.action.label, 'ActivityFinalNode');
    assert.deepEqual(input, before);
    assert.notEqual(g.sommets.final.metadata, final);
  }
  const sansData = node('final', 'activityFinalNode'); delete sansData.data;
  assert.equal(importerDiagramme({ nodes: [sansData], edges: [] }).sommets.final.label, 'Fin');
});
