import type { Entity, Scene } from './camera.js';

/** Banc dense à l'échelle 1:1, distinct des fixtures historiques v1.
 * Le tir destructible est une entrée d'adaptateur, pas une nouvelle mécanique. */
export function readabilityScene(reference: Scene): Scene {
  const entities: Entity[] = [];
  const entity = (id: string, category: Entity['category'], x: number, y: number,
    width: number, height: number, destructible = false): Entity => ({
    id, category, position: { x, y }, dimensions: { width, height },
    state: 'actif', destructible, projectileOrigin: null,
  });
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    const x = (col - 1) * 82, y = -145 + row * 94;
    const decor = (row + col) % 3 === 0;
    const solid = entity(`solide-${row}-${col}`, decor ? 'decor' : 'objet-destructible', x, y, 32, 32, !decor);
    solid.damageState = row % 2 ? 'endommage' : 'intact';
    entities.push(solid);
    const hostile = entity(`hostile-${row}-${col}`, 'projectile', x + 25, y + 5, 10, 20, row === 2 && col === 1);
    hostile.projectileOrigin = { faction: 'ennemi', emitterId: 'banc-ennemi' };
    const friendly = entity(`allie-${row}-${col}`, 'projectile', x - 25, y - 8, 6, 14);
    friendly.projectileOrigin = { faction: 'joueur', emitterId: 'banc-joueur' };
    entities.push(hostile, friendly);
  }
  entities.push(entity('banc-joueur', 'joueur', -65, -225, 32, 32),
    entity('banc-ennemi', 'ennemi', 0, -225, 40, 36, true),
    entity('banc-boss', 'boss', 74, -228, 64, 54, true),
    entity('banc-mere', 'vaisseau-mere', 0, 255, 160, 96, true));
  return { ...structuredClone(reference), id: 'lisibilite-dense', playerId: 'banc-joueur', entities };
}
