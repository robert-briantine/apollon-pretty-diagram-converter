import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { chromium } from 'playwright';
import { convertirJson } from '../dist/server/conversion.js';
import { LIMITE_JSON } from '../dist/server/app.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const reference = await readFile(join(root, 'diagram.json'), 'utf8');
const petit = JSON.stringify({ nodes: ['a', 'b', 'c'].map(id => ({
  id, type: 'activityActionNode', width: 100, height: 40, data: { name: 'Été 👩‍💻' },
})), edges: [{ id: 'ab', type: 'ActivityControlFlow', source: 'a', target: 'b' }] });

const nettoyages = new WeakMap();
function nettoyerApres(t, action) {
  if (!nettoyages.has(t)) {
    const actions = []; nettoyages.set(t, actions);
    t.after(async () => {
      const erreurs = [];
      for (const nettoyer of actions) {
        try { await nettoyer(); } catch (error) { erreurs.push(error); }
      }
      if (erreurs.length) throw new AggregateError(erreurs, 'Échec du nettoyage des instances de test');
    });
  }
  nettoyages.get(t).push(action);
}

// Chaque cas dispose de son processus et le termine dans after, même en échec.
function lancer(t, { fault, host = '127.0.0.1', port = '0', cwd = tmpdir() } = {}) {
  const flags = fault ? ['--experimental-test-module-mocks', '--import', join(root, 'tests/http-faults.mjs')] : [];
  const child = spawn(process.execPath, [...flags, join(root, 'dist/server/index.js')], {
    cwd, env: { ...process.env, HOST: host, PORT: port, ...(fault ? { DIAGRAM_HTTP_FAULT: fault } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; let stderr = ''; let boundPort = null; let clos = false;
  const termine = once(child, 'close').then(([code, signal]) => { clos = true; return { code, signal }; });
  const adresse = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      const match = stdout.match(/Serveur disponible sur http:\/\/(\[[^\]]+\]|[^:]+):(\d+)/);
      if (match) { boundPort = Number(match[2]); resolve({ host: match[1], port: boundPort }); }
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    termine.then(() => reject(new Error(`Serveur arrêté avant écoute : ${stderr}`)), reject);
  });
  adresse.catch(() => {}); // Les tests de démarrage en échec attendent seulement termine.
  nettoyerApres(t, async () => {
    if (!clos) child.kill('SIGTERM');
    let timer;
    try {
      await Promise.race([termine, new Promise((_, reject) => {
        timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Arrêt serveur expiré')); }, 5000);
      })]);
      assert.equal(clos, true);
      if (boundPort !== null) {
        await assert.rejects(fetch(`http://127.0.0.1:${boundPort}/`, { signal: AbortSignal.timeout(2000) }),
          'le serveur de test ne doit plus écouter');
      }
    } finally {
      clearTimeout(timer);
      console.log(`serveur-test ${JSON.stringify({ pid: child.pid, port: boundPort, stopped: clos })}`);
    }
  });
  return { child, adresse, termine, get stdout() { return stdout; }, get stderr() { return stderr; } };
}
async function demarrer(t, options) {
  const serveur = lancer(t, options);
  let timer;
  try {
    const { host, port } = await Promise.race([serveur.adresse, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Démarrage serveur expiré')), 10000);
    })]);
    return { serveur, host, port, url: `http://127.0.0.1:${port}` };
  } finally { clearTimeout(timer); }
}
const envoyer = (url, body = reference, headers = { 'Content-Type': 'application/json' }) =>
  fetch(`${url}/api/generate`, { method: 'POST', body, headers, signal: AbortSignal.timeout(20000) });
async function succes(url, json = reference) {
  const response = await envoyer(url, json);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/svg\+xml; charset=utf-8$/i);
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="diagram.svg"');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
  const svg = new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer());
  assert.equal(svg, convertirJson(json), 'SVG HTTP identique au service commun');
  return svg;
}
async function erreur(response, status, code, message) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type'), /^application\/json; charset=utf-8$/i);
  assert.equal(response.headers.get('content-disposition'), null);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message']);
  assert.equal(body.error.code, code); assert.match(body.error.message, message);
  return body;
}

