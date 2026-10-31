import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { forme, arc, graphe, preparer, reference, negatif, hostile, croisements } from './svg-fixtures.mjs';
import { convertirJson } from '../dist/server/conversion.js';
import { rendreSvg } from '../dist/server/svg.js';

async function ouvrir(svg, verifier) {
  const dir = await mkdtemp(join(tmpdir(), 'diagrams-svg-'));
  let browser;
  try {
    const file = join(dir, 'diagram.svg');
    await writeFile(file, svg, 'utf8');
    browser = await chromium.launch({ timeout: 20000 });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, offline: true });
    const page = await context.newPage();
    const erreurs = []; const demandes = []; const dialogues = [];
    page.on('pageerror', e => erreurs.push(e.message));
    page.on('request', r => { if (!r.url().startsWith('file:')) demandes.push(r.url()); });
    page.on('dialog', async d => { dialogues.push(d.message()); await d.dismiss(); });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('parsererror').count(), 0);
    await verifier(page);
    assert.deepEqual(erreurs, []); assert.deepEqual(demandes, []); assert.deepEqual(dialogues, []);
  } finally {
    try { if (browser) await browser.close(); } finally { await rm(dir, { recursive: true, force: true }); }
  }
}

/** Oracle du moteur navigateur : mesure les glyphes effectivement affichés,
 * et contrôle leur inclusion dans le contour, les collisions et les marges. */
