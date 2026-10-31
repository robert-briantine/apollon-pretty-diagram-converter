import type { A, Ancre, Forme, Graphe, JsonObject, JsonValue, Point } from './graphe.js';

export type CodeErreurImport =
  | 'JSON_INVALIDE'
  | 'STRUCTURE_INVALIDE'
  | 'IDENTIFIANT_INVALIDE'
  | 'IDENTIFIANT_DUPLIQUE'
  | 'REFERENCE_ABSENTE'
  | 'DIMENSION_INVALIDE'
  | 'TYPE_NON_PRIS_EN_CHARGE';

export class ErreurImportDiagramme extends Error {
  constructor(public readonly code: CodeErreurImport, public readonly chemin: string, detail: string) {
    super(`${code} — ${chemin} : ${detail}`);
    this.name = 'ErreurImportDiagramme';
  }
}

function erreur(code: CodeErreurImport, chemin: string, detail: string): never {
  throw new ErreurImportDiagramme(code, chemin, detail);
}

function objet(value: unknown, chemin: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    erreur('STRUCTURE_INVALIDE', chemin, 'objet JSON attendu');
  }
  return value as Record<string, unknown>;
}

function tableau(value: unknown, chemin: string): unknown[] {
  if (!Array.isArray(value)) erreur('STRUCTURE_INVALIDE', chemin, 'tableau attendu');
  return value;
}

function texte(value: unknown, chemin: string): string {
  if (typeof value !== 'string') erreur('STRUCTURE_INVALIDE', chemin, 'chaîne attendue');
  return value;
}

function identifiant(value: unknown, chemin: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    erreur('IDENTIFIANT_INVALIDE', chemin, 'identifiant non vide attendu');
  }
  return value;
}

function dimension(value: unknown, chemin: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    erreur('DIMENSION_INVALIDE', chemin, 'nombre fini strictement positif attendu');
  }
  return value;
}

function nombre(value: unknown, chemin: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    erreur('STRUCTURE_INVALIDE', chemin, 'nombre fini attendu');
  }
  return value;
}

function point(value: unknown, chemin: string): Point {
  const p = objet(value, chemin);
  return { x: nombre(p.x, `${chemin}.x`), y: nombre(p.y, `${chemin}.y`) };
}

function ancre(value: unknown, chemin: string): Ancre {
  const a = objet(value, chemin);
  const side = a.side;
  if (side !== 'top' && side !== 'right' && side !== 'bottom' && side !== 'left') {
    erreur('STRUCTURE_INVALIDE', `${chemin}.side`, 'côté top, right, bottom ou left attendu');
  }
  const ratio = nombre(a.ratio, `${chemin}.ratio`);
  if (ratio < 0 || ratio > 1) erreur('STRUCTURE_INVALIDE', `${chemin}.ratio`, 'ratio entre 0 et 1 attendu');
  return { side, ratio };
}

/** Copie uniquement des valeurs JSON, sans partager d'objets avec l'entrée.
 * Object.fromEntries préserve aussi les clés JSON telles que __proto__. */
function copierJson(value: unknown, chemin: string, parents = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || value === null || parents.has(value)) {
    erreur('JSON_INVALIDE', chemin, 'valeur non JSON ou référence circulaire');
  }
  parents.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from(value, (item, i) => copierJson(item, `${chemin}[${i}]`, parents));
    }
    return Object.fromEntries(Object.entries(objet(value, chemin)).map(([key, item]) =>
      [key, copierJson(item, `${chemin}.${key}`, parents)]));
  } finally {
    parents.delete(value);
  }
}

function metadata(value: Record<string, unknown>, chemin: string): JsonObject {
  return copierJson(value, chemin) as JsonObject;
}

function forme(type: unknown, chemin: string): Forme['type'] {
  switch (type) {
    case 'activityActionNode': return 'rectangle';
    case 'activityDecisionNode':
    case 'activityMergeNode': return 'losange';
    case 'activityInitialNode':
    case 'activityFinalNode': return 'ovale';
    default: return erreur('TYPE_NON_PRIS_EN_CHARGE', chemin, `type de nœud non pris en charge : ${String(type)}`);
  }
}

