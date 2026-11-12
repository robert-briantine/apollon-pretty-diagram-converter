import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { interfaceTest } from './ui-fixtures.mjs';

const reference = JSON.parse(await readFile(new URL('../docs/jeu/scene-reference.json', import.meta.url), 'utf8'));
const captures = new URL('../docs/jeu/captures/evolution3/', import.meta.url);
async function open(t) {
  const ui = await interfaceTest(t, { viewport: { width: 1280, height: 720 } });
  await ui.page.goto(`${ui.url}/jeu-demo.html`);
  await ui.page.evaluate(async () => await (await import('/assets/jeu/demo.js')).ready);
  return ui;
}

test('jeu-lisibilite-scene-dense-couleur-gris-fonds-et-quatre-formats', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  await mkdir(captures, { recursive: true });
  for (const [width, height] of [[1280, 720], [1920, 1080], [800, 800], [360, 640]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(h => document.querySelector('canvas').style.height === `${h}px`, height);
    await page.locator('#readability').click();
    const geometry = await page.evaluate(async reference => {
      const view = await (await import('/assets/jeu/demo.js')).ready;
      const { readabilityScene } = await import('/assets/jeu/readability.js');
      const { screenBounds } = await import('/assets/jeu/camera.js');
      const scene = readabilityScene(reference), snapshot = view.getSnapshot();
      return { snapshot, scene, bounds: scene.entities.map(e => screenBounds(e, snapshot.camera, snapshot.game)) };
    }, reference);
    assert.equal(geometry.scene.entities.length, 40);
    assert.equal(geometry.snapshot.visibleIds.length, 40);
    assert.equal(geometry.snapshot.camera.zoom, 1, 'échelle réelle');
    assert.equal(geometry.scene.entities.filter(e => e.projectileOrigin?.faction === 'ennemi').length, 12);
    for (const b of geometry.bounds) {
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= geometry.snapshot.game.width && b.y + b.height <= height);
    }
    for (const background of ['sombre', 'clair']) {
      await page.selectOption('#background', background);
      for (const grayscale of [false, true]) {
        await page.locator('#grayscale').setChecked(grayscale);
        const metrics = await page.evaluate(async () => {
          const { RectangularView } = await import('/assets/jeu/renderer.js');
          const { loadSprites } = await import('/assets/jeu/sprites.js');
          const { readabilityScene } = await import('/assets/jeu/readability.js');
          const { worldToScreen } = await import('/assets/jeu/camera.js');
          const reference = await (await fetch('/assets/jeu/data/scene-reference.json')).json();
          const scene = readabilityScene(reference), source = document.querySelector('canvas');
          const canvas = document.createElement('canvas'), c = canvas.getContext('2d');
          const view = new RectangularView(canvas, scene, await loadSprites());
          view.resize(parseFloat(source.style.width), parseFloat(source.style.height), 1, false);
          view.setBackground(document.querySelector('#background').value);
          const luminance = pixel => .2126 * pixel[0] + .7152 * pixel[1] + .0722 * pixel[2];
          // Chaque catégorie garde des valeurs sombres ET claires : le contour
          // survit aux deux fonds et à une véritable conversion en luminance.
          return ['decor', 'objet-destructible', 'tir-ennemi', 'tir-joueur'].map(key => {
            const e = scene.entities.find(e => key.startsWith('tir-') ? e.projectileOrigin?.faction === key.slice(4) : e.category === key);
            const p = worldToScreen(e.position, view.getSnapshot().camera, view.getSnapshot().game);
            const values = [];
            const d = c.getImageData(Math.floor(p.x - e.dimensions.width / 2), Math.floor(p.y - e.dimensions.height / 2), e.dimensions.width, e.dimensions.height).data;
            for (let i = 0; i < d.length; i += 4) values.push(luminance(d.slice(i, i + 3)));
            return { key, dark: values.filter(v => v < 65).length, light: values.filter(v => v > 175).length };
          });
        });
        for (const m of metrics) {
          assert.ok(m.dark >= 4, `${m.key} : contour sombre sur fond clair`);
          if (m.key !== 'decor') assert.ok(m.light >= 4, `${m.key} : cœur/marques clairs sur fond sombre`);
        }
        await page.locator('canvas').screenshot({ path: new URL(`dense-${width}x${height}-${background}-${grayscale ? 'gris' : 'couleur'}.png`, captures).pathname });
      }
    }
  }
});

