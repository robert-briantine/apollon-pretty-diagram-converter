// Les scènes de l'évolution 0 restent la source unique des données de démonstration.
import { mkdir, copyFile } from 'node:fs/promises';
const destination = new URL('../dist/client/jeu/data/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['scene-reference', 'scenarios', 'conversions-reference']) {
  await copyFile(new URL(`../docs/jeu/${name}.json`, import.meta.url), new URL(`${name}.json`, destination));
}
