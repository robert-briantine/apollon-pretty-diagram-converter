import type { A, Ancre, Forme, Placement, Point } from './graphe.js';
import { ErreurGeometrie, validerBoite } from './geometrie.js';

const cotes = ['top', 'right', 'bottom', 'left'] as const;
export const ESPACEMENT_PISTES = 32;

/** Réserve la place des ports libres avant le placement et le routage.
 * Les ancres à ratio imposé conservent leur répartition, même serrée. */
export function dimensionnerConnexions(forme: Forme, arcs: readonly A[]): void {
  if (forme.type !== 'rectangle') return;
  const demandes = new Map(cotes.map(side => [side, { nombre: 0, fixe: false }]));
  for (const arc of arcs) for (const source of [true, false]) {
    if ((source ? arc.debut : arc.fin) !== forme.id) continue;
    const ancre = source ? arc.sourceAnchor : arc.targetAnchor;
    const handle = source ? arc.sourceHandle : arc.targetHandle;
    const side = ancre?.side ?? cotes.find(c => c === handle) ?? (source ? 'bottom' : 'top');
    const demande = demandes.get(side);
    if (!demande) continue; // genererConnexions fournit le diagnostic d'ancre invalide.
    demande.nombre++;
    demande.fixe ||= ancre !== undefined;
  }
  for (const [side, demande] of demandes) {
    if (demande.fixe || demande.nombre < 2) continue;
    const axe = side === 'top' || side === 'bottom' ? 'dx' : 'dy';
    forme[axe] = Math.max(forme[axe], (demande.nombre + 1) * ESPACEMENT_PISTES);
  }
}

/** Ordre stable : haut, droite, bas, gauche ; ratios croissants par côté.
 * Les ancres priment sur les handles cardinaux. Sans indication, une sortie
 * utilise le bas et une entrée le haut. Les handles inconnus sont conservés
 * dans l'arc mais ne sont pas interprétés ici. */
export function genererConnexions(forme: Forme, p: Point, arcs: readonly A[] = []): Point[] {
  validerBoite(p, forme, `forme[${JSON.stringify(forme.id)}]`);
  const point = (side: Ancre['side'], ratio: number): Point => {
    switch (side) {
      case 'top': return { x: p.x + forme.dx * ratio, y: p.y };
      case 'right': return { x: p.x + forme.dx, y: p.y + forme.dy * ratio };
      case 'bottom': return { x: p.x + forme.dx * ratio, y: p.y + forme.dy };
      case 'left': return { x: p.x, y: p.y + forme.dy * ratio };
    }
  };
  if (forme.type === 'losange' || forme.type === 'ovale') return cotes.map(side => point(side, 0.5));
  if (forme.type !== 'rectangle') {
    throw new ErreurGeometrie('FORME_INVALIDE', 'forme.type', 'rectangle, losange ou ovale attendu');
  }
  const demandes = new Map<Ancre['side'], (number | undefined)[]>(cotes.map(side => [side, []]));
  for (const arc of arcs) {
    for (const source of [true, false]) {
      if ((source ? arc.debut : arc.fin) !== forme.id) continue;
      const ancre = source ? arc.sourceAnchor : arc.targetAnchor;
      const handle = source ? arc.sourceHandle : arc.targetHandle;
      if (ancre && (!cotes.includes(ancre.side) || !Number.isFinite(ancre.ratio) || ancre.ratio < 0 || ancre.ratio > 1)) {
        throw new ErreurGeometrie('ANCRE_INVALIDE', `arc[${JSON.stringify(arc.id)}].${source ? 'sourceAnchor' : 'targetAnchor'}`, 'côté cardinal et ratio fini dans [0, 1] attendus');
      }
      const side = ancre?.side ?? (cotes.find(side => side === handle) ?? (source ? 'bottom' : 'top'));
      demandes.get(side)!.push(ancre?.ratio);
    }
  }
  const resultat: Point[] = [];
  for (const side of cotes) {
    const ratios = demandes.get(side)!;
    const fixes = new Set(ratios.filter((r): r is number => r !== undefined));
    let libres = ratios.filter(r => r === undefined).length;
    // Répartition régulière des demandes sans ratio, en évitant les ancres fixées.
    let divisions = fixes.size + libres + 1;
    while (libres > 0) {
      for (let i = 1; i < divisions && libres > 0; i++) {
        const ratio = i / divisions;
        if (!fixes.has(ratio)) {
          fixes.add(ratio);
          libres--;
        }
      }
      divisions *= 2;
    }
    if (fixes.size === 0) fixes.add(0.5);
    for (const ratio of [...fixes].sort((a, b) => a - b)) {
      const connexion = point(side, ratio);
      // Inclut les coins communs à deux côtés ; déduplication en coordonnées absolues.
      if (!resultat.some(p => p.x === connexion.x && p.y === connexion.y)) resultat.push(connexion);
    }
  }
  return resultat;
}

/** Construit un placement à une origine fournie, sans calcul de disposition. */
export function creerPlacement(forme: Forme, p: Point, arcs: readonly A[] = []): Placement {
  return { forme, p: { ...p }, connexions: genererConnexions(forme, p, arcs) };
}
