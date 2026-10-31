import { readFile, stat, realpath, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { convertirJson } from './conversion.js';

function diagnostic(etape: string, chemin: string, cause: unknown): Error {
  return new Error(`${etape} « ${chemin} » : ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
}

/** Lecture UTF-8 puis conversion intégrale avant toute création de sortie.
 * Publication par renommage sur le même système de fichiers : une destination
 * existante reste intacte si la conversion ou l'écriture temporaire échoue. */
export async function convertirFichier(source: string, destination: string): Promise<void> {
  const entree = resolve(source); const sortie = resolve(destination);
  const identique = () => new Error('DESTINATION_IDENTIQUE : la destination désigne le fichier source.');
  if (entree === sortie) throw identique();

  let json: string;
  let sourceReelle: string;
  let sourceStat: Awaited<ReturnType<typeof stat>>;
  try {
    json = await readFile(entree, 'utf8');
    sourceReelle = await realpath(entree);
    sourceStat = await stat(entree);
  } catch (cause) { throw diagnostic('Lecture impossible', entree, cause); }

  try {
    const destinationReelle = await realpath(sortie);
    const destinationStat = await stat(sortie);
    if (destinationReelle === sourceReelle ||
        (destinationStat.dev === sourceStat.dev && destinationStat.ino === sourceStat.ino)) {
      throw identique();
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw diagnostic('Destination refusée', sortie, cause);
    }
  }

  const svg = convertirJson(json);
  let temporaire: string | undefined;
  try {
    // Le parent doit exister. Le répertoire privé évite les collisions entre
    // conversions et les fichiers préexistants, y compris les liens symboliques.
    temporaire = await mkdtemp(join(dirname(sortie), '.diagram-svg-'));
    const fichier = join(temporaire, 'resultat.svg');
    await writeFile(fichier, svg, { encoding: 'utf8', flag: 'wx' });
    await rename(fichier, sortie);
  } catch (cause) { throw diagnostic('Écriture impossible', sortie, cause); }
  finally { if (temporaire) await rm(temporaire, { recursive: true, force: true }); }
}
