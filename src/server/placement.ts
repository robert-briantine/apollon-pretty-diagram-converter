import type { A, Forme, Graphe, Placement, Point } from './graphe.js';
import { creerPlacement, dimensionnerConnexions } from './connexions.js';
import { ErreurGeometrie, nombreFini, validerBoite, verifierPlacement } from './geometrie.js';
import { dimensionnerForme, type TextePlace } from './texte.js';

export const REGLES_PLACEMENT = Object.freeze({
  orientation: 'haut-bas' as const, margeExterieure: 48,
  espaceHorizontal: 64, espaceVertical: 80, espaceComposantes: 128,
});
export interface DiagnosticPlacement {
  code: string;
  chemin: string;
  message: string;
  conflits?: [string, string][];
}
export type ResultatPlacements = {
  ok: true;
  sommets: Record<string, Placement>;
  textes: Record<string, TextePlace>;
  /** Inclut une réserve extérieure pour les futurs chemins de retour. */
  cadre: { x: number; y: number; dx: number; dy: number };
} | { ok: false; diagnostic: DiagnosticPlacement };

class ErreurPlacement extends Error {
  constructor(readonly code: string, readonly chemin: string, detail: string) {
    super(`${code} — ${chemin} : ${detail}`);
  }
}
const comparerId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Refuse aussi les coordonnées finies trop grandes pour représenter une
 * marge : l'arrondi IEEE-754 ne doit pas transformer un couloir en contact. */
function avecEspace(fin: number, espace: number, chemin: string): number {
  const suivant = fin + espace;
  nombreFini(suivant, chemin);
  if (suivant - fin < espace - 1e-8) {
    throw new ErreurPlacement('PRECISION_INSUFFISANTE', chemin, 'coordonnées trop grandes pour conserver les marges');
  }
  return suivant;
}

/** Kosaraju itératif : pas d'hypothèse d'arbre, pas de récursion sur les cycles. */
function composantesFortes(ids: string[], sorties: Map<string, string[]>, entrees: Map<string, string[]>): string[][] {
  const vus = new Set<string>();
  const fins: string[] = [];
  for (const id of ids) {
    if (vus.has(id)) continue;
    vus.add(id);
    const pile = [{ id, prochain: 0 }];
    while (pile.length) {
      const cadre = pile[pile.length - 1];
      const voisins = sorties.get(cadre.id)!;
      if (cadre.prochain < voisins.length) {
        const voisin = voisins[cadre.prochain++];
        if (!vus.has(voisin)) {
          vus.add(voisin);
          pile.push({ id: voisin, prochain: 0 });
        }
      } else {
        fins.push(cadre.id);
        pile.pop();
      }
    }
  }
  vus.clear();
  const groupes: string[][] = [];
  for (const id of fins.reverse()) {
    if (vus.has(id)) continue;
    const groupe: string[] = [];
    const pile = [id];
    vus.add(id);
    while (pile.length) {
      const courant = pile.pop()!;
      groupe.push(courant);
      for (const voisin of entrees.get(courant)!) {
        if (!vus.has(voisin)) { vus.add(voisin); pile.push(voisin); }
      }
    }
    groupes.push(groupe.sort(comparerId));
  }
  return groupes.sort((a, b) => comparerId(a[0], b[0]));
}

/** Calcule uniquement les placements ; aucun chemin n'est inventé. Les arcs
 * servent au classement et aux connexions et restent intégralement inchangés.
 * Une erreur produit un diagnostic, jamais un résultat partiel déclaré valide. */
export function calculerPlacements(g: Graphe, compact = false): ResultatPlacements {
  try {
    return calculer(g, compact);
  } catch (error) {
    if (error instanceof ErreurGeometrie || error instanceof ErreurPlacement) {
      return { ok: false, diagnostic: { code: error.code, chemin: error.chemin, message: error.message } };
    }
    throw error;
  }
}