test('jeu-lisibilite-proprietes-reelles-degats-origines-et-double-identite', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const results = await page.evaluate(async reference => {
    const { RectangularView } = await import('/assets/jeu/renderer.js');
    const { loadSprites, spriteKey } = await import('/assets/jeu/sprites.js');
    const canvas = document.createElement('canvas'), c = canvas.getContext('2d');
    const view = new RectangularView(canvas, reference, await loadSprites());
    view.resize(100, 100, 1, false);
    const image = () => [...c.getImageData(25, 25, 50, 50).data];
    view.setScene({ ...reference, entities: [] });
    const background = image();
    const base = { ...reference.entities[2], id: 'identifiant-opaque', position: { x: 0, y: 0 } };
    const results = [];
    for (const category of ['decor', 'objet-destructible', 'boss', 'vaisseau-mere', 'ennemi', 'projectile']) {
      for (const faction of category === 'projectile' ? ['ennemi', 'joueur', 'neutre'] : [null]) {
        const variants = [];
        for (const destructible of [false, true]) for (const damageState of ['intact', 'endommage']) {
          const entity = { ...base, category, destructible, damageState,
            projectileOrigin: faction ? { faction, emitterId: 'emetteur-supprime' } : null };
          view.setScene({ ...reference, entities: [entity] });
          variants.push({ destructible, damageState, key: spriteKey(entity), pixels: image() });
        }
        results.push({ category, faction, variants });
      }
    }
    return { entries: results, background };
  }, reference);
  for (const r of results.entries) {
    const [solid, falseDamaged, destructible, damaged] = r.variants;
    assert.notDeepEqual(solid.pixels, destructible.pixels, `marques uniquement si destructible : ${r.category}/${r.faction}`);
    assert.deepEqual(solid.pixels, falseDamaged.pixels, 'aucune fissure trompeuse sur un indestructible');
    if (r.category !== 'projectile') assert.notDeepEqual(destructible.pixels, damaged.pixels, 'état endommagé persistant');
    else {
      assert.equal(destructible.key, `tir-${r.faction}`);
      // Les deux verrous restent secondaires : moins de 20 % du raster change.
      const changes = solid.pixels.filter((v, i) => v !== destructible.pixels[i]).length;
      assert.ok(changes > 0 && changes < solid.pixels.length * .2);
    }
    if (r.category === 'objet-destructible') {
      assert.equal(solid.key, 'decor'); assert.equal(destructible.key, 'objet-destructible');
    }
  }
  const hostile = results.entries.find(r => r.faction === 'ennemi'), friendly = results.entries.find(r => r.faction === 'joueur');
  // Masque d'occupation binaire : indépendant de toute teinte, y compris en gris.
  const mask = pixels => pixels.filter((v, i) => i % 4 === 0).map((_, p) =>
    [0, 1, 2].some(ch => pixels[p * 4 + ch] !== results.background[p * 4 + ch]));
  assert.notDeepEqual(mask(hostile.variants[0].pixels), mask(friendly.variants[0].pixels));
  const crate = results.entries.find(r => r.category === 'objet-destructible');
  assert.notDeepEqual(mask(crate.variants[2].pixels), mask(hostile.variants[0].pixels));
});

