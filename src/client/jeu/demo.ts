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
  const view = new RectangularView(canvas, reference);
  for (const scenario of scenarios.scenarios) select.add(new Option(scenario.id, scenario.id));
  select.disabled = false;

  function information() {
    const s = view.getSnapshot();
    element('camera').textContent = `x ${s.camera.x.toFixed(0)}\ny ${s.camera.y.toFixed(0)}\n${Math.round(s.camera.zoom * 100)} %`;
    element('follow').setAttribute('aria-pressed', String(s.following));
    status.textContent = `${s.visibleIds.length} entités visibles`;
  }
  function resize() {
    const s = view.resize(document.documentElement.clientWidth, document.documentElement.clientHeight);
    const hud = element('hud');
    hud.style.left = `${s.hud.x}px`;
    hud.style.width = `${s.hud.width}px`;
    information();
  }
  function choose() {
    const scenario = scenarios.scenarios.find(s => s.id === select.value)!;
    view.setScene(resolveScenario(reference, scenario));
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
  }, { once: true });
  watchDensity();
  resize();
  choose();
  return view;
}

/** Accès au contrat public de rendu pour un futur adaptateur moteur. */
export const ready = start();
void ready.catch(error => { status.textContent = `Erreur : ${error.message}`; });