async function verifierRendu(page, scale) {
  return page.evaluate(scale => {
    const svg = document.documentElement;
    const vb = svg.viewBox.baseVal;
    svg.style.width = `${vb.width * scale}px`; svg.style.height = `${vb.height * scale}px`;
    const problemes = [];
    const check = (ok, message) => { if (!ok) problemes.push(message); };
    const formes = [...document.querySelectorAll('.forme')];
    const labels = [...document.querySelectorAll('.fond-libelle')];
    const bbox = e => e.getBBox();
    const separes = (a, b, m = 0) => a.x + a.width <= b.x - m + 0.01 || b.x + b.width <= a.x - m + 0.01 || a.y + a.height <= b.y - m + 0.01 || b.y + b.height <= a.y - m + 0.01;
    const contient = (b, marge = 14) => b.x >= vb.x + marge - 0.01 && b.y >= vb.y + marge - 0.01 && b.x + b.width <= vb.x + vb.width - marge + 0.01 && b.y + b.height <= vb.y + vb.height - marge + 0.01;
    const luminance = color => {
      const rgb = color.match(/\d+/g).slice(0, 3).map(Number).map(n => n / 255)
        .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    for (const text of document.querySelectorAll('text')) {
      if (!text.textContent) continue;
      const fond = text.parentElement.querySelector('.forme, .fond-libelle, .fond-legende');
      const a = luminance(getComputedStyle(text).fill);
      const b = luminance(getComputedStyle(fond).fill);
      check((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, 'contraste de texte insuffisant');
    }
    check(Math.abs(svg.getBoundingClientRect().width - vb.width * scale) < 0.1, 'échelle effective incorrecte');
    check(Math.abs(svg.getCTM().a - scale) < 0.01, 'matrice de zoom incorrecte');
    for (const e of [...formes, ...labels, ...document.querySelectorAll('text')]) {
      if (e.tagName === 'text' && e.textContent === '') continue;
      check(contient(bbox(e)), `coupure aux bords : ${e.outerHTML.slice(0, 70)}`);
    }
    for (const path of document.querySelectorAll('.chemin')) {
      const b = bbox(path);
      check(contient({ x: b.x - 20, y: b.y - 20, width: b.width + 40, height: b.height + 40 }), 'chemin/flèche sans marge');
      check(path.getTotalLength() > 0 && getComputedStyle(path).markerEnd.includes('fleche'), 'flèche absente');
    }
    for (const n of document.querySelectorAll('.noeud')) {
      const shape = n.querySelector('.forme'); const b = bbox(shape);
      for (const line of n.querySelectorAll('tspan')) {
        if (!line.textContent) continue;
        const t = bbox(line);
        for (const x of [t.x, t.x + t.width]) for (const y of [t.y, t.y + t.height]) {
          const nx = Math.abs((x - b.x - b.width / 2) / (b.width / 2));
          const ny = Math.abs((y - b.y - b.height / 2) / (b.height / 2));
          check(shape.tagName === 'polygon' ? nx + ny < 1 : shape.tagName === 'ellipse' ? nx * nx + ny * ny < 1 : nx < 1 && ny < 1,
            `texte hors contour : ${line.textContent}`);
        }
        check(getComputedStyle(line).fontSize === '14px', 'taille de texte inattendue');
      }
    }
    for (const [i, label] of labels.entries()) {
      const b = bbox(label);
      for (const shape of formes) check(separes(b, bbox(shape), 8), 'libellé trop près d’une forme');
      for (const autre of labels.slice(i + 1)) check(separes(b, bbox(autre), 8), 'collision de libellés');
      const text = label.parentElement.querySelector('text'); const t = bbox(text);
      check(t.x >= b.x && t.y >= b.y && t.x + t.width <= b.x + b.width && t.y + t.height <= b.y + b.height, 'texte hors étiquette');
    }
    return { problemes, noeuds: document.querySelectorAll('.noeud').length, arcs: document.querySelectorAll('.arc').length,
      oui: document.querySelectorAll('.chemin.branche-oui').length,
      non: document.querySelectorAll('.chemin.branche-non').length };
  }, scale);
}
async function capture(page, nom) {
  if (!process.env.SVG_SCREENSHOT_DIR) return;
  const directory = resolve(process.env.SVG_SCREENSHOT_DIR);
  await mkdir(directory, { recursive: true });
  // Capture directe du document XML : évite les helpers HTML de screenshot
  // (injection de styles de curseur) sur un document SVG autonome.
  const session = await page.context().newCDPSession(page);
  try {
    const capturer = async (suffixe, clip) => {
      const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
      await writeFile(join(directory, `${nom}${suffixe}.png`), Buffer.from(data, 'base64'));
    };
    const taille = await page.evaluate(() => ({ x: 0, y: 0, width: document.documentElement.getBoundingClientRect().width, height: document.documentElement.getBoundingClientRect().height }));
    await capturer('', taille);
    if (nom.startsWith('diagram-')) {
      const clip = await page.locator('[data-node-id="7fa714ee-c6b2-4795-bab1-3087eada86ae"]').evaluate(n => {
        const b = n.getBoundingClientRect();
        return { x: Math.max(0, b.x - 160), y: Math.max(0, b.y - 120), width: b.width + 320, height: b.height + 300 };
      });
      await capturer('-branche', clip);
    }
  } finally { await session.detach(); }
}

test('svg-navigateur-croisements-couleurs-et-pointes-proches-preservees', { timeout: 60000 }, async () => {
  const fixture = croisements();
  await ouvrir(fixture.svg, async page => {
    for (const scale of [1, 2]) assert.deepEqual((await verifierRendu(page, scale)).problemes, []);
    assert.deepEqual(await page.locator('.dessus-croisement').evaluateAll(paths => paths.map(p => getComputedStyle(p).stroke)),
      ['rgb(74, 222, 128)', 'rgb(248, 113, 113)', 'rgb(148, 163, 184)']);
    await verifierRendu(page, 1); await capture(page, 'croisements-couleurs-1x');
  });
  // Une flèche verte finit 12 px après le croisement (dans sa pointe de 20 px).
  const { spatial, textes, arcs } = fixture;
  spatial.sommets.bas.p.y = 252;
  spatial.sommets.bas.connexions.forEach(p => { p.y -= 108; });
  spatial.chemins = [spatial.chemins[2], spatial.chemins[3]];
  spatial.chemins[1].listeDePas[0].distance = 360;
  arcs[3].label = 'oui';
  await ouvrir(rendreSvg(spatial, textes, [arcs[2], arcs[3]]), async page => {
    const horizontal = page.locator('[data-arc-id="h2"] .chemin');
    const vertical = page.locator('[data-arc-id="vertical"] .chemin');
    assert.match(await horizontal.getAttribute('mask'), /^url\(#croisement-/);
    assert.equal(await vertical.getAttribute('mask'), null, 'la pointe entière reste au-dessus');
    assert.equal(await page.locator('.dessus-croisement').getAttribute('data-crossing-for'), 'vertical');
    const clip = await page.evaluate(() => {
      const p = new DOMPoint(98, 238).matrixTransform(document.documentElement.getScreenCTM());
      return { x: p.x, y: p.y, width: 4, height: 4, scale: 3 };
    });
    const session = await page.context().newCDPSession(page);
    try {
      const avant = await session.send('Page.captureScreenshot', { format: 'png', clip });
      await page.evaluate(() => {
        document.querySelectorAll('.chemin').forEach(p => p.removeAttribute('mask'));
        document.querySelector('.croisements').remove();
      });
      const sansDecoration = await session.send('Page.captureScreenshot', { format: 'png', clip });
      assert.equal(avant.data, sansDecoration.data, 'les pixels intérieurs de la pointe restent intacts');
    } finally { await session.detach(); }
    await capture(page, 'croisement-pointe-1x');
  });
});

test('svg-navigateur-diagram-taille-normale-et-double', { timeout: 60000 }, async () => {
  const { svg } = await reference();
  await ouvrir(svg, async page => {
    for (const scale of [1, 2]) {
      const r = await verifierRendu(page, scale);
      assert.deepEqual(r.problemes, []); assert.equal(r.noeuds, 18); assert.equal(r.arcs, 24);
      assert.equal(r.oui, 6); assert.equal(r.non, 6);
      await capture(page, `diagram-${scale}x`);
    }
    const retours = await page.locator('.chemin').evaluateAll(paths => paths.filter(p => p.getPointAtLength(p.getTotalLength()).y < p.getPointAtLength(0).y).length);
    assert.ok(retours > 0);
  });
});

test('svg-navigateur-coordonnees-negatives-et-marges', { timeout: 60000 }, async () => {
  await ouvrir(negatif().svg, async page => {
    for (const scale of [1, 2]) assert.deepEqual((await verifierRendu(page, scale)).problemes, []);
    await capture(page, 'negatif-2x');
  });
});

test('svg-navigateur-texte-long-et-retours', { timeout: 60000 }, async () => {
  const label = 'Été e\u0301 👩‍💻界 : une très longue explication\n\n' + 'Extraordinairement'.repeat(10) + '\n';
  const { svg, textes } = preparer(graphe(['rectangle', 'losange', 'ovale'].map(type => forme(type, { type, label, dx: 20, dy: 10 })), [arc('long', 'rectangle', 'losange', label)]));
  await ouvrir(svg, async page => {
    for (const scale of [1, 2]) assert.deepEqual((await verifierRendu(page, scale)).problemes, []);
    const lignes = await page.locator('.noeud').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [n.dataset.nodeId, [...n.querySelectorAll('tspan')].map(t => t.textContent)])));
    for (const [id, t] of Object.entries(textes)) assert.deepEqual(lignes[id], t.lignes);
    await capture(page, 'textes-longs-2x');
  });
});

test('svg-navigateur-xml-inerte-et-hors-ligne', { timeout: 60000 }, async () => {
  const { g, svg } = hostile();
  await ouvrir(svg, async page => {
    assert.equal(await page.locator('script, image, foreignObject, [onload], [href]').count(), 0);
    const labels = await page.locator('.noeud').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.nodeId, label: n.getAttribute('aria-label'), titre: n.querySelector('title').textContent })));
    for (const n of labels) {
      assert.equal(n.label, g.sommets[n.id].label); assert.equal(n.titre, n.label);
    }
    assert.deepEqual((await verifierRendu(page, 1)).problemes, []);
    await capture(page, 'xml-inerte-1x');
  });
});

