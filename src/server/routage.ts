import type { A, Ancre, Chemin, Graphe, Pas, Placement, Point, SpaceGraphe } from './graphe.js';
import { calculerPlacements } from './placement.js';
import { ESPACEMENT_PISTES } from './connexions.js';
import { calculerDestination, verifierChemin, verifierPlacement, verifierPlacementChemin } from './geometrie.js';

// Un virage coûte plusieurs pas de piste : éviter les escaliers est prioritaire
// sur un petit raccourci, tout en conservant les pénalités de croisement.
export const REGLES_ROUTAGE = Object.freeze({
  marge: 12, degagement: 24, espacementPistes: ESPACEMENT_PISTES, coutCoude: 240,
  coutSuperposition: 120, coutProximite: 4, coutCroisement: 1200, coutConnexionUtilisee: 40,
  toleranceCarree: 1e-12, maxEssais: 2, maxEtats: 250_000, maxNoeudsGrille: 200_000,
});
export interface OptionsRoutage {
  /** Resserre les positions et rapproche les rangs reliés dans les colonnes. */
  dispositionCompacte?: boolean;
  /** 1 : connexions préférées ; 2 : autorise le repli sur les autres côtés. */
  maxEssais?: number;
  /** Budget cumulé de recherche par arc, pour garantir un arrêt explicite. */
  maxEtats?: number;
  maxNoeudsGrille?: number;
}
export interface DiagnosticRoutage {
  code: string;
  chemin: string;
  message: string;
  essais: number;
  arcId?: string;
}
export class ErreurRoutage extends Error {
  constructor(readonly diagnostic: DiagnosticRoutage) {
    super(`${diagnostic.code} — ${diagnostic.chemin} : ${diagnostic.message}`);
    this.name = 'ErreurRoutage';
  }
}
function erreur(code: string, chemin: string, message: string, essais = 0, arcId?: string): never {
  throw new ErreurRoutage({ code, chemin, message, essais, ...(arcId === undefined ? {} : { arcId }) });
}
const cotes = ['top', 'right', 'bottom', 'left'] as const;
const normales: Record<Ancre['side'], Point> = {
  top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};
const egaux = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const longueur = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
interface Boite { id: string; x: number; y: number; dx: number; dy: number }
interface Port { idx: number; p: Point; sortie: Point; side: Ancre['side']; axe: number; noeud: number }
interface Segment { a: Point; b: Point; extremites?: Point[] }
// Les arcs issus du même port peuvent s'écarter au bout du dégagement commun.
// Ce raccord imposé n'est pas un croisement entre deux arcs indépendants.
function degagementCommun(p: Point, s: Segment, extremites: Point[]): boolean {
  return extremites.some(e => (s.extremites ?? [s.a, s.b]).some(q => egaux(e, q)) &&
    longueur(e, p) <= REGLES_ROUTAGE.degagement + 1e-8);
}

/** Le corps d'un chemin ne doit pas recouper son départ ou son arrivée.
 * Seul le point de sortie du dégagement est disponible à la recherche. */
function croiseDegagement(a: Point, b: Point, port: Port): boolean {
  const horizontal = a.y === b.y;
  const portHorizontal = port.p.y === port.sortie.y;
  const axe = horizontal ? 'x' : 'y'; const fixe = horizontal ? 'y' : 'x';
  if (horizontal === portHorizontal) {
    return a[fixe] === port.p[fixe] &&
      Math.min(Math.max(a[axe], b[axe]), Math.max(port.p[axe], port.sortie[axe])) >
      Math.max(Math.min(a[axe], b[axe]), Math.min(port.p[axe], port.sortie[axe])) + 1e-8;
  }
  const position = port.p[axe];
  return position >= Math.min(a[axe], b[axe]) && position <= Math.max(a[axe], b[axe]) &&
    a[fixe] >= Math.min(port.p[fixe], port.sortie[fixe]) &&
    a[fixe] <= Math.max(port.p[fixe], port.sortie[fixe]) &&
    Math.abs(a[fixe] - port.sortie[fixe]) > 1e-8;
}

