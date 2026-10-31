import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { chromium } from 'playwright';
import { convertirDiagramme, convertirJson, ErreurConversion } from '../dist/server/conversion.js';
import { importerDiagramme } from '../dist/server/importer.js';
import { preparer } from './svg-fixtures.mjs';
import { calculerPlacements, computeSpatialGraphe, rendreSvg, verifierChemin, verifierPlacement, verifierPlacementChemin } from '../dist/server/graphe.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const reference = join(root, 'diagram.json');
const cli = join(root, 'dist/server/convertir.js');
const node = id => ({ id, type: 'activityActionNode', width: 100, height: 40, data: { name: 'Été & <suite>\nÀ bientôt 👩‍💻' } });
const diagramme = () => ({ nodes: ['a', 'b', 'c'].map(node), edges: [
  { id: 'ab', source: 'a', target: 'b', type: 'ActivityControlFlow', data: { label: 'oui' } },
] });

function commande(source, destination, fault) {
  const flags = fault ? ['--experimental-test-module-mocks', '--import', join(root, 'tests/conversion-faults.mjs')] : [];
  const result = spawnSync(process.execPath, [...flags, cli, source, destination], {
    cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, ...(fault ? { DIAGRAM_TEST_FAULT: fault } : {}) },
  });
  assert.ifError(result.error); assert.equal(result.signal, null);
  return result;
}

async function temporaire(action) {
  const before = await readFile(reference);
  const dir = await mkdtemp(join(tmpdir(), 'diagrams-conversion-'));
  try { await action(dir); }
  finally {
    try { assert.deepEqual(await readFile(reference), before, 'diagram.json doit rester intact'); }
    finally { await rm(dir, { recursive: true, force: true }); }
  }
}

async function echec({ contenu, absent = false, message, fault }) {
  await temporaire(async dir => {
    const source = join(dir, 'source.json'); const destination = join(dir, 'sortie.svg');
    if (!absent) await writeFile(source, contenu ?? JSON.stringify(diagramme()), 'utf8');
    const avant = absent ? null : await readFile(source);
    for (const preexiste of [false, true]) {
      if (preexiste) await writeFile(destination, 'sortie précédente', 'utf8');
      const result = commande(source, destination, fault);
      assert.equal(result.status, 1); assert.match(result.stderr, message);
      assert.doesNotMatch(result.stdout, /SVG généré/);
      if (preexiste) assert.equal(await readFile(destination, 'utf8'), 'sortie précédente');
      else await assert.rejects(readFile(destination), { code: 'ENOENT' });
      assert.deepEqual((await readdir(dir)).sort(), [
        ...(absent ? [] : ['source.json']), ...(preexiste ? ['sortie.svg'] : []),
      ].sort(), 'aucun fichier ou dossier temporaire résiduel');
      if (!absent) assert.deepEqual(await readFile(source), avant);
    }
  });
}

test('conversion-service-memoire-equivalence-et-immuabilite', async () => {
  const document = diagramme(); const snapshot = structuredClone(document);
  const svg = convertirDiagramme(document);
  const g = importerDiagramme(document);
  assert.equal(svg, rendreSvg(computeSpatialGraphe(g, { dispositionCompacte: true }), calculerPlacements(g, true).textes, g.arretes));
  assert.equal(convertirDiagramme(document, { dispositionCompacte: false }), preparer(g).svg);
  assert.equal(svg, convertirJson(JSON.stringify(document)));
  assert.deepEqual(document, snapshot);
  assert.match(svg, /Été &amp; &lt;suite&gt;/); assert.match(svg, /👩‍💻/);
  assert.match(convertirDiagramme({ nodes: [], edges: [] }), /<svg /);
});

test('conversion-service-diagnostics-json-import-calcul', () => {
  for (const [action, etape, message] of [
    [() => convertirJson('{'), 'json', /JSON_INVALIDE/],
    [() => convertirDiagramme({}), 'import', /STRUCTURE_INVALIDE.*\$\.nodes/],
    [() => convertirDiagramme(diagramme(), { maxEtats: 1 }), 'calcul', /BUDGET_ROUTAGE_DEPASSE/],
  ]) {
    assert.throws(action, error => {
      assert.ok(error instanceof ErreurConversion); assert.equal(error.etape, etape);
      assert.ok(error.cause instanceof Error); assert.match(error.message, message); return true;
    });
  }
});