test('jeu-lisibilite-tirs-prioritaires-effets-trajectoire-redimensionnement-et-zoom', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  await mkdir(captures, { recursive: true });
  const observations = await page.evaluate(async reference => {
    const { RectangularView } = await import('/assets/jeu/renderer.js');
    const { loadSprites } = await import('/assets/jeu/sprites.js');
    const canvas = document.createElement('canvas'), c = canvas.getContext('2d');
    const images = await loadSprites();
    const view = new RectangularView(canvas, reference, images);
    const solid = { ...reference.entities[2], position: { x: 0, y: 0 }, dimensions: { width: 96, height: 96 } };
    const hostile = { ...reference.entities[4], position: { x: 0, y: 0 } };
    const friendly = { ...reference.entities[5], position: { x: 0, y: 0 }, dimensions: { width: 32, height: 32 } };
    const observations = [];
    for (const [width, height, dpr] of [[1040, 720, 1], [288, 640, 2], [800, 800, 1.5]]) {
      view.resize(width, height, dpr, false);
      for (const zoom of [.12, .5, 1, 2]) for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        // Un même tir traverse le monde ; l'émetteur est absent de la scène.
        const shot = { ...hostile, position: { x: zoom * 50, y: -zoom * 20 } };
        const object = { ...solid, position: shot.position }, playerShot = { ...friendly, position: shot.position };
        view.setCamera({ ...shot.position, zoom });
        const read = () => [...c.getImageData(Math.floor(canvas.width / 2) - 10, Math.floor(canvas.height / 2) - 10, 20, 20).data];
        view.setScene({ ...reference, entities: [] }); const background = read();
        view.setScene({ ...reference, entities: [shot] });
        view.setPresentation({ [shot.id]: { orientation: angle } }); const isolated = read();
        // Oracle indépendant : pixels opaques de la source SVG. Les franges
        // anticrénelées se mélangent normalement avec les objets situés dessous.
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvas.width; maskCanvas.height = canvas.height;
        const mc = maskCanvas.getContext('2d');
        mc.scale(dpr, dpr); mc.translate(width / 2, height / 2); mc.rotate(angle);
        mc.scale(Math.max(zoom, .8), Math.max(zoom, .8));
        mc.drawImage(images['tir-ennemi'], -5, -10, 10, 20);
        const mask = mc.getImageData(Math.floor(canvas.width / 2) - 10, Math.floor(canvas.height / 2) - 10, 20, 20).data;
        for (const state of ['impact', 'destruction']) for (const progress of [0, .25, .5, .75, 1]) {
          // Ordre d'entrée hostile avant les objets et le tir joueur, volontairement.
          view.setScene({ ...reference, entities: [shot, object, playerShot] });
          view.setPresentation({ [object.id]: { state, progress }, [playerShot.id]: { state: 'tir', progress: .5 }, [shot.id]: { orientation: angle } });
          const composite = read();
          let changed = 0, opaque = 0, preservedOpaque = 0;
          for (let i = 0; i < isolated.length; i += 4) {
            if ([0, 1, 2].some(ch => isolated[i + ch] !== background[i + ch])) {
              changed++;
            }
            if (mask[i + 3] === 255) {
              opaque++;
              // L'alpha 255 de getImageData est arrondi ; une frange à .999
              // peut encore varier d'un niveau lors de la composition.
              if ([0, 1, 2].every(ch => Math.abs(isolated[i + ch] - composite[i + ch]) <= 1)) preservedOpaque++;
            }
          }
          observations.push({ width, height, dpr, zoom, angle, state, progress, changed, opaque, preservedOpaque });
        }
      }
    }
    return observations;
  }, reference);
  assert.equal(observations.length, 480);
  for (const o of observations) {
    assert.ok(o.changed >= 30, `taille minimale du tir : ${JSON.stringify(o)}`);
    assert.ok(o.opaque >= 12, `cœur opaque suffisamment grand : ${JSON.stringify(o)}`);
    assert.equal(o.preservedOpaque, o.opaque, `tous les pixels opaques devant les effets : ${JSON.stringify(o)}`);
  }
  await page.locator('#readability').click();
  await page.selectOption('#visual-state', 'destruction');
  await page.locator('#animate').click();
  await page.waitForFunction(() => document.querySelector('#timeline').value === '150');
  // Le banc dense anime les solides seulement, pas la disparition des tirs voisins.
  await page.locator('canvas').screenshot({ path: new URL('tirs-apres-destruction.png', captures).pathname });
});

