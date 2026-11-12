import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { interfaceTest } from './ui-fixtures.mjs';

const reference = JSON.parse(await readFile(new URL('../docs/jeu/scene-reference.json', import.meta.url), 'utf8'));
const sizes = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 800, height: 800 }, { width: 360, height: 640 }];
async function open(t) {
  const ui = await interfaceTest(t, { viewport: sizes[0] });
  await ui.page.goto(`${ui.url}/jeu-demo.html`);
  await ui.page.evaluate(async () => { await (await import('/assets/jeu/demo.js')).ready; });
  return ui;
}
async function snapshot(page) {
  return page.evaluate(async () => (await (await import('/assets/jeu/demo.js')).ready).getSnapshot());
}
async function resize(page, size) {
  await page.setViewportSize(size);
  await page.waitForFunction(({ width, height }) => {
    const c = document.querySelector('canvas');
    return parseFloat(c.style.width) === width - Math.min(240, Math.floor(width * .2)) && parseFloat(c.style.height) === height;
  }, size);
}
async function capture(page, name) {
  if (!process.env.JEU_SCREENSHOT_DIR) return;
  await mkdir(resolve(process.env.JEU_SCREENSHOT_DIR), { recursive: true });
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(process.env.JEU_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
  } finally { await session.detach(); }
}

test('jeu-navigateur-formats-redimensionnement-et-hud', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  for (const size of [...sizes, { width: 1280, height: 720 }]) {
    await resize(page, size);
    const s = await snapshot(page);
    const boxes = await page.evaluate(() => {
      const rect = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      return { game: rect(document.querySelector('canvas')), hud: rect(document.querySelector('aside')),
        overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        controlsFit: [...document.querySelectorAll('aside button, aside select, aside a, aside output')].every(e => {
          const b = e.getBoundingClientRect(), a = document.querySelector('aside').getBoundingClientRect();
          return b.x >= a.x && b.right <= a.right;
        }) };
    });
    assert.deepEqual(boxes.game, s.game); assert.deepEqual(boxes.hud, s.hud);
    assert.equal(s.game.width + s.hud.width, size.width);
    assert.equal(s.game.height, size.height); assert.ok(s.game.width > 0);
    assert.equal(boxes.overflow, false); assert.equal(boxes.controlsFit, true);
    assert.deepEqual(s.camera, { x: 0, y: 0, zoom: 1 });
    await capture(page, `format-${size.width}x${size.height}`);
  }
});

test('jeu-navigateur-coins-centre-hors-champ-et-pixels', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  for (const size of sizes) {
    await resize(page, size);
    const result = await page.evaluate(async reference => {
      const view = await (await import('/assets/jeu/demo.js')).ready;
      view.setCamera({ x: 0, y: 0, zoom: 1 });
      const { game: { width: w, height: h } } = view.getSnapshot();
      const points = [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8], [w / 2, h / 2],
        [-7, h / 2], [w + 7, h / 2], [w / 2, -5], [w / 2, h + 5],
        [-6, h / 2], [w + 6, h / 2], [w / 2, -4], [w / 2, h + 4],
        [-5, h / 2], [w + 5, h / 2], [w / 2, -3], [w / 2, h + 3]];
      const entities = points.map(([x, y], i) => ({ ...reference.entities[2], id: `coin-${i}`,
        position: { x: x - w / 2, y: y - h / 2 }, dimensions: { width: 12, height: 8 } }));
      entities.push({ ...entities[4], id: 'inactif', state: 'inactif' }, { ...entities[4], id: 'detruit', state: 'detruit' });
      view.setScene({ ...reference, entities });
      const canvas = document.querySelector('canvas');
      const c = canvas.getContext('2d');
      const pixel = (x, y) => [...c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data];
      const image = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = true;
      for (let i = 3; i < image.length; i += 4) if (image[i] !== 255) opaque = false;
      return { visible: view.getSnapshot().visibleIds, pixels: points.slice(0, 5).map(([x, y]) => pixel(x, y)),
        corners: [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => pixel(x, y)), opaque };
    }, reference);
    assert.deepEqual(result.visible, [0, 1, 2, 3, 4, 13, 14, 15, 16].map(i => `coin-${i}`));
    assert.deepEqual(result.pixels, Array(5).fill([246, 205, 114, 255]), 'entités dessinées dans chaque coin et au centre');
    assert.deepEqual(result.corners, Array(4).fill([23, 40, 58, 255]), 'le monde atteint les quatre coins');
    assert.equal(result.opaque, true, 'aucun pixel vide hérité du masque circulaire');
    await capture(page, `coins-${size.width}x${size.height}`);
  }
});

