import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { interfaceTest, generation } from './ui-fixtures.mjs';

const reference = JSON.parse(await readFile(new URL('../docs/jeu/scene-reference.json', import.meta.url), 'utf8'));
const captures = new URL('../docs/jeu/captures/evolution4/', import.meta.url);
async function open(t) {
  const ui = await interfaceTest(t, { viewport: { width: 1280, height: 720 } });
  await ui.page.goto(`${ui.url}/jeu-demo.html`);
  await ui.page.evaluate(async () => await (await import('/assets/jeu/demo.js')).ready);
  return ui;
}

test('jeu-guidage-instantanes-deplacements-destructions-camera-et-nettoyage', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const result = await page.evaluate(async reference => {
    const view = await (await import('/assets/jeu/demo.js')).ready;
    const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    let scene = { ...reference, entities: reference.entities.filter(e => e.id === reference.playerId || ['boss-est', 'boss-ouest', 'mere-nord'].includes(e.id)) };
    const frames = [], snapshots = [];
    const emit = change => {
      scene = structuredClone(scene); change?.(scene);
      frames.push({ value: freeze(scene), original: JSON.stringify(scene) });
      view.setScene(scene); snapshots.push(view.getSnapshot());
    };
    view.setCamera({ x: 0, y: 0, zoom: 1 });
    emit();
    emit(s => { s.entities[0].position = { x: 600, y: 0 }; });
    emit(s => { s.entities.find(e => e.id === 'boss-est').position = { x: 3000, y: 0 }; });
    emit(s => { s.entities.find(e => e.id === 'mere-nord').state = 'detruit'; });
    emit(s => { s.entities = s.entities.filter(e => e.id !== 'boss-ouest'); });
    emit(s => { s.entities.find(e => e.id === 'boss-est').state = 'detruit'; });
    const c = document.querySelector('canvas').getContext('2d');
    const hash = () => c.getImageData(0, 0, c.canvas.width, c.canvas.height).data.reduce((a, b) => (a * 31 + b) >>> 0, 0);
    const afterDestruction = hash();
    emit(s => { s.entities = s.entities.filter(e => e.id === s.playerId); });
    const afterRemoval = hash();
    view.setScene(frames[0].value);
    view.setCamera({ x: -900, y: 100, zoom: 1 });
    const visible = view.getSnapshot().guidance;
    view.setCamera({ x: 0, y: 0, zoom: 1 });
    const restored = view.getSnapshot().guidance;
    view.setCamera({ x: 0, y: 0, zoom: .1 });
    const zoomVisible = view.getSnapshot().guidance;
    view.setCamera({ x: 0, y: 0, zoom: 1 });
    view.followPlayer(true);
    const moved = structuredClone(frames[0].value);
    moved.entities[0].position = { x: 600, y: 0 };
    view.setScene(freeze(moved));
    const followed = view.getSnapshot();
    view.setScene({ ...reference, entities: [] });
    return { targets: snapshots.map(s => s.guidance?.targetId ?? null),
      distances: snapshots.map(s => s.guidance?.distance ?? null),
      immutable: frames.every(f => JSON.stringify(f.value) === f.original), afterDestruction, afterRemoval,
      visible, restored, zoomVisible, followed, cleared: view.getSnapshot().guidance };
  }, reference);
  assert.deepEqual(result.targets, ['boss-ouest', 'boss-est', 'mere-nord', 'boss-ouest', 'boss-est', null, null]);
  assert.equal(result.distances[1], 400);
  assert.equal(result.immutable, true);
  assert.equal(result.afterDestruction, result.afterRemoval, 'aucune encre de flèche périmée');
  assert.equal(result.visible, null); assert.equal(result.zoomVisible, null);
  assert.equal(result.restored.targetId, 'boss-ouest');
  assert.deepEqual(result.followed.camera, { x: 600, y: 0, zoom: 1 });
  assert.equal(result.followed.guidance, null, 'boss-est visible après suivi');
  assert.equal(result.cleared, null);
});

