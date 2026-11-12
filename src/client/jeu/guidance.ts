import { isVisible, worldToScreen } from './camera.js';
import type { Camera, Point, Rectangle, Scene } from './camera.js';

export interface Guidance {
  targetId: string;
  category: 'boss' | 'vaisseau-mere';
  distance: number;
  direction: Point;
  angle: number;
  position: Point;
  /** Enveloppe circulaire complète, contour compris, en pixels CSS. */
  radius: number;
}

/** Aucun cache ni référence d'entité : chaque instantané remplace le précédent.
 * Le monde fourni est cartésien, sans bouclage ni métrique moteur disponible. */
export function guidance(scene: Scene, camera: Camera, game: Rectangle): Guidance | null {
  const candidates = scene.entities.filter(e => e.state === 'actif' &&
    (e.category === 'boss' || e.category === 'vaisseau-mere'));
  if (!candidates.length || candidates.some(e => isVisible(e, camera, game))) return null;
  const player = scene.entities.find(e => e.id === scene.playerId && e.state === 'actif');
  if (!player) return null;

  const distance = (position: Point) => Math.hypot(position.x - player.position.x, position.y - player.position.y);
  const target = candidates.reduce((best, e) => {
    const a = distance(e.position), b = distance(best.position);
    return a < b || (a === b && e.id < best.id) ? e : best;
  });
  const from = worldToScreen(player.position, camera, game);
  const to = worldToScreen(target.position, camera, game);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  // Un joueur et une cible superposés hors champ ne définissent aucun cap.
  if (length === 0) return null;
  const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const side = Math.min(game.width, game.height);
  const radius = Math.min(20, side / 4), margin = Math.min(16, side / 8);
  const halfWidth = game.width / 2 - radius - margin;
  const halfHeight = game.height / 2 - radius - margin;
  // Rayon centré dans le rectangle : le cap reste joueur→cible même en caméra
  // libre. La translation de caméra influe sur la visibilité, pas sur ce cap.
  const travel = Math.min(direction.x === 0 ? Infinity : halfWidth / Math.abs(direction.x),
    direction.y === 0 ? Infinity : halfHeight / Math.abs(direction.y));
  return {
    targetId: target.id, category: target.category as Guidance['category'], distance: distance(target.position),
    direction, angle: Math.atan2(direction.y, direction.x), radius,
    position: { x: game.x + game.width / 2 + direction.x * travel,
      y: game.y + game.height / 2 + direction.y * travel },
  };
}