/** Test spécialisé aux seuls segments orthogonaux et aux boîtes ouvertes. */
function traverse(a: Point, b: Point, r: Boite): boolean {
  if (a.x === b.x) return a.x > r.x && a.x < r.x + r.dx &&
    Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.dy;
  return a.y > r.y && a.y < r.y + r.dy &&
    Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.dx;
}
function boite(id: string, pl: Placement, marge: number): Boite {
  const b = { id, x: pl.p.x - marge, y: pl.p.y - marge,
    dx: pl.forme.dx + 2 * marge, dy: pl.forme.dy + 2 * marge };
  if (![b.x, b.y, b.dx, b.dy, b.x + b.dx, b.y + b.dy].every(Number.isFinite) ||
    (marge > 0 && (b.x >= pl.p.x || b.y >= pl.p.y || b.x + b.dx <= pl.p.x + pl.forme.dx ||
      b.y + b.dy <= pl.p.y + pl.forme.dy))) {
    erreur('PRECISION_INSUFFISANTE', `sommets[${JSON.stringify(id)}]`, 'Marge de routage non représentable.');
  }
  return b;
}
function ports(pl: Placement): Port[] {
  return pl.connexions.flatMap((p, idx) => cotes.filter(side => {
    switch (side) {
      case 'top': return p.y === pl.p.y;
      case 'right': return p.x === pl.p.x + pl.forme.dx;
      case 'bottom': return p.y === pl.p.y + pl.forme.dy;
      case 'left': return p.x === pl.p.x;
    }
  }).map(side => {
    const n = normales[side];
    return { idx, p, side, axe: n.x === 0 ? 1 : 0, noeud: -1,
      sortie: { x: p.x + n.x * REGLES_ROUTAGE.degagement, y: p.y + n.y * REGLES_ROUTAGE.degagement } };
  }));
}
function preferes(liste: Port[], pl: Placement, arc: A, source: boolean): Port[] {
  const ancre = source ? arc.sourceAnchor : arc.targetAnchor;
  const handle = source ? arc.sourceHandle : arc.targetHandle;
  const side = ancre?.side ?? cotes.find(c => c === handle) ?? (source ? 'bottom' : 'top');
  const candidats = liste.filter(p => p.side === side);
  if (!ancre || pl.forme.type !== 'rectangle') return candidats;
  const n = normales[side];
  const position = n.x === 0 ? pl.p.x + pl.forme.dx * ancre.ratio : pl.p.y + pl.forme.dy * ancre.ratio;
  return candidats.filter(p => Math.abs((n.x === 0 ? p.p.x : p.p.y) - position) < 1e-8);
}

// Droite, bas, gauche, haut : deux directions opposées diffèrent de deux.
const direction = (a: Point, b: Point): number => a.x === b.x ? (b.y > a.y ? 1 : 3) : (b.x > a.x ? 0 : 2);
interface Voisin { noeud: number; direction: number; distance: number }
/** Grille de visibilité non uniforme : contours dilatés, pistes voisines et
 * dégagements des ports. Les arêtes sont construites paresseusement et partagées
 * entre arcs. La source et la cible restent des obstacles pendant la recherche. */
