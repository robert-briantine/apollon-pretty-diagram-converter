import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertirJson } from '../dist/server/conversion.js';
import { interfaceTest, selection, generation, succes, echec, capture, reference, petit } from './ui-fixtures.mjs';

async function ouvrir(page) {
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Ouvrir à taille réelle', exact: false }).click();
  const svg = await popup; await svg.waitForLoadState();
  assert.equal(await svg.locator('parsererror').count(), 0);
  return svg;
}
async function enregistrer(t, page, expectedName, expectedSvg) {
  const dir = await mkdtemp(join(tmpdir(), 'diagrams-ui-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Enregistrer le SVG', exact: true }).click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), expectedName);
  const path = join(dir, expectedName);
  await download.saveAs(path);
  assert.equal(await download.failure(), null);
  assert.equal(await readFile(path, 'utf8'), expectedSvg);
  return path;
}

test('ui-presentation-large-trajets-simplifies-apercu-et-export-autonome', { timeout: 60000 }, async t => {
  const ui = await interfaceTest(t, { fault: 'trace' });
  const { page, context } = ui;
  await generation(page);
  const svg = await ouvrir(page);
  const mesurer = () => svg.locator('svg').evaluate(root => {
    const vb = root.viewBox.baseVal;
    const chemins = [...root.querySelectorAll('.chemin')];
    const coudes = chemins.map(p => (p.getAttribute('d').match(/ L /g) ?? []).length - 1);
    const coupures = [...root.querySelectorAll('.forme, text, .chemin')].filter(e => {
      const b = e.getBBox();
      return b.x < vb.x || b.y < vb.y || b.x + b.width > vb.x + vb.width || b.y + b.height > vb.y + vb.height;
    }).length;
    return { largeur: vb.width, hauteur: vb.height, coudes: coudes.reduce((s, n) => s + n, 0),
      maximum: Math.max(...coudes), coupures, noeuds: root.querySelectorAll('.noeud').length,
      arcs: chemins.length, contenu: root.outerHTML };
  });
  const avant = await mesurer();
  assert.ok(avant.largeur / avant.hauteur >= 1.4 && avant.largeur / avant.hauteur <= 2.5,
    'le document lui-même occupe davantage la largeur, sans déformer son aperçu');
  assert.ok(avant.coudes <= 75 && avant.maximum <= 7, 'les flèches exportées ont moins de virages');
  assert.equal(avant.coupures, 0); assert.equal(avant.noeuds, 18); assert.equal(avant.arcs, 24);
  assert.deepEqual(await page.locator('#svg-preview').evaluate(img => [img.naturalWidth, img.naturalHeight]),
    [avant.largeur, avant.hauteur]);
  const trace = ui.stdout.match(/conflits-service (\{[^\n]+\})/);
  assert.ok(trace);
  assert.deepEqual(JSON.parse(trace[1]), { verifierChemin: [], verifierPlacement: [], verifierPlacementChemin: [] });
  await capture(page, 'presentation-large-apercu');
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
  await capture(page, 'presentation-large-plein-ecran');
  await page.locator('#zoom-in').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#zoom-value').textContent(), '125 %');
  await page.keyboard.press('Escape');
  const path = await enregistrer(t, page, 'diagram.svg', convertirJson(reference));
  await context.setOffline(true);
  await svg.goto(pathToFileURL(path).href);
  assert.deepEqual(await mesurer(), avant, 'géométrie et rendu identiques dans le fichier enregistré');
});

test('ui-parcours-diagram-selection-apercu-ouverture-et-enregistrement-autonome', { timeout: 60000 }, async t => {
  const ui = await interfaceTest(t, { fault: 'trace' });
  const { page, context } = ui;
  await generation(page);
  assert.equal(await page.locator('#file-name').textContent(), 'Fichier sélectionné : diagram.json');
  assert.equal(await page.locator('#result-name').textContent(), 'Résultat de : diagram.json');
  const href = await page.locator('#svg-preview').getAttribute('src');
  assert.equal(await page.locator('#download-svg').getAttribute('href'), href);
  const svg = await ouvrir(page);
  assert.equal(await svg.locator('.noeud').count(), 18);
  assert.equal(await svg.locator('.arc').count(), 24);
  assert.equal(await svg.locator('rect.forme').count(), 11);
  assert.equal(await svg.locator('polygon.forme').count(), 6);
  assert.equal(await svg.locator('ellipse.forme').count(), 1);
  assert.equal(await svg.locator('.texte-arc').filter({ hasText: /^oui$/ }).count(), 0);
  assert.equal(await svg.locator('.texte-arc').filter({ hasText: /^non$/ }).count(), 0);
  assert.deepEqual(await svg.locator('.texte-legende').allTextContents(), ['Oui', 'Non']);
  assert.equal(await svg.locator('.chemin.branche-oui').count(), 6);
  assert.equal(await svg.locator('.chemin.branche-non').count(), 6);
  assert.equal(await svg.locator('.chemin').evaluateAll(paths => paths.every(p => getComputedStyle(p).markerEnd.includes('fleche'))), true);
  assert.ok(await svg.locator('.chemin').evaluateAll(paths => paths.some(p => p.getPointAtLength(p.getTotalLength()).y < p.getPointAtLength(0).y)));
  // Le module de test trace les retours réels des trois vérificateurs du service avant rendu.
  const trace = ui.stdout.match(/conflits-service (\{[^\n]+\})/);
  assert.ok(trace, 'trace des vérificateurs du service disponible');
  assert.deepEqual(JSON.parse(trace[1]), { verifierChemin: [], verifierPlacement: [], verifierPlacementChemin: [] });
  assert.doesNotMatch(ui.stderr, /Échec interne|VERIFICATEUR_NON_APPELE/);
  await capture(page, 'parcours-diagram');
  const expected = convertirJson(reference);
  const path = await enregistrer(t, page, 'diagram.svg', expected);
  const before = await svg.locator('svg').evaluate(e => e.outerHTML);
  await context.setOffline(true);
  const requests = []; svg.on('request', req => { if (!req.url().startsWith('file:')) requests.push(req.url()); });
  await svg.goto(pathToFileURL(path).href);
  assert.equal(await svg.locator('svg').evaluate(e => e.outerHTML), before);
  assert.equal(await svg.evaluate(() => document.characterSet.toUpperCase()), 'UTF-8');
  assert.deepEqual(requests, []);
});