test('jeu-lisibilite-instantanes-geles-changement-scene-et-metadonnees-combat', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const result = await page.evaluate(async reference => {
    const { RectangularView } = await import('/assets/jeu/renderer.js');
    const { loadSprites } = await import('/assets/jeu/sprites.js');
    const canvas = document.createElement('canvas'), c = canvas.getContext('2d');
    const view = new RectangularView(canvas, reference, await loadSprites());
    view.resize(100, 100, 1, false);
    const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const initial = { ...reference, entities: reference.entities.filter(e => ['caisse-01', 'tir-ennemi-01'].includes(e.id)).map(e => ({ ...e,
      position: { x: e.category === 'projectile' ? 15 : -15, y: 0 },
      collision: { radius: 9, targets: ['joueur'], projectileCanBeDestroyed: e.destructible }, damage: 17 })) };
    const next = structuredClone(initial);
    next.id = 'autre-scene';
    next.entities[0].damageState = 'endommage'; next.entities[1].destructible = true;
    next.entities[1].position.y = 20;
    const frames = [freeze(initial), freeze(next)], originals = frames.map(s => JSON.stringify(s));
    const raster = () => [...c.getImageData(0, 0, 100, 100).data];
    view.setScene(initial); const before = raster();
    for (const frame of frames) {
      view.setScene(frame);
      for (const state of ['impact', 'destruction']) view.setPresentation(Object.fromEntries(frame.entities.map(e => [e.id, { state, progress: .5 }])));
      view.resize(360, 640, 2); view.resize(100, 100, 1, false);
    }
    view.setScene(initial); // Les effets d'une autre scène ne doivent pas survivre.
    return { originals, after: frames.map(s => JSON.stringify(s)), restored: raster(), before, visible: view.getSnapshot().visibleIds };
  }, reference);
  assert.deepEqual(result.originals, result.after, 'positions, origine, destructibilité, collisions et dégâts inchangés');
  assert.deepEqual(result.restored, result.before, 'retour de scène sans effet résiduel');
  assert.deepEqual(result.visible, ['caisse-01', 'tir-ennemi-01']);
});

test('jeu-lisibilite-orientations-limites-visuelles-selection-et-disparition', { timeout: 60000 }, async t => {
  const { page } = await open(t);
  const results = await page.evaluate(async reference => {
    const { RectangularView } = await import('/assets/jeu/renderer.js');
    const { loadSprites } = await import('/assets/jeu/sprites.js');
    const { spriteSheet } = await import('/assets/jeu/sheet.js');
    const canvas = document.createElement('canvas'), images = await loadSprites();
    const view = new RectangularView(canvas, reference, images);
    view.resize(320, 240, 2, false);
    const c = canvas.getContext('2d');
    const entries = spriteSheet(reference, view.getSnapshot().game).entities;
    const results = [];
    for (const source of entries) {
      const entity = { ...source, position: { x: 0, y: 0 } };
      const scene = { ...reference, entities: [entity], playerId: entity.id };
      for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        view.setPresentation({}); view.setScene({ ...scene, entities: [] });
        const background = c.getImageData(0, 0, canvas.width, canvas.height).data;
        view.setScene(scene); view.setPresentation({ [entity.id]: { orientation: angle } });
        const image = c.getImageData(0, 0, canvas.width, canvas.height).data;
        const hostile = entity.projectileOrigin?.faction === 'ennemi';
        // Le tir hostile tourne sans rétrécir : limites visuelles orientées,
        // distinctes de son enveloppe logique inchangée.
        const visualWidth = hostile ? 10 * Math.abs(Math.cos(angle)) + 20 * Math.abs(Math.sin(angle)) : entity.dimensions.width;
        const visualHeight = hostile ? 10 * Math.abs(Math.sin(angle)) + 20 * Math.abs(Math.cos(angle)) : entity.dimensions.height;
        let pixels = 0, outside = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if ([0, 1, 2].some(ch => image[i + ch] !== background[i + ch])) {
            pixels++;
            if (Math.abs((x + .5) / 2 - 160) > visualWidth / 2 + .5 ||
              Math.abs((y + .5) / 2 - 120) > visualHeight / 2 + .5) outside++;
          }
        }
        view.setPresentation({ [entity.id]: { orientation: angle, state: 'destruction', progress: 1 } });
        const end = c.getImageData(0, 0, canvas.width, canvas.height).data;
        results.push({ id: entity.id, angle, pixels, outside, vanished: end.every((v, i) => v === background[i]),
          picked: view.inspect({ x: 160, y: 120 })?.id, logical: entity.dimensions, hostile });
      }
    }
    return results;
  }, reference);
  assert.equal(results.length, 45);
  for (const r of results) {
    assert.ok(r.pixels > 0, r.id); assert.equal(r.outside, 0, `${r.id} à ${r.angle}`);
    assert.equal(r.vanished, true); assert.equal(r.picked, r.id, 'effet visuel sans mutation logique');
  }
});
