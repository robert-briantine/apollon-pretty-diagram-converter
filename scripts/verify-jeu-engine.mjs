// Recette d'intégration externe, volontairement hors de tests/*.test.mjs.
// Le dépôt ne fournit pas de moteur ; aucune réussite ne peut être annoncée
// sans les véritables assertions et replays du moteur raccordé au renderer.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const entry = process.env.JEU_ENGINE_VERIFICATION;
if (!entry) {
  console.error('INDISPONIBLE : fournir le moteur et son adaptateur, puis définir JEU_ENGINE_VERIFICATION vers son script Node de replays avant/après (déplacement, tir, collisions, dégâts et guidage boss/vaisseaux mères, frontière si monde bouclé).');
  process.exit(2);
}
const result = spawnSync(process.execPath, [resolve(entry)], { stdio: 'inherit', timeout: 120000 });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