test('ui-branches-rouges-vertes-apercu-remplacement-et-export-hors-ligne', { timeout: 60000 }, async t => {
  const { page, context } = await interfaceTest(t);
  for (const [name, json, nombre] of [['diagram.json', reference, 6], ['boucle.json', petit, 1]]) {
    await generation(page, name, json);
    // Vérifie aussi le SVG réellement décodé comme image dans l'aperçu.
    const pixels = await page.locator('#svg-preview').evaluate(img => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let rouge = 0; let vert = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 248 && data[i + 1] === 113 && data[i + 2] === 113 && data[i + 3] === 255) rouge++;
        if (data[i] === 74 && data[i + 1] === 222 && data[i + 2] === 128 && data[i + 3] === 255) vert++;
      }
      return { rouge, vert };
    });
    assert.ok(pixels.rouge > 0 && pixels.vert > 0, 'les deux couleurs apparaissent dans l’aperçu');
    const svg = await ouvrir(page);
    const couleurs = async () => svg.locator('.arc').evaluateAll(arcs => arcs.map(a => {
      const path = a.querySelector('.chemin');
      const id = path.getAttribute('marker-end').match(/^url\(#([^\)]+)\)$/)[1];
      const marker = document.getElementById(id);
      return { label: a.getAttribute('aria-label'), trait: getComputedStyle(path).stroke,
        pointe: getComputedStyle(marker.querySelector('path')).fill,
        dimensions: [marker.markerWidth.baseVal.value, marker.markerHeight.baseVal.value],
        orient: marker.getAttribute('orient') };
    }));
    const avant = await couleurs();
    for (const [label, couleurs] of [['oui', ['rgb(74, 222, 128)', 'rgb(187, 247, 208)', 'rgb(22, 163, 74)']],
      ['non', ['rgb(248, 113, 113)', 'rgb(254, 202, 202)', 'rgb(251, 113, 133)']]]) {
      const branches = avant.filter(a => a.label === label);
      assert.equal(branches.length, nombre);
      for (const a of branches) {
        assert.ok(couleurs.includes(a.trait)); assert.equal(a.pointe, a.trait);
        assert.deepEqual(a.dimensions, [20, 16]); assert.equal(a.orient, 'auto');
      }
    }
    for (const a of avant.filter(a => !['oui', 'non'].includes(a.label))) {
      assert.ok(!['rgb(74, 222, 128)', 'rgb(248, 113, 113)'].includes(a.trait));
      assert.equal(a.pointe, a.trait);
    }
    await capture(page, `branches-colorees-${nombre}`);
    const path = await enregistrer(t, page, name.replace('.json', '.svg'), convertirJson(json));
    await context.setOffline(true);
    await svg.goto(pathToFileURL(path).href);
    assert.equal(await svg.locator('parsererror').count(), 0);
    assert.deepEqual(await couleurs(), avant, 'couleurs identiques dans le fichier autonome');
    await svg.close();
    await context.setOffline(false);
  }
});

test('ui-absence-selection-json-invalide-et-diagramme-invalide-puis-reprise', { timeout: 60000 }, async t => {
  const { page } = await interfaceTest(t);
  assert.equal(await page.locator('#generate').isDisabled(), true);
  await page.locator('#generate-form').evaluate(form => form.requestSubmit());
  await echec(page, /Sélectionnez un fichier JSON/);
  assert.equal(await page.locator('#diagram-file').evaluate(e => e === document.activeElement), true);
  for (const [name, content, message] of [
    ['vide.json', '', /JSON valide/], ['syntaxe.json', '{', /JSON valide/],
    ['structure.json', '{}', /STRUCTURE_INVALIDE/],
    ['reference.json', JSON.stringify({ ...JSON.parse(petit), edges: [{ ...JSON.parse(petit).edges[0], target: 'absent' }] }), /REFERENCE_ABSENTE/],
    ['volumineux.json', ' '.repeat(1048577), /limite de 1 Mio/],
  ]) {
    await generation(page, 'avant.json', petit);
    await selection(page, name, content);
    assert.equal(await page.locator('#result').isVisible(), false);
    await page.locator('#generate').click();
    await echec(page, message);
    assert.match(await page.locator('#app-status').textContent(), new RegExp(name));
    await generation(page, 'corrigé.json', petit);
  }
});

test('ui-fichier-illisible-et-nouvelle-selection-valide', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t);
  await generation(page, 'avant.json', petit);
  await page.evaluate(() => {
    const text = File.prototype.text;
    File.prototype.text = function () { File.prototype.text = text; return Promise.reject(new DOMException('Accès refusé', 'NotReadableError')); };
  });
  await selection(page, 'illisible.json', petit);
  await page.locator('#generate').click();
  await echec(page, /Impossible de lire le fichier/);
  await generation(page, 'lisible.json', petit);
});

test('ui-erreur-conversion-api-reelle-et-reprise', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t, { fault: 'rendu' });
  await selection(page);
  await page.locator('#generate').click();
  await echec(page, /La génération SVG a échoué/);
  await generation(page);
});

