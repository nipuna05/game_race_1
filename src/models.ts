/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Downloaded 3D models (GLB files in public/models). They are optional: when a file is missing the game uses its built-in shapes instead.
 *  Credits and licences are in CREDITS.md. */
const url = (p: string) => import.meta.env.BASE_URL + p;

export interface BikeModel { file: string; rotY: number; length: number; tint?: string }
/** Which downloaded model replaces which bike's body. rotY turns the model so it faces +z; length is the bike's length in game units; tint names the material that takes the bike's colour. */
export const BIKE_MODELS: Record<string, BikeModel> = {
  sport: { file: 'models/bikes/sv650.glb', rotY: 0, length: 2.15, tint: 'Blue' },
  cruiser: { file: 'models/bikes/poly.glb', rotY: -Math.PI / 2, length: 2.6 },
  scooter: { file: 'models/bikes/vrmobil.glb', rotY: Math.PI / 2, length: 1.9 },
  chopper: { file: 'models/kenney/vehicle-motorcycle.glb', rotY: 0, length: 2.2 },
  vespa: { file: 'models/bikes/vespa.glb', rotY: 0, length: 1.95, tint: 'Material.001' },
  dirt: { file: 'models/bikes/military.glb', rotY: 0, length: 2.35, tint: 'Green_Motor' },
};
export const TRUCKS = ['green', 'purple', 'red', 'yellow'].map((c) => `models/kenney/vehicle-truck-${c}.glb`);
export const TOWN_BUILDINGS = ['building-small-a', 'building-small-b', 'building-small-c', 'building-small-d', 'building-garage'].map((n) => `models/kenney-city/${n}.glb`);

const loaded = new Map<string, THREE.Object3D>();
const waiting: (() => void)[] = [];
export const modelsReady = { done: false };
export const onModels = (f: () => void) => { if (modelsReady.done) f(); else waiting.push(f); };
export const getModel = (file: string) => loaded.get(file) ?? null;

/** Load everything in the background; a model that fails to load is simply skipped. */
export function preloadModels() {
  const files = [...Object.values(BIKE_MODELS).map((m) => m.file), ...TRUCKS, ...TOWN_BUILDINGS], loader = new GLTFLoader();
  Promise.allSettled(files.map((f) => new Promise<void>((res, rej) => loader.load(url(f), (g) => { loaded.set(f, g.scene); res(); }, undefined, () => rej())))).then(() => { modelsReady.done = true; waiting.splice(0).forEach((f) => f()); });
}

function cloneWithMaterials(src: THREE.Object3D): THREE.Object3D {
  const c = src.clone(true);
  c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : (m.material as THREE.Material).clone(); });
  return c;
}

/** A downloaded bike model, turned to face +z, scaled to the bike's length, standing on the ground and centred. Null if it is not available. */
export function fitBike(bikeId: string, color: number): THREE.Group | null {
  const bm = BIKE_MODELS[bikeId], src = bm && getModel(bm.file); if (!bm || !src) return null;
  const g = cloneWithMaterials(src), holder = new THREE.Group(); holder.add(g); g.rotation.y = bm.rotY;
  if (bm.tint) g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material) && (m.material as THREE.Material).name === bm.tint) ((m.material as THREE.MeshStandardMaterial).color).setHex(color); });
  holder.updateMatrixWorld(true); let box = new THREE.Box3().setFromObject(holder);
  g.scale.setScalar(bm.length / Math.max(box.getSize(new THREE.Vector3()).z, 1e-3));
  holder.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(holder); const c = box.getCenter(new THREE.Vector3());
  g.position.set(-c.x, -box.min.y, -c.z);
  return holder;
}

/** A Kenney truck for the traffic, scaled to car size. */
export function truck(i: number): THREE.Group | null {
  const src = getModel(TRUCKS[i % TRUCKS.length]); if (!src) return null;
  const g = cloneWithMaterials(src), h = new THREE.Group(); g.scale.setScalar(1.55); h.add(g); return h;
}
