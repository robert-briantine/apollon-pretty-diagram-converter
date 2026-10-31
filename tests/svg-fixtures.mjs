import { importerFichierDiagramme } from '../dist/server/importer.js';
import { calculerPlacements, computeSpatialGraphe, rendreSvg, dimensionnerForme, creerPlacement } from '../dist/server/graphe.js';

export const forme = (id, extras = {}) => ({ id, type: 'rectangle', dx: 200, dy: 80, label: id, metadata: {}, ...extras });
export const arc = (id, debut, fin, label = '') => ({ id, debut, fin, label, metadata: {} });
export const graphe = (formes, arretes = []) => ({ sommets: Object.fromEntries(formes.map(f => [f.id, f])), arretes, metadata: {} });
export function preparer(g) {
  const placements = calculerPlacements(g);
  if (!placements.ok) throw new Error(JSON.stringify(placements));
  const spatial = computeSpatialGraphe(g);
  const svg = rendreSvg(spatial, placements.textes, g.arretes);
  return { g, spatial, textes: placements.textes, svg };
}
export async function reference() {
  return preparer(await importerFichierDiagramme(new URL('../diagram.json', import.meta.url)));
}
export function negatif() {
  const a = dimensionnerForme(forme('a', { dy: 60 }));
  const b = dimensionnerForme(forme('b', { dy: 60 }));
  const spatial = { sommets: { a: creerPlacement(a.forme, { x: -400, y: -500 }), b: creerPlacement(b.forme, { x: -100, y: -100 }) },
    chemins: [{ arcId: 'detour', debut: 'a', fin: 'b', idx: 3, listeDePas: [
      { type: 'horizontal', distance: -500 }, { type: 'vertical', distance: -430 },
      { type: 'horizontal', distance: 900 }, { type: 'vertical', distance: 800 },
    ] }] };
  const textes = { a: a.texte, b: b.texte };
  const arcs = [arc('detour', 'a', 'b', 'Retour très extérieur')];
  return { spatial, textes, arcs, svg: rendreSvg(spatial, textes, arcs) };
}
export function hostile() {
  const id = 'a" onload="alert(1) <&>\n';
  const label = 'Été & < > " \'\n<script>alert("x")</script>\nFin\n';
  const arcId = 'arc"><image href="https://example.invalid/x"/>';
  return preparer(graphe([forme(id, { label }), forme('__proto__', { type: 'losange', label })],
    [arc(arcId, id, '__proto__', label)]));
}
export function points(spatial, c) {
  const out = [{ ...spatial.sommets[c.debut].connexions[c.idx] }];
  for (const pas of c.listeDePas) {
    const p = { ...out.at(-1) };
    p[pas.type === 'horizontal' ? 'x' : 'y'] += pas.distance;
    out.push(p);
  }
  return out;
}

/** Trois croisements isolés, dont un arc parcouru de droite à gauche.
 * Géométrie volontairement explicite, indépendante du routeur testé ailleurs. */
export function croisements() {
  const sommets = {}; const textes = {}; const chemins = []; const arcs = [];
  const ajouter = (id, p) => {
    const d = dimensionnerForme(forme(id, { dx: 60, dy: 40, label: 'À' }));
    sommets[id] = creerPlacement(d.forme, p); textes[id] = d.texte;
  };
  for (const [i, label] of [' OUI ', 'Non', ''].entries()) {
    const y = 80 * (i + 1); const inverse = i === 1;
    ajouter(`s${i}`, { x: inverse ? 320 : -160, y: y - 26 });
    ajouter(`t${i}`, { x: inverse ? -160 : 320, y: y - 26 });
    arcs.push(arc(`h${i}`, `s${i}`, `t${i}`, label));
    chemins.push({ arcId: `h${i}`, debut: `s${i}`, fin: `t${i}`, idx: inverse ? 3 : 1,
      listeDePas: [{ type: 'horizontal', distance: inverse ? -420 : 420 }] });
  }
  ajouter('haut', { x: 70, y: -160 }); ajouter('bas', { x: 70, y: 360 });
  arcs.push(arc('vertical', 'haut', 'bas'));
  chemins.push({ arcId: 'vertical', debut: 'haut', fin: 'bas', idx: 2,
    listeDePas: [{ type: 'vertical', distance: 468 }] });
  const spatial = { sommets, chemins };
  return { spatial, textes, arcs, svg: rendreSvg(spatial, textes, arcs) };
}

/** n polylignes formant un graphe complet de croisements : chaque verticale
 * coupe toutes les horizontales suivantes, loin des ports et des coudes. */
export function entrelaces(n = 6, labels = []) {
  const sommets = {}; const textes = {}; const chemins = []; const arcs = [];
  const bas = 80 * (n + 2);
  for (let i = 0; i < n; i++) {
    const y = 80 * (i + 1); const x = 80 * (i + 1);
    for (const [id, position] of [[`s${i}`, 'source'], [`t${i}`, 'cible']]) {
      const d = dimensionnerForme(forme(id, { dx: 60, dy: 40, label: 'À' }));
      const p = position === 'source' ? { x: -d.forme.dx, y: y - d.forme.dy / 2 }
        : { x: x - d.forme.dx / 2, y: bas };
      sommets[id] = creerPlacement(d.forme, p); textes[id] = d.texte;
    }
    chemins.push({ arcId: `piste-${i}`, debut: `s${i}`, fin: `t${i}`, idx: 1,
      listeDePas: [{ type: 'horizontal', distance: x }, { type: 'vertical', distance: bas - y }] });
    arcs.push(arc(`piste-${i}`, `s${i}`, `t${i}`, labels[i] ?? ''));
  }
  const spatial = { sommets, chemins };
  return { spatial, textes, arcs, svg: rendreSvg(spatial, textes, arcs) };
}
