import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guidance } from '../dist/client/jeu/guidance.js';
import { layout } from '../dist/client/jeu/camera.js';
import { resolveScenario } from '../dist/client/jeu/scenarios.js';

const reference = JSON.parse(await readFile(new URL('../docs/jeu/scene-reference.json', import.meta.url), 'utf8'));
const player = reference.entities[0];
const camera = { x: 0, y: 0, zoom: 1 }, game = layout(1280, 720).game;
const major = (id, category, x, y, state = 'actif') => ({
  ...reference.entities.find(e => e.category === category), id, position: { x, y }, state,
});
const scene = (...targets) => ({ ...reference, entities: [structuredClone(player), ...targets] });
const result = (...targets) => guidance(scene(...targets), camera, game);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

test('jeu-guidage-aucune-cible-active-ni-reference', () => {
  assert.equal(result(), null);
  assert.equal(result(major('mort', 'boss', 900, 0, 'detruit'), major('inactif', 'vaisseau-mere', 0, -900, 'inactif')), null);
  assert.equal(result({ ...reference.entities[2], position: { x: 900, y: 0 } }), null);
  assert.equal(guidance({ ...reference, entities: [major('boss', 'boss', 900, 0)] }, camera, game), null, 'sans joueur : aucun cap périmé');
});

test('jeu-guidage-boss-seul-hors-ecran', () => {
  const g = result(major('boss', 'boss', 1000, 0));
  assert.equal(g.targetId, 'boss'); assert.equal(g.category, 'boss'); assert.equal(g.distance, 1000);
  assert.deepEqual(g.direction, { x: 1, y: 0 });
  assert.equal(Array.isArray(g), false, 'un seul indicateur, pas une liste par cible');
});

test('jeu-guidage-vaisseau-mere-seul-hors-ecran', () => {
  const g = result(major('mere', 'vaisseau-mere', 0, -1200));
  assert.equal(g.targetId, 'mere'); assert.equal(g.category, 'vaisseau-mere'); assert.equal(g.distance, 1200);
  assert.deepEqual(g.direction, { x: 0, y: -1 });
});

test('jeu-guidage-plus-proche-toutes-categories-distance-monde', () => {
  const targets = [major('boss-loin', 'boss', 1900, 0), major('mere-proche', 'vaisseau-mere', 0, -800),
    major('boss-proche', 'boss', -900, 100), major('mere-loin', 'vaisseau-mere', 1800, 1000)];
  assert.equal(result(...targets).targetId, 'mere-proche');
  targets[2].position = { x: -700, y: 0 };
  assert.equal(result(...targets).targetId, 'boss-proche');
  const s = scene(...targets);
  s.entities[0].position = { x: 1800, y: 0 };
  const g = guidance(s, { x: 50, y: 20, zoom: 2 }, game);
  assert.equal(g.targetId, 'boss-loin', 'la caméra ne remplace pas le joueur dans la distance');
  assert.equal(g.distance, 100);
});

test('jeu-guidage-egalites-identifiants-stables-sans-mutation', () => {
  const targets = [major('b-boss', 'boss', -900, 0), major('a-mere', 'vaisseau-mere', 900, 0),
    major('c-mere', 'vaisseau-mere', 0, -900)];
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const s = freeze(scene(...targets)), before = JSON.stringify(s);
  for (const order of [targets, [...targets].reverse(), [targets[1], targets[2], targets[0]]]) {
    assert.equal(result(...order).targetId, 'a-mere');
  }
  assert.equal(guidance(s, camera, game).targetId, 'a-mere');
  assert.equal(JSON.stringify(s), before);
});

test('jeu-guidage-visibilite-croisee-partielle-tangence-et-hud', () => {
  for (const category of ['boss', 'vaisseau-mere']) {
    const opposite = category === 'boss' ? 'vaisseau-mere' : 'boss';
    const outside = major('proche-hors-champ', opposite, 0, -800);
    assert.equal(result(outside, major('visible-loin', category, 480, 300)), null,
      'une cible visible masque une cible hors champ plus proche du joueur');
    // Rendre la cible visible plus éloignée du joueur sans modifier sa caméra.
    const s = scene(outside, major('visible', category, 480, 300));
    s.entities[0].position = { x: 0, y: -700 };
    assert.equal(guidance(s, camera, game), null);
    const base = major('bord', category, 0, 0), hw = base.dimensions.width / 2, hh = base.dimensions.height / 2;
    for (const [x, y, dx, dy] of [[game.width / 2 + hw, 0, 1, 0], [-game.width / 2 - hw, 0, -1, 0],
      [0, game.height / 2 + hh, 0, 1], [0, -game.height / 2 - hh, 0, -1]]) {
      assert.equal(result(outside, major('bord', category, x - dx * .01, y - dy * .01)), null, 'intersection de .01 px');
      assert.ok(result(outside, major('bord', category, x, y)), 'tangence hors champ selon le contrat v1');
      assert.ok(result(outside, major('bord', category, x + dx * .01, y + dy * .01)), 'juste hors du bord');
    }
    assert.ok(result(major('dans-hud', category, game.width / 2 + hw + 1, 0)), 'la bande droite ne rend pas une cible visible');
  }
});

test('jeu-guidage-huit-directions-marges-formats-camera-et-sans-hud', () => {
  for (const size of [[1280, 720], [1920, 1080], [800, 800], [360, 640], [360, 800], [80, 120], [1, 1]]) {
    for (const withHud of [true, false]) for (const zoom of [.04, .5, 1, 4]) {
      const viewport = { ...layout(...size, withHud).game, x: 7, y: 13 };
      const cam = { x: 37, y: -80, zoom };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [-1, 1], [1, -1]]) {
        const s = scene(major('cible', 'boss', cam.x + dx * 100000, cam.y + dy * 100000));
        s.entities[0].position = { x: cam.x, y: cam.y };
        const g = guidance(s, cam, viewport), norm = Math.hypot(dx, dy);
        close(g.direction.x, dx / norm); close(g.direction.y, dy / norm);
        close(Math.cos(g.angle), dx / norm); close(Math.sin(g.angle), dy / norm);
        const { position: p, radius: r } = g;
        assert.ok(p.x - r >= viewport.x && p.y - r >= viewport.y);
        assert.ok(p.x + r <= viewport.x + viewport.width && p.y + r <= viewport.y + viewport.height);
        const borderDistance = Math.min(p.x - r - viewport.x, p.y - r - viewport.y,
          viewport.x + viewport.width - p.x - r, viewport.y + viewport.height - p.y - r);
        close(borderDistance, Math.min(16, Math.min(viewport.width, viewport.height) / 8));
        close((p.x - viewport.x - viewport.width / 2) * dy, (p.y - viewport.y - viewport.height / 2) * dx);
      }
    }
  }
});

test('jeu-guidage-douze-scenarios-oracles-evolution-zero', async () => {
  const data = JSON.parse(await readFile(new URL('../docs/jeu/scenarios.json', import.meta.url), 'utf8'));
  for (const scenario of data.scenarios) {
    const w = data.windows[scenario.window];
    const g = guidance(resolveScenario(reference, scenario), scenario.camera, layout(w.width, w.height).game);
    assert.equal(g?.targetId ?? null, scenario.expected.arrowTargetId, scenario.id);
  }
});