test('conversion-cli-commande-documentee-utf8-et-service', async () => {
  await temporaire(async dir => {
    const destination = join(dir, 'diagram.svg');
    // Commande exacte documentée, après compilation par scripts/test.mjs.
    const result = commande('diagram.json', destination);
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.match(result.stdout, /SVG généré/);
    const bytes = await readFile(destination);
    const svg = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.match(svg, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.equal(svg, convertirJson(await readFile(reference, 'utf8')));
    const doc = new DOMParser({ onError: level => { throw new Error(`XML ${level}`); } }).parseFromString(svg, 'image/svg+xml');
    assert.equal(doc.documentElement.namespaceURI, 'http://www.w3.org/2000/svg');
    const groupes = [...doc.getElementsByTagName('g')];
    assert.equal(groupes.filter(e => e.getAttribute('class') === 'noeud').length, 18);
    assert.equal(groupes.filter(e => e.getAttribute('class') === 'arc').length, 24);
    assert.deepEqual(await readdir(dir), ['diagram.svg']);
  });
});

test('conversion-cli-svg-ouverture-navigateur', { timeout: 60000 }, async () => {
  await temporaire(async dir => {
    const destination = join(dir, 'diagram.svg');
    assert.equal(commande(reference, destination).status, 0);
    let browser;
    try {
      browser = await chromium.launch({ timeout: 20000 });
      const page = await browser.newPage({ offline: true });
      await page.goto(pathToFileURL(destination).href);
      assert.equal(await page.locator('parsererror').count(), 0);
      assert.equal(await page.locator('.noeud').count(), 18);
      assert.equal(await page.locator('.arc').count(), 24);
      assert.equal(await page.evaluate(() => document.characterSet.toUpperCase()), 'UTF-8');
      assert.ok(await page.locator('svg').isVisible());
    } finally { if (browser) await browser.close(); }
  });
});

test('conversion-cli-lecture-inexistante', async () => {
  await echec({ absent: true, message: /Lecture impossible.*source\.json.*ENOENT/ });
});

test('conversion-cli-json-invalide', async () => {
  await echec({ contenu: '{invalid', message: /Conversion \(json\).*JSON_INVALIDE/ });
});

test('conversion-cli-diagramme-invalide', async () => {
  await echec({ contenu: '{"nodes":[],"edges":[{"id":"e","type":"ActivityControlFlow","source":"absent","target":"absent"}]}',
    message: /Conversion \(import\).*REFERENCE_ABSENTE.*\$\.edges\[0\]\.source/ });
});

test('conversion-cli-erreur-geometrique-controlee', async () => {
  const document = diagramme(); document.nodes[0].width = Number.MAX_VALUE;
  await echec({ contenu: JSON.stringify(document), message: /Conversion \(calcul\).*PRECISION_INSUFFISANTE.*sommets/ });
});

test('conversion-cli-refus-chemin-invalide', async () => {
  await echec({ fault: 'chemin', message: /Conversion \(validation\).*CONFLITS_GEOMETRIQUES.*"verifierChemin":\[\{/ });
});

test('conversion-cli-refus-placements-superposes', async () => {
  await echec({ fault: 'placement', message: /Conversion \(validation\).*"verifierPlacement":\[\["a","c"\]\]/ });
});

test('conversion-cli-refus-chemin-traversant-forme', async () => {
  await echec({ fault: 'obstacle', message: /Conversion \(validation\).*"verifierPlacementChemin":\[\["ab","c"\]\]/ });
});

test('conversion-cli-diagnostic-rendu', async () => {
  await echec({ fault: 'rendu', message: /Conversion \(rendu\).*RENDU_CONTROLE/ });
});

test('conversion-cli-ecriture-interrompue-atomique', async () => {
  await echec({ fault: 'ecriture', message: /Écriture impossible.*sortie\.svg.*ENOSPC/ });
});

test('conversion-cli-destination-inaccessible', async () => {
  await temporaire(async dir => {
    const source = join(dir, 'source.json');
    await writeFile(source, JSON.stringify(diagramme()), 'utf8');
    const avant = await readFile(source);
    const destination = join(dir, 'absent', 'sortie.svg');
    const result = commande(source, destination);
    assert.equal(result.status, 1); assert.match(result.stderr, /Écriture impossible.*sortie\.svg.*ENOENT/);
    await assert.rejects(readFile(destination), { code: 'ENOENT' });
    const dossier = join(dir, 'destination.svg'); await mkdir(dossier);
    const refus = commande(source, dossier);
    assert.equal(refus.status, 1); assert.match(refus.stderr, /Écriture impossible.*destination\.svg.*EISDIR/);
    assert.deepEqual(await readdir(dossier), []);
    assert.deepEqual((await readdir(dir)).sort(), ['destination.svg', 'source.json']);
    assert.deepEqual(await readFile(source), avant);
  });
});

test('conversion-cli-refus-destination-source', async () => {
  await temporaire(async () => {
    for (const destination of [reference, resolve(root, 'src', '..', 'diagram.json')]) {
      const result = commande(reference, destination);
      assert.equal(result.status, 1); assert.match(result.stderr, /DESTINATION_IDENTIQUE/);
      assert.doesNotMatch(result.stdout, /SVG généré/);
    }
  });
});

test('conversion-cli-refus-alias-source', async () => {
  await temporaire(async dir => {
    const source = join(dir, 'source.json'); await writeFile(source, JSON.stringify(diagramme()), 'utf8');
    const avant = await readFile(source);
    for (const [nom, creer] of [['symbolique.svg', symlink], ['physique.svg', link]]) {
      const alias = join(dir, nom); await creer(source, alias);
      const result = commande(source, alias);
      assert.equal(result.status, 1); assert.match(result.stderr, /DESTINATION_IDENTIQUE/);
      assert.deepEqual(await readFile(alias), avant);
    }
    assert.deepEqual(await readFile(source), avant);
  });
});

test('conversion-cli-remplacement-destination-et-chemins-espaces', async () => {
  await temporaire(async dir => {
    const source = join(dir, 'entrée été.json'); const destination = join(dir, 'présentation finale.svg');
    const json = JSON.stringify(diagramme()); await writeFile(source, json, 'utf8');
    await writeFile(destination, 'ancien fichier', 'utf8');
    const result = commande(source, destination);
    assert.equal(result.status, 0); assert.equal(await readFile(destination, 'utf8'), convertirJson(json));
    assert.equal(await readFile(source, 'utf8'), json);
    assert.equal((await readdir(dir)).length, 2);
  });
});

test('conversion-cli-arguments-invalides', () => {
  for (const args of [[], ['diagram.json'], ['diagram.json', 'sortie.svg', 'extra'], ['', 'sortie.svg']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 20000 });
    assert.ifError(result.error); assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage.*source\.json.*destination\.svg/);
  }
});

test('conversion-disposition-compacte-reference-connexions-et-conflits', async () => {
  const document = JSON.parse(await readFile(reference, 'utf8'));
  const before = structuredClone(document);
  const g = importerDiagramme(document);
  const spatial = computeSpatialGraphe(g, { dispositionCompacte: true });
  assert.equal(Object.keys(spatial.sommets).length, 18);
  assert.equal(spatial.chemins.length, 24);
  assert.deepEqual(verifierChemin(spatial, 1e-12), []);
  assert.deepEqual(verifierPlacement(spatial), []);
  assert.deepEqual(verifierPlacementChemin(spatial), []);
  for (const pl of Object.values(spatial.sommets)) {
    if (pl.forme.type !== 'rectangle') assert.equal(pl.connexions.length, 4);
  }
  assert.ok(Object.values(spatial.sommets).some(pl => pl.forme.type === 'rectangle' && pl.connexions.length > 4));
  const dimensions = svg => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement.getAttribute('viewBox').split(' ').map(Number).slice(2);
  const compact = convertirDiagramme(document);
  const [w, h] = dimensions(compact);
  assert.ok(w / h > .6 && w / h < 2.5, 'cadrage équilibré pour une fenêtre de présentation');
  const [oldW, oldH] = dimensions(convertirDiagramme(document, { dispositionCompacte: false }));
  assert.ok(w * h < oldW * oldH * .4, 'au moins 60 % de surface vide évitée sur le diagramme fourni');
  assert.equal(compact, rendreSvg(spatial, calculerPlacements(g, true).textes, g.arretes));
  assert.deepEqual(document, before);
});
