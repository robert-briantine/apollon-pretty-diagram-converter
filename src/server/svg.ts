import type { A, Point, SpaceGraphe } from './graphe.js';
import { calculerDestination } from './geometrie.js';
import { composerLignes, mesurerTexte, REGLES_TEXTE, type TextePlace } from './texte.js';

export const REGLES_SVG = Object.freeze({ marge: 16, contour: 2, fleche: 20,
  margeLibelle: 8, paddingLibelle: 6, rayonCroisement: 5, haloCroisement: 7 });
interface Boite { x: number; y: number; dx: number; dy: number }
interface Trace { points: Point[]; label: string; id: string }
interface Encre { couleur: string; marqueur: string }
interface Segment { a: Point; b: Point; trace: Trace; dernier: boolean }
interface Croisement { h: Segment; v: Segment; x: number; y: number; horizontal: number; vertical: number }
// Palette lisible sur fond sombre, sans rouge ni vert réservés aux conditions.
const PALETTE = ['#94a3b8', '#60a5fa', '#fbbf24', '#c084fc', '#f0abfc', '#a5b4fc'];
const ENCRES: Encre[] = PALETTE.map((couleur, i) => ({ couleur, marqueur: i ? `fleche-piste-${i}` : 'fleche' }));
const PALETTES = {
  ordinaire: ENCRES,
  oui: ['#4ade80', '#bbf7d0', '#16a34a'].map((couleur, i) =>
    ({ couleur, marqueur: `fleche-oui${i ? `-${i}` : ''}` })),
  non: ['#f87171', '#fecaca', '#fb7185'].map((couleur, i) =>
    ({ couleur, marqueur: `fleche-non${i ? `-${i}` : ''}` })),
};
interface Etiquette { boite: Boite; lignes: string[]; largeurs: number[]; rappel?: Point }

// Seuls les libellés de branche explicites déterminent la couleur ; les autres
// arcs utilisent la palette de séparation des croisements. Le libellé source
// reste disponible dans le titre et le nom accessible, même sans étiquette.
function branche(label: string): 'oui' | 'non' | undefined {
  const valeur = label.trim().toLowerCase();
  return valeur === 'oui' || valeur === 'non' ? valeur : undefined;
}

/** XML 1.0 : les caractères interdits et les demi-surrogates isolés sont
 * remplacés par U+FFFD. Les données ne sont jamais interpolées comme balisage. */
function xml(value: string, attribut = false): string {
  let result = '';
  for (const c of value) {
    const n = c.codePointAt(0)!;
    const valide = n === 9 || n === 10 || n === 13 ||
      (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || n >= 0x10000;
    if (!valide) { result += '\ufffd'; continue; }
    result += ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]
      ?? (attribut && /[\n\r\t]/.test(c) ? `&#${n};` : c);
  }
  return result;
}
function nombre(n: number): string {
  if (!Number.isFinite(n)) throw new Error('SVG : coordonnée non finie.');
  return String(Object.is(n, -0) ? 0 : n);
}
const xy = (p: Point): string => `${nombre(p.x)} ${nombre(p.y)}`;
function rect(b: Boite): string {
  return `x="${nombre(b.x)}" y="${nombre(b.y)}" width="${nombre(b.dx)}" height="${nombre(b.dy)}"`;
}
function recouvre(a: Boite, b: Boite, marge = 0): boolean {
  return a.x < b.x + b.dx + marge && a.x + a.dx > b.x - marge &&
    a.y < b.y + b.dy + marge && a.y + a.dy > b.y - marge;
}
function segmentBoite(a: Point, b: Point, marge: number): Boite {
  return { x: Math.min(a.x, b.x) - marge, y: Math.min(a.y, b.y) - marge,
    dx: Math.abs(a.x - b.x) + 2 * marge, dy: Math.abs(a.y - b.y) + 2 * marge };
}

/** Une même détection alimente la coloration et les repères de passage.
 * Les contacts aux ports/coudes et les parallèles ne sont pas des croisements. */