class Grille {
  readonly xs: number[];
  readonly ys: number[];
  private readonly cache = new Map<number, Voisin[]>();
  constructor(readonly boites: Boite[], tousPorts: Port[], maxNoeuds: number) {
    const xs = new Set<number>();
    const ys = new Set<number>();
    for (const b of boites) for (const piste of [0, 1, 2]) {
      const d = piste * REGLES_ROUTAGE.espacementPistes;
      xs.add(b.x - d); xs.add(b.x + b.dx + d);
      ys.add(b.y - d); ys.add(b.y + b.dy + d);
    }
    for (const p of tousPorts) {
      xs.add(p.sortie.x); ys.add(p.sortie.y);
      // Pistes de part et d'autre d'un même port : les formes à quatre
      // connexions peuvent partager le dégagement sans partager tout le trajet.
      for (const piste of [-2, -1, 1, 2]) {
        const d = piste * REGLES_ROUTAGE.espacementPistes;
        if (p.axe === 1) xs.add(p.sortie.x + d);
        else ys.add(p.sortie.y + d);
      }
    }
    this.xs = [...xs].sort((a, b) => a - b);
    this.ys = [...ys].sort((a, b) => a - b);
    if (this.xs.length * this.ys.length > maxNoeuds) {
      erreur('GRILLE_TROP_GRANDE', 'routage.grille', `Limite de ${maxNoeuds} nœuds dépassée.`);
    }
    for (const p of tousPorts) p.noeud = this.ys.indexOf(p.sortie.y) * this.xs.length + this.xs.indexOf(p.sortie.x);
  }
  point(noeud: number): Point {
    return { x: this.xs[noeud % this.xs.length], y: this.ys[Math.floor(noeud / this.xs.length)] };
  }
  voisins(noeud: number): Voisin[] {
    const cache = this.cache.get(noeud);
    if (cache) return cache;
    const x = noeud % this.xs.length;
    const y = Math.floor(noeud / this.xs.length);
    const resultat: Voisin[] = [];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (x + dx < 0 || x + dx >= this.xs.length || y + dy < 0 || y + dy >= this.ys.length) continue;
      const prochain = (y + dy) * this.xs.length + x + dx;
      const a = this.point(noeud); const b = this.point(prochain);
      if (!this.boites.some(r => traverse(a, b, r))) {
        resultat.push({ noeud: prochain, direction: direction(a, b), distance: longueur(a, b) });
      }
    }
    this.cache.set(noeud, resultat);
    return resultat;
  }
}

