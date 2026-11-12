import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { interfaceTest } from './ui-fixtures.mjs';

const reference = JSON.parse(await readFile(new URL('../docs/jeu/scene-reference.json', import.meta.url), 'utf8'));
const sizes = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 800, height: 800 }, { width: 360, height: 640 }];
const captures = new URL('../docs/jeu/captures/', import.meta.url);
async function open(t) {
  const ui = await interfaceTest(t, { viewport: sizes[0] });
  await ui.page.goto(`${ui.url}/jeu-demo.html`);
  await ui.page.evaluate(async () => await (await import('/assets/jeu/demo.js')).ready);
  return ui;
}
async function capture(page, name) {
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: new URL(`${name}.png`, captures).pathname });
}

test('jeu-sprites-assets-transparents-silhouettes-et-palette', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const results = await page.evaluate(async () => {
    const { sprites, loadSprites, spritePivot } = await import('/assets/jeu/sprites.js');
    const images = await loadSprites();
    return Object.entries(sprites).map(([key, s]) => {
      const canvas = document.createElement('canvas'); canvas.width = s.width; canvas.height = s.height;
      const c = canvas.getContext('2d'); c.drawImage(images[s.file], 0, 0, s.width, s.height);
      const { data } = c.getImageData(0, 0, s.width, s.height);
      let count = 0, light = 0, edge = 0, maxContrast = 0;
      const luminance = channels => channels.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const backgroundLuminance = luminance([23, 40, 58]);
      const levels = new Set(); const silhouette = [];
      for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
        const i = (y * s.width + x) * 4;
        if (!data[i + 3]) continue;
        count++; if (data[i] + data[i + 1] + data[i + 2] > 450) light++;
        if (data[i + 3] > 240) maxContrast = Math.max(maxContrast, (luminance([data[i], data[i + 1], data[i + 2]]) + .05) / (backgroundLuminance + .05));
        levels.add(Math.round((data[i] + data[i + 1] + data[i + 2]) / 30));
        if (!x || !y || x === s.width - 1 || y === s.height - 1) edge++;
      }
      // Masque normalisé : l'identification doit survivre à la suppression des couleurs.
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        const px = Math.min(s.width - 1, Math.floor((x + .5) * s.width / 12));
        const py = Math.min(s.height - 1, Math.floor((y + .5) * s.height / 12));
        silhouette.push(data[(py * s.width + px) * 4 + 3] > 127 ? '1' : '0');
      }
      return { key, count, area: s.width * s.height, light, maxContrast, levels: levels.size, edge,
        corners: [data[3], data[(s.width - 1) * 4 + 3], data[((s.height - 1) * s.width) * 4 + 3], data[data.length - 1]],
        source: [images[s.file].naturalWidth, images[s.file].naturalHeight], size: [s.width, s.height], pivot: spritePivot,
        mask: silhouette.join('') };
    });
  });
  assert.equal(results.length, 9);
  for (const r of results) {
    assert.deepEqual(r.source, r.size.map(n => n * 2));
    assert.deepEqual(r.pivot, { x: .5, y: .5 });
    assert.deepEqual(r.corners, [0, 0, 0, 0], r.key);
    assert.ok(r.count > r.area * .18 && r.count < r.area * .94, r.key);
    assert.ok(r.light > 0 && r.levels >= 4, `volumes et valeurs de ${r.key}`);
    assert.ok(r.maxContrast >= 3, `arêtes lisibles sur la planète : ${r.key}`);
    assert.equal(r.edge, 0, `aucune coupure au bord : ${r.key}`);
  }
  const shapes = results.filter(r => ['joueur', 'ennemi', 'boss', 'vaisseau-mere'].includes(r.key));
  assert.equal(new Set(shapes.map(r => r.mask)).size, 4);
  const crate = results.find(r => r.key === 'objet-destructible'), shot = results.find(r => r.key === 'tir-ennemi');
  assert.notEqual(crate.mask, shot.mask);
});

test('jeu-sprites-planche-scenes-quatre-formats-et-densite', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.waitForFunction(h => document.querySelector('canvas').style.height === `${h}px`, size.height);
    await page.locator('#sheet').click();
    const result = await page.evaluate(async reference => {
      const view = await (await import('/assets/jeu/demo.js')).ready;
      const { spriteSheet } = await import('/assets/jeu/sheet.js');
      const { screenBounds } = await import('/assets/jeu/camera.js');
      const snapshot = view.getSnapshot(), scene = spriteSheet(reference, snapshot.game);
      return { snapshot, entities: scene.entities.map(e => ({ ...e, bounds: screenBounds(e, snapshot.camera, snapshot.game) })) };
    }, reference);
    assert.equal(result.snapshot.visibleIds.length, 9);
    for (const e of result.entities) {
      assert.ok(e.bounds.x >= 0 && e.bounds.y >= 0);
      assert.ok(e.bounds.x + e.bounds.width <= result.snapshot.game.width);
      assert.ok(e.bounds.y + e.bounds.height + 30 <= result.snapshot.game.height);
      assert.deepEqual([e.bounds.width, e.bounds.height], [e.dimensions.width, e.dimensions.height]);
    }
    await capture(page, `planche-${size.width}x${size.height}`);
    for (const scene of ['catalogue', 'amas-dense']) {
      await page.selectOption('#scenario', scene);
      await page.dispatchEvent('#scenario', 'change');
      const pixels = await page.locator('canvas').evaluate(canvas => {
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return { opaque: d.every((v, i) => i % 4 !== 3 || v === 255), colors: new Set(Array.from(d).filter((_, i) => i % 4 === 0)).size };
      });
      assert.equal(pixels.opaque, true); assert.ok(pixels.colors > 60);
      await capture(page, `apres-${scene}-${size.width}x${size.height}`);
      if (scene === 'amas-dense') {
        await page.locator('canvas').evaluate(canvas => {
          const c = canvas.getContext('2d'), image = c.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < image.data.length; i += 4) {
            const grey = .2126 * image.data[i] + .7152 * image.data[i + 1] + .0722 * image.data[i + 2];
            image.data[i] = image.data[i + 1] = image.data[i + 2] = grey;
          }
          c.putImageData(image, 0, 0);
        });
        await capture(page, `gris-amas-dense-${size.width}x${size.height}`);
      }
    }
  }
});

