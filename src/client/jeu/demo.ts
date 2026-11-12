import { loadSprites } from './sprites.js';
import type { VisualState } from './sprites.js';
import { spriteSheet } from './sheet.js';
import { readabilityScene } from './readability.js';
import { guidanceScene } from './guidance-scene.js';
import { RectangularView } from './renderer.js';
import { resolveScenario } from './scenarios.js';
import type { Scenarios } from './scenarios.js';
import type { Point, Scene } from './camera.js';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('world');
const status = element('status');
const select = element<HTMLSelectElement>('scenario');

async function load<T>(name: string): Promise<T> {
  const response = await fetch(`/assets/jeu/data/${name}.json`);
  if (!response.ok) throw new Error(`Scène indisponible (${response.status}).`);
  return response.json();
}

async function start() {
  const [reference, scenarios] = await Promise.all([load<Scene>('scene-reference'), load<Scenarios>('scenarios')]);
  const images = await loadSprites();
  const view = new RectangularView(canvas, reference, images);
  let showingSheet = false;
  let showingReadability = false;
  let currentScene = reference;
  let visualFrame = 0;
  const state = element<HTMLSelectElement>('visual-state');
  const orientation = element<HTMLInputElement>('orientation');
  const timeline = element<HTMLInputElement>('timeline');
  function present() {
    const progress = Number(timeline.value) / 150;
    view.setPresentation(Object.fromEntries(currentScene.entities.map(e => [e.id, {
      orientation: Number(orientation.value) * Math.PI / 180,
      state: (showingReadability && e.category === 'projectile' ? 'repos' : state.value) as VisualState, progress,
    }])));
    element('visual-time').textContent = `${timeline.value} ms · ${orientation.value}°`;
  }
  function sheet() {
    currentScene = spriteSheet(reference, view.getSnapshot().game);
    view.setScene(currentScene);
    view.setCamera({ x: 0, y: 0, zoom: 1 });
    present();
  }
  state.addEventListener('change', present);
  orientation.addEventListener('input', present);
  timeline.addEventListener('input', () => { cancelAnimationFrame(visualFrame); present(); });
  element('animate').addEventListener('click', () => {
    cancelAnimationFrame(visualFrame);
    const start = performance.now();
    function frame(now: number) {
      timeline.value = String(Math.min(150, Math.round(now - start)));
      present();
      if (now - start < 150) visualFrame = requestAnimationFrame(frame);
    }
    visualFrame = requestAnimationFrame(frame);
  });
  element('sheet').addEventListener('click', () => {
    showingReadability = false;
    showingSheet = !showingSheet;
    view.setSheet(showingSheet);
    element('sheet').setAttribute('aria-pressed', String(showingSheet));
    if (showingSheet) sheet(); else choose();
    information();
  });
  for (const scenario of scenarios.scenarios) select.add(new Option(scenario.id, scenario.id));
  select.disabled = false;
  function dense(guided: boolean) {
    showingReadability = true;
    showingSheet = false;
    view.setSheet(false);
    element('sheet').setAttribute('aria-pressed', 'false');
    currentScene = guided ? guidanceScene(reference) : readabilityScene(reference);
    view.setScene(currentScene);
    view.setCamera({ x: 0, y: 0, zoom: 1 });
    present(); information();
  }
  element('readability').addEventListener('click', () => dense(false));
  element('guidance-scene').addEventListener('click', () => dense(true));
  element<HTMLSelectElement>('background').addEventListener('change', event => {
    view.setBackground((event.target as HTMLSelectElement).value as 'clair' | 'sombre');
  });
  element<HTMLInputElement>('grayscale').addEventListener('change', event => {
    canvas.style.filter = (event.target as HTMLInputElement).checked ? 'grayscale(1)' : '';
  });

  function information() {
    const s = view.getSnapshot();
    element('camera').textContent = `x ${s.camera.x.toFixed(0)}\ny ${s.camera.y.toFixed(0)}\n${Math.round(s.camera.zoom * 100)} %`;
    element('follow').setAttribute('aria-pressed', String(s.following));
    status.textContent = `${s.visibleIds.length} entités visibles`;
    element('guidance').textContent = s.guidance
      ? `${s.guidance.category === 'boss' ? 'Boss' : 'Vaisseau mère'} · ${s.guidance.targetId}\n${Math.round(s.guidance.distance)} u du joueur`
      : 'Aucune recherche hors champ.';
  }
  function resize() {
    const s = view.resize(document.documentElement.clientWidth, document.documentElement.clientHeight);
    const hud = element('hud');
    hud.style.left = `${s.hud.x}px`;
    hud.style.width = `${s.hud.width}px`;
    if (showingSheet) sheet();
    information();
  }
  function choose() {
    showingReadability = false;
    const scenario = scenarios.scenarios.find(s => s.id === select.value)!;
    showingSheet = false;
    view.setSheet(false);
    element('sheet').setAttribute('aria-pressed', 'false');
    currentScene = resolveScenario(reference, scenario);
    view.setScene(currentScene);
    present();
    view.setCamera(scenario.camera);
    element('inspection').textContent = 'Cliquer une entité.';
    information();
  }
  function pan(dx: number, dy: number) {
    const { camera } = view.getSnapshot();
    view.setCamera({ ...camera, x: camera.x + dx / camera.zoom, y: camera.y + dy / camera.zoom });
    information();
  }
  function zoom(factor: number) {
    const { camera } = view.getSnapshot();
    view.setCamera({ ...camera, zoom: Math.max(0.04, Math.min(4, camera.zoom * factor)) });
    information();
  }
  select.addEventListener('change', choose);
  element('reset').addEventListener('click', choose);
  element('follow').addEventListener('click', () => {
    view.followPlayer(!view.getSnapshot().following); information();
  });
  element('planet').addEventListener('click', () => {
    const { game } = view.getSnapshot();
    view.setCamera({ ...reference.planet.center, zoom: Math.min(game.width, game.height) / (reference.planet.radius * 2 + 400) });
    information();
  });
  element('zoom-in').addEventListener('click', () => zoom(1.25));
  element('zoom-out').addEventListener('click', () => zoom(0.8));
  canvas.addEventListener('keydown', event => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => pan(-64, 0), ArrowRight: () => pan(64, 0),
      ArrowUp: () => pan(0, -64), ArrowDown: () => pan(0, 64),
      '+': () => zoom(1.25), '=': () => zoom(1.25), '-': () => zoom(0.8),
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  let drag: { id: number; start: Point; last: Point; moved: boolean } | undefined;
  const pointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    canvas.focus();
    const p = pointer(event);
    drag = { id: event.pointerId, start: p, last: p, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const p = pointer(event);
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) <= 3) return;
    drag.moved = true;
    pan(drag.last.x - p.x, drag.last.y - p.y);
    drag.last = p;
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved) {
      const entity = view.inspect(pointer(event));
      element('inspection').textContent = entity ? `${entity.id}\n${entity.category}\nx ${entity.position.x}, y ${entity.position.y}` : 'Aucune entité ici.';
    }
    drag = undefined;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener('lostpointercapture', () => { drag = undefined; });

  const observer = new ResizeObserver(resize);
  observer.observe(document.documentElement);
  window.addEventListener('resize', resize);
  // Un changement de moniteur/DPR peut survenir sans événement resize ni
  // notification de media query (notamment lors d'une émulation navigateur).
  // Cette veille ne redessine que lorsque la densité change.
  let lastDensity = window.devicePixelRatio;
  let densityFrame: number;
  function watchDensity() {
    if (lastDensity !== window.devicePixelRatio) {
      lastDensity = window.devicePixelRatio;
      resize();
    }
    densityFrame = requestAnimationFrame(watchDensity);
  }
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(densityFrame);
    cancelAnimationFrame(visualFrame);
  }, { once: true });
  watchDensity();
  resize();
  choose();
  return view;
}

/** Accès au contrat public de rendu pour un futur adaptateur moteur. */
export const ready = start();
void ready.catch(error => { status.textContent = `Erreur : ${error.message}`; });
