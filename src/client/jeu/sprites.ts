import type { Entity } from './camera.js';

/** Sources vectorielles à 2× ; dimensions nominales en unités du monde.
 * Pivot normalisé central, avant vers -Y. Aucune donnée de combat ici. */
export const sprites = {
  joueur: { file: 'joueur', width: 32, height: 32, label: 'Joueur · chevron' },
  ennemi: { file: 'ennemi', width: 40, height: 36, label: 'Ennemi · ailes crochues' },
  decor: { file: 'rocher', width: 48, height: 48, label: 'Décor · roche mate' },
  'objet-destructible': { file: 'caisse', width: 32, height: 32, label: 'Destructible · 4 verrous' },
  boss: { file: 'boss', width: 96, height: 80, label: 'Boss · pinces' },
  'vaisseau-mere': { file: 'vaisseau-mere', width: 200, height: 120, label: 'Vaisseau mère · 3 baies' },
  'tir-ennemi': { file: 'tir-ennemi', width: 10, height: 20, label: 'Tir ennemi · double pointe' },
  'tir-joueur': { file: 'tir-joueur', width: 6, height: 14, label: 'Tir joueur · trait' },
  'tir-neutre': { file: 'tir-neutre', width: 8, height: 16, label: 'Tir neutre · losange' },
} as const;
export type SpriteKey = keyof typeof sprites;
export type VisualState = 'repos' | 'deplacement' | 'tir' | 'impact' | 'destruction';
export interface Presentation { orientation?: number; state?: VisualState; progress?: number }
export const spritePivot = { x: 0.5, y: 0.5 } as const;

export function spriteKey(entity: Entity): SpriteKey {
  if (entity.category === 'projectile') return `tir-${entity.projectileOrigin?.faction ?? 'neutre'}`;
  // Une catégorie historique ne doit jamais donner de faux verrous de destructibilité.
  if (entity.category === 'objet-destructible' && !entity.destructible) return 'decor';
  return entity.category;
}

export async function loadSprites(): Promise<Record<string, HTMLImageElement>> {
  const entries = await Promise.all([...Object.values(sprites).map(s => s.file), 'sol'].map(async file => {
    const image = new Image();
    image.src = `/jeu/sprites/${file}.svg`;
    try { await image.decode(); } catch { throw new Error(`Sprite local indisponible : ${file}.svg`); }
    return [file, image] as const;
  }));
  return Object.fromEntries(entries);
}

/** Ajustement uniforme des solides dans l'enveloppe existante. Un tir hostile
 * conserve sa taille en tournant ; sa pointe peut dépasser l'enveloppe logique.
 * L'orientation ne modifie jamais dimensions, sélection ou visibilité logiques. */
export function spriteTransform(entity: Entity, orientation = 0) {
  const sprite = sprites[spriteKey(entity)];
  const cos = Math.abs(Math.cos(orientation)), sin = Math.abs(Math.sin(orientation));
  const hostile = entity.category === 'projectile' && entity.projectileOrigin?.faction === 'ennemi';
  const scale = hostile ? Math.min(entity.dimensions.width / sprite.width, entity.dimensions.height / sprite.height)
    : Math.min(entity.dimensions.width / (sprite.width * cos + sprite.height * sin),
      entity.dimensions.height / (sprite.width * sin + sprite.height * cos));
  return { pivot: { ...spritePivot }, orientation, scale, width: sprite.width, height: sprite.height };
}