test('ui-reponses-api-inexploitables-et-reprise-sans-apercu-perime', { timeout: 45000 }, async t => {
  const { page } = await interfaceTest(t);
  for (const response of [
    { status: 502, contentType: 'text/html', body: '<html>Proxy indisponible</html>' },
    { status: 413, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Corps trop volumineux : limite 1 Mio.' } }) },
    { status: 200, contentType: 'text/html', body: '<html>Page intermédiaire</html>' },
    { status: 200, contentType: 'image/svg+xml', body: '<svg>incomplet' },
    { status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="urn:autre"/>' },
  ]) {
    await generation(page, 'avant.json', petit);
    await page.route('**/api/generate', route => route.fulfill(response), { times: 1 });
    await selection(page, 'erreur.json', petit);
    await page.locator('#generate').click();
    await echec(page, response.status === 502 ? /HTTP 502/ : response.status === 413 ? /Corps trop volumineux/ : /SVG invalide/);
    await generation(page, 'après.json', petit);
  }
});

test('ui-coupure-reseau-et-reprise', { timeout: 30000 }, async t => {
  const { page, context } = await interfaceTest(t);
  await generation(page, 'avant.json', petit);
  await context.setOffline(true);
  await selection(page, 'hors-ligne.json', petit);
  await page.locator('#generate').click();
  await echec(page, /connexion réseau/);
  await context.setOffline(false);
  await generation(page, 'rétabli.json', petit);
});

test('ui-delai-reseau-expire-et-reprise', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t);
  await page.clock.install();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/generate', async route => {
    await pending;
    await route.abort().catch(() => {});
  }, { times: 1 });
  await selection(page, 'lent.json', petit);
  await page.locator('#generate').click();
  await page.waitForFunction(() => document.querySelector('#app-status').textContent.startsWith('Génération'));
  await page.clock.fastForward(61000);
  await echec(page, /trop de temps/);
  release();
  await generation(page, 'rapide.json', petit);
});

test('ui-deux-diagrammes-remplacement-telechargement-et-liberation-des-url', { timeout: 60000 }, async t => {
  const { page } = await interfaceTest(t);
  await generation(page);
  const first = await page.locator('#svg-preview').getAttribute('src');
  await enregistrer(t, page, 'diagram.svg', convertirJson(reference));
  await selection(page, 'Été présentation.JSON', petit);
  assert.equal(await page.locator('#result').isVisible(), false);
  assert.equal(await page.evaluate(url => window.urlsRevoked.includes(url), first), true);
  await page.locator('#generate').click(); await succes(page);
  const second = await page.locator('#svg-preview').getAttribute('src');
  assert.notEqual(second, first);
  assert.equal(await page.locator('#download-svg').getAttribute('download'), 'Été présentation.svg');
  const expected = convertirJson(petit);
  assert.equal(await page.evaluate(async url => (await fetch(url)).text(), second), expected);
  await enregistrer(t, page, 'Été présentation.svg', expected);
  const popup = await ouvrir(page);
  assert.equal(await popup.locator('.noeud').count(), 2);
  assert.equal(await popup.locator('.arc').count(), 2);
  assert.match(await popup.locator('.noeud').allTextContents().then(v => v.join(' ')), /Été/);
  assert.ok(await popup.locator('tspan').count() > 4);
  await capture(page, 'second-diagramme');
  await selection(page, 'autre.json', petit);
  assert.deepEqual(await page.evaluate(() => window.urlsRevoked), [first, second]);
  await page.locator('#diagram-file').setInputFiles([]);
  assert.equal(await page.locator('#generate').isDisabled(), true);
  assert.equal(await page.locator('#file-name').textContent(), 'Aucun fichier sélectionné.');
});

test('ui-verrouillage-lecture-requete-et-double-soumission', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t);
  let requests = 0;
  await page.route('**/api/generate', async route => {
    requests++;
    await page.waitForFunction(() => window.releaseRequest === true);
    await route.continue();
  });
  await page.evaluate(() => {
    const text = File.prototype.text;
    File.prototype.text = async function () {
      await new Promise(resolve => { window.releaseRead = resolve; });
      return text.call(this);
    };
  });
  await selection(page, 'attente.json', petit);
  await page.locator('#generate').click();
  await page.waitForFunction(() => typeof window.releaseRead === 'function');
  assert.match(await page.locator('#app-status').textContent(), /Lecture/);
  for (const phase of ['lecture', 'requête']) {
    assert.equal(await page.locator('#diagram-file').isDisabled(), true);
    assert.equal(await page.locator('#generate').isDisabled(), true);
    assert.equal(await page.locator('#generate-form').getAttribute('aria-busy'), 'true');
    await page.locator('#generate-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    if (phase === 'lecture') {
      await page.evaluate(() => window.releaseRead());
      await page.waitForFunction(() => document.querySelector('#app-status').textContent.startsWith('Génération'));
    }
  }
  await page.evaluate(() => { window.releaseRequest = true; });
  await succes(page);
  assert.equal(requests, 1);
  assert.equal(await page.locator('#generate-form').getAttribute('aria-busy'), 'false');
  assert.equal(await page.locator('#generate').isDisabled(), false);
});

test('ui-clavier-fenetre-etroite-et-etats-accessibles', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t, { viewport: { width: 360, height: 800 } });
  assert.equal(await page.getByLabel('Fichier du diagramme JSON').count(), 1);
  assert.equal(await page.locator('#app-status').getAttribute('role'), 'status');
  assert.equal(await page.locator('#app-error').getAttribute('role'), 'alert');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#diagram-file').evaluate(e => e === document.activeElement), true);
  // Activation du véritable sélecteur natif avec le clavier.
  const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
  await page.keyboard.press('Space');
  await (await chooser).setFiles({ name: 'clavier.json', mimeType: 'application/json', buffer: Buffer.from(petit) });
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#generate').evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('Enter'); await succes(page);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#open-svg').evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#download-svg').evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('button, input, .actions a').evaluateAll(elements => elements.every(e => {
    const b = e.getBoundingClientRect(); return b.x >= 0 && b.right <= window.innerWidth && b.width > 0;
  })), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const size = await page.locator('#svg-preview').evaluate(img => ({
    fit: getComputedStyle(img).objectFit, width: img.clientWidth, height: img.clientHeight,
    natural: img.naturalWidth / img.naturalHeight,
  }));
  assert.equal(size.fit, 'contain'); assert.ok(size.width > 0 && size.height > 0 && size.natural > 0);
  await capture(page, 'fenetre-etroite-clavier');
});