test('jeu-sprites-comparaison-reference-meme-cadrage-et-echelle', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const manifest = JSON.parse(await readFile(new URL('../docs/jeu/captures/avant.json', import.meta.url), 'utf8'));
  for (const id of ['catalogue', 'amas-dense']) {
    await page.selectOption('#scenario', id);
    const actual = await page.evaluate(async () => (await (await import('/assets/jeu/demo.js')).ready).getSnapshot());
    assert.deepEqual(actual.camera, manifest[id].camera);
    assert.deepEqual(actual.game, manifest[id].game);
    assert.deepEqual(actual.visibleIds, manifest[id].visibleIds);
    const before = await readFile(new URL(`../docs/jeu/captures/avant-${id}-1280x720.png`, import.meta.url));
    assert.ok(before.length > 1000);
    const after = await page.screenshot();
    assert.notDeepEqual(after, before);
    await capture(page, `apres-${id}-1280x720`);
  }
});

test('jeu-sprites-orientations-transitions-pivots-et-instantanes-immuables', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const result = await page.evaluate(async reference => {
    const view = await (await import('/assets/jeu/demo.js')).ready;
    const { spriteTransform } = await import('/assets/jeu/sprites.js');
    const original = JSON.stringify(reference);
    // Métadonnées opaques du futur moteur : le rendu doit les laisser intactes.
    reference.entities.forEach(e => { e.damage = 7; e.collision = { radius: 9 }; });
    const expected = JSON.stringify(reference);
    view.setScene(reference);
    const canvas = document.querySelector('canvas'), c = canvas.getContext('2d');
    const hash = () => Array.from(c.getImageData(500, 340, 40, 40).data).reduce((a, b) => (a * 31 + b) >>> 0, 0);
    const baseline = hash(), samples = [], transforms = [];
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (const state of ['repos', 'deplacement', 'tir', 'impact', 'destruction']) {
        const hashes = [];
        for (const progress of [0, .5, 1]) {
          view.setPresentation({ [reference.playerId]: { orientation: angle, state, progress } });
          const snapshot = view.getSnapshot();
          hashes.push(hash());
          samples.push({ camera: snapshot.camera, picked: view.inspect({ x: 520, y: 360 }).id, visible: snapshot.visibleIds });
        }
        transforms.push({ angle, state, hashes, transform: spriteTransform(reference.entities[0], angle) });
      }
    }
    view.setPresentation({});
    return { baseline, restored: hash(), samples, transforms, unchanged: JSON.stringify(reference) === expected, originalPresent: !!original };
  }, reference);
  assert.equal(result.unchanged, true); assert.equal(result.baseline, result.restored);
  for (const sample of result.samples) {
    assert.equal(sample.picked, reference.playerId);
    assert.deepEqual(sample.camera, { x: 0, y: 0, zoom: 1 });
    assert.deepEqual(sample.visible, result.samples[0].visible);
  }
  for (const sample of result.transforms) {
    assert.deepEqual(sample.transform.pivot, { x: .5, y: .5 });
    if (sample.state !== 'repos') assert.notEqual(sample.hashes[0], sample.hashes[1], sample.state);
    if (sample.state !== 'destruction') assert.equal(sample.hashes[0], sample.hashes[2], sample.state);
  }
  await page.locator('#sheet').click();
  for (const [state, angle] of [['deplacement', '90'], ['tir', '180'], ['impact', '270'], ['destruction', '0']]) {
    await page.selectOption('#visual-state', state);
    await page.locator('#orientation').fill(angle); await page.dispatchEvent('#orientation', 'input');
    await page.locator('#timeline').fill('75'); await page.dispatchEvent('#timeline', 'input');
    await capture(page, `etat-${state}-${angle}`);
  }
  await page.locator('#animate').click();
  await page.waitForFunction(() => document.querySelector('#timeline').value === '150');
});

test('jeu-sprites-chargement-local-sans-reseau-distant-et-diagnostic-manquant', { timeout: 60000 }, async t => {
  const { page, context, url } = await interfaceTest(t, { viewport: sizes[0] });
  const remote = [], failures = [], resources = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== url) { remote.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('response', response => { if (response.url().endsWith('.svg')) resources.push({ url: response.url(), status: response.status() }); });
  await page.goto(`${url}/jeu-demo.html`);
  await page.evaluate(async () => await (await import('/assets/jeu/demo.js')).ready);
  await page.locator('#sheet').click();
  assert.deepEqual(remote, []); assert.deepEqual(failures, []);
  assert.equal(resources.length, 10); assert.ok(resources.every(r => r.status === 200));
  // Échec explicite plutôt qu'une scène silencieusement privée d'un sprite.
  await context.route('**/jeu/sprites/boss.svg', route => route.fulfill({ status: 404, body: '' }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Sprite local indisponible : boss.svg'));
});