function trouverCroisements(traces: Trace[]): Croisement[] {
  const segments = traces.flatMap(t => t.points.slice(1).map((b, i) =>
    ({ a: t.points[i], b, trace: t, dernier: i === t.points.length - 2 })));
  const dessus = segments.filter(s => s.a.y === s.b.y);
  const dessous = segments.filter(s => s.a.x === s.b.x);
  const resultat: Croisement[] = [];
  for (const h of dessus) for (const v of dessous) {
    if (h.trace === v.trace) continue;
    const x = v.a.x; const y = h.a.y;
    const horizontal = Math.min(x - Math.min(h.a.x, h.b.x), Math.max(h.a.x, h.b.x) - x);
    const vertical = Math.min(y - Math.min(v.a.y, v.b.y), Math.max(v.a.y, v.b.y) - y);
    if (horizontal > 1e-7 && vertical > 1e-7) resultat.push({ h, v, x, y, horizontal, vertical });
  }
  return resultat;
}

/** Colore le graphe des intersections, par saturation puis degré et identifiant.
 * Une seule encre par arc entier, indépendante de l'ordre d'entrée. Les arcs
 * ordinaires isolés restent gris. Deux branches de même condition prennent des
 * nuances distinctes de vert ou rouge. Si leur palette est saturée, minimise
 * les voisins de même couleur, sans changer la signification des conditions. */
