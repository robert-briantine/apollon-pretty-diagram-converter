import { isVisible, layout, pickEntity, worldBounds, worldToScreen } from './camera.js';
import { sprites, spriteKey, spriteTransform } from './sprites.js';
import type { Presentation } from './sprites.js';
import type { Camera, Entity, Point, Scene } from './camera.js';
import { guidance } from './guidance.js';
import type { Guidance } from './guidance.js';

/** Consomme des instantanés ; ne change jamais positions, états ni collisions. */
export class RectangularView {
  readonly canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private scene: Scene;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private partition = layout(1, 1);
  private dpr = 1;
  private following = false;
  private presentation: Record<string, Presentation> = {};
  private sheet = false;
  private background: 'clair' | 'sombre' = 'sombre';

  setBackground(background: 'clair' | 'sombre') { this.background = background; this.draw(); }

  setPresentation(presentation: Record<string, Presentation>) {
    for (const value of Object.values(presentation)) {
      if (!Number.isFinite(value.orientation ?? 0) || !Number.isFinite(value.progress ?? 0) ||
        (value.progress ?? 0) < 0 || (value.progress ?? 0) > 1) throw new RangeError('Présentation invalide.');
    }
    this.presentation = structuredClone(presentation);
    this.draw();
  }

  setSheet(enabled: boolean) { this.sheet = enabled; this.draw(); }