test('svg-navigateur-theme-sombre-export-et-cadrage-compact', { timeout: 60000 }, async () => {
  const svg = convertirJson(await readFile(new URL('../diagram.json', import.meta.url), 'utf8'));
  await ouvrir(svg, async page => {
    for (const scale of [1, 2]) {
      const r = await verifierRendu(page, scale);
      assert.deepEqual(r.problemes, []);
      assert.equal(r.noeuds, 18); assert.equal(r.arcs, 24);
      assert.equal(r.oui, 6); assert.equal(r.non, 6);
    }
    assert.equal(await page.locator('svg').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(11, 17, 32)');
    assert.ok(await page.locator('.rectangle').evaluateAll(nodes => nodes.every(n => n.rx.baseVal.value > 0)));
    // Les arcs ordinaires utilisent la palette sans rouge ni vert.
    assert.equal(await page.locator('.chemin:not(.branche-oui):not(.branche-non)').count(), 12);
    assert.equal(await page.locator('.chemin:not(.branche-oui):not(.branche-non)').evaluateAll(paths => paths.every(p => !['rgb(74, 222, 128)', 'rgb(248, 113, 113)'].includes(getComputedStyle(p).stroke))), true);
    // Retour à une vue d'ensemble avant la capture ; les détails sont capturés à 1×.
    await verifierRendu(page, 1);
    await capture(page, 'diagram-compact-sombre-1x');
  });
});

test('svg-navigateur-debut-fleches-agrandies-et-export-autonome', { timeout: 60000 }, async () => {
  const svg = convertirJson(await readFile(new URL('../diagram.json', import.meta.url), 'utf8'));
  await ouvrir(svg, async page => {
    const debut = page.locator('[data-node-id="618ec9db-0b4b-43eb-be3b-f5dcf7a5adc1"]');
    assert.equal(await debut.getAttribute('aria-label'), 'Début');
    assert.equal(await debut.locator('title').textContent(), 'Début');
    assert.equal(await debut.locator('.texte-noeud').textContent(), 'Début');
    assert.equal(await debut.locator('.forme').evaluate(e => getComputedStyle(e).fill), 'rgb(18, 55, 47)');
    const mesures = await page.locator('svg').evaluate(svg => {
      const marker = svg.querySelector('#fleche');
      const p = marker.querySelector('path').getBBox();
      const problemes = []; const directions = new Set();
      const labels = [...svg.querySelectorAll('.fond-libelle')].map(e => e.getBBox());
      for (const path of svg.querySelectorAll('.chemin')) {
        const length = path.getTotalLength(); const fin = path.getPointAtLength(length);
        const avant = path.getPointAtLength(length - 1);
        const horizontal = Math.abs(fin.x - avant.x) > .5;
        directions.add(horizontal ? fin.x > avant.x ? 'droite' : 'gauche' : fin.y > avant.y ? 'bas' : 'haut');
        const b = horizontal ? { x: Math.min(fin.x, fin.x - Math.sign(fin.x - avant.x) * p.width), y: fin.y - p.height / 2, width: p.width, height: p.height }
          : { x: fin.x - p.height / 2, y: Math.min(fin.y, fin.y - Math.sign(fin.y - avant.y) * p.width), width: p.height, height: p.width };
        if (labels.some(t => t.x < b.x + b.width && t.x + t.width > b.x && t.y < b.y + b.height && t.y + t.height > b.y)) problemes.push('libellé masquant une flèche');
      }
      return { largeur: p.width, hauteur: p.height, refX: marker.refX.baseVal.value, refY: marker.refY.baseVal.value,
        couleur: getComputedStyle(marker.querySelector('path')).fill, directions: [...directions].sort(), problemes };
    });
    assert.equal(mesures.largeur, 20); assert.equal(mesures.hauteur, 16);
    assert.equal(mesures.refX, 20); assert.equal(mesures.refY, 8);
    assert.equal(mesures.couleur, 'rgb(148, 163, 184)');
    assert.deepEqual(mesures.directions, ['bas', 'droite', 'gauche', 'haut']);
    assert.deepEqual(mesures.problemes, []);
    for (const scale of [1, 2]) assert.deepEqual((await verifierRendu(page, scale)).problemes, []);
    await verifierRendu(page, 1);
    await capture(page, 'diagram-corrige-debut-fleches-1x');
  });
});
