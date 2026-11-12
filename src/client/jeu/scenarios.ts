import type { Camera, Entity, Scene } from './camera.js';

export interface Scenario {
  id: string;
  window: string;
  camera: Camera;
  include: 'all' | string[];
  overrides: Record<string, Partial<Entity>>;
}
export interface Scenarios { scenarios: Scenario[] }

/** Résolution déterministe, indépendante du dessin et sans mutation de la référence. */
export function resolveScenario(reference: Scene, scenario: Scenario): Scene {
  const scene = structuredClone(reference);
  scene.id = scenario.id;
  scene.entities = scene.entities.filter(e => scenario.include === 'all' || scenario.include.includes(e.id))
    .map(e => ({ ...e, ...structuredClone(scenario.overrides[e.id] ?? {}) }));
  return scene;
}