test('ui-plein-ecran-natif-zoom-retour-et-enregistrement', { timeout: 60000 }, async t => {
  const { page } = await interfaceTest(t);
  await generation(page);
  const url = await page.locator('#svg-preview').getAttribute('src');
  const button = page.locator('#fullscreen');
  await button.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.fullscreenElement?.id === 'result');
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  const bounds = await page.locator('#result').boundingBox();
  assert.ok(bounds.x === 0 && bounds.y === 0 && bounds.width === 1440 && bounds.height === 1000);
  assert.equal(await page.locator('#generate-form').evaluate(e => e.closest('section').inert), true);
  await page.locator('#zoom').focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#zoom-value').textContent(), '200 %');
  await page.waitForFunction(() => document.querySelector('#svg-preview').clientHeight >= document.querySelector('.preview').clientHeight * 1.99);
  await page.locator('.preview').focus(); await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.querySelector('.preview').scrollTop > 0);
  await capture(page, 'plein-ecran-zoom');
  await page.getByRole('button', { name: 'Vue d’ensemble', exact: true }).click();
  assert.equal(await page.locator('#zoom').inputValue(), '100');
  assert.equal(await page.locator('.preview').evaluate(e => e.scrollTop), 0);
  await capture(page, 'plein-ecran-ensemble');
  // Simule aussi une sortie via l'interface native du navigateur.
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.querySelector('#result').classList.contains('expanded'));
  assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#fullscreen').evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('#generate-form').evaluate(e => e.closest('section').inert), false);
  assert.equal(await page.locator('#svg-preview').getAttribute('src'), url);
  // Chromium interdit de redimensionner sa fenêtre native en plein écran.
  // Vérifie le recalcul après retour et dans la vue couvrant la fenêtre.
  await page.evaluate(() => { document.querySelector('#result').requestFullscreen = undefined; });
  await page.locator('#fullscreen').click();
  await page.locator('#zoom').fill('200');
  await page.setViewportSize({ width: 720, height: 800 });
  await page.waitForFunction(() => {
    const img = document.querySelector('#svg-preview'); const view = document.querySelector('.preview');
    const scale = Math.min(view.clientWidth / img.naturalWidth, view.clientHeight / img.naturalHeight) * 2;
    return Math.abs(img.clientWidth - img.naturalWidth * scale) < 2 && Math.abs(img.clientHeight - img.naturalHeight * scale) < 2;
  });
  await page.keyboard.press('Escape');
  await enregistrer(t, page, 'diagram.svg', convertirJson(reference));
});

test('ui-plein-ecran-repli-api-absente-ou-refusee-et-echap', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t, { viewport: { width: 360, height: 800 } });
  await generation(page, 'compact.json', petit);
  for (const mode of ['absente', 'refusée']) {
    await page.evaluate(mode => {
      document.querySelector('#result').requestFullscreen = mode === 'absente' ? undefined : () => Promise.reject(new DOMException('Refus', 'NotAllowedError'));
    }, mode);
    await page.locator('#fullscreen').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#result').classList.contains('expanded'));
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    const bounds = await page.locator('#result').boundingBox();
    assert.deepEqual(bounds, { x: 0, y: 0, width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Tab');
    if (await page.locator('#zoom-out').isEnabled()) {
      assert.equal(await page.locator('#zoom-out').evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Tab');
    }
    assert.equal(await page.locator('#zoom').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('#zoom').inputValue(), '400');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#fullscreen').evaluate(e => e === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.body.classList.contains('viewer-open')), false);
  }
});

test('ui-plein-ecran-nouvelle-selection-et-echec-liberent-la-vue', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t);
  await generation(page, 'premier.json', petit);
  const first = await page.locator('#svg-preview').getAttribute('src');
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'result');
  await page.locator('#zoom').fill('300');
  await selection(page, 'invalide.json', '{');
  await page.waitForFunction(() => document.fullscreenElement === null);
  assert.equal(await page.locator('#result').isVisible(), false);
  assert.equal(await page.locator('#zoom').inputValue(), '100');
  assert.equal(await page.evaluate(() => document.body.classList.contains('viewer-open')), false);
  assert.equal(await page.evaluate(url => window.urlsRevoked.includes(url), first), true);
  await page.locator('#generate').click(); await echec(page, /JSON valide/);
  await generation(page, 'corrigé.json', petit);
  assert.equal(await page.locator('#result-name').textContent(), 'Résultat de : corrigé.json');
  assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'), 'false');
});

test('ui-chemins-raccourcis-apercu-et-fichier-autonome-identiques', { timeout: 60000 }, async t => {
  const { page, context } = await interfaceTest(t, { fault: 'trace' });
  await generation(page);
  const svg = await ouvrir(page);
  const mesures = async () => svg.locator('.chemin').evaluateAll(paths => ({
    total: paths.reduce((s, p) => s + p.getTotalLength(), 0),
    traces: paths.map(p => p.getAttribute('d')),
  }));
  const avant = await mesures();
  assert.equal(avant.traces.length, 24);
  assert.ok(avant.total > 13000 && avant.total < 18000, `longueur SVG effectivement rendue : ${avant.total}`);
  assert.equal(await svg.locator('.noeud').count(), 18);
  const path = await enregistrer(t, page, 'diagram.svg', convertirJson(reference));
  await context.setOffline(true);
  await svg.goto(pathToFileURL(path).href);
  assert.deepEqual(await mesures(), avant, 'les mêmes chemins courts sont présents dans le SVG téléchargé');
  assert.equal(await svg.locator('parsererror').count(), 0);
  await capture(page, 'chemins-raccourcis');
});