interface Entree { etat: number; cout: number; ordre: number }
/** Tas binaire stable : les égalités suivent l'ordre d'insertion. */
class FilePriorite {
  private readonly valeurs: Entree[] = [];
  private ordre = 0;
  private avant(a: Entree, b: Entree): boolean { return a.cout < b.cout || (a.cout === b.cout && a.ordre < b.ordre); }
  ajouter(etat: number, cout: number): void {
    const valeur = { etat, cout, ordre: this.ordre++ };
    let i = this.valeurs.length;
    this.valeurs.push(valeur);
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (!this.avant(valeur, this.valeurs[parent])) break;
      this.valeurs[i] = this.valeurs[parent]; i = parent;
    }
    this.valeurs[i] = valeur;
  }
  retirer(): Entree | undefined {
    const premier = this.valeurs[0];
    const dernier = this.valeurs.pop();
    if (this.valeurs.length && dernier) {
      let i = 0;
      while (i * 2 + 1 < this.valeurs.length) {
        let enfant = i * 2 + 1;
        if (enfant + 1 < this.valeurs.length && this.avant(this.valeurs[enfant + 1], this.valeurs[enfant])) enfant++;
        if (!this.avant(this.valeurs[enfant], dernier)) break;
        this.valeurs[i] = this.valeurs[enfant]; i = enfant;
      }
      this.valeurs[i] = dernier;
    }
    return premier;
  }
}
function coutOccupation(a: Point, b: Point, occupes: Segment[], extremites: Point[]): number {
  let total = 0;
  for (const s of occupes) {
    if ((a.y === b.y) === (s.a.y === s.b.y)) {
      const h = a.y === b.y;
      const axe = h ? 'x' : 'y'; const fixe = h ? 'y' : 'x';
      const ecart = Math.abs(a[fixe] - s.a[fixe]);
      if (ecart >= REGLES_ROUTAGE.espacementPistes) continue;
      const commun = Math.max(0, Math.min(Math.max(a[axe], b[axe]), Math.max(s.a[axe], s.b[axe])) -
        Math.max(Math.min(a[axe], b[axe]), Math.min(s.a[axe], s.b[axe])));
      // La grille réunit des coordonnées de nombreux ports : doubler le pas
      // des pistes seul n'empêche pas deux trajets de se frôler à 4 px.
      // Coût proportionnel à la longueur côtoyée, sans interdire les passages
      // étroits ou les connexions imposées par le diagramme importé.
      total += commun * (ecart === 0 ? 1 : Math.max(0, 1 - ecart / REGLES_ROUTAGE.espacementPistes) *
        REGLES_ROUTAGE.coutProximite / REGLES_ROUTAGE.coutSuperposition);
    } else if ((a.y === b.y) !== (s.a.y === s.b.y)) {
      // La grille subdivise les segments : facturer l'arrivée à l'intersection
      // une seule fois, même lorsqu'elle est exactement sur une ligne de grille.
      const h = a.y === b.y;
      const position = h ? s.a.x : s.a.y;
      const debut = h ? a.x : a.y; const fin = h ? b.x : b.y;
      const fixe = h ? a.y : a.x;
      const s0 = h ? s.a.y : s.a.x; const s1 = h ? s.b.y : s.b.x;
      if ((debut < position && position <= fin || fin <= position && position < debut) &&
        Math.min(s0, s1) <= fixe && fixe <= Math.max(s0, s1)) {
        const intersection = h ? { x: position, y: fixe } : { x: fixe, y: position };
        // Plusieurs arcs peuvent devoir utiliser le même sommet d'un ovale ou
        // losange. Leur séparation/convergence dans le dégagement commun n'est
        // pas un croisement évitable, et ne doit pas favoriser un trajet identique.
        if (degagementCommun(intersection, s, extremites)) continue;
        // Un croisement sur un coude ou sur un dégagement réservé ressemble
        // à une jonction. Préférer une intersection transversale dans la piste.
        const bout = egaux(intersection, s.a) || egaux(intersection, s.b);
        total += REGLES_ROUTAGE.coutCroisement * (bout ? 3 : 1) / REGLES_ROUTAGE.coutSuperposition;
      }
    }
  }
  return total * REGLES_ROUTAGE.coutSuperposition;
}
const clePort = (id: string, p: Port): string => JSON.stringify([id, p.idx]);
interface Trajet { source: Port; cible: Port; points: Point[] }
function chercher(grille: Grille, sources: Port[], cibles: Port[], arc: A, occupes: Segment[], usages: Map<string, number>,
  budget: { restant: number }, essai: number): Trajet | undefined {
  // Une boucle doit revenir sur une autre connexion, sans aller-retour nul.
  if (arc.debut === arc.fin) {
    sources = sources.slice(0, 1);
    cibles = cibles.filter(p => sources.length && p.idx !== sources[0].idx);
  }
  if (!sources.length || !cibles.length) return undefined;
  const extremites = [...sources, ...cibles].map(p => p.p);
  const entreesInterdites = new Map<number, boolean>();
  const occupation = (a: Point, b: Point): number => coutOccupation(a, b, occupes, extremites);
  const coutVirage = (p: Point): number => occupes.some(s =>
    (s.a.x === s.b.x ? p.x === s.a.x && p.y >= Math.min(s.a.y, s.b.y) && p.y <= Math.max(s.a.y, s.b.y)
      : p.y === s.a.y && p.x >= Math.min(s.a.x, s.b.x) && p.x <= Math.max(s.a.x, s.b.x)) &&
    !degagementCommun(p, s, extremites)) ? REGLES_ROUTAGE.coutCroisement * 3 : 0;
  const file = new FilePriorite();
  const couts = new Map<number, number>();
  const parents = new Map<number, number>();
  const origines = new Map<number, Port>();
  const fins = new Map<number, Port[]>();
  const coutPort = (id: string, p: Port): number => (usages.get(clePort(id, p)) ?? 0) * REGLES_ROUTAGE.coutConnexionUtilisee;
  for (const p of cibles) fins.set(p.noeud, [...(fins.get(p.noeud) ?? []), p]);
  for (const p of sources) {
    const etat = p.noeud * 4 + direction(p.p, p.sortie);
    const cout = REGLES_ROUTAGE.degagement + coutPort(arc.debut, p) + occupation(p.p, p.sortie);
    if (cout >= (couts.get(etat) ?? Infinity)) continue;
    couts.set(etat, cout); origines.set(etat, p); file.ajouter(etat, cout);
  }
  let meilleur: { etat: number; cible: Port; cout: number } | undefined;
  for (let element = file.retirer(); element; element = file.retirer()) {
    const { etat, cout } = element;
    if (cout !== couts.get(etat)) continue;
    if (meilleur && cout >= meilleur.cout) break;
    if (--budget.restant < 0) erreur('BUDGET_ROUTAGE_DEPASSE', `arc[${JSON.stringify(arc.id)}]`,
      'Budget d’états épuisé ; augmenter maxEtats ou simplifier le graphe.', essai, arc.id);
    const noeud = Math.floor(etat / 4); const sens = etat % 4;
    for (const cible of fins.get(noeud) ?? []) {
      // Ne jamais atteindre le dégagement en sens inverse de l'entrée : cela
      // ajouterait une impasse puis un demi-tour visible comme une jonction en T.
      if (direction(cible.sortie, cible.p) === (sens + 2) % 4) continue;
      const final = cout + REGLES_ROUTAGE.degagement + coutPort(arc.fin, cible) +
        (sens % 2 === cible.axe ? 0 : REGLES_ROUTAGE.coutCoude + coutVirage(cible.sortie)) + occupation(cible.sortie, cible.p);
      if (!meilleur || final < meilleur.cout) meilleur = { etat, cible, cout: final };
    }
    for (const v of grille.voisins(noeud)) {
      if (v.direction === (sens + 2) % 4) continue;
      const a = grille.point(noeud); const b = grille.point(v.noeud);
      const cleEntree = noeud * 4 + v.direction;
      let interdit = entreesInterdites.get(cleEntree);
      if (interdit === undefined) {
        interdit = cibles.some(p => croiseDegagement(a, b, p));
        entreesInterdites.set(cleEntree, interdit);
      }
      if (interdit || croiseDegagement(a, b, origines.get(etat)!)) continue;
      const prochain = v.noeud * 4 + v.direction;
      const distance = cout + v.distance + (sens === v.direction ? 0 : REGLES_ROUTAGE.coutCoude + coutVirage(grille.point(noeud))) +
        occupation(grille.point(noeud), grille.point(v.noeud));
      if (distance >= (couts.get(prochain) ?? Infinity)) continue;
      couts.set(prochain, distance); parents.set(prochain, etat);
      origines.set(prochain, origines.get(etat)!); file.ajouter(prochain, distance);
    }
  }
  if (!meilleur) return undefined;
  const points: Point[] = [];
  let courant: number | undefined = meilleur.etat;
  const source = origines.get(courant)!;
  while (courant !== undefined) {
    points.push(grille.point(Math.floor(courant / 4))); courant = parents.get(courant);
  }
  return { source, cible: meilleur.cible, points: [source.p, ...points.reverse(), meilleur.cible.p] };
}