/** Importe un objet JSON déjà décodé. Aucune écriture ni mutation de l'entrée. */
export function importerDiagramme(value: unknown): Graphe {
  const document = objet(value, '$');
  const nodes = tableau(document.nodes, '$.nodes');
  const edges = tableau(document.edges, '$.edges');
  const ids = new Set<string>();
  const sommets: Record<string, Forme> = Object.create(null);
  const nouvelId = (value: unknown, chemin: string): string => {
    const id = identifiant(value, chemin);
    if (ids.has(id)) erreur('IDENTIFIANT_DUPLIQUE', chemin, `identifiant déjà utilisé : ${id}`);
    ids.add(id);
    return id;
  };

  for (const [i, value] of nodes.entries()) {
    const chemin = `$.nodes[${i}]`;
    const node = objet(value, chemin);
    const id = nouvelId(node.id, `${chemin}.id`);
    const type = forme(node.type, `${chemin}.type`);
    const dx = dimension(node.width, `${chemin}.width`);
    const dy = dimension(node.height, `${chemin}.height`);
    const data = node.data === undefined ? {} : objet(node.data, `${chemin}.data`);
    const nom = data.name === undefined ? '' : texte(data.name, `${chemin}.data.name`);
    // Le nom technique par défaut d'Appolon n'est pas un libellé de présentation.
    // Un nom personnalisé reste intact ; les données originales restent en metadata.
    const label = node.type === 'activityInitialNode' && /^(?:ActivityInitialNode)?$/i.test(nom.trim()) ? 'Début'
      : node.type === 'activityFinalNode' && /^(?:ActivityFinalNode)?$/i.test(nom.trim()) ? 'Fin' : nom;
    if (node.measured !== undefined) {
      const measured = objet(node.measured, `${chemin}.measured`);
      for (const key of ['width', 'height']) {
        if (measured[key] !== undefined) dimension(measured[key], `${chemin}.measured.${key}`);
      }
    }
    const position = node.position === undefined ? undefined : point(node.position, `${chemin}.position`);
    sommets[id] = {
      id, type, dx, dy, label,
      ...(position === undefined ? {} : { position }),
      metadata: metadata(node, chemin),
    };
  }

  const arretes: A[] = Array.from(edges, (value, i) => {
    const chemin = `$.edges[${i}]`;
    const edge = objet(value, chemin);
    const id = nouvelId(edge.id, `${chemin}.id`);
    if (edge.type !== 'ActivityControlFlow') {
      erreur('TYPE_NON_PRIS_EN_CHARGE', `${chemin}.type`, `type d'arc non pris en charge : ${String(edge.type)}`);
    }
    const debut = identifiant(edge.source, `${chemin}.source`);
    const fin = identifiant(edge.target, `${chemin}.target`);
    for (const [key, reference] of [['source', debut], ['target', fin]]) {
      if (!Object.hasOwn(sommets, reference)) {
        erreur('REFERENCE_ABSENTE', `${chemin}.${key}`, `nœud introuvable : ${reference}`);
      }
    }
    const data = edge.data === undefined ? {} : objet(edge.data, `${chemin}.data`);
    const arc: A = {
      id, debut, fin,
      label: data.label === undefined ? '' : texte(data.label, `${chemin}.data.label`),
      metadata: metadata(edge, chemin),
    };
    for (const key of ['sourceHandle', 'targetHandle'] as const) {
      if (edge[key] !== undefined) arc[key] = edge[key] === null ? null : texte(edge[key], `${chemin}.${key}`);
    }
    for (const key of ['sourceAnchor', 'targetAnchor'] as const) {
      if (data[key] !== undefined) arc[key] = ancre(data[key], `${chemin}.data.${key}`);
    }
    if (data.points !== undefined) {
      arc.points = tableau(data.points, `${chemin}.data.points`).map((p, j) => point(p, `${chemin}.data.points[${j}]`));
    }
    return arc;
  });

  const extras = Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'nodes' && key !== 'edges'));
  return { sommets, arretes, metadata: metadata(extras, '$') };
}

/** Décode un texte JSON avec un diagnostic stable, puis valide son schéma. */
export function parserDiagramme(json: string): Graphe {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    erreur('JSON_INVALIDE', '$', 'syntaxe JSON incorrecte');
  }
  return importerDiagramme(value);
}