test('ui-croisements-halos-visibles-apercu-export-et-remplacement', { timeout: 60000 }, async t => {
  const { page, context } = await interfaceTest(t, { fault: 'trace' });
  await generation(page);
  const svg = await ouvrir(page);
  const mesurer = () => svg.locator('svg').evaluate(root => {
    const traces = [...root.querySelectorAll('.chemin')].flatMap(path => {
      const n = path.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
      const p = Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[i * 2], y: n[i * 2 + 1] }));
      return p.slice(1).map((b, i) => ({ a: p[i], b, id: path.parentElement.dataset.arcId, couleur: getComputedStyle(path).stroke }));
    });
    const attendus = []; let detail;
    const obstacles = [...root.querySelectorAll('.forme, .fond-libelle')].map(e => e.getBBox());
    for (const h of traces.filter(s => s.a.y === s.b.y)) for (const v of traces.filter(s => s.a.x === s.b.x)) {
      const x = v.a.x; const y = h.a.y;
      const dh = Math.min(x - Math.min(h.a.x, h.b.x), Math.max(h.a.x, h.b.x) - x);
      const dv = Math.min(y - Math.min(v.a.y, v.b.y), Math.max(v.a.y, v.b.y) - y);
      if (dh <= 1e-7 || dv <= 1e-7) continue;
      attendus.push(JSON.stringify([x, y]));
      if (!detail && dh > 32 && dv > 32 && !obstacles.some(b =>
        x > b.x - 16 && x < b.x + b.width + 16 && y > b.y - 16 && y < b.y + b.height + 16)) {
        detail = { x, y, horizontal: h.couleur, vertical: v.couleur };
      }
    }
    const halos = [...root.querySelectorAll('.halo-croisement')];
    const dessus = [...root.querySelectorAll('.dessus-croisement')];
    return { attendus: [...new Set(attendus)].sort(),
      obtenus: dessus.map(p => JSON.stringify([Number(p.dataset.x), Number(p.dataset.y)])).sort(),
      halos: halos.length, fond: halos.map(e => getComputedStyle(e).stroke),
      couleurs: dessus.map(e => getComputedStyle(e).stroke),
      vb: [root.viewBox.baseVal.x, root.viewBox.baseVal.y, root.viewBox.baseVal.width, root.viewBox.baseVal.height],
      detail, contenu: root.outerHTML };
  });
  const avant = await mesurer();
  assert.ok(avant.attendus.length > 0 && avant.attendus.length <= 25);
  assert.deepEqual(avant.obtenus, avant.attendus, 'chaque croisement intérieur porte son repère');
  assert.equal(avant.halos, avant.attendus.length);
  assert.ok(avant.fond.every(c => c === 'rgb(0, 0, 0)'));
  assert.ok(avant.detail, 'un croisement dégagé est disponible pour le contrôle des pixels');
  // Vérifie le SVG effectivement décodé comme image, puis le fichier autonome.
  const pixels = await page.locator('#svg-preview').evaluate((img, { vb, detail }) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth * 2; canvas.height = img.naturalHeight * 2;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixel = dy => {
      const x = Math.floor((detail.x - vb[0]) * canvas.width / vb[2]);
      const y = Math.floor((detail.y + dy - vb[1]) * canvas.height / vb[3]);
      return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    };
    return { dessus: pixel(0), coupure: pixel(2.5), dessous: pixel(7) };
  }, avant);
  const rgb = c => c.match(/\d+/g).map(Number);
  assert.deepEqual(pixels.dessus, rgb(avant.detail.horizontal));
  assert.deepEqual(pixels.coupure, [11, 17, 32], 'le halo interrompt visiblement le trait inférieur');
  assert.deepEqual(pixels.dessous, rgb(avant.detail.vertical), 'le trait inférieur reprend après le croisement');
  const path = await enregistrer(t, page, 'diagram.svg', convertirJson(reference));
  await context.setOffline(true);
  await svg.goto(pathToFileURL(path).href);
  assert.deepEqual(await mesurer(), avant, 'géométrie, halos et couleurs identiques hors ligne');
  await capture(page, 'croisements-apercu');
  if (process.env.UI_SCREENSHOT_DIR) {
    const session = await context.newCDPSession(svg);
    try {
      const { x, y } = await svg.evaluate(({ x, y }) => {
        const p = new DOMPoint(x, y).matrixTransform(document.documentElement.getScreenCTM());
        return { x: p.x, y: p.y };
      }, avant.detail);
      const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: Math.max(0, x - 100), y: Math.max(0, y - 100), width: 200, height: 200, scale: 3 } });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(process.env.UI_SCREENSHOT_DIR, 'croisement-detail.png'), Buffer.from(data, 'base64'));
    } finally { await session.detach(); }
  }
  await svg.close(); await context.setOffline(false);
  await generation(page, 'autre.json', petit);
  const autre = await ouvrir(page);
  assert.equal(await autre.locator('.halo-croisement').count(), 0, 'aucun ancien repère dans le second résultat');
  assert.equal(await page.locator('#download-svg').getAttribute('download'), 'autre.svg');
});

