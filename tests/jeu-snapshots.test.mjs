import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { interfaceTest } from './ui-fixtures.mjs';

const reference = JSON.parse(await readFile(new URL('../docs/jeu/scene-reference.json', import.meta.url), 'utf8'));

// Instantanés de test fournis au renderer, sans calcul de mouvement, tir,
// collision ou dégâts. Ce cas ne prétend pas exécuter un moteur de combat.
test('jeu-sprites-succession-instantanes-figes-suivi-tirs-et-etats', { timeout: 60000 }, async t => {
  const { page, url } = await interfaceTest(t, { viewport: { width: 1280, height: 720 } });
  await page.goto(`${url}/jeu-demo.html`);
  const result = await page.evaluate(async reference => {
    const view = await (await import('/assets/jeu/demo.js')).ready;
    const { worldToScreen } = await import('/assets/jeu/camera.js');
    const freeze = value => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    };
    const initial = structuredClone(reference);
    initial.entities = initial.entities.filter(e => ['joueur-01', 'caisse-01', 'tir-joueur-01'].includes(e.id));
    initial.entities.forEach(e => {
      e.collision = { radius: 9, mask: ['opaque-engine-metadata'] };
      e.damage = 7;
    });
    initial.entities.find(e => e.category === 'projectile').state = 'inactif';
    const moved = structuredClone(initial);
    moved.entities.find(e => e.id === moved.playerId).position = { x: 96, y: 64 };
    const fired = structuredClone(moved);
    const shot = fired.entities.find(e => e.category === 'projectile');
    shot.state = 'actif';
    shot.position = { x: 136, y: 44 };
    const destroyed = structuredClone(fired);
    destroyed.entities.find(e => e.id === 'caisse-01').state = 'detruit';
    const frames = [initial, moved, fired, destroyed].map(freeze);
    const originals = frames.map(frame => JSON.stringify(frame));
    const observations = [];
    view.followPlayer(true);
    for (const frame of frames) {
      view.setScene(frame);
      const player = frame.entities.find(e => e.id === frame.playerId);
      const camera = view.getSnapshot().camera;
      const { game } = view.getSnapshot();
      // La présentation est appliquée à des objets gelés, avec des valeurs
      // opaques de collision et dégâts, puis remise au repos sur le même frame.
      for (const state of ['deplacement', 'tir', 'impact', 'destruction']) {
        view.setPresentation(Object.fromEntries(frame.entities.map(e => [e.id, {
          state, progress: .5, orientation: Math.PI / 2,
        }])));
        view.draw();
      }
      view.setPresentation({});
      const shot = frame.entities.find(e => e.category === 'projectile');
      const crate = frame.entities.find(e => e.id === 'caisse-01');
      observations.push({
        camera, playerPosition: player.position,
        pickedPlayer: view.inspect({ x: game.width / 2, y: game.height / 2 })?.id,
        pickedShot: view.inspect(worldToScreen(shot.position, camera, game))?.id ?? null,
        pickedCrate: view.inspect(worldToScreen(crate.position, camera, game))?.id ?? null,
        visible: view.getSnapshot().visibleIds,
        entities: structuredClone(frame.entities),
      });
    }
    // Revenir à un ancien instantané ne doit conserver ni la position suivante,
    // ni les états suivants, ni un effet de destruction résiduel.
    view.setScene(frames[0]);
    return {
      observations,
      originals,
      finalInputs: frames.map(frame => JSON.stringify(frame)),
      restored: view.getSnapshot(),
      restoredPlayer: view.inspect({ x: 520, y: 360 })?.id,
    };
  }, reference);
  assert.deepEqual(result.finalInputs, result.originals, 'tous les instantanés restent strictement identiques');
  assert.deepEqual(result.observations.map(o => o.playerPosition), [
    { x: 0, y: 0 }, { x: 96, y: 64 }, { x: 96, y: 64 }, { x: 96, y: 64 },
  ]);
  for (const o of result.observations) {
    assert.deepEqual(o.camera, { ...o.playerPosition, zoom: 1 });
    assert.equal(o.pickedPlayer, 'joueur-01');
    for (const e of o.entities) {
      assert.equal(e.damage, 7);
      assert.deepEqual(e.collision, { radius: 9, mask: ['opaque-engine-metadata'] });
    }
  }
  assert.deepEqual(result.observations.map(o => o.pickedShot), [null, null, 'tir-joueur-01', 'tir-joueur-01']);
  assert.deepEqual(result.observations.map(o => o.pickedCrate), ['caisse-01', 'caisse-01', 'caisse-01', null]);
  assert.deepEqual(result.observations.map(o => o.visible), [
    ['joueur-01', 'caisse-01'], ['joueur-01', 'caisse-01'],
    ['joueur-01', 'caisse-01', 'tir-joueur-01'], ['joueur-01', 'tir-joueur-01'],
  ]);
  assert.deepEqual(result.restored.camera, { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(result.restored.visibleIds, ['joueur-01', 'caisse-01']);
  assert.equal(result.restoredPlayer, 'joueur-01');
});
