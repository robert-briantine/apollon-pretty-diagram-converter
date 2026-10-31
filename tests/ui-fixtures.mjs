import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const reference = await readFile(new URL('../diagram.json', import.meta.url), 'utf8');
export const petit = JSON.stringify({ nodes: [
  { id: 'debut', type: 'activityInitialNode', width: 100, height: 60, data: { name: 'Été\nDébut' } },
  { id: 'action', type: 'activityActionNode', width: 100, height: 40,
    data: { name: 'Présentation & <texte> : une longue explication avec accents\nDeuxième ligne' } },
], edges: [
  { id: 'aller', type: 'ActivityControlFlow', source: 'debut', target: 'action', data: { label: 'oui' } },
  { id: 'boucle', type: 'ActivityControlFlow', source: 'action', target: 'action', data: { label: 'non' } },
] });

export async function interfaceTest(t, { fault, viewport = { width: 1440, height: 1000 } } = {}) {
  const flags = fault ? ['--experimental-test-module-mocks', '--import', resolve(root, 'tests/http-faults.mjs')] : [];
  const child = spawn(process.execPath, [...flags, resolve(root, 'dist/server/index.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', ...(fault ? { DIAGRAM_HTTP_FAULT: fault } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; let stderr = ''; let port = null; let closed = false; let browser;
  const done = once(child, 'close').then(() => { closed = true; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  // Nettoyage enregistré avant toute attente ou ouverture de navigateur.
  t.after(async () => {
    try { if (browser) await browser.close(); }
    finally {
      if (!closed) child.kill('SIGTERM');
      let timer;
      try {
        await Promise.race([done, new Promise((_, reject) => {
          timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Serveur non arrêté')); }, 5000);
        })]);
        assert.equal(closed, true);
        if (port) await assert.rejects(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) }));
      } finally {
        clearTimeout(timer);
        console.log(`serveur-test ${JSON.stringify({ pid: child.pid, port, stopped: closed })}`);
      }
    }
  });
  let startupTimer;
  try {
    await Promise.race([new Promise((accept, reject) => {
      child.on('error', reject);
      child.stdout.on('data', chunk => {
        stdout += chunk;
        const match = stdout.match(/Serveur disponible sur http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { port = Number(match[1]); accept(); }
      });
      done.then(() => reject(new Error(`Arrêt avant écoute : ${stderr}`)), reject);
    }), new Promise((_, reject) => { startupTimer = setTimeout(() => reject(new Error('Démarrage expiré')), 10000); })]);
  } finally { clearTimeout(startupTimer); }
  browser = await chromium.launch({ timeout: 20000 });
  const context = await browser.newContext({ acceptDownloads: true, viewport });
  await context.addInitScript(() => {
    window.urlsCreated = []; window.urlsRevoked = [];
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); window.urlsCreated.push(url); return url; };
    URL.revokeObjectURL = url => { window.urlsRevoked.push(url); revoke(url); };
  });
  const page = await context.newPage();
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
  t.after(() => assert.deepEqual(pageErrors, []));
  const url = `http://127.0.0.1:${port}`;
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#diagram-file').disabled);
  return { page, context, url, get stdout() { return stdout; }, get stderr() { return stderr; } };
}
export async function selection(page, name = 'diagram.json', content = reference) {
  await page.locator('#diagram-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
}
export async function generation(page, name = 'diagram.json', content = reference) {
  await selection(page, name, content);
  await page.getByRole('button', { name: 'Générer le SVG', exact: true }).click();
  await succes(page);
}
export async function succes(page) {
  await page.waitForFunction(() => document.querySelector('#app-status').textContent.includes('avec succès'));
  assert.equal(await page.locator('#app-error').isVisible(), false);
  assert.equal(await page.locator('#result').isVisible(), true);
  await page.waitForFunction(() => document.querySelector('#svg-preview').naturalWidth > 0);
}
export async function echec(page, message) {
  await page.locator('#app-error').waitFor({ state: 'visible' });
  assert.match(await page.locator('#app-error').textContent(), message);
  assert.equal(await page.locator('#result').isVisible(), false);
  assert.equal(await page.locator('#svg-preview').getAttribute('src'), null);
  assert.equal(await page.locator('#download-svg').getAttribute('href'), null);
  assert.equal(await page.locator('#diagram-file').isDisabled(), false);
}
export async function capture(page, name) {
  if (!process.env.UI_SCREENSHOT_DIR) return;
  const directory = resolve(process.env.UI_SCREENSHOT_DIR);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, `${name}.png`), fullPage: true });
}