test('ui-pistes-32px-croisements-couleurs-distinctes-export-et-remplacement', { timeout: 60000 }, async t => {
  const { page, context } = await interfaceTest(t, { fault: 'trace' });
  const sansConditions = JSON.parse(reference);
  sansConditions.edges.forEach(e => { e.data = { ...e.data, label: '' }; });
  const autreJson = JSON.stringify(sansConditions);
  for (const [nom, json, branches] of [['diagram.json', reference, 12], ['pistes.json', autreJson, 0]]) {
    await generation(page, nom, json);
    assert.equal(await page.locator('#result-name').textContent(), `Résultat de : ${nom}`);
    const svg = await ouvrir(page);
    const mesurer = () => svg.locator('svg').evaluate(root => {
      const erreurs = []; const arcs = [...root.querySelectorAll('.arc')].map(a => {
        const path = a.querySelector('.chemin');
        const n = path.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
        const points = Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[i * 2], y: n[i * 2 + 1] }));
        const couleur = getComputedStyle(path).stroke;
        const label = a.getAttribute('aria-label').trim().toLowerCase();
        const marker = root.querySelector(path.getAttribute('marker-end').slice(4, -1));
        if (getComputedStyle(marker.querySelector('path')).fill !== couleur) erreurs.push('pointe non assortie');
        const verts = ['rgb(74, 222, 128)', 'rgb(187, 247, 208)', 'rgb(22, 163, 74)'];
        const rouges = ['rgb(248, 113, 113)', 'rgb(254, 202, 202)', 'rgb(251, 113, 133)'];
        if (label === 'oui' ? !verts.includes(couleur) : label === 'non' ? !rouges.includes(couleur) :
          [...verts, ...rouges].includes(couleur)) erreurs.push('couleur conditionnelle incorrecte');
        return { id: a.dataset.arcId, label, couleur, points };
      });
      const segments = arcs.flatMap(arc => arc.points.slice(1).map((b, i) => ({ a: arc.points[i], b, arc })));
      let croisements = 0; let conditionsIdentiques = 0; let ordinaires = 0;
      for (const h of segments.filter(s => s.a.y === s.b.y)) for (const v of segments.filter(s => s.a.x === s.b.x)) {
        if (h.arc === v.arc) continue;
        if (v.a.x <= Math.min(h.a.x, h.b.x) + 1e-7 || v.a.x >= Math.max(h.a.x, h.b.x) - 1e-7 ||
          h.a.y <= Math.min(v.a.y, v.b.y) + 1e-7 || h.a.y >= Math.max(v.a.y, v.b.y) - 1e-7) continue;
        croisements++;
        const memeCondition = h.arc.label === v.arc.label && ['oui', 'non'].includes(h.arc.label);
        if (memeCondition) conditionsIdentiques++;
        if (h.arc.couleur === v.arc.couleur) erreurs.push(`croisement de même couleur : ${h.arc.id}/${v.arc.id}`);
        if (![h.arc.label, v.arc.label].some(l => ['oui', 'non'].includes(l))) ordinaires++;
      }
      for (const p of root.querySelectorAll('.dessus-croisement')) {
        if (getComputedStyle(p).stroke !== arcs.find(a => a.id === p.dataset.crossingFor).couleur) erreurs.push('repère non assorti');
      }
      return { erreurs, croisements, conditionsIdentiques, ordinaires, arcs, contenu: root.outerHTML };
    });
    const avant = await mesurer();
    assert.deepEqual(avant.erreurs, []);
    assert.ok(avant.croisements > 0 && avant.croisements <= 25,
      'les pistes espacées et sans auto-intersection conservent la réduction des croisements et leurs couleurs distinctes');
    assert.ok(avant.ordinaires > 0, 'croisements de pistes ordinaires effectivement testés');
    assert.equal(avant.arcs.filter(a => ['oui', 'non'].includes(a.label)).length, branches);
    const palette = [...new Set(avant.arcs.filter(a => !['oui', 'non'].includes(a.label)).map(a => a.couleur))];
    assert.ok(palette.length >= 2);
    // Chaque couleur attribuée apparaît réellement dans l'image affichée.
    const pixels = await page.locator('#svg-preview').evaluate((img, couleurs) => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      return couleurs.map(c => {
        const rgb = c.match(/\d+/g).map(Number); let nombre = 0;
        for (let i = 0; i < data.length; i += 4) if (rgb.every((n, j) => data[i + j] === n) && data[i + 3] === 255) nombre++;
        return nombre;
      });
    }, palette);
    assert.ok(pixels.every(n => n > 20), 'palette visible dans l’aperçu image');
    await capture(page, `pistes-colorees-${nom}`);
    const path = await enregistrer(t, page, nom.replace('.json', '.svg'), convertirJson(json));
    await context.setOffline(true);
    await svg.goto(pathToFileURL(path).href);
    assert.deepEqual(await mesurer(), avant, 'rendu identique dans le SVG autonome hors ligne');
    console.log(`couleurs-croisements ${JSON.stringify({ fichier: nom, croisements: avant.croisements,
      conditionsIdentiques: avant.conditionsIdentiques, ordinaires: avant.ordinaires, palette })}`);
    await svg.close(); await context.setOffline(false);
  }
});