function nettoyer(points: Point[]): Point[] {
  const resultat: Point[] = [];
  for (const p of points) {
    if (resultat.length && egaux(resultat[resultat.length - 1], p)) continue;
    // Fusionne seulement les pas colinéaires de même sens (jamais un retour).
    while (resultat.length >= 2) {
      const a = resultat[resultat.length - 2]; const b = resultat[resultat.length - 1];
      if ((a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) ||
        (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0)) resultat.pop();
      else break;
    }
    resultat.push({ ...p });
  }
  return resultat;
}
function degage(a: Point, b: Point, port: Port): boolean {
  const n = normales[port.side];
  return (n.x === 0 ? a.x === b.x : a.y === b.y) &&
    (b.x - a.x) * n.x + (b.y - a.y) * n.y >= REGLES_ROUTAGE.degagement - 1e-8;
}
function trajetValide(t: Trajet, arc: A, reelles: Boite[], dilatees: Boite[]): boolean {
  const p = nettoyer(t.points);
  if (p.length < 2 || !degage(p[0], p[1], t.source) || !degage(p[p.length - 1], p[p.length - 2], t.cible)) return false;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]; const b = p[i];
    if (![a.x, a.y, b.x, b.y, longueur(a, b)].every(Number.isFinite) || (a.x !== b.x && a.y !== b.y)) return false;
    if (i > 1 && direction(a, b) === (direction(p[i - 2], a) + 2) % 4) return false;
    if (reelles.some(r => traverse(a, b, r))) return false;
    if (dilatees.some(r => r.id !== arc.debut && r.id !== arc.fin && traverse(a, b, r))) return false;
  }
  return true;
}
function chemin(t: Trajet, arc: A): Chemin {
  const points = nettoyer(t.points);
  const listeDePas: Pas[] = points.slice(1).map((p, i) => p.x === points[i].x
    ? { type: 'vertical', distance: p.y - points[i].y }
    : { type: 'horizontal', distance: p.x - points[i].x });
  return { arcId: arc.id, debut: arc.debut, fin: arc.fin, idx: t.source.idx, listeDePas };
}

