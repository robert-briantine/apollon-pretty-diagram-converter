/** Coordonnées CSS pour l'écran, unités cartésiennes pour le monde (y vers le bas).
 * Le DPR appartient exclusivement au backing store, jamais à ces fonctions. */
export interface Point { x: number; y: number }
export interface Rectangle extends Point { width: number; height: number }
export interface Camera extends Point { zoom: number }
export interface Entity {
  id: string;
  category: 'ennemi' | 'joueur' | 'decor' | 'objet-destructible' | 'projectile' | 'boss' | 'vaisseau-mere';
  position: Point;
  dimensions: { width: number; height: number };
  state: 'actif' | 'inactif' | 'detruit';
  destructible: boolean;
  /** État persistant fourni par l'adaptateur moteur, indépendant d'un flash d'impact. */
  damageState?: 'intact' | 'endommage';
  projectileOrigin: { faction: 'ennemi' | 'joueur' | 'neutre'; emitterId: string } | null;
}
export interface Scene {
  version: number;
  id: string;
  planet: { center: Point; radius: number };
  playerId: string;
  entities: Entity[];
}

/** Partition exacte de la fenêtre, HUD optionnel. Même à 1 px le jeu reste positif. */
export function layout(width: number, height: number, withHud = true) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    throw new RangeError('La fenêtre doit avoir des dimensions finies positives.');
  }
  const hudWidth = withHud ? Math.min(240, Math.floor(width * 0.2)) : 0;
  return {
    game: { x: 0, y: 0, width: width - hudWidth, height },
    hud: { x: width - hudWidth, y: 0, width: hudWidth, height },
  };
}

export function worldToScreen(point: Point, camera: Camera, viewport: Rectangle): Point {
  return {
    x: viewport.x + viewport.width / 2 + (point.x - camera.x) * camera.zoom,
    y: viewport.y + viewport.height / 2 + (point.y - camera.y) * camera.zoom,
  };
}

export function screenToWorld(point: Point, camera: Camera, viewport: Rectangle): Point {
  return {
    x: camera.x + (point.x - viewport.x - viewport.width / 2) / camera.zoom,
    y: camera.y + (point.y - viewport.y - viewport.height / 2) / camera.zoom,
  };
}

export function screenBounds(entity: Entity, camera: Camera, viewport: Rectangle): Rectangle {
  const center = worldToScreen(entity.position, camera, viewport);
  const width = entity.dimensions.width * camera.zoom;
  const height = entity.dimensions.height * camera.zoom;
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/** Aire d'intersection strictement positive : une tangence n'est pas visible. */
export function isVisible(entity: Entity, camera: Camera, viewport: Rectangle): boolean {
  const b = screenBounds(entity, camera, viewport);
  return entity.state === 'actif' && b.x < viewport.x + viewport.width &&
    b.x + b.width > viewport.x && b.y < viewport.y + viewport.height && b.y + b.height > viewport.y;
}

export function contains(rect: Rectangle, point: Point): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

/** Sélection d'inspection, pas un volume de collision de jeu. Ordre inverse du dessin. */
export function pickEntity(scene: Scene, point: Point, camera: Camera, viewport: Rectangle): Entity | undefined {
  if (!contains(viewport, point)) return undefined;
  const world = screenToWorld(point, camera, viewport);
  return [...scene.entities].reverse().find(e => e.state === 'actif' &&
    Math.abs(world.x - e.position.x) <= e.dimensions.width / 2 &&
    Math.abs(world.y - e.position.y) <= e.dimensions.height / 2);
}

export function worldBounds(camera: Camera, viewport: Rectangle): Rectangle {
  return { ...screenToWorld(viewport, camera, viewport), width: viewport.width / camera.zoom, height: viewport.height / camera.zoom };
}
