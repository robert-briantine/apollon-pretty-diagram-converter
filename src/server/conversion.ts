import type { OptionsRoutage } from './routage.js';
import { importerDiagramme } from './importer.js';
import { calculerPlacements } from './placement.js';
import { computeSpatialGraphe, REGLES_ROUTAGE } from './routage.js';
import { verifierChemin, verifierPlacement, verifierPlacementChemin } from './geometrie.js';
import { rendreSvg } from './svg.js';

export type EtapeConversion = 'json' | 'import' | 'calcul' | 'validation' | 'rendu';

/** Conserve le diagnostic métier d'origine dans cause, y compris son code. */
export class ErreurConversion extends Error {
  constructor(public readonly etape: EtapeConversion, cause: unknown) {
    super(`Conversion (${etape}) : ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'ErreurConversion';
  }
}

function executer<T>(etape: EtapeConversion, action: () => T): T {
  try { return action(); } catch (cause) { throw new ErreurConversion(etape, cause); }
}

/** Service synchrone en mémoire, utilisable avec le corps JSON d'une requête
 * Express. Aucune dépendance aux chemins, aux fichiers ou au serveur HTTP. */
export function convertirDiagramme(document: unknown, options: OptionsRoutage = {}): string {
  options = { dispositionCompacte: true, ...options };
  const graphe = executer('import', () => importerDiagramme(document));
  const { spatial, textes } = executer('calcul', () => {
    // Les compositions sont celles du placement initial, avant le routage.
    const placement = calculerPlacements(graphe, options.dispositionCompacte);
    if (!placement.ok) {
      throw new Error(`${placement.diagnostic.code} — ${placement.diagnostic.chemin} : ${placement.diagnostic.message}`);
    }
    return { spatial: computeSpatialGraphe(graphe, options), textes: placement.textes };
  });
  executer('validation', () => {
    // Barrière explicite avant le rendu, même si le routeur vérifie déjà sa sortie.
    const conflits = {
      verifierChemin: verifierChemin(spatial, REGLES_ROUTAGE.toleranceCarree),
      verifierPlacement: verifierPlacement(spatial),
      verifierPlacementChemin: verifierPlacementChemin(spatial),
    };
    if (Object.values(conflits).some(liste => liste.length > 0)) {
      throw new Error(`CONFLITS_GEOMETRIQUES — ${JSON.stringify(conflits)}`);
    }
  });
  return executer('rendu', () => rendreSvg(spatial, textes, graphe.arretes));
}

/** Variante pour une entrée JSON textuelle, sans lecture de fichier. */
export function convertirJson(json: string, options: OptionsRoutage = {}): string {
  const document: unknown = executer('json', () => {
    try { return JSON.parse(json); } catch {
      throw new Error('JSON_INVALIDE — $ : syntaxe JSON incorrecte');
    }
  });
  return convertirDiagramme(document, options);
}
