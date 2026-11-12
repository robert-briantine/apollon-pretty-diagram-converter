import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { layout, worldToScreen, screenToWorld, screenBounds, isVisible, pickEntity, worldBounds } from '../dist/client/jeu/camera.js';
import { resolveScenario } from '../dist/client/jeu/scenarios.js';

const load = async name => JSON.parse(await readFile(new URL(`../docs/jeu/${name}.json`, import.meta.url), 'utf8'));
const reference = await load('scene-reference');
const fixture = (position, dimensions = { width: 12, height: 8 }) => ({
  ...reference.entities[2], position, dimensions,
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('jeu-layout-rectangle-hud-et-sans-hud', () => {
  for (const [width, height] of [[1280, 720], [1920, 1080], [800, 800], [360, 640], [80, 120], [1, 1]]) {
    for (const withHud of [true, false]) {
      const { game, hud } = layout(width, height, withHud);
      assert.deepEqual([game.x, game.y, hud.y], [0, 0, 0]);
      assert.equal(game.width + hud.width, width);
      assert.equal(hud.x, game.width);
      assert.equal(game.height, height); assert.equal(hud.height, height);
      assert.ok(game.width > 0 && hud.width >= 0 && hud.width <= width * .2);
      if (!withHud) assert.equal(hud.width, 0);
    }
  }
  assert.equal(layout(1280, 720).hud.width, 240);
  assert.equal(layout(360, 640).hud.width, 72);
  for (const width of [0, -1, NaN, Infinity]) assert.throws(() => layout(width, 100), RangeError);
});

test('jeu-conversions-oracles-zoom-decalage-et-redimensionnement', async () => {
  for (const { camera, viewport, world, screen } of await load('conversions-reference')) {
    assert.deepEqual(worldToScreen(world, camera, viewport), screen);
    assert.deepEqual(screenToWorld(screen, camera, viewport), world);
  }
  for (const size of [[1280, 720], [1920, 1080], [800, 800], [360, 640]]) {
    const viewport = layout(...size).game;
    for (const camera of [{ x: 2380, y: -2380, zoom: .5 }, { x: -120, y: 36, zoom: 2.5 }]) {
      for (const point of [{ x: 0, y: 0 }, { x: -3000, y: 2400 }, { x: 12.25, y: -7.75 }]) {
        const back = screenToWorld(worldToScreen(point, camera, viewport), camera, viewport);
        close(back.x, point.x); close(back.y, point.y);
      }
      const bounds = worldBounds(camera, viewport);
      assert.deepEqual(worldToScreen(bounds, camera, viewport), { x: 0, y: 0 });
      close(bounds.width * camera.zoom, viewport.width);
      close(bounds.height * camera.zoom, viewport.height);
      const b = screenBounds(fixture(camera), camera, viewport);
      close(b.width / b.height, 1.5);
      assert.equal(b.width, 12 * camera.zoom);
    }
  }
});

test('jeu-visibilite-quatre-coins-tangences-et-etats', () => {
  for (const size of [[1280, 720], [1920, 1080], [800, 800], [360, 640]]) {
    const viewport = layout(...size).game;
    const camera = { x: 2380, y: -100, zoom: 2 };
    const at = (x, y) => fixture({ x: camera.x + (x - viewport.width / 2) / 2, y: camera.y + (y - viewport.height / 2) / 2 });
    const w = viewport.width, h = viewport.height;
    for (const p of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10], [w / 2, h / 2], [-11, h / 2], [w + 11, h / 2], [w / 2, -7], [w / 2, h + 7]]) {
      assert.equal(isVisible(at(...p), camera, viewport), true);
    }
    for (const p of [[-12, h / 2], [w + 12, h / 2], [w / 2, -8], [w / 2, h + 8], [-13, -9]]) {
      assert.equal(isVisible(at(...p), camera, viewport), false);
    }
    for (const state of ['inactif', 'detruit']) assert.equal(isVisible({ ...at(20, 20), state }, camera, viewport), false);
    const entity = at(w - 10, h - 10);
    const scene = { ...reference, entities: [entity] };
    assert.equal(pickEntity(scene, { x: w - 10, y: h - 10 }, camera, viewport), entity);
    assert.equal(pickEntity(scene, { x: w, y: h - 10 }, camera, viewport), undefined, 'HUD exclu des interactions');
  }
});

test('jeu-scenes-reference-determinisme-et-visibilite-compatibles', async () => {
  assert.deepEqual(await load('scene-reference'), reference);
  const original = structuredClone(reference);
  const ids = reference.entities.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(reference.entities.map(e => e.category)).size, 6);
  assert.ok(reference.entities.find(e => e.id === 'caisse-01').destructible);
  assert.equal(reference.entities.find(e => e.id === 'tir-ennemi-01').projectileOrigin.faction, 'ennemi');
  const scenarios = await load('scenarios');
  for (const s of scenarios.scenarios) {
    const scene = resolveScenario(reference, s);
    assert.deepEqual(scene, resolveScenario(reference, s));
    const window = scenarios.windows[s.window];
    const viewport = layout(window.width, window.height).game;
    assert.equal(window.hudWidth, window.width - viewport.width);
    const visible = scene.entities.filter(e => ['boss', 'vaisseau-mere'].includes(e.category) && isVisible(e, s.camera, viewport));
    assert.deepEqual(visible.map(e => e.id).sort(), [...s.expected.visibleMajorIds].sort());
    for (const p of s.expected.planetPoints ?? []) {
      assert.equal((p.position.x - scene.planet.center.x) ** 2 + (p.position.y - scene.planet.center.y) ** 2 <= scene.planet.radius ** 2, p.inside);
    }
  }
  assert.deepEqual(reference, original, 'les instantanés ne sont jamais mutés');
});