  constructor(canvas: HTMLCanvasElement, scene: Scene, private images: Record<string, HTMLImageElement>) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponible.');
    this.context = context;
    this.scene = scene;
  }

  getSnapshot() {
    return { camera: { ...this.camera }, game: { ...this.partition.game }, hud: { ...this.partition.hud },
      world: worldBounds(this.camera, this.partition.game), dpr: this.dpr, following: this.following,
      guidance: guidance(this.scene, this.camera, this.partition.game),
      visibleIds: this.scene.entities.filter(e => isVisible(e, this.camera, this.partition.game)).map(e => e.id) };
  }

  resize(width: number, height: number, dpr = window.devicePixelRatio || 1, withHud = true) {
    this.partition = layout(width, height, withHud);
    this.dpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    const { game } = this.partition;
    this.canvas.style.width = `${game.width}px`;
    this.canvas.style.height = `${game.height}px`;
    this.canvas.width = Math.max(1, Math.round(game.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(game.height * this.dpr));
    this.draw();
    return this.getSnapshot();
  }

  setScene(scene: Scene) {
    if (scene.id !== this.scene.id) this.presentation = {};
    this.scene = scene;
    this.trackPlayer();
    this.draw();
  }

  setCamera(camera: Camera) {
    if (![camera.x, camera.y, camera.zoom].every(Number.isFinite) || camera.zoom <= 0) {
      throw new RangeError('Caméra finie et zoom strictement positif requis.');
    }
    this.camera = { ...camera };
    this.following = false;
    this.draw();
  }

  followPlayer(enabled: boolean) {
    this.following = enabled;
    this.trackPlayer();
    this.draw();
  }

  private trackPlayer() {
    const player = this.scene.entities.find(e => e.id === this.scene.playerId);
    if (this.following && player) this.camera = { ...this.camera, ...player.position };
  }

  inspect(point: Point) { return pickEntity(this.scene, point, this.camera, this.partition.game); }

  draw() {
    const c = this.context;
    const { game } = this.partition;
    // Un seul repère CSS, compensant aussi les arrondis du backing store.
    c.setTransform(this.canvas.width / game.width, 0, 0, this.canvas.height / game.height, 0, 0);
    c.fillStyle = this.background === 'clair' ? '#edf1f5' : '#080f20';
    c.fillRect(0, 0, game.width, game.height);

    // La planète est une géométrie circulaire du monde, jamais un clip de caméra.
    const center = worldToScreen(this.scene.planet.center, this.camera, game);
    c.beginPath();
    c.arc(center.x, center.y, this.scene.planet.radius * this.camera.zoom, 0, Math.PI * 2);
    c.fillStyle = this.background === 'clair' ? '#cbd4dc' : '#17283a';
    c.fill();
    c.strokeStyle = '#64788d';
    c.lineWidth = 1;
    c.stroke();

    // Repères discrets à l'intérieur du monde ; les quatre coins restent dessinables.
    const bounds = worldBounds(this.camera, game);
    const step = 128;
    if (this.camera.zoom >= 0.25) {
      c.fillStyle = '#26384a';
      for (let x = Math.ceil(bounds.x / step) * step; x < bounds.x + bounds.width; x += step) {
        for (let y = Math.ceil(bounds.y / step) * step; y < bounds.y + bounds.height; y += step) {
          const p = this.scene.planet;
          if ((x - p.center.x) ** 2 + (y - p.center.y) ** 2 > p.radius ** 2) continue;
          const s = worldToScreen({ x, y }, this.camera, game);
          c.fillRect(s.x, s.y, 2, 2);
        }
      }
    }

    // Les détails de terrain restent sombres, sous les objets interactifs.
    if (this.camera.zoom >= .25) {
      const step = 384;
      for (let x = Math.floor(bounds.x / step) * step; x < bounds.x + bounds.width; x += step) {
        for (let y = Math.floor(bounds.y / step) * step; y < bounds.y + bounds.height; y += step) {
          const p = this.scene.planet;
          if (Math.hypot(x - p.center.x, y - p.center.y) + 100 > p.radius) continue;
          const s = worldToScreen({ x, y }, this.camera, game), size = 128 * this.camera.zoom;
          c.drawImage(this.images.sol, s.x - size / 2, s.y - size / 2, size, size);
        }
      }
    }
    const layer = { decor: 0, 'objet-destructible': 1, 'vaisseau-mere': 2, boss: 3, ennemi: 4, joueur: 5, projectile: 6 };
    // Tous les effets des objets sont sous les tirs. Les tirs hostiles passent
    // aussi après les autres tirs, indépendamment de l'ordre des instantanés.
    const order = (e: Entity) => e.category === 'projectile' && e.projectileOrigin?.faction === 'ennemi' ? 7 : layer[e.category];
    const entities = this.scene.entities.filter(e => isVisible(e, this.camera, game))
      .sort((a, b) => order(a) - order(b));
    for (const entity of entities) this.drawSprite(entity);
    const indicator = guidance(this.scene, this.camera, game);
    if (indicator) this.drawGuidance(indicator);
  }

  private drawGuidance(indicator: Guidance) {
    const c = this.context;
    c.save();
    c.translate(indicator.position.x, indicator.position.y);
    c.scale(indicator.radius / 20, indicator.radius / 20);
    // Médaillon de navigation fixe à l'écran, distinct des aiguilles hostiles.
    // Pas de halo : toute l'encre reste dans le rayon annoncé de 20 px.
    c.beginPath(); c.arc(0, 0, 18, 0, Math.PI * 2);
    c.fillStyle = '#080f20'; c.fill();
    c.strokeStyle = '#70e1f5'; c.lineWidth = 2; c.stroke();
    c.rotate(indicator.angle);
    c.beginPath(); c.moveTo(12, 0); c.lineTo(-6, -9);
    c.lineTo(-2, 0); c.lineTo(-6, 9); c.closePath();
    c.fillStyle = '#e8f6ff'; c.fill();
    c.beginPath(); c.moveTo(-12, -4); c.lineTo(-12, 4);
    c.strokeStyle = '#70e1f5'; c.lineWidth = 2; c.stroke();
    c.restore();
  }

  private drawSprite(entity: Entity) {
    const c = this.context, game = this.partition.game;
    const key = spriteKey(entity), sprite = sprites[key];
    const visual = this.presentation[entity.id] ?? {};
    const progress = visual.progress ?? 0;
    const transform = spriteTransform(entity, visual.orientation ?? 0);
    const center = worldToScreen(entity.position, this.camera, game);
    if (this.sheet) {
      c.fillStyle = '#101f31';
      const columns = game.width < 600 ? (entity.category === 'vaisseau-mere' ? 1 : 2) : 3;
      const width = Math.min(224, game.width / columns - 8);
      c.fillRect(center.x - width / 2, center.y - entity.dimensions.height / 2 - 10, width, entity.dimensions.height + 42);
      c.fillStyle = '#d4dfed'; c.textAlign = 'center'; c.font = '11px system-ui';
      c.fillText(sprite.label, center.x, center.y + entity.dimensions.height / 2 + 16, width - 6);
      c.fillStyle = '#8da1b8'; c.font = '10px system-ui';
      c.fillText(`${sprite.width} × ${sprite.height} · 1:1`, center.x, center.y + entity.dimensions.height / 2 + 29, width - 6);
    }
    c.save();
    c.translate(center.x, center.y);
    c.rotate(transform.orientation);
    const hostile = entity.category === 'projectile' && entity.projectileOrigin?.faction === 'ennemi';
    // Minimum de lecture de 8×16 px CSS pour une aiguille nominale, sans modifier
    // l'enveloppe de sélection, le culling ni les volumes du futur moteur.
    const scale = hostile ? Math.max(transform.scale * this.camera.zoom, .8) : transform.scale * this.camera.zoom;
    c.scale(scale, scale);
    const w = transform.width, h = transform.height;
    if (visual.state === 'destruction') c.globalAlpha = 1 - progress;
    c.drawImage(this.images[sprite.file], -w / 2, -h / 2, w, h);
    if (entity.destructible) {
      // Quatre équerres à double valeur pour les solides ; deux petits verrous
      // latéraux pour un projectile destructible : sa pointe reste prioritaire.
      c.beginPath();
      if (entity.category === 'projectile') {
        for (const sign of [-1, 1]) {
          c.moveTo(sign * w * .22, -h * .06); c.lineTo(sign * w * .38, -h * .06);
          c.lineTo(sign * w * .38, h * .10);
        }
      } else {
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          c.moveTo(x * w * .20, y * h * .38); c.lineTo(x * w * .38, y * h * .38);
          c.lineTo(x * w * .38, y * h * .20);
        }
      }
      c.lineJoin = 'miter'; c.strokeStyle = '#060a12'; c.lineWidth = 3; c.stroke();
      c.strokeStyle = '#fff0b6'; c.lineWidth = 1; c.stroke();
      if (entity.damageState === 'endommage' && entity.category !== 'projectile') {
        // Fissure centrale, sans effacer les quatre coins identifiables.
        c.beginPath(); c.moveTo(-w * .12, -h * .24); c.lineTo(w * .06, -h * .07);
        c.lineTo(-w * .06, h * .08); c.lineTo(w * .14, h * .24);
        c.strokeStyle = '#060a12'; c.lineWidth = 3; c.stroke();
        c.strokeStyle = '#fff0b6'; c.lineWidth = 1; c.stroke();
      }
    }
    c.globalAlpha = 1;
    // États de présentation uniquement, durée conventionnelle de 150 ms.
    // Pas de tremblement ni de déplacement du pivot, pas de mutation de scène.
    const fade = Math.sin(progress * Math.PI) * .35;
    c.globalAlpha = fade;
    c.strokeStyle = entity.destructible ? '#f6cd72' : '#e8f6ff';
    c.fillStyle = c.strokeStyle;
    c.lineWidth = 1;
    if (visual.state === 'impact') {
      c.beginPath();
      if (entity.destructible && entity.category !== 'projectile') c.rect(-w * .34, -h * .34, w * .68, h * .68);
      else c.ellipse(0, 0, w * .42, h * .42, 0, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        c.beginPath(); c.moveTo(Math.cos(angle) * w * .12, Math.sin(angle) * h * .12);
        c.lineTo(Math.cos(angle) * w * .32, Math.sin(angle) * h * .32); c.stroke();
      }
    } else if (visual.state === 'destruction') {
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const x = Math.cos(angle) * w * .4 * progress, y = Math.sin(angle) * h * .4 * progress;
        c.fillRect(x - 1, y - 1, 2, 2);
      }
    } else if (visual.state === 'deplacement') {
      for (const x of [-w * .18, w * .18]) {
        c.beginPath(); c.moveTo(x - 1, h * .28); c.lineTo(x, h * .48); c.lineTo(x + 1, h * .28); c.fill();
      }
    } else if (visual.state === 'tir') {
      c.beginPath(); c.moveTo(0, -h * .48); c.lineTo(-w * .12, -h * .25); c.lineTo(w * .12, -h * .25); c.closePath(); c.fill();
    }
    c.restore();
  }
}