/** Assemble placement et routage sans modifier g. Les libellés sont accessibles
 * par Chemin.arcId dans g.arretes ; ordre et multiplicité des arcs sont conservés.
 * Toute sortie passe les trois vérificateurs, plus le contrôle des dégagements.
 * Un échec lève ErreurRoutage avec diagnostic, jamais un graphe partiel. */
export function computeSpatialGraphe(g: Graphe, options: OptionsRoutage = {}): SpaceGraphe {
  const limites = { maxEssais: options.maxEssais ?? REGLES_ROUTAGE.maxEssais,
    maxEtats: options.maxEtats ?? REGLES_ROUTAGE.maxEtats,
    maxNoeudsGrille: options.maxNoeudsGrille ?? REGLES_ROUTAGE.maxNoeudsGrille };
  for (const [nom, valeur] of Object.entries(limites)) {
    if (!Number.isSafeInteger(valeur) || valeur <= 0 || (nom === 'maxEssais' && valeur > REGLES_ROUTAGE.maxEssais)) {
      erreur('OPTION_INVALIDE', `options.${nom}`, 'Entier strictement positif attendu ; maxEssais est limité à 2.');
    }
  }
  const ids = new Set<string>();
  for (const [i, a] of g.arretes.entries()) {
    if (typeof a.id !== 'string' || !a.id || ids.has(a.id) || typeof a.label !== 'string') {
      erreur('ARC_INVALIDE', `arretes[${i}]`, 'Identifiant unique non vide et libellé texte attendus.');
    }
    ids.add(a.id);
  }
  const resultat = calculerPlacements(g, options.dispositionCompacte);
  if (!resultat.ok) erreur(resultat.diagnostic.code, resultat.diagnostic.chemin, resultat.diagnostic.message);
  const sg: SpaceGraphe = { sommets: resultat.sommets, chemins: [] };
  const reelles = Object.entries(sg.sommets).map(([id, pl]) => boite(id, pl, 0));
  const dilatees = Object.entries(sg.sommets).map(([id, pl]) => boite(id, pl, REGLES_ROUTAGE.marge));
  const portsDe = new Map(Object.entries(sg.sommets).map(([id, pl]) => [id, ports(pl).filter(p =>
    !dilatees.some(r => r.id !== id && traverse(p.p, p.sortie, r)))]));
  const grille = new Grille(dilatees, [...portsDe.values()].flat(), limites.maxNoeudsGrille);
  const occupes: Segment[] = [];
  const usages = new Map<string, number>();
  // Réserver les liaisons locales avant les longs retours évite qu'un détour
  // occupe un couloir direct. L'identifiant départage les distances égales.
  const distanceArc = (a: A): number => {
    const p = sg.sommets[a.debut]; const q = sg.sommets[a.fin];
    return longueur({ x: p.p.x + p.forme.dx / 2, y: p.p.y + p.forme.dy / 2 },
      { x: q.p.x + q.forme.dx / 2, y: q.p.y + q.forme.dy / 2 });
  };
  const ordre = [...g.arretes].sort((a, b) => distanceArc(a) - distanceArc(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Réserve les dégagements imposés avant le premier trajet : un arc court
  // ne doit pas occuper la sortie obligatoire d'un arc routé plus tard.
  const reserves = new Map<string, Segment[]>();
  for (const arc of ordre) {
    const segments: Segment[] = [];
    for (const [id, source] of [[arc.debut, true], [arc.fin, false]] as const) {
      const candidats = preferes(portsDe.get(id)!, sg.sommets[id], arc, source);
      if (candidats.length === 1) segments.push({ a: candidats[0].p, b: candidats[0].sortie });
    }
    reserves.set(arc.id, segments);
  }
  const chemins = new Map<string, Chemin>();
  for (const arc of ordre) {
    const sources = portsDe.get(arc.debut)!; const cibles = portsDe.get(arc.fin)!;
    const sp = preferes(sources, sg.sommets[arc.debut], arc, true);
    const cp = preferes(cibles, sg.sommets[arc.fin], arc, false);
    let trajet: Trajet | undefined;
    // Les points importés sont absolus : aucune translation supposée. Un point
    // diagonal, non fini, traversant ou devenu incohérent déclenche un recalcul.
    if (arc.points?.length && arc.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      // Sans côté explicitement demandé, les points peuvent eux-mêmes choisir
      // un port latéral ; le bas/haut n'est qu'une préférence par défaut.
      const avecCoteSource = arc.sourceAnchor || cotes.some(c => c === arc.sourceHandle);
      const avecCoteCible = arc.targetAnchor || cotes.some(c => c === arc.targetHandle);
      for (const source of avecCoteSource ? sp : sources) {
        for (const cible of avecCoteCible ? cp : cibles) {
          const candidat = { source, cible, points: [source.p, ...arc.points, cible.p] };
          if (trajetValide(candidat, arc, reelles, dilatees)) { trajet = candidat; break; }
        }
        if (trajet) break;
      }
    }
    reserves.delete(arc.id);
    const extremites = [...sp, ...cp].map(p => p.p);
    const futures = [...reserves.values()].flat().filter(s => !extremites.some(p => egaux(p, s.a)));
    const occupation = [...occupes, ...futures];
    const budget = { restant: limites.maxEtats };
    for (let essai = 1; !trajet && essai <= limites.maxEssais; essai++) {
      trajet = chercher(grille, essai === 1 ? sp : sources, essai === 1 ? cp : cibles,
        arc, occupation, usages, budget, essai);
    }
    if (!trajet) erreur('ROUTAGE_IMPOSSIBLE', `arc[${JSON.stringify(arc.id)}]`,
      'Aucun trajet entre les connexions disponibles dans la limite des essais.', limites.maxEssais, arc.id);
    if (!trajetValide(trajet, arc, reelles, dilatees)) erreur('DEGAGEMENT_INVALIDE', `arc[${JSON.stringify(arc.id)}]`,
      'Le trajet ne respecte pas les formes ou leurs dégagements.', limites.maxEssais, arc.id);
    const c = chemin(trajet, arc);
    chemins.set(arc.id, c);
    let p = trajet.source.p;
    for (const pas of c.listeDePas) {
      const q = calculerDestination(p, [pas]); occupes.push({ a: p, b: q, extremites: [trajet.source.p, trajet.cible.p] }); p = q;
    }
    for (const [id, port] of [[arc.debut, trajet.source], [arc.fin, trajet.cible]] as const) {
      const cle = clePort(id, port); usages.set(cle, (usages.get(cle) ?? 0) + 1);
    }
  }
  sg.chemins = g.arretes.map(a => chemins.get(a.id)!);
  const conflits = { chemins: verifierChemin(sg, REGLES_ROUTAGE.toleranceCarree),
    placements: verifierPlacement(sg), obstacles: verifierPlacementChemin(sg) };
  if (Object.values(conflits).some(c => c.length)) {
    erreur('CONFLITS_ROUTAGE', 'SpaceGraphe', JSON.stringify(conflits), limites.maxEssais);
  }
  return sg;
}