test('http-diagram-reference-svg-utf8-et-equivalence-service', { timeout: 30000 }, async t => {
  const { url } = await demarrer(t);
  const svg = await succes(url);
  const doc = new DOMParser({ onError: level => { throw new Error(`XML ${level}`); } }).parseFromString(svg, 'image/svg+xml');
  assert.equal(doc.documentElement.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.ok(doc.documentElement.hasAttribute('viewBox'));
  const groupes = [...doc.getElementsByTagName('g')];
  assert.equal(groupes.filter(g => g.getAttribute('class') === 'noeud').length, 18);
  assert.equal(groupes.filter(g => g.getAttribute('class') === 'arc').length, 24);
  assert.equal(doc.getElementsByTagName('script').length, 0);
  await succes(url, petit);
  assert.equal(await readFile(join(root, 'diagram.json'), 'utf8'), reference);
});

test('http-json-mal-forme-et-reprise', async t => {
  const { url } = await demarrer(t);
  await erreur(await envoyer(url, '{'), 400, 'JSON_INVALIDE', /^Le corps contient un JSON mal formé\.$/);
  await succes(url);
});

test('http-reference-arc-invalide-et-reprise', async t => {
  const { url } = await demarrer(t);
  const document = JSON.parse(reference); document.edges[0].target = 'absent';
  await erreur(await envoyer(url, JSON.stringify(document)), 400, 'DIAGRAMME_INVALIDE', /REFERENCE_ABSENTE.*\$\.edges\[0\]\.target/);
  await succes(url);
});

test('http-structure-corps-et-refus-chemin-local', async t => {
  const { url } = await demarrer(t);
  for (const body of ['', '{}', 'null', '[]', '42', '"diagram.json"', JSON.stringify({ path: join(root, 'diagram.json') })]) {
    await erreur(await envoyer(url, body), 400, 'DIAGRAMME_INVALIDE', /STRUCTURE_INVALIDE/);
  }
  await succes(url);
});

test('http-limite-un-mio-octets-et-reprise', async t => {
  const { url } = await demarrer(t);
  const json = JSON.stringify({ nodes: [], edges: [], note: 'été 👩‍💻' });
  const body = json + ' '.repeat(LIMITE_JSON - Buffer.byteLength(json));
  assert.equal(Buffer.byteLength(body), 1048576);
  await erreur(await envoyer(url, body + ' '), 413, 'CORPS_TROP_VOLUMINEUX', /^Le corps JSON dépasse la limite de 1048576 octets \(1 Mio\)\.$/);
  await succes(url, body); // La limite est inclusive et mesure les octets UTF-8.
  await succes(url);
});

test('http-format-contenu-charset-compression-et-reprise', async t => {
  const { url } = await demarrer(t);
  await erreur(await envoyer(url, reference, { 'Content-Type': 'text/plain' }), 400, 'CONTENT_TYPE_INVALIDE', /Content-Type: application\/json/);
  await erreur(await envoyer(url, '{}', { 'Content-Type': 'application/json; charset=iso-8859-1' }), 400, 'CORPS_INVALIDE', /UTF-8, sans compression/);
  await erreur(await envoyer(url, '{}', { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }), 400, 'CORPS_INVALIDE', /UTF-8, sans compression/);
  await succes(url);
});

test('http-erreur-interne-rendu-controlee-et-reprise', async t => {
  const { url, serveur } = await demarrer(t, { fault: 'rendu' });
  const body = await erreur(await envoyer(url), 500, 'ERREUR_INTERNE', /^La génération SVG a échoué\. Réessayez ou contactez le responsable du serveur\.$/);
  assert.doesNotMatch(JSON.stringify(body), /RENDU_INTERNE_CONTROLE|stack|dist\//);
  await succes(url);
  assert.match(serveur.stderr, /RENDU_INTERNE_CONTROLE/);
});

test('http-erreur-interne-import-inattendue-et-reprise', async t => {
  const { url, serveur } = await demarrer(t, { fault: 'import' });
  await erreur(await envoyer(url), 500, 'ERREUR_INTERNE', /La génération SVG a échoué/);
  await succes(url);
  assert.match(serveur.stderr, /IMPORT_INTERNE_CONTROLE/);
});

async function refusGeometrie(t, fault, diagnostic) {
  const { url, serveur } = await demarrer(t, { fault });
  await erreur(await envoyer(url, petit), 500, 'ERREUR_INTERNE', /La génération SVG a échoué/);
  await succes(url, petit);
  assert.match(serveur.stderr, /CONFLITS_GEOMETRIQUES/);
  assert.match(serveur.stderr, diagnostic);
}
test('http-verificateur-chemin-bloque-succes', async t => {
  await refusGeometrie(t, 'chemin', /"verifierChemin":\[\{/);
});
test('http-verificateur-placement-bloque-succes', async t => {
  await refusGeometrie(t, 'placement', /"verifierPlacement":\[\["a","c"\]\]/);
});
test('http-verificateur-placement-chemin-bloque-succes', async t => {
  await refusGeometrie(t, 'obstacle', /"verifierPlacementChemin":\[\["ab","c"\]\]/);
});
test('http-trois-verificateurs-avant-rendu', async t => {
  const { url, serveur } = await demarrer(t, { fault: 'trace' });
  await succes(url);
  assert.doesNotMatch(serveur.stderr, /VERIFICATEUR_NON_APPELE|Échec interne/);
});

test('http-interface-finale-ressources-host-port-zero', { timeout: 30000 }, async t => {
  const { url, host, port } = await demarrer(t);
  assert.equal(host, '127.0.0.1'); assert.ok(port > 0);
  for (const [path, type, file] of [
    ['/', /text\/html/, 'public/index.html'], ['/styles.css', /text\/css/, 'public/styles.css'],
    ['/assets/main.js', /(?:text|application)\/javascript/, 'dist/client/main.js'],
  ]) {
    const response = await fetch(url + path);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), type);
    assert.equal(await response.text(), await readFile(join(root, file), 'utf8'));
  }
  for (const path of ['/diagram.json', '/src/server/index.ts', '/assets/../server/index.js']) {
    assert.equal((await fetch(url + path)).status, 404);
  }
  const browser = await chromium.launch({ timeout: 15000 });
  try {
    const page = await browser.newPage();
    const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#app-status')?.textContent === 'Sélectionnez un fichier JSON pour commencer.');
    assert.equal(await page.getByLabel('Fichier du diagramme JSON').isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Générer le SVG', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('#result').isVisible(), false);
    assert.notEqual(await page.locator('h1').evaluate(e => getComputedStyle(e).fontFamily), '');
    assert.deepEqual(erreurs, []);
  } finally { await browser.close(); }
});

test('http-host-personnalise-port-fixe-et-diagnostics-demarrage', async t => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  t.after(() => { if (reservation.listening) reservation.close(); });
  const port = reservation.address().port;
  // Le port occupé provoque le diagnostic du socle, sans arrêter son propriétaire.
  const conflit = lancer(t, { port: String(port) });
  assert.equal((await conflit.termine).code, 1);
  assert.match(conflit.stderr, /Impossible de démarrer le serveur.*EADDRINUSE/);
  assert.doesNotMatch(conflit.stdout, /Serveur disponible/);
  assert.equal(reservation.listening, true);
  await new Promise(resolve => reservation.close(resolve));
  const { url, host, port: effectif } = await demarrer(t, { host: '0.0.0.0', port: String(port) });
  assert.equal(host, '0.0.0.0'); assert.equal(effectif, port);
  await succes(url, petit);
  for (const invalide of ['-1', '65536', 'abc', '', '1.5']) {
    const serveur = lancer(t, { port: invalide });
    assert.equal((await serveur.termine).code, 1);
    assert.match(serveur.stderr, /PORT doit être un entier compris entre 0 et 65535/);
    assert.doesNotMatch(serveur.stdout, /Serveur disponible/);
  }
});

test('http-svg-consultation-et-enregistrement-navigateur', { timeout: 45000 }, async t => {
  const { url } = await demarrer(t);
  const dir = await mkdtemp(join(tmpdir(), 'diagrams-http-'));
  let browser;
  try {
    browser = await chromium.launch({ timeout: 15000 });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage(); await page.goto(url);
    // Consommation navigateur de l'API ; le parcours de sélection appartient à l'évolution 7.
    await page.evaluate(async json => {
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      for (const id of ['ouvrir', 'enregistrer']) {
        const a = document.createElement('a'); a.id = id; a.href = url; a.textContent = id;
        if (id === 'ouvrir') a.target = '_blank'; else a.download = 'diagram.svg';
        document.body.append(a);
      }
    }, reference);
    const ouverture = page.waitForEvent('popup'); await page.locator('#ouvrir').click();
    const apercu = await ouverture; await apercu.waitForLoadState();
    assert.equal(await apercu.locator('parsererror').count(), 0);
    assert.equal(await apercu.locator('.noeud').count(), 18);
    assert.equal(await apercu.locator('.arc').count(), 24);
    assert.ok(await apercu.locator('svg').isVisible());
    const enregistrement = page.waitForEvent('download'); await page.locator('#enregistrer').click();
    const download = await enregistrement; assert.equal(download.suggestedFilename(), 'diagram.svg');
    const file = join(dir, 'diagram.svg'); await download.saveAs(file);
    assert.equal(await download.failure(), null);
    assert.equal(await readFile(file, 'utf8'), convertirJson(reference));
    await context.setOffline(true);
    await apercu.goto(pathToFileURL(file).href);
    assert.equal(await apercu.locator('parsererror').count(), 0);
    assert.equal(await apercu.locator('.noeud').count(), 18);
    assert.equal(await apercu.locator('.arc').count(), 24);
    assert.equal(await apercu.evaluate(() => document.characterSet.toUpperCase()), 'UTF-8');
    assert.ok(await apercu.locator('svg').isVisible());
    await page.evaluate(() => URL.revokeObjectURL(document.querySelector('#ouvrir').href));
  } finally {
    try { if (browser) await browser.close(); }
    finally { await rm(dir, { recursive: true, force: true }); }
  }
});
