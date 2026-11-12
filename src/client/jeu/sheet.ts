import type { Entity, Scene, Rectangle } from './camera.js';
import { sprites } from './sprites.js';

/** Planche à zoom 1, indépendante des instantanés de référence. */
export function spriteSheet(reference: Scene, game: Rectangle): Scene {
  const keys = ['vaisseau-mere', 'boss', 'decor', 'joueur', 'ennemi', 'objet-destructible', 'tir-ennemi', 'tir-joueur', 'tir-neutre'] as const;
  const narrow = game.width < 600;
  const entities = keys.map((key, i): Entity => {
    const sprite = sprites[key];
    const projectile = key.startsWith('tir-');
    const x = narrow ? (i === 0 ? game.width / 2 : game.width * ((i - 1) % 2 ? .75 : .25))
      : game.width * ((i % 3 + .5) / 3);
    const y = narrow ? (i === 0 ? 80 : i <= 2 ? 218 : 344 + Math.floor((i - 3) / 2) * 100)
      : 140 + Math.floor(i / 3) * 180;
    return { id: `planche-${key}`, category: projectile ? 'projectile' : key as Entity['category'],
      position: { x: x - game.width / 2, y: y - game.height / 2 },
      dimensions: { width: sprite.width, height: sprite.height }, state: 'actif',
      destructible: key === 'objet-destructible' || key === 'boss' || key === 'vaisseau-mere' || key === 'ennemi',
      projectileOrigin: projectile ? { faction: key.slice(4) as 'ennemi' | 'joueur' | 'neutre', emitterId: 'planche' } : null };
  });
  return { ...reference, id: 'planche', playerId: 'planche-joueur', entities };
}
