import type { Scene } from './camera.js';
import { readabilityScene } from './readability.js';

/** Recette visuelle fixe : vrais sprites, amas de tirs et trois cibles hors champ.
 * Aucun déplacement, combat ou dégât simulé. */
export function guidanceScene(reference: Scene): Scene {
  const scene = readabilityScene(reference);
  scene.id = 'guidage-dense';
  scene.entities.find(e => e.id === 'banc-boss')!.position = { x: 900, y: -500 };
  scene.entities.find(e => e.id === 'banc-mere')!.position = { x: -1400, y: 700 };
  scene.entities.push({ ...structuredClone(scene.entities.find(e => e.id === 'banc-boss')!),
    id: 'boss-lointain', position: { x: 1800, y: 400 } });
  return scene;
}
