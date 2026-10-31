/** Contrats métier issus du graphe.ts de référence (conservé à la racine). */
export interface Point {
  x: number;
  y: number;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface Ancre {
  side: 'top' | 'right' | 'bottom' | 'left';
  ratio: number;
}

export interface Forme {
  id: string;
  type: 'losange' | 'rectangle' | 'ovale';
  dx: number;
  dy: number;
  label: string;
  /** Position d'origine, facultative, dans le repère Appolon. */
  position?: Point;
  /** Copie indépendante du nœud Appolon complet, sans perte de métadonnées. */
  metadata: JsonObject;
}

/** Arc orienté ; un tableau conserve les arcs parallèles et leur ordre. */
export interface A {
  id: string;
  debut: string;
  fin: string;
  label: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  sourceAnchor?: Ancre;
  targetAnchor?: Ancre;
  points?: Point[];
  /** Copie indépendante de l'arc Appolon complet. */
  metadata: JsonObject;
}

export interface Graphe {
  sommets: Record<string, Forme>;
  /** Orthographe de la référence conservée pour la compatibilité. */
  arretes: A[];
  /** Propriétés du document hors nodes et edges. */
  metadata: JsonObject;
}

export interface Pas {
  type: 'horizontal' | 'vertical';
  distance: number;
}

export interface Chemin {
  /** Identité de l'arc A.id, y compris pour les arcs parallèles. */
  arcId: string;
  debut: string;
  fin: string;
  /** Indice dans les connexions du placement source, jamais un identifiant d'arc. */
  idx: number;
  listeDePas: Pas[];
}

export interface Placement {
  /** Coin supérieur gauche du rectangle englobant la forme. */
  p: Point;
  forme: Forme;
  /** Points absolus, ordre haut/droite/bas/gauche pour losange et ovale.
   * Rectangle : côtés dans ce même ordre puis ratios croissants, sans doublon. */
  connexions: Point[];
}

/** « SpatialGraphe » du besoin porte le nom SpaceGraphe dans la référence. */
export interface SpaceGraphe {
  sommets: Record<string, Placement>;
  chemins: Chemin[];
}

export { creerPlacement, genererConnexions } from './connexions.js';
export { calculerPlacements, REGLES_PLACEMENT } from './placement.js';
export type { ResultatPlacements, DiagnosticPlacement } from './placement.js';
export { computeSpatialGraphe, ErreurRoutage, REGLES_ROUTAGE } from './routage.js';
export type { OptionsRoutage, DiagnosticRoutage } from './routage.js';
export { dimensionnerForme, mesurerTexte, REGLES_TEXTE } from './texte.js';
export type { TextePlace } from './texte.js';
export { rendreSvg, REGLES_SVG } from './svg.js';
export {
  ErreurGeometrie, calculerDestination, intersection, segmentIntersecteRectangle,
  verifierChemin, verifierPlacement, verifierPlacementChemin,
} from './geometrie.js';
