import type { Chemin, Forme, Pas, Placement, Point, SpaceGraphe } from './graphe.js';

export type CodeErreurGeometrie =
  | 'NOMBRE_NON_FINI' | 'DIMENSION_INVALIDE' | 'REFERENCE_ABSENTE'
  | 'INDICE_CONNEXION_INVALIDE' | 'CONNEXIONS_INVALIDES' | 'PAS_INVALIDE'
  | 'TOLERANCE_INVALIDE' | 'ANCRE_INVALIDE' | 'FORME_INVALIDE';

/** Les entrées invalides sont distinguées des conflits d'une géométrie valide. */
export class ErreurGeometrie extends Error {
  constructor(public readonly code: CodeErreurGeometrie, public readonly chemin: string, detail: string) {
    super(`${code} — ${chemin} : ${detail}`);
    this.name = 'ErreurGeometrie';
  }
}

export function nombreFini(value: number, chemin: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ErreurGeometrie('NOMBRE_NON_FINI', chemin, 'nombre fini attendu');
  }
}

function validerPoint(p: Point, chemin: string): void {
  nombreFini(p?.x, `${chemin}.x`);
  nombreFini(p?.y, `${chemin}.y`);
}

export function validerBoite(p: Point, forme: Forme, chemin: string): void {
  validerPoint(p, `${chemin}.p`);
  for (const dimension of ['dx', 'dy'] as const) {
    nombreFini(forme?.[dimension], `${chemin}.forme.${dimension}`);
    if (forme[dimension] <= 0) {
      throw new ErreurGeometrie('DIMENSION_INVALIDE', `${chemin}.forme.${dimension}`, 'dimension strictement positive attendue');
    }
  }
  nombreFini(p.x + forme.dx, `${chemin}.xMax`);
  nombreFini(p.y + forme.dy, `${chemin}.yMax`);
}

/** Additionne les pas signés sans modifier le point ni la liste reçus. */
export function calculerDestination(p: Point, listePas: Pas[]): Point {
  validerPoint(p, 'depart');
  if (!Array.isArray(listePas)) {
    throw new ErreurGeometrie('PAS_INVALIDE', 'listeDePas', 'tableau attendu');
  }
  const r = { ...p };
  for (const [i, pas] of listePas.entries()) {
    if (pas?.type !== 'horizontal' && pas?.type !== 'vertical') {
      throw new ErreurGeometrie('PAS_INVALIDE', `listeDePas[${i}].type`, 'horizontal ou vertical attendu');
    }
    nombreFini(pas.distance, `listeDePas[${i}].distance`);
    const axe = pas.type === 'horizontal' ? 'x' : 'y';
    r[axe] += pas.distance;
    nombreFini(r[axe], `listeDePas[${i}].destination.${axe}`);
  }
  return r;
}

/** Validation préalable commune : même un placement tiers inutilisé est contrôlé. */
function validerSpaceGraphe(sg: SpaceGraphe): void {
  for (const [id, pl] of Object.entries(sg.sommets)) {
    const chemin = `sommets[${JSON.stringify(id)}]`;
    validerBoite(pl?.p, pl?.forme, chemin);
    if (!Array.isArray(pl.connexions) || pl.connexions.length === 0) {
      throw new ErreurGeometrie('CONNEXIONS_INVALIDES', `${chemin}.connexions`, 'au moins une connexion attendue');
    }
    for (const [i, p] of pl.connexions.entries()) validerPoint(p, `${chemin}.connexions[${i}]`);
  }
  for (const [i, c] of sg.chemins.entries()) {
    const chemin = `chemins[${i}] (arc ${JSON.stringify(c.arcId)})`;
    for (const extremite of ['debut', 'fin'] as const) {
      if (!Object.hasOwn(sg.sommets, c[extremite])) {
        throw new ErreurGeometrie('REFERENCE_ABSENTE', `${chemin}.${extremite}`, `sommet absent : ${c[extremite]}`);
      }
    }
    const connexions = sg.sommets[c.debut].connexions;
    if (!Number.isInteger(c.idx) || c.idx < 0 || c.idx >= connexions.length) {
      throw new ErreurGeometrie('INDICE_CONNEXION_INVALIDE', `${chemin}.idx`, `indice ${c.idx} hors de [0, ${connexions.length - 1}]`);
    }
    try {
      calculerDestination(connexions[c.idx], c.listeDePas);
    } catch (error) {
      if (error instanceof ErreurGeometrie) {
        throw new ErreurGeometrie(error.code, `${chemin}.${error.chemin}`, error.message);
      }
      throw error;
    }
  }
}