test('jeu-navigateur-planete-circulaire-bords-et-proportions', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const result = await page.evaluate(async reference => {
    const view = await (await import('/assets/jeu/demo.js')).ready;
    const c = document.querySelector('canvas').getContext('2d');
    const pixel = (x, y) => [...c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data];
    // Le disque complet : diamètre horizontal et vertical de 480 px, centre (520,360).
    view.setScene({ ...reference, entities: [] });
    view.setCamera({ x: 0, y: 0, zoom: .1 });
    const extents = [];
    for (const horizontal of [true, false]) {
      const values = [];
      for (let i = 0; i < (horizontal ? 1040 : 720); i++) {
        const p = horizontal ? pixel(i, 360) : pixel(520, i);
        if (p[0] !== 8 || p[1] !== 15 || p[2] !== 32) values.push(i);
      }
      extents.push(values.at(-1) - values[0] + 1);
    }
    const corners = [[0, 0], [1039, 0], [0, 719], [1039, 719]].map(p => pixel(...p));
    // Les quatre bords de planète et une caméra libre au-delà du disque.
    const edges = [];
    for (const [x, y] of [[2400, 0], [-2400, 0], [0, 2400], [0, -2400], [2800, 2800]]) {
      const entity = { ...reference.entities[2], id: 'repere', position: { x, y }, dimensions: { width: 32, height: 20 } };
      view.setCamera({ x, y, zoom: 1 });
      view.setScene({ ...reference, entities: [entity] });
      const image = c.getImageData(490, 330, 60, 60);
      const points = [];
      for (let py = 0; py < 60; py++) for (let px = 0; px < 60; px++) {
        const i = (py * 60 + px) * 4;
        if (image.data[i] === 246 && image.data[i + 1] === 205) points.push([px, py]);
      }
      const width = Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) + 1;
      const height = Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])) + 1;
      edges.push({ camera: view.getSnapshot().camera, width, height, visible: view.getSnapshot().visibleIds,
        alpha: [[0, 0], [1039, 0], [0, 719], [1039, 719]].map(p => pixel(...p)[3]) });
    }
    view.setCamera({ x: 2400, y: 0, zoom: 1 });
    view.setScene({ ...reference, entities: [] });
    return { extents, corners, edges, inside: pixel(400, 350), outside: pixel(600, 350), planet: reference.planet };
  }, reference);
  assert.deepEqual(result.extents, [482, 482]);
  assert.deepEqual(result.corners, Array(4).fill([8, 15, 32, 255]));
  assert.deepEqual(result.inside, [23, 40, 58, 255]); assert.deepEqual(result.outside, [8, 15, 32, 255]);
  assert.equal(result.planet.radius, 2400);
  result.edges.forEach((e, i) => {
    assert.deepEqual([e.camera.x, e.camera.y], [[2400, 0], [-2400, 0], [0, 2400], [0, -2400], [2800, 2800]][i]);
    assert.deepEqual([e.width, e.height], [30, 18]);
    assert.deepEqual(e.visible, ['repere']); assert.deepEqual(e.alpha, [255, 255, 255, 255]);
  });
  await capture(page, 'bord-planete');
  await page.locator('#planet').click();
  await capture(page, 'planete-entiere');
});

