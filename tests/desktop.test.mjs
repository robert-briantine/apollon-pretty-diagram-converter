import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { convertirJson } from '../dist/server/conversion.js';
import { selection, generation, succes, echec, reference, petit } from './ui-fixtures.mjs';

async function desktop(t) {
  const app = express();
  let api = 0;
  app.post('/api/generate', (_req, res) => { api++; res.sendStatus(500); });
  app.use(express.static(resolve('dist/desktop')));
  const server = app.listen(0, '127.0.0.1');
  let browser;
  t.after(async () => {
    try { if (browser) await browser.close(); }
    finally {
      await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
      assert.equal(server.listening, false);
      console.log(`serveur-test ${JSON.stringify({ pid: process.pid, port: server.address()?.port ?? port, stopped: !server.listening })}`);
    }
  });
  await once(server, 'listening');
  const port = server.address().port;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(() => {
    window.nativeCalls = []; window.nativeFailure = false; window.urlsRevoked = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { window.urlsRevoked.push(url); revoke(url); };
    window.__TAURI_INTERNALS__ = { invoke: async (command, payload) => {
      window.nativeCalls.push({ command, payload });
      if (window.nativeFailure) throw new Error('Disque inaccessible');
      return false; // Simule l'annulation du dialogue, sans erreur.
    } };
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => { assert.deepEqual(errors, []); assert.equal(api, 0, 'aucun serveur de conversion nécessaire'); });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => !document.querySelector('#diagram-file').disabled);
  return { page, context };
}
async function svg(page) {
  return page.locator('#svg-preview').evaluate(async img => (await fetch(img.src)).text());
}

test('desktop-worker-hors-ligne-meme-svg-18-noeuds-24-arcs-et-remplacement', { timeout: 60000 }, async t => {
  const { page, context } = await desktop(t);
  // Les assets et le worker sont embarqués ; aucun réseau de conversion.
  await page.route('**/api/**', route => route.abort());
  await generation(page);
  const first = await svg(page);
  assert.equal(first, convertirJson(reference));
  assert.equal((first.match(/class="noeud"/g) ?? []).length, 18);
  assert.equal((first.match(/class="chemin(?:\s[^"]*)?"/g) ?? []).length, 24);
  await page.locator('#zoom-in').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#zoom-value').textContent(), '125 %');
  await page.locator('#fullscreen').click(); await page.keyboard.press('Escape');
  const old = await page.locator('#svg-preview').getAttribute('src');
  await generation(page, 'été.json', petit);
  const second = await svg(page);
  assert.equal(second, convertirJson(petit)); assert.notEqual(first, second);
  assert.ok(await page.evaluate(old => window.urlsRevoked.includes(old), old));
  await page.locator('#download-svg').click();
  assert.deepEqual(await page.evaluate(() => window.nativeCalls.at(-1)), {
    command: 'save_svg', payload: { svg: second, name: 'été.svg' },
  });
  // Ouvre séparément les octets remis au dialogue natif, sans service de conversion.
  const standalone = await context.newPage();
  await standalone.goto(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(second)}`);
  assert.equal(await standalone.locator('svg').count(), 1);
  assert.equal(await standalone.locator('parsererror').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('desktop-erreurs-json-metier-worker-expiration-et-reprise-sans-apercu-perime', { timeout: 60000 }, async t => {
  const { page } = await desktop(t);
  assert.equal(await page.locator('#generate').isDisabled(), true);
  await selection(page, 'invalide.json', '{'); await page.locator('#generate').click();
  await echec(page, /JSON valide/);
  await generation(page, 'valide.json', petit);
  await selection(page, 'structure.json', '{}'); await page.locator('#generate').click();
  await echec(page, /Conversion \(import\)/);
  await page.route('**/worker.js', route => route.abort());
  await selection(page, 'worker.json', petit); await page.locator('#generate').click();
  await echec(page, /conversion locale/);
  await page.unroute('**/worker.js');
  await generation(page, 'reprise.json', petit);
  await page.evaluate(() => {
    window.RealWorker = Worker;
    window.terminated = 0;
    window.Worker = class { postMessage() {} terminate() { window.terminated++; } };
  });
  await page.clock.install();
  await selection(page, 'lent.json', petit); await page.locator('#generate').click();
  await page.waitForFunction(() => document.querySelector('#app-status').textContent.startsWith('Génération'));
  assert.equal(await page.locator('#generate').isDisabled(), true);
  await page.clock.fastForward(60001);
  await echec(page, /trop de temps/);
  assert.equal(await page.evaluate(() => window.terminated), 1);
  await page.evaluate(() => { window.Worker = window.RealWorker; });
  await generation(page, 'nouveau.json', petit);
  assert.equal(await svg(page), convertirJson(petit));
});

test('desktop-dialogue-annule-erreur-ecriture-et-ouverture-native-du-bon-resultat', { timeout: 30000 }, async t => {
  const { page } = await desktop(t);
  await generation(page, 'présentation.json', petit);
  await page.locator('#download-svg').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.nativeCalls.length === 1);
  await succes(page); // Annuler conserve le résultat.
  await page.evaluate(() => { window.nativeFailure = true; });
  await page.locator('#download-svg').click();
  await page.locator('#app-error').waitFor({ state: 'visible' });
  assert.match(await page.locator('#app-error').textContent(), /Disque inaccessible/);
  assert.equal(await page.locator('#result').isVisible(), true);
  await page.evaluate(() => { window.nativeFailure = false; });
  await generation(page, 'autre.json', petit);
  await page.locator('#open-svg').click();
  await page.waitForFunction(() => window.nativeCalls.length === 3);
  assert.deepEqual(await page.evaluate(() => window.nativeCalls.at(-1)), {
    command: 'open_svg', payload: { svg: convertirJson(petit), name: 'autre.svg' },
  });
});