/** epsilon est une distance AU CARRÉ ; l'égalité au seuil est acceptée. */
export function verifierChemin(sg: SpaceGraphe, epsilon: number): Chemin[] {
  if (!Number.isFinite(epsilon) || epsilon < 0) {
    throw new ErreurGeometrie('TOLERANCE_INVALIDE', 'epsilon', 'distance au carré finie et positive ou nulle attendue');
  }
  validerSpaceGraphe(sg);
  return sg.chemins.filter(c => {
    const fin = calculerDestination(sg.sommets[c.debut].connexions[c.idx], c.listeDePas);
    return sg.sommets[c.fin].connexions.every(p => {
      const dx = fin.x - p.x;
      const dy = fin.y - p.y;
      return dx * dx + dy * dy > epsilon;
    });
  });
}

/** Les boîtes fermées sont en conflit, même en cas de simple tangence. */
export function intersection(p: Placement, q: Placement): boolean {
  validerBoite(p?.p, p?.forme, 'placementA');
  validerBoite(q?.p, q?.forme, 'placementB');
  return p.p.x <= q.p.x + q.forme.dx && q.p.x <= p.p.x + p.forme.dx &&
    p.p.y <= q.p.y + q.forme.dy && q.p.y <= p.p.y + p.forme.dy;
}

export function verifierPlacement(sg: SpaceGraphe): [string, string][] {
  validerSpaceGraphe(sg);
  const placements = Object.entries(sg.sommets);
  const conflits: [string, string][] = [];
  placements.forEach(([a, p], i) => {
    for (const [b, q] of placements.slice(i + 1)) {
      if (intersection(p, q)) conflits.push([a, b]);
    }
  });
  return conflits;
}

/** Intersection avec l'intérieur ouvert d'une boîte, dans les deux sens.
 * Un bord longé ou un coin touché seuls ne comptent pas. Accepte aussi un
 * segment diagonal ; les chemins métier restent orthogonaux. */
export function segmentIntersecteRectangle(
  p: Point, q: Point, x: number, y: number, largeur: number, hauteur: number,
): boolean {
  validerPoint(p, 'segment.debut');
  validerPoint(q, 'segment.fin');
  validerBoite({ x, y }, { dx: largeur, dy: hauteur } as Forme, 'rectangle');
  let entree = 0;
  let sortie = 1;
  for (const [a, b, min, max] of [[p.x, q.x, x, x + largeur], [p.y, q.y, y, y + hauteur]]) {
    if (a === b) {
      if (a <= min || a >= max) return false;
    } else {
      const delta = b - a;
      nombreFini(delta, 'segment.delta');
      const t1 = (min - a) / delta;
      const t2 = (max - a) / delta;
      entree = Math.max(entree, Math.min(t1, t2));
      sortie = Math.min(sortie, Math.max(t1, t2));
      if (entree >= sortie) return false;
    }
  }
  return entree < sortie;
}

/** Une seule paire [arcId, sommet tiers] par conflit, même si plusieurs pas
 * traversent la même boîte. arcId distingue les arcs parallèles. */
export function verifierPlacementChemin(sg: SpaceGraphe): [string, string][] {
  validerSpaceGraphe(sg);
  const conflits: [string, string][] = [];
  for (const c of sg.chemins) {
    const touches = new Set<string>();
    let courant = sg.sommets[c.debut].connexions[c.idx];
    for (const pas of c.listeDePas) {
      const suivant = calculerDestination(courant, [pas]);
      for (const [id, pl] of Object.entries(sg.sommets)) {
        if (id === c.debut || id === c.fin || touches.has(id)) continue;
        if (segmentIntersecteRectangle(courant, suivant, pl.p.x, pl.p.y, pl.forme.dx, pl.forme.dy)) {
          touches.add(id);
          conflits.push([c.arcId, id]);
        }
      }
      courant = suivant;
    }
  }
  return conflits;
}