function calculer(g: Graphe, compact: boolean): ResultatPlacements {
  const regles = REGLES_PLACEMENT;
  const ids = Object.keys(g.sommets).sort(comparerId);
  const formes = new Map<string, Forme>();
  const textes: Record<string, TextePlace> = Object.create(null);
  const sorties = new Map(ids.map(id => [id, [] as string[]]));
  const entrees = new Map(ids.map(id => [id, [] as string[]]));
  for (const id of ids) {
    const f = g.sommets[id];
    const chemin = `sommets[${JSON.stringify(id)}]`;
    if (f.id !== id || typeof f.label !== 'string') {
      throw new ErreurPlacement('SOMMET_INVALIDE', chemin, 'id identique à la clé et libellé texte attendus');
    }
    if (!['rectangle', 'losange', 'ovale'].includes(f.type)) {
      throw new ErreurPlacement('FORME_INVALIDE', chemin, 'rectangle, losange ou ovale attendu');
    }
    validerBoite(f.position ?? { x: 0, y: 0 }, f, chemin);
    const dimension = dimensionnerForme(f);
    dimensionnerConnexions(dimension.forme, g.arretes);
    if (dimension.forme.type === 'rectangle') {
      dimension.texte.zoneUtile.dx = dimension.forme.dx;
      dimension.texte.zoneUtile.dy = dimension.forme.dy;
    }
    formes.set(id, dimension.forme);
    textes[id] = dimension.texte;
  }
  for (const [i, arc] of g.arretes.entries()) {
    for (const extremite of ['debut', 'fin'] as const) {
      if (!formes.has(arc[extremite])) {
        throw new ErreurPlacement('REFERENCE_ABSENTE', `arretes[${i}].${extremite}`, `sommet absent : ${arc[extremite]}`);
      }
    }
    sorties.get(arc.debut)!.push(arc.fin);
    entrees.get(arc.fin)!.push(arc.debut);
  }
  for (const voisins of [sorties, entrees]) {
    for (const [id, liste] of voisins) voisins.set(id, [...new Set(liste)].sort(comparerId));
  }

  const fortes = composantesFortes(ids, sorties, entrees);
  const groupeDe = new Map<string, number>();
  fortes.forEach((groupe, i) => groupe.forEach(id => groupeDe.set(id, i)));
  const suivants = fortes.map(() => new Set<number>());
  const degres = fortes.map(() => 0);
  for (const id of ids) {
    const a = groupeDe.get(id)!;
    for (const voisin of sorties.get(id)!) {
      const b = groupeDe.get(voisin)!;
      if (a !== b && !suivants[a].has(b)) { suivants[a].add(b); degres[b]++; }
    }
  }
  // Rang de plus long chemin dans le DAG condensé. Un cycle réserve autant
  // de rangs que de sommets, sa dernière arête disposant d'un couloir de retour.
  const rangs = fortes.map(() => 0);
  const prets = fortes.map((_, i) => i).filter(i => degres[i] === 0);
  for (let i = 0; i < prets.length; i++) {
    const a = prets[i];
    for (const b of [...suivants[a]].sort((a, b) => a - b)) {
      rangs[b] = Math.max(rangs[b], rangs[a] + fortes[a].length);
      if (--degres[b] === 0) prets.push(b);
    }
  }
  const rangDe = new Map<string, number>();
  fortes.forEach((groupe, i) => {
    // Les indications verticales ordonnent l'intérieur des cycles.
    const ordre = [...groupe].sort((a, b) =>
      (formes.get(a)!.position?.y ?? 0) - (formes.get(b)!.position?.y ?? 0) || comparerId(a, b));
    ordre.forEach((id, j) => rangDe.set(id, rangs[i] + j));
  });

  // Composantes faibles : chaque îlot reçoit sa propre bande horizontale.
  const faibles: string[][] = [];
  const vus = new Set<string>();
  for (const id of ids) {
    if (vus.has(id)) continue;
    const groupe = [id];
    vus.add(id);
    for (let i = 0; i < groupe.length; i++) {
      for (const voisin of [...sorties.get(groupe[i])!, ...entrees.get(groupe[i])!]) {
        if (!vus.has(voisin)) { vus.add(voisin); groupe.push(voisin); }
      }
    }
    faibles.push(groupe);
  }
  const indicationX = (groupe: string[]): number => groupe.reduce((min, id) =>
    Math.min(min, formes.get(id)!.position?.x ?? 0), Infinity);
  faibles.sort((a, b) => indicationX(a) - indicationX(b) || comparerId(a[0], b[0]));
  // Translation commune pour les positions négatives, sans déformer leurs écarts.
  let minX: number = regles.margeExterieure;
  let minY: number = regles.margeExterieure;
  for (const forme of formes.values()) {
    if (forme.position) {
      minX = Math.min(minX, forme.position.x);
      minY = Math.min(minY, forme.position.y);
    }
  }
  const decalageX = regles.margeExterieure - minX;
  const decalageY = regles.margeExterieure - minY;
  const places = new Map<string, Placement>();
  let debutGroupe: number = regles.margeExterieure;
  let maxX = 0;
  let maxY = 0;
  for (const groupe of faibles) {
    const couches = new Map<number, string[]>();
    for (const id of groupe) {
      const rang = rangDe.get(id)!;
      if (!couches.has(rang)) couches.set(rang, []);
      couches.get(rang)!.push(id);
    }
    let debutLigne: number = regles.margeExterieure;
    let finGroupe = debutGroupe;
    for (const [, couche] of [...couches].sort(([a], [b]) => a - b)) {
      couche.sort((a, b) => (formes.get(a)!.position?.x ?? 0) - (formes.get(b)!.position?.x ?? 0) || comparerId(a, b));
      let curseur = debutGroupe;
      let finLigne = debutLigne;
      for (const id of couche) {
        const forme = formes.get(id)!;
        // En présentation, les indications gardent leur rôle d'ordre, sans
        // réserver les grands espaces vides du canevas de l'éditeur.
        const x = compact ? curseur : Math.max(curseur, (forme.position?.x ?? 0) + decalageX);
        const y = compact ? debutLigne : Math.max(debutLigne, (forme.position?.y ?? 0) + decalageY);
        // Toute taille/position est définitive avant de générer les connexions.
        const pl = creerPlacement(forme, { x, y }, g.arretes);
        places.set(id, pl);
        curseur = avecEspace(x + forme.dx, compact ? 48 : regles.espaceHorizontal, `sommets[${JSON.stringify(id)}].margeDroite`);
        finLigne = Math.max(finLigne, y + forme.dy);
        finGroupe = Math.max(finGroupe, x + forme.dx);
        maxX = Math.max(maxX, x + forme.dx);
        maxY = Math.max(maxY, y + forme.dy);
      }
      debutLigne = avecEspace(finLigne, compact ? 56 : regles.espaceVertical, 'couche.margeBasse');
    }
    debutGroupe = avecEspace(finGroupe, compact ? 64 : regles.espaceComposantes, 'composante.margeDroite');
  }
  if (compact && places.size) {
    // Replie les longues successions en colonnes alternées : une seule bande
    // verticale laisserait presque toute la largeur de l'écran inutilisée.
    // Les tailles sont conservées ; les centres alignés évitent les petits
    // décrochements entre formes de largeurs ou hauteurs différentes.
    // Connexions et routes suivent les positions définitives.
    const bandes = new Map<number, [string, Placement][]>();
    for (const entry of places) {
      const y = entry[1].p.y;
      if (!bandes.has(y)) bandes.set(y, []);
      bandes.get(y)!.push(entry);
    }
    const lignes = [...bandes].sort(([a], [b]) => a - b).map(([, entries]) => {
      const x = Math.min(...entries.map(([, pl]) => pl.p.x));
      return { entries, x, largeur: Math.max(...entries.map(([, pl]) => pl.p.x + pl.forme.dx)) - x,
        hauteur: Math.max(...entries.map(([, pl]) => pl.forme.dy)) };
    });
    if (lignes.length >= 6 && maxY / maxX > 1.8) {
      // Choisit un format proche d'une présentation 16:9 d'après les tailles
      // réelles, sans étirer les formes ni ajouter du vide dans le SVG.
      const espaceColonnes = 112;
      const grillePour = (colonnes: number) => {
        const rangs = Math.ceil(lignes.length / colonnes);
        const largeurs = Array.from({ length: colonnes }, (_, col) =>
          Math.max(0, ...lignes.slice(col * rangs, (col + 1) * rangs).map(l => l.largeur)));
        const hauteurs = Array.from({ length: rangs }, (_, row) => Math.max(0,
          ...lignes.filter((_, i) => (Math.floor(i / rangs) % 2 ? rangs - 1 - i % rangs : i % rangs) === row).map(l => l.hauteur)));
        const largeur = largeurs.reduce((a, b) => a + b, 0) + (colonnes - 1) * espaceColonnes;
        const hauteur = hauteurs.reduce((a, b) => a + b, 0) + (rangs - 1) * 56;
        return Math.abs(Math.log(largeur / hauteur / (16 / 9)));
      };
      let colonnes = 2;
      for (let n = 3; n <= Math.min(6, Math.ceil(lignes.length / 2)); n++) {
        if (grillePour(n) < grillePour(colonnes)) colonnes = n;
      }
      const rangs = Math.ceil(lignes.length / colonnes);
      const cases = lignes.map((_, i) => {
        const col = Math.floor(i / rangs);
        return { col, row: col % 2 ? rangs - 1 - i % rangs : i % rangs };
      });
      const disposer = (ordre: typeof lignes) => {
        const cellules = ordre.map((ligne, i) => ({ ligne, ...cases[i] }));
        const largeurs = Array.from({ length: colonnes }, (_, col) => Math.max(0, ...cellules.filter(c => c.col === col).map(c => c.ligne.largeur)));
        const hauteurs = Array.from({ length: rangs }, (_, row) => Math.max(0, ...cellules.filter(c => c.row === row).map(c => c.ligne.hauteur)));
        return { cellules, largeurs, hauteurs };
      };
      const origine = (c: ReturnType<typeof disposer>['cellules'][number], d: ReturnType<typeof disposer>) => ({
        x: regles.margeExterieure + d.largeurs.slice(0, c.col).reduce((a, b) => a + b + espaceColonnes, 0) +
          (d.largeurs[c.col] - c.ligne.largeur) / 2,
        y: regles.margeExterieure + d.hauteurs.slice(0, c.row).reduce((a, b) => a + b + 56, 0),
      });
      // Rapproche les rangs reliés au lieu de replier aveuglément une longue
      // composante cyclique. Les lignes restent indivisibles, sans chevauchement.
      // Le coût tient compte des côtés/ratios demandés et du dégagement normal.
      const cout = (ordre: typeof lignes): number => {
        const d = disposer(ordre);
        const positions = new Map<string, Point>();
        for (const c of d.cellules) {
          const p = origine(c, d);
          for (const [id, pl] of c.ligne.entries) positions.set(id, { x: p.x + pl.p.x - c.ligne.x, y: p.y + (d.hauteurs[c.row] - pl.forme.dy) / 2 });
        }
        const port = (id: string, a: A, source: boolean) => {
          const p = positions.get(id)!; const f = formes.get(id)!;
          const ancre = source ? a.sourceAnchor : a.targetAnchor;
          const handle = source ? a.sourceHandle : a.targetHandle;
          const side = ancre?.side ?? (['top', 'right', 'bottom', 'left'].includes(handle ?? '') ? handle : source ? 'bottom' : 'top');
          const ratio = f.type === 'rectangle' ? ancre?.ratio ?? .5 : .5;
          const n = side === 'top' ? { x: 0, y: -1 } : side === 'right' ? { x: 1, y: 0 }
            : side === 'bottom' ? { x: 0, y: 1 } : { x: -1, y: 0 };
          return { x: p.x + (n.x === 0 ? f.dx * ratio : n.x > 0 ? f.dx : 0) + n.x * 24,
            y: p.y + (n.y === 0 ? f.dy * ratio : n.y > 0 ? f.dy : 0) + n.y * 24, n };
        };
        let total = 0;
        for (const a of g.arretes) {
          const p = port(a.debut, a, true); const q = port(a.fin, a, false);
          total += Math.abs(p.x - q.x) + Math.abs(p.y - q.y) +
            2 * Math.max(0, (p.x - q.x) * p.n.x + (p.y - q.y) * p.n.y) +
            2 * Math.max(0, (q.x - p.x) * q.n.x + (q.y - p.y) * q.n.y);
        }
        return total;
      };
      const ordre = [...lignes];
      let meilleur = cout(ordre);
      // Descente déterministe bornée ; les grands graphes gardent le repli
      // linéaire pour ne pas faire exploser le coût de placement.
      if (lignes.length <= 64) for (let passe = 0; passe < 8; passe++) {
        let changement = false;
        for (let i = 0; i < ordre.length; i++) for (let j = i + 1; j < ordre.length; j++) {
          [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
          const candidat = cout(ordre);
          if (candidat < meilleur - 1e-8) { meilleur = candidat; changement = true; }
          else [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
        }
        if (!changement) break;
      }
      const disposition = disposer(ordre);
      maxX = 0; maxY = 0;
      for (const cellule of disposition.cellules) {
        const { ligne } = cellule;
        const { x, y } = origine(cellule, disposition);
        for (const [id, pl] of ligne.entries) {
          const p = { x: x + pl.p.x - ligne.x, y: y + (disposition.hauteurs[cellule.row] - pl.forme.dy) / 2 };
          places.set(id, creerPlacement(pl.forme, p, g.arretes));
          maxX = Math.max(maxX, p.x + pl.forme.dx);
          maxY = Math.max(maxY, p.y + pl.forme.dy);
        }
      }
    }
  }
  const sommets = Object.fromEntries(ids.map(id => [id, places.get(id)!]));
  const conflits = verifierPlacement({ sommets, chemins: [] });
  if (conflits.length) {
    return { ok: false, diagnostic: { code: 'CONFLITS_PLACEMENT', chemin: 'sommets',
      message: 'Le calcul conserve des boîtes en conflit.', conflits } };
  }
  const dx = avecEspace(maxX, regles.margeExterieure, 'cadre.dx');
  const dy = avecEspace(maxY, regles.margeExterieure, 'cadre.dy');
  return { ok: true, sommets, textes, cadre: { x: 0, y: 0, dx, dy } };
}
