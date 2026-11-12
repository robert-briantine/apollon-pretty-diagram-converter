import { isVisible, layout, pickEntity, screenBounds, worldBounds, worldToScreen } from './camera.js';
import type { Camera, Point, Scene } from './camera.js';

/** Consomme des instantanés ; ne change jamais positions, états ni collisions. */
export class RectangularView {
  readonly canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private scene: Scene;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private partition = layout(1, 1);
  private dpr = 1;
  private following = false;

  constructor(canvas: HTMLCanvasElement, scene: Scene) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponible.');
    this.context = context;
    this.scene = scene;
  }

  getSnapshot() {
    return { camera: { ...this.camera }, game: { ...this.partition.game }, hud: { ...this.partition.hud },
      world: worldBounds(this.camera, this.partition.game), dpr: this.dpr, following: this.following,
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
    c.fillStyle = '#080f20';
    c.fillRect(0, 0, game.width, game.height);

    // La planète est une géométrie circulaire du monde, jamais un clip de caméra.
    const center = worldToScreen(this.scene.planet.center, this.camera, game);
    c.beginPath();
    c.arc(center.x, center.y, this.scene.planet.radius * this.camera.zoom, 0, Math.PI * 2);
    c.fillStyle = '#17283a';
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

    // Enveloppes de référence uniquement : les sprites seront livrés dans l'évolution dédiée.
    const colors = { joueur: '#70e1f5', decor: '#64788d', 'objet-destructible': '#f6cd72',
      projectile: '#ff738f', boss: '#c5a0ff', 'vaisseau-mere': '#b8cce8' };
    for (const entity of this.scene.entities) {
      if (!isVisible(entity, this.camera, game)) continue;
      const b = screenBounds(entity, this.camera, game);
      c.fillStyle = colors[entity.category];
      c.fillRect(b.x, b.y, b.width, b.height);
      c.strokeStyle = '#060a12';
      c.strokeRect(b.x + 0.5, b.y + 0.5, Math.max(0, b.width - 1), Math.max(0, b.height - 1));
    }
  }
}