test('jeu-guidage-rendu-unique-huit-caps-redimensionnement-dpr-et-hud', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  for (const [width, height] of [[1280, 720], [1920, 1080], [800, 800], [360, 640], [360, 800]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(h => document.querySelector('canvas').style.height === `${h}px`, height);
    const observations = await page.evaluate(async reference => {
      const view = await (await import('/assets/jeu/demo.js')).ready;
      const canvas = document.querySelector('canvas'), c = canvas.getContext('2d');
      const result = [], player = reference.entities[0], boss = reference.entities.find(e => e.category === 'boss');
      view.setCamera({ x: 0, y: 0, zoom: 1 });
      const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
      for (const dpr of [1, 2]) {
        view.resize(width, height, dpr);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [-1, 1], [1, -1]]) {
          view.setScene({ ...reference, entities: [player] });
          const before = c.getImageData(0, 0, canvas.width, canvas.height).data;
          view.setScene({ ...reference, entities: [player,
            { ...boss, position: { x: dx * 10000, y: dy * 10000 } },
            { ...boss, id: 'autre-boss', position: { x: dx * 20000, y: dy * 20000 } }] });
          const snapshot = view.getSnapshot(), g = snapshot.guidance;
          const after = c.getImageData(0, 0, canvas.width, canvas.height).data;
          let changed = 0, escaped = 0;
          for (let i = 0; i < after.length; i += 4) {
            if (after[i] === before[i] && after[i + 1] === before[i + 1] && after[i + 2] === before[i + 2]) continue;
            changed++;
            const x = (i / 4 % canvas.width + .5) / dpr, y = (Math.floor(i / 4 / canvas.width) + .5) / dpr;
            if (Math.hypot(x - g.position.x, y - g.position.y) > g.radius) escaped++;
          }
          const tip = [...c.getImageData(Math.floor((g.position.x + Math.cos(g.angle) * 8) * dpr),
            Math.floor((g.position.y + Math.sin(g.angle) * 8) * dpr), 1, 1).data];
          result.push({ snapshot, changed, escaped, tip, dx, dy });
        }
      }
      return result;
    }, reference);
    for (const { snapshot: s, changed, escaped, tip, dx, dy } of observations) {
      const g = s.guidance, r = Math.hypot(dx, dy);
      assert.equal(g.targetId, 'boss-est');
      assert.ok(Math.abs(g.direction.x - dx / r) < 1e-9 && Math.abs(g.direction.y - dy / r) < 1e-9);
      assert.ok(changed > 500, 'médaillon et pointe effectivement dessinés');
      assert.equal(escaped, 0, 'une seule flèche : aucune encre ailleurs que dans son médaillon');
      assert.ok(tip[0] > 210 && tip[1] > 225 && tip[2] > 235, 'pointe orientée vers la cible');
      assert.ok(g.position.x + g.radius < s.hud.x && g.position.y + g.radius < height);
      assert.ok(g.position.x - g.radius >= 0 && g.position.y - g.radius >= 0);
    }
  }
});

test('jeu-guidage-parcours-visuel-complet-scenes-effets-et-diagrammes', { timeout: 60000 }, async t => {
  const { page, url } = await open(t);
  await mkdir(captures, { recursive: true });
  // Le parcours reste rejouable depuis les commandes visibles de la démo.
  for (const [width, height] of [[1280, 720], [1920, 1080], [800, 800], [360, 640]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(h => document.querySelector('canvas').style.height === `${h}px`, height);
    await page.locator('#guidance-scene').click();
    const s = await page.evaluate(async () => (await (await import('/assets/jeu/demo.js')).ready).getSnapshot());
    assert.equal(s.guidance.targetId, 'banc-boss');
    assert.equal(s.visibleIds.length, 38, '36 objets et tirs denses, un joueur, un ennemi');
    assert.match(await page.locator('#guidance').textContent(), /Boss · banc-boss/);
    for (const background of ['clair', 'sombre']) {
      await page.selectOption('#background', background);
      for (const gray of [false, true]) {
        await page.locator('#grayscale').setChecked(gray);
        await page.locator('#hud').evaluate(e => { e.scrollTop = 0; });
        await page.screenshot({ path: new URL(`dense-${width}x${height}-${background}-${gray ? 'gris' : 'couleur'}.png`, captures).pathname });
      }
    }
    await page.locator('#grayscale').uncheck();
    for (const state of ['deplacement', 'tir', 'impact', 'destruction']) {
      await page.selectOption('#visual-state', state);
      await page.locator('#timeline').fill('75'); await page.dispatchEvent('#timeline', 'input');
      assert.equal((await page.evaluate(async () => (await (await import('/assets/jeu/demo.js')).ready).getSnapshot())).guidance.targetId, 'banc-boss');
    }
    await page.selectOption('#visual-state', 'repos');
    await page.locator('#planet').click();
    const planet = await page.evaluate(async () => (await (await import('/assets/jeu/demo.js')).ready).getSnapshot());
    assert.equal(planet.guidance, null, 'les cibles deviennent visibles avec la planète entière');
    assert.match(await page.locator('#guidance').textContent(), /Aucune recherche/);
    await page.locator('#hud').evaluate(e => { e.scrollTop = 0; });
    await page.screenshot({ path: new URL(`planete-${width}x${height}.png`, captures).pathname });
    await page.selectOption('#scenario', 'partiellement-visible');
    // La fixture historique « partiellement-visible » est cadrée pour 1280 px.
    // Replacer son bord visuel sur le bord du rectangle courant pour les autres formats.
    assert.equal(await page.evaluate(async reference => {
      const view = await (await import('/assets/jeu/demo.js')).ready;
      const { game } = view.getSnapshot();
      const scene = structuredClone(reference);
      scene.entities.find(e => e.id === 'boss-est').position = { x: game.width / 2 + 48 - .01, y: 0 };
      view.setScene(scene);
      return view.getSnapshot().guidance;
    }, reference), null);
    await page.selectOption('#scenario', 'reference-hors-champ');
    assert.match(await page.locator('#guidance').textContent(), /boss-ouest/);
    await page.selectOption('#scenario', 'aucune-cible');
    assert.equal(await page.evaluate(async () => (await (await import('/assets/jeu/demo.js')).ready).getSnapshot().guidance), null);
  }
  await page.locator('a[href="/"]').click();
  await page.waitForURL(`${url}/`);
  await page.waitForFunction(() => !document.querySelector('#diagram-file').disabled);
  await generation(page);
  const svg = await page.locator('#download-svg').getAttribute('href');
  const counts = await page.evaluate(async href => {
    const d = new DOMParser().parseFromString(await (await fetch(href)).text(), 'image/svg+xml');
    return [d.querySelectorAll('.noeud').length, d.querySelectorAll('.chemin').length];
  }, svg);
  assert.deepEqual(counts, [18, 24]);
});
