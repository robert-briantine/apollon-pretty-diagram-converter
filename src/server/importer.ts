import { readFile } from 'node:fs/promises';
import type { PathLike } from 'node:fs';
import type { Graphe } from './graphe.js';
import { parserDiagramme } from './importer-document.js';
export * from './importer-document.js';

/** Lecture seule ; les erreurs d'accès du système de fichiers restent identifiables. */
export async function importerFichierDiagramme(chemin: PathLike): Promise<Graphe> {
  return parserDiagramme(await readFile(chemin, 'utf8'));
}