test('ui-zoom-boutons-clavier-bornes-et-export-inchange', { timeout: 60000 }, async t => {
  const { page, context } = await interfaceTest(t);
  await generation(page);
  const initialUrl = await page.locator('#svg-preview').getAttribute('src');
  const original = convertirJson(reference);
  assert.equal(await page.getByRole('button', { name: 'Réduire le zoom', exact: true }).isDisabled(), true);
  const agrandir = page.getByRole('button', { name: 'Agrandir le zoom', exact: true });
  await agrandir.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#zoom-value').textContent(), '125 %');
  assert.equal(await page.locator('#zoom').getAttribute('aria-valuetext'), '125 % de la vue d’ensemble');
  const taille = await page.locator('#svg-preview').evaluate(img => {
    const v = document.querySelector('.preview');
    const scale = Math.min(v.clientWidth / img.naturalWidth, v.clientHeight / img.naturalHeight);
    return img.clientHeight / (img.naturalHeight * scale);
  });
  assert.ok(Math.abs(taille - 1.25) < .01, 'agrandissement effectif de l’image');
  await page.getByRole('button', { name: 'Réduire le zoom', exact: true }).focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#zoom').inputValue(), '100');
  await page.locator('#zoom').focus(); await page.keyboard.press('End');
  assert.equal(await page.locator('#zoom-value').textContent(), '400 %');
  assert.equal(await agrandir.isDisabled(), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#zoom-value').textContent(), '375 %');
  assert.equal(await agrandir.isDisabled(), false);
  assert.equal(await page.locator('#svg-preview').getAttribute('src'), initialUrl);
  assert.equal(await page.locator('#download-svg').getAttribute('href'), initialUrl);
  const path = await enregistrer(t, page, 'diagram.svg', original);
  const svg = await ouvrir(page);
  const before = await svg.locator('svg').evaluate(e => e.outerHTML);
  await context.setOffline(true);
  await svg.goto(pathToFileURL(path).href);
  assert.equal(await svg.locator('svg').evaluate(e => e.outerHTML), before);
  assert.equal(await svg.locator('.noeud').count(), 18);
  assert.equal(await svg.locator('.arc').count(), 24);
  await capture(page, 'zoom-boutons');
});

test('ui-zoom-molette-ancrage-defilement-et-vue-ensemble', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t);
  await generation(page);
  await page.locator('#zoom').fill('200');
  const view = page.locator('.preview');
  await view.scrollIntoViewIfNeeded();
  await view.evaluate(v => v.scrollTo((v.scrollWidth - v.clientWidth) / 2, (v.scrollHeight - v.clientHeight) / 2));
  const point = () => view.evaluate(v => {
    const img = v.querySelector('img');
    const scale = Math.min(img.clientWidth / img.naturalWidth, img.clientHeight / img.naturalHeight);
    return { x: (v.scrollLeft + v.clientWidth / 2 - (img.clientWidth - img.naturalWidth * scale) / 2) / scale,
      y: (v.scrollTop + v.clientHeight / 2 - (img.clientHeight - img.naturalHeight * scale) / 2) / scale };
  });
  // Événement de molette dans la région, avec les coordonnées réelles du pointeur.
  const wheel = (deltaY, ctrlKey = true) => view.evaluate((v, { deltaY, ctrlKey }) => {
    const b = v.getBoundingClientRect();
    const event = new WheelEvent('wheel', { deltaY, ctrlKey, bubbles: true, cancelable: true,
      clientX: b.left + v.clientLeft + v.clientWidth / 2, clientY: b.top + v.clientTop + v.clientHeight / 2 });
    v.dispatchEvent(event); return event.defaultPrevented;
  }, { deltaY, ctrlKey });
  const before = await point();
  assert.equal(await wheel(-120), true);
  assert.equal(await page.locator('#zoom-value').textContent(), '225 %');
  const after = await point();
  assert.ok(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2,
    'le même détail reste sous la souris');
  assert.equal(await wheel(120, false), false, 'la molette sans Ctrl reste disponible pour défiler');
  assert.equal(await page.locator('#zoom').inputValue(), '225');
  await wheel(120);
  assert.equal(await page.locator('#zoom').inputValue(), '200');
  await page.locator('#zoom').fill('400');
  await wheel(-120);
  assert.equal(await page.locator('#zoom').inputValue(), '400');
  await capture(page, 'zoom-molette');
  await page.locator('#fit').click();
  assert.equal(await page.locator('#zoom-value').textContent(), '100 %');
  assert.deepEqual(await view.evaluate(v => [v.scrollLeft, v.scrollTop]), [0, 0]);
  assert.equal(await page.locator('#zoom-out').isDisabled(), true);
  await wheel(120);
  assert.equal(await page.locator('#zoom').inputValue(), '100');
});

test('ui-zoom-fenetre-etroite-plein-ecran-remplacement-et-reprise', { timeout: 30000 }, async t => {
  const { page } = await interfaceTest(t, { viewport: { width: 320, height: 740 } });
  await generation(page);
  for (const expanded of [false, true]) {
    if (expanded) {
      await page.evaluate(() => { document.querySelector('#result').requestFullscreen = undefined; });
      await page.locator('#fullscreen').click();
    }
    await page.locator('#zoom-in').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#zoom').inputValue(), expanded ? '150' : '125');
    assert.equal(await page.locator('.zoom-controls button, .zoom-controls input').evaluateAll(elements => elements.every(e => {
      const b = e.getBoundingClientRect(); return b.x >= 0 && b.right <= innerWidth && b.width > 0;
    })), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await page.locator('.preview').evaluate(v => v.scrollHeight > v.clientHeight || v.scrollWidth > v.clientWidth),
      'les détails restent accessibles par défilement sur l’axe agrandi');
    if (expanded) await page.keyboard.press('Escape');
  }
  const first = await page.locator('#svg-preview').getAttribute('src');
  await generation(page, 'zoom-autre.json', petit);
  assert.equal(await page.locator('#zoom').inputValue(), '100');
  assert.equal(await page.locator('#zoom-out').isDisabled(), true);
  assert.equal(await page.locator('#zoom-in').isDisabled(), false);
  assert.equal(await page.evaluate(url => window.urlsRevoked.includes(url), first), true);
  await page.locator('#zoom-in').click();
  await enregistrer(t, page, 'zoom-autre.svg', convertirJson(petit));
  await selection(page, 'invalide.json', '{');
  await page.locator('#generate').click(); await echec(page, /JSON valide/);
  await generation(page, 'reprise.json', petit);
  assert.equal(await page.locator('#zoom-value').textContent(), '100 %');
  assert.equal(await page.locator('#result-name').textContent(), 'Résultat de : reprise.json');
  await capture(page, 'zoom-fenetre-etroite');
});