function colorerTraces(traces: Trace[], croisements: Croisement[]): Map<Trace, Encre> {
  const encres = new Map<Trace, Encre>();
  const voisins = new Map<Trace, Set<Trace>>();
  for (const trace of traces) voisins.set(trace, new Set());
  for (const { h, v } of croisements) {
    if (branche(h.trace.label) !== branche(v.trace.label)) continue;
    voisins.get(h.trace)!.add(v.trace); voisins.get(v.trace)!.add(h.trace);
  }
  const restants = new Set(voisins.keys());
  const saturation = (t: Trace): number => new Set([...voisins.get(t)!]
    .flatMap(v => encres.has(v) ? [encres.get(v)!.couleur] : [])).size;
  while (restants.size) {
    const trace = [...restants].sort((a, b) => saturation(b) - saturation(a) ||
      voisins.get(b)!.size - voisins.get(a)!.size || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    const palette = PALETTES[branche(trace.label) ?? 'ordinaire'];
    const comptes = palette.map(encre => [...voisins.get(trace)!].filter(v => encres.get(v) === encre).length);
    encres.set(trace, palette[comptes.indexOf(Math.min(...comptes))]);
    restants.delete(trace);
  }
  return encres;
}

/** Passage au-dessus : un masque local interrompt le seul trait inférieur,
 * puis le trait supérieur est redessiné dans l'encre de son chemin entier.
 * Les chemins validés et leurs pointes restent intégralement inchangés. */
function decorerCroisements(croisements: Croisement[], encres: Map<Trace, Encre>):
  { marques: string; masques: Map<string, string[]> } {
  const masques = new Map<string, string[]>(); const traits: string[] = [];
  const vus = new Set<string>();
  for (const { h, v, x, y, horizontal, vertical } of croisements) {
    // Une pointe proche du croisement passe au-dessus, pour rester entière.
    // Ailleurs, la convention est toujours horizontal au-dessus de vertical.
    const distancePointe = v.dernier ? Math.abs(v.b.y - y) : Infinity;
    const dessusVertical = distancePointe < REGLES_SVG.fleche + REGLES_SVG.haloCroisement;
    const haut = dessusVertical ? v : h; const bas = dessusVertical ? h : v;
    const cle = JSON.stringify([haut.trace.id, bas.trace.id, x, y]);
    if (vus.has(cle)) continue;
    vus.add(cle);
    // Réduit le repère près d'un coude ; le halo ne dépasse pas le croisement
    // et ne transforme pas une extrémité voisine en coupure de chemin.
    const rayon = Math.min(REGLES_SVG.rayonCroisement, (dessusVertical ? vertical : horizontal) / 2);
    const largeurPointe = dessusVertical ? 16 * Math.max(0, 1 - distancePointe / REGLES_SVG.fleche) : 0;
    const largeur = Math.min(Math.max(REGLES_SVG.haloCroisement, largeurPointe + 5), dessusVertical ? horizontal : vertical);
    const d = dessusVertical ? `M ${xy({ x, y: y - rayon })} L ${xy({ x, y: y + rayon })}`
      : `M ${xy({ x: x - rayon, y })} L ${xy({ x: x + rayon, y })}`;
    const type = branche(haut.trace.label);
    masques.set(bas.trace.id, [...(masques.get(bas.trace.id) ?? []),
      `<path class="halo-croisement" d="${d}" stroke-width="${nombre(largeur)}"/>`]);
    traits.push(`<path class="dessus-croisement${type ? ` branche-${type}` : ''}" style="stroke: ${encres.get(haut.trace)!.couleur}" data-crossing-for="${xml(haut.trace.id, true)}" data-x="${nombre(x)}" data-y="${nombre(y)}" d="${d}"/>`);
  }
  return { marques: `<g class="croisements" aria-hidden="true">${traits.join('')}</g>`, masques };
}

/** Placement indépendant du routage : réserve les boîtes des formes et les
 * couloirs de TOUS les arcs, puis les étiquettes déjà placées. Les conditions
 * sont expliquées dans une légende ; aucun texte n'est tourné pour suivre un arc. */
function placerEtiquettes(traces: Trace[], formes: Boite[]): (Etiquette | undefined)[] {
  const segments = traces.flatMap(t => t.points.slice(1).map((b, i) => segmentBoite(t.points[i], b, 3)));
  const occupees: Boite[] = [];
  const libre = (b: Boite): boolean => !formes.some(f => recouvre(b, f, REGLES_SVG.margeLibelle)) &&
    !occupees.some(f => recouvre(b, f, REGLES_SVG.margeLibelle)) && !segments.some(s => recouvre(b, s));
  const droite = Math.max(0, ...formes.map(f => f.x + f.dx), ...segments.map(s => s.x + s.dx)) + 32;
  return traces.map(trace => {
    if (trace.label === '' || branche(trace.label)) return undefined;
    const lignes = composerLignes(trace.label);
    const largeurs = lignes.map(mesurerTexte);
    const dx = Math.max(...largeurs) + 2 * REGLES_SVG.paddingLibelle;
    const dy = lignes.length * REGLES_TEXTE.interligne + 2 * REGLES_SVG.paddingLibelle;
    for (const ecart of [8, 16, 32, 64, 128, 192]) {
      for (let i = 1; i < trace.points.length; i++) {
        const a = trace.points[i - 1]; const b = trace.points[i];
        const longueur = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        const presDuDepart = ((a.x === b.x ? dy : dx) / 2 + REGLES_SVG.margeLibelle + 2) / longueur;
        for (const ratio of [...(presDuDepart < 1 ? [presDuDepart] : []), 0.5, 0.25, 0.75, 0.1, 0.9]) {
          const p = { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
          for (const signe of [1, -1]) {
            const cx = p.x + (a.x === b.x ? signe * (dx / 2 + ecart) : 0);
            const cy = p.y + (a.y === b.y ? signe * (dy / 2 + ecart) : 0);
            const boite = { x: cx - dx / 2, y: cy - dy / 2, dx, dy };
            if (libre(boite)) {
              const etiquette = { boite, lignes, largeurs, ...(ecart > 16 ? { rappel: p } : {}) };
              occupees.push(boite);
              return etiquette;
            }
          }
        }
      }
    }
    // Une zone très dense n'autorise pas à cacher un libellé : réserve une
    // colonne extérieure, avec rappel vers l'arc. Recherche finie, sans déplacer
    // les formes ni modifier les pas du chemin validé.
    const a = trace.points[0]; const b = trace.points[1] ?? a;
    const rappel = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const boite = { x: droite, y: rappel.y - dy / 2, dx, dy };
    for (let i = 0; i <= occupees.length; i++) {
      const conflit = occupees.find(f => recouvre(boite, f, REGLES_SVG.margeLibelle));
      if (!conflit) break;
      boite.y = conflit.y + conflit.dy + REGLES_SVG.margeLibelle;
    }
    occupees.push(boite);
    return { boite, lignes, largeurs, rappel };
  });
}

function texte(lignes: string[], largeurs: number[], cx: number, cy: number, classe: string): string {
  const debut = cy - lignes.length * REGLES_TEXTE.interligne / 2 + REGLES_TEXTE.interligne / 2 + REGLES_TEXTE.taille * 0.35;
  return `<text class="${classe}" text-anchor="middle" xml:space="preserve">${lignes.map((ligne, i) =>
    `<tspan x="${nombre(cx)}" y="${nombre(debut + i * REGLES_TEXTE.interligne)}"${largeurs[i] > 0 ?
      ` textLength="${nombre(largeurs[i])}" lengthAdjust="spacingAndGlyphs"` : ''}>${xml(ligne)}</tspan>`).join('')}</text>`;
}

/** Reçoit le SpaceGraphe validé, les compositions issues de calculerPlacements
 * et les libellés indexés par A.id (jamais Chemin.idx). Fonction pure : aucune
 * nouvelle mesure/découpe des nœuds et aucun changement de géométrie. */
export function rendreSvg(spatial: SpaceGraphe, textes: Readonly<Record<string, TextePlace>>,
  arcs: readonly Pick<A, 'id' | 'label'>[]): string {
  const libelles = new Map<string, string>();
  for (const arc of arcs) {
    if (libelles.has(arc.id) || typeof arc.label !== 'string') throw new Error(`SVG : libellé d'arc invalide : ${arc.id}`);
    libelles.set(arc.id, arc.label);
  }
  const traces: Trace[] = spatial.chemins.map(c => {
    const depart = spatial.sommets[c.debut]?.connexions[c.idx];
    if (!depart || !libelles.has(c.arcId)) throw new Error(`SVG : connexion ou libellé absent : ${c.arcId}`);
    const points = [{ ...depart }];
    for (const pas of c.listeDePas) points.push(calculerDestination(points[points.length - 1], [pas]));
    return { points, label: libelles.get(c.arcId)!, id: c.arcId };
  });
  if (new Set(traces.map(t => t.id)).size !== arcs.length || traces.length !== arcs.length) {
    throw new Error('SVG : chaque arc doit correspondre à un unique chemin.');
  }
  const placements = Object.entries(spatial.sommets);
  const formes = placements.map(([, pl]) => ({ x: pl.p.x, y: pl.p.y, dx: pl.forme.dx, dy: pl.forme.dy }));
  const etiquettes = placerEtiquettes(traces, formes);
  const bornes: Boite[] = [...formes.map(b => ({ x: b.x - 1, y: b.y - 1, dx: b.dx + 2, dy: b.dy + 2 })),
    ...traces.flatMap(t => t.points.map(p => segmentBoite(p, p, REGLES_SVG.fleche))),
    ...etiquettes.flatMap(e => e ? [{ x: e.boite.x - 1, y: e.boite.y - 1, dx: e.boite.dx + 2, dy: e.boite.dy + 2 }] : [])];
  const noeuds = placements.map(([id, pl], i) => {
    const t = Object.hasOwn(textes, id) ? textes[id] : undefined;
    if (!t || t.lignes.length !== t.largeurs.length) throw new Error(`SVG : composition du nœud absente ou invalide : ${id}`);
    const cx = pl.p.x + pl.forme.dx / 2; const cy = pl.p.y + pl.forme.dy / 2;
    bornes.push({ x: cx - t.largeur / 2, y: cy - t.hauteur / 2, dx: t.largeur, dy: t.hauteur });
    let forme: string;
    switch (pl.forme.type) {
      case 'rectangle': {
        // Un port proche d'un coin doit rester sur le côté rectiligne.
        const rayon = Math.min(12, pl.forme.dx / 4, pl.forme.dy / 4, ...pl.connexions.map(p =>
          Math.min(...[pl.p.x, pl.p.x + pl.forme.dx].flatMap(x =>
            [pl.p.y, pl.p.y + pl.forme.dy].map(y => Math.hypot(p.x - x, p.y - y))))));
        forme = `<rect class="forme rectangle" ${rect(formes[i])} rx="${nombre(rayon)}"/>`; break;
      }
      case 'ovale': {
        const finale = pl.forme.metadata.type === 'activityFinalNode';
        forme = `<ellipse class="forme ovale${finale ? ' finale' : ''}" cx="${nombre(cx)}" cy="${nombre(cy)}" rx="${nombre(pl.forme.dx / 2)}" ry="${nombre(pl.forme.dy / 2)}"/>`;
        if (finale) forme += `<ellipse class="contour-final" cx="${nombre(cx)}" cy="${nombre(cy)}" rx="${nombre(Math.max(1, pl.forme.dx / 2 - 6))}" ry="${nombre(Math.max(1, pl.forme.dy / 2 - 6))}"/>`;
        break;
      }
      case 'losange': forme = `<polygon class="forme losange" points="${xy({ x: cx, y: pl.p.y })} ${xy({ x: pl.p.x + pl.forme.dx, y: cy })} ${xy({ x: cx, y: pl.p.y + pl.forme.dy })} ${xy({ x: pl.p.x, y: cy })}"/>`; break;
      default: throw new Error(`SVG : forme inconnue : ${id}`);
    }
    return `<g id="noeud-${i}" class="noeud" data-node-id="${xml(id, true)}" aria-label="${xml(pl.forme.label, true)}"><title>${xml(pl.forme.label)}</title>${forme}${texte(t.lignes, t.largeurs, cx, cy, 'texte-noeud')}</g>`;
  });
  // Une seule légende, hors de la géométrie validée, fait aussi partie du fichier
  // autonome. Réserver sa boîte avant le viewBox évite toute coupure à l'export.
  const conditions = (['oui', 'non'] as const).filter(type => traces.some(t => branche(t.label) === type));
  const lx = bornes.length ? Math.min(...bornes.map(b => b.x)) : 0;
  const ly = (bornes.length ? Math.max(...bornes.map(b => b.y + b.dy)) : 0) + 16;
  const legende = conditions.length ? `<g class="legende" role="group" aria-label="Légende des branches : vert = oui ; rouge = non">${conditions.map((type, i) => {
    const b = { x: lx + i * 140, y: ly, dx: 128, dy: 44 };
    const encre = PALETTES[type][0];
    return `<g class="legende-condition" data-condition="${type}"><rect class="fond-legende" ${rect(b)} rx="8"/><path class="symbole-legende" style="stroke: ${encre.couleur}" d="M ${xy({ x: b.x + 12, y: ly + 22 })} L ${xy({ x: b.x + 56, y: ly + 22 })}" marker-end="url(#${encre.marqueur})"/>${texte([type === 'oui' ? 'Oui' : 'Non'], [27], b.x + 92, ly + 22, 'texte-legende')}</g>`;
  }).join('')}</g>` : '';
  if (conditions.length) bornes.push({ x: lx - 1, y: ly - 1, dx: conditions.length * 140 - 10, dy: 46 });
  const x = (bornes.length ? Math.min(...bornes.map(b => b.x)) : 0) - REGLES_SVG.marge;
  const y = (bornes.length ? Math.min(...bornes.map(b => b.y)) : 0) - REGLES_SVG.marge;
  const dx = (bornes.length ? Math.max(...bornes.map(b => b.x + b.dx)) : 0) - x + REGLES_SVG.marge;
  const dy = (bornes.length ? Math.max(...bornes.map(b => b.y + b.dy)) : 0) - y + REGLES_SVG.marge;
  const intersections = trouverCroisements(traces);
  const encres = colorerTraces(traces, intersections);
  const croisements = decorerCroisements(intersections, encres);
  const masques: string[] = [];
  const chemins = traces.map((t, i) => {
    const type = branche(t.label);
    const encre = encres.get(t)!;
    const halo = croisements.masques.get(t.id);
    if (halo) masques.push(`<mask id="croisement-${i}" maskUnits="userSpaceOnUse" ${rect({ x, y, dx, dy })}><rect ${rect({ x, y, dx, dy })} fill="white"/>${halo.join('')}</mask>`);
    return `<g id="arc-${i}" class="arc" data-arc-id="${xml(t.id, true)}" aria-label="${xml(t.label, true)}"><title>${xml(t.label)}</title><path class="chemin${type ? ` branche-${type}` : ''}" style="stroke: ${encre.couleur}" d="M ${t.points.map(xy).join(' L ')}" marker-end="url(#${encre.marqueur})"${halo ? ` mask="url(#croisement-${i})"` : ''}/></g>`;
  });
  // Marqueurs locaux avec couleurs explicites : même rendu dans l'aperçu image
  // et le fichier autonome, sans dépendre du support de context-stroke.
  const utilisees = new Set(encres.values());
  const marqueurs = Object.values(PALETTES).flatMap(palette =>
    palette.filter((encre, i) => i === 0 || utilisees.has(encre)))
    .map(({ marqueur, couleur }) => `<marker id="${marqueur}" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="16" viewBox="0 0 20 16" refX="20" refY="8" orient="auto"><path d="M 0 0 L 20 8 L 0 16 Z" fill="${couleur}"/></marker>`).join('');
  // Les rappels restent derrière TOUTES les formes et étiquettes : un rappel
  // de repli ne peut pas masquer le texte d'un arc précédemment dessiné.
  const rappels = etiquettes.flatMap((e, i) => e?.rappel ? [
    `<path class="rappel" data-label-for="${xml(traces[i].id, true)}" d="M ${xy(e.rappel)} L ${xy({ x: e.boite.x + e.boite.dx / 2, y: e.boite.y + e.boite.dy / 2 })}"/>`,
  ] : []);
  const labels = traces.map((trace, i) => {
    if (branche(trace.label)) return '';
    const e = etiquettes[i];
    if (!e) return `<g class="libelle-arc" data-label-for="${xml(trace.id, true)}"><text class="texte-arc"/></g>`;
    const b = e.boite;
    return `<g class="libelle-arc" data-label-for="${xml(trace.id, true)}"><rect class="fond-libelle" ${rect(b)} rx="4"/>${texte(e.lignes, e.largeurs, b.x + b.dx / 2, b.y + b.dy / 2, 'texte-arc')}</g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${nombre(dx)}" height="${nombre(dy)}" viewBox="${[x, y, dx, dy].map(nombre).join(' ')}" role="img" aria-labelledby="titre description" lang="fr">
<title id="titre">Diagramme d’activité</title><desc id="description">${placements.length} nœuds et ${traces.length} arcs orientés.</desc>
<defs>${marqueurs}${masques.join('')}</defs>
<style>
svg { background: #0b1120; color-scheme: dark; }
text { font-family: ${REGLES_TEXTE.famille}; font-size: ${REGLES_TEXTE.taille}px; fill: #f1f5f9; }
.forme { stroke: #7dd3fc; stroke-width: 2; stroke-linejoin: round; }
.rectangle { fill: #172b46; } .losange { fill: #382d18; stroke: #fbbf24; } .ovale { fill: #12372f; stroke: #6ee7b7; }
.finale { fill: #3b2030; stroke: #fda4af; } .contour-final { fill: none; stroke: #fda4af; stroke-width: 2; }
.chemin, .dessus-croisement { fill: none; stroke: #94a3b8; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.branche-oui { stroke: #4ade80; } .branche-non { stroke: #f87171; }
.halo-croisement { fill: none; stroke: black; stroke-linecap: butt; }
.fond-libelle { fill: #172033; stroke: #64748b; stroke-width: 1; }
.fond-legende { fill: #172033; stroke: #64748b; stroke-width: 1; }
.symbole-legende { fill: none; stroke-width: 2; stroke-linecap: round; }
.rappel { fill: none; stroke: #94a3b8; stroke-width: 1; stroke-dasharray: 3 3; }
</style>
<g class="arcs">${chemins.join('\n')}</g>
${croisements.marques}
<g class="rappels">${rappels.join('\n')}</g>
<g class="noeuds">${noeuds.join('\n')}</g>
<g class="libelles">${labels.join('\n')}</g>
${legende}
</svg>\n`;
}