test('jeu-navigateur-interactions-suivi-et-coordonnees', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  for (const size of sizes) {
    await resize(page, size);
    await page.locator('#reset').click();
    // Déplacement au clavier, puis clic sur la caisse via la projection commune.
    await page.locator('canvas').focus(); await page.keyboard.press('ArrowRight');
    const s = await snapshot(page);
    assert.equal(s.camera.x, 64);
    const point = { x: s.game.width / 2 + 120 - 64, y: s.game.height / 2 + 60 };
    await page.mouse.click(point.x, point.y);
    assert.match(await page.locator('#inspection').textContent(), /caisse-01/);
    await page.mouse.move(s.game.width / 2, s.game.height / 2);
    await page.mouse.down(); await page.mouse.move(s.game.width / 2 + 40, s.game.height / 2 + 20); await page.mouse.up();
    assert.deepEqual((await snapshot(page)).camera, { x: 24, y: -20, zoom: 1 });
    const roundtrip = await page.evaluate(async () => {
      const view = await (await import('/assets/jeu/demo.js')).ready;
      const { worldToScreen, screenToWorld } = await import('/assets/jeu/camera.js');
      const s = view.getSnapshot(), world = { x: -12.5, y: 43.25 };
      return screenToWorld(worldToScreen(world, s.camera, s.game), s.camera, s.game);
    });
    assert.deepEqual(roundtrip, { x: -12.5, y: 43.25 });
  }
  const tracked = await page.evaluate(async reference => {
    const view = await (await import('/assets/jeu/demo.js')).ready;
    const original = structuredClone(reference);
    view.followPlayer(true);
    const next = structuredClone(reference);
    next.entities.find(e => e.id === next.playerId).position = { x: 2380, y: -100 };
    const before = JSON.stringify(next);
    view.setScene(next);
    const { camera, game } = view.getSnapshot();
    const picked = view.inspect({ x: game.width / 2, y: game.height / 2 });
    return { camera, picked: picked.id, immutable: JSON.stringify(next) === before, referenceUnchanged: JSON.stringify(original) === JSON.stringify(reference) };
  }, reference);
  assert.deepEqual(tracked.camera, { x: 2380, y: -100, zoom: 1 });
  assert.equal(tracked.picked, reference.playerId); assert.equal(tracked.immutable, true); assert.equal(tracked.referenceUnchanged, true);
  await resize(page, sizes[0]);
  assert.equal((await snapshot(page)).following, true);
  assert.equal((await snapshot(page)).camera.x, 2380);
});

test('jeu-navigateur-dpr-un-deux-et-changement-a-chaud', { timeout: 60000 }, async t => {
  const { page, context } = await open(t);
  const session = await context.newCDPSession(page);
  const viewHandle = await page.evaluateHandle(async () => await (await import('/assets/jeu/demo.js')).ready);
  // La fixture ferme le navigateur avant les autres hooks de nettoyage.
  t.after(async () => { if (!page.isClosed()) await session.detach(); });
  for (const dpr of [2, 1.5, 1]) {
    await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: dpr, mobile: false });
    await page.waitForFunction(({ view, dpr }) => view.getSnapshot().dpr === dpr, { view: viewHandle, dpr });
    const s = await snapshot(page);
    assert.deepEqual(s.game, { x: 0, y: 0, width: 1040, height: 720 });
    const result = await page.evaluate(async () => {
      const view = await (await import('/assets/jeu/demo.js')).ready;
      const canvas = document.querySelector('canvas'), s = view.getSnapshot();
      return { backing: [canvas.width, canvas.height], picked: view.inspect({ x: 640, y: 420 }).id,
        center: [...canvas.getContext('2d').getImageData(640 * s.dpr, 420 * s.dpr, 1, 1).data] };
    });
    assert.deepEqual(result.backing, [1040 * dpr, 720 * dpr]);
    assert.equal(result.picked, 'caisse-01'); assert.deepEqual(result.center, [246, 205, 114, 255]);
    await page.mouse.click(640, 420); assert.match(await page.locator('#inspection').textContent(), /caisse-01/);
    await capture(page, `dpr-${dpr}`);
  }
});

test('jeu-navigateur-scenarios-informations-et-retour-diagrammes', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const ids = await page.locator('#scenario option').evaluateAll(options => options.map(o => o.value));
  for (const id of ids) {
    await page.locator('#scenario').selectOption(id);
    assert.match(await page.locator('#status').textContent(), /entités visibles/);
  }
  await resize(page, sizes[3]);
  await page.locator('#follow').click();
  assert.equal(await page.locator('#follow').getAttribute('aria-pressed'), 'true');
  await page.locator('#planet').click();
  await capture(page, 'mobile-planete');
  await page.locator('a[href="/"]').click();
  assert.equal(await page.locator('#diagram-file').isEnabled(), true);
});