test('ui-noeuds-finaux-legende-reprise-remplacement-et-export-autonome', { timeout: 60000 }, async t => {
  const ui = await interfaceTest(t, { fault: 'trace', viewport: { width: 360, height: 800 } });
  const { page, context } = ui;
  const document = { nodes: [
    { id: 'debut', type: 'activityInitialNode', width: 60, height: 40, data: { name: 'ActivityInitialNode' } },
    { id: 'action', type: 'activityActionNode', width: 120, height: 60, data: { name: 'Décider à Noël\nUne explication longue avec des accents' } },
    { id: 'decision', type: 'activityDecisionNode', width: 90, height: 60, data: { name: 'Validé ?' } },
    { id: 'fin-oui', type: 'activityFinalNode', width: 30, height: 30, data: { name: 'Terminé\nÉté & <fin>' } },
    { id: 'fin-non', type: 'activityFinalNode', width: 30, height: 30, data: { name: 'ActivityFinalNode' } },
  ], edges: [
    ['entree', 'debut', 'action', ''], ['suite', 'action', 'decision', 'à vérifier'],
    ['accepte', 'decision', 'fin-oui', ' OUI '], ['refuse', 'decision', 'fin-non', '\tNon '],
  ].map(([id, source, target, label]) => ({ id, source, target, type: 'ActivityControlFlow', data: { label } })) };
  // Reproduit l'emplacement nodes[4] du diagnostic signalé et la reprise après rejet.
  const invalide = structuredClone(document); invalide.nodes[4].type = 'inconnu';
  await selection(page, 'invalide.json', JSON.stringify(invalide)); await page.locator('#generate').click();
  await echec(page, /TYPE_NON_PRIS_EN_CHARGE.*nodes\[4\]/);
  const json = JSON.stringify(document);
  for (const [name, content, legendes] of [['finaux.json', json, ['Oui', 'Non']],
    ['sans-conditions.json', JSON.stringify({ ...document, edges: document.edges.map(e => ({ ...e, data: { label: 'Continuer' } })) }), []]]) {
    await generation(page, name, content);
    assert.equal(await page.locator('#result-name').textContent(), `Résultat de : ${name}`);
    const svg = await ouvrir(page);
    assert.equal(await svg.locator('.noeud').count(), 5);
    assert.equal(await svg.locator('.arc').count(), 4);
    assert.equal(await svg.locator('.forme.finale').count(), 2);
    assert.equal(await svg.locator('.contour-final').count(), 2);
    assert.equal(await svg.locator('[data-node-id="fin-non"] .texte-noeud').textContent(), 'Fin');
    assert.equal(await svg.locator('[data-node-id="fin-oui"] .texte-noeud').textContent(), 'TerminéÉté & <fin>');
    assert.equal(await svg.locator('[data-node-id="debut"] .texte-noeud').textContent(), 'Début');
    assert.deepEqual(await svg.locator('.texte-legende').allTextContents(), legendes);
    assert.equal(await svg.locator('.texte-arc').filter({ hasText: /^\s*(oui|non)\s*$/i }).count(), 0);
    const problemes = await svg.locator('svg').evaluate(root => {
      const vb = root.viewBox.baseVal; const errors = [];
      for (const el of root.querySelectorAll('.legende, .contour-final, text')) {
        if (el.tagName === 'text' && !el.textContent) continue;
        const b = el.getBBox();
        if (b.x < vb.x + 14 || b.y < vb.y + 14 || b.x + b.width > vb.x + vb.width - 14 || b.y + b.height > vb.y + vb.height - 14) errors.push('élément coupé');
      }
      for (const node of root.querySelectorAll('.noeud:has(.finale)')) {
        const inner = node.querySelector('.contour-final').getBBox();
        for (const span of node.querySelectorAll('tspan')) {
          const b = span.getBBox();
          for (const x of [b.x, b.x + b.width]) for (const y of [b.y, b.y + b.height]) {
            const nx = (x - inner.x - inner.width / 2) / (inner.width / 2);
            const ny = (y - inner.y - inner.height / 2) / (inner.height / 2);
            if (nx * nx + ny * ny >= 1) errors.push('texte hors double contour');
          }
        }
      }
      return errors;
    });
    assert.deepEqual(problemes, []);
    await page.locator('#zoom-in').focus(); await page.keyboard.press('Enter');
    await capture(page, `noeuds-finaux-${name}`);
    if (process.env.UI_SCREENSHOT_DIR) {
      await svg.locator('svg').evaluate(root => { const v = root.viewBox.baseVal; root.style.width = '720px'; root.style.height = `${720 * v.height / v.width}px`; });
      // Capture CDP : les helpers HTML de screenshot ne s'appliquent pas au document XML autonome.
      const session = await context.newCDPSession(svg);
      try {
        const clip = await svg.locator('svg').evaluate(root => { const b = root.getBoundingClientRect(); return { x: 0, y: 0, width: b.width, height: b.height, scale: 1 }; });
        const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
        await writeFile(join(process.env.UI_SCREENSHOT_DIR, `${name}-export.png`), Buffer.from(data, 'base64'));
      } finally { await session.detach(); }
    }
    const before = await svg.locator('svg').evaluate(e => { e.removeAttribute('style'); return e.outerHTML; });
    const path = await enregistrer(t, page, name.replace('.json', '.svg'), convertirJson(content));
    await context.setOffline(true);
    await svg.goto(pathToFileURL(path).href);
    assert.equal(await svg.locator('svg').evaluate(e => e.outerHTML), before);
    assert.deepEqual(await svg.locator('.texte-legende').allTextContents(), legendes);
    await context.setOffline(false); await svg.close();
  }
  const traces = [...ui.stdout.matchAll(/conflits-service (\{[^\n]+\})/g)];
  assert.equal(traces.length, 2);
  traces.forEach(([, trace]) => assert.deepEqual(JSON.parse(trace), { verifierChemin: [], verifierPlacement: [], verifierPlacementChemin: [] }));
  const urls = await page.evaluate(() => ({ created: window.urlsCreated, revoked: window.urlsRevoked }));
  assert.equal(urls.created.length, 2); assert.deepEqual(urls.revoked, urls.created.slice(0, 1));
});
