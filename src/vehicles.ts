import * as THREE from 'three';
import { Merge, compose, std } from './bikemodel';

/** Realistic traffic: sedans, hatchbacks, SUVs, taxis, vans, pickups, city buses and police cruisers, built from shapes in code.
 *  Every vehicle faces +z, stands on the ground (y = 0) and is merged into a handful of meshes so a busy street stays cheap. */
export type VType = 'sedan' | 'hatch' | 'suv' | 'taxi' | 'van' | 'pickup' | 'bus' | 'police';
export interface Vehicle { group: THREE.Group; type: VType; halfWidth: number; seg: number; speed: [number, number]; siren: THREE.Mesh[] }

const PAINTS = [0xf2f2f2, 0xd9dce1, 0x1b1d22, 0x6b7077, 0xb3261e, 0x1f4a8c, 0x2f5d3a, 0xc9b99a, 0xd86b1c, 0x7a1f2b, 0x3a6b8c];
const BUS_PAINTS = [0xc62828, 0x1565c0, 0xf5f5f5, 0x2e7d32, 0xf9a825];
const glass = () => std(0x1b2733, 0.85, 0.1), trim = () => std(0x15171b, 0.3, 0.55), tyre = () => std(0x0d0d0f, 0, 0.95), chrome = () => std(0xd8dce2, 1, 0.2);
const headL = () => std(0xfff6d8, 0.2, 0.1, { emissive: 0xfff0c0, emissiveIntensity: 0.85 }), tailL = () => std(0xff2a2a, 0.2, 0.3, { emissive: 0xff1010, emissiveIntensity: 0.9 });
const plate = () => std(0xf4f4f0, 0, 0.6);
const paint = (c: number) => std(c, 0.55, 0.3, { envMapIntensity: 1.1 });
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A side-view trapezoid (the greenhouse: windows between the pillars), extruded across the car. z runs along the car, y is up. */
function greenhouse(m: Merge, zFB: number, zFT: number, zRT: number, zRB: number, y0: number, y1: number, width: number) {
  const sh = new THREE.Shape(); sh.moveTo(zFB, y0); sh.lineTo(zFT, y1); sh.lineTo(zRT, y1); sh.lineTo(zRB, y0); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false }); g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)); g.translate(width / 2, 0, 0);
  m.add(g, glass(), new THREE.Matrix4());
}
function wheels(m: Merge, zs: number[], x: number, r: number, wide: number) {
  for (const z of zs) for (const sx of [-1, 1]) {
    m.add(new THREE.CylinderGeometry(r, r, wide, 20), tyre(), compose([sx * x, r, z], [1, 1, 1], [0, 0, Math.PI / 2]));
    m.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, wide + 0.03, 14), chrome(), compose([sx * x, r, z], [1, 1, 1], [0, 0, Math.PI / 2]));
    m.box([sx * (x - 0.02), r + r * 0.82, z], [wide + 0.12, r * 0.5, r * 2.5], trim());                      // the arch above the wheel
  }
}
function lights(m: Merge, L: number, W: number, y: number, tailY = y) {
  for (const sx of [-1, 1]) {
    m.box([sx * (W / 2 - 0.3), y, L / 2 + 0.005], [0.38, 0.14, 0.05], headL()); m.box([sx * (W / 2 - 0.3), tailY, -L / 2 - 0.005], [0.4, 0.14, 0.05], tailL());
    m.box([sx * (W / 2 - 0.12), y - 0.22, L / 2 + 0.005], [0.16, 0.08, 0.05], std(0xffd27a, 0.2, 0.2, { emissive: 0xffa500, emissiveIntensity: 0.5 }));   // indicators
  }
  m.box([0, y - 0.08, L / 2 + 0.005], [0.9, 0.18, 0.06], trim());                                          // grille
  m.box([0, 0.5, L / 2 - 0.02], [W - 0.1, 0.16, 0.14], trim()); m.box([0, 0.5, -L / 2 + 0.02], [W - 0.1, 0.16, 0.14], trim());   // bumpers
  m.box([0, 0.48, L / 2 + 0.07], [0.5, 0.12, 0.02], plate()); m.box([0, 0.55, -L / 2 - 0.07], [0.5, 0.12, 0.02], plate());
}

interface Spec { L: number; W: number; wr: number; belt: number; roof: number; zFB: number; zFT: number; zRT: number; zRB: number }
const SPECS: Record<string, Spec> = {
  sedan: { L: 4.6, W: 1.85, wr: 0.34, belt: 0.98, roof: 1.46, zFB: 1.0, zFT: 0.35, zRT: -0.85, zRB: -1.5 },
  hatch: { L: 3.9, W: 1.75, wr: 0.32, belt: 0.95, roof: 1.5, zFB: 0.85, zFT: 0.3, zRT: -0.95, zRB: -1.55 },
  suv: { L: 4.7, W: 1.95, wr: 0.4, belt: 1.12, roof: 1.78, zFB: 1.0, zFT: 0.4, zRT: -1.65, zRB: -1.95 },
};

function passenger(type: 'sedan' | 'hatch' | 'suv' | 'taxi' | 'police', color: number): { m: Merge; siren: THREE.Mesh[]; hw: number; seg: number } {
  const sp = SPECS[type === 'taxi' || type === 'police' ? 'sedan' : type], { L, W, wr, belt, roof, zFB, zFT, zRT, zRB } = sp;
  const m = new Merge(), body = paint(type === 'taxi' ? 0xf2b705 : type === 'police' ? 0xf4f4f4 : color), siren: THREE.Mesh[] = [];
  const base = 0.32, lowH = belt - base;
  m.box([0, base + lowH / 2, 0], [W, lowH, L], body);                                                           // lower body
  m.ell([0, base + lowH * 0.55, L / 2 - 0.35], [W / 2 * 0.98, lowH * 0.55, 0.7], body);                         // rounded nose
  m.ell([0, base + lowH * 0.55, -L / 2 + 0.35], [W / 2 * 0.98, lowH * 0.55, 0.7], body);                        // rounded tail
  greenhouse(m, zFB, zFT, zRT, zRB, belt, roof, W - 0.22);                                                      // the windows
  m.box([0, roof + 0.025, (zFT + zRT) / 2], [W - 0.2, 0.06, zFT - zRT + 0.05], type === 'police' ? trim() : body);   // the roof
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.12);
    m.seg(new THREE.Vector3(x, belt, zFB), new THREE.Vector3(x, roof, zFT), 0.035, body);                       // A pillar
    m.box([x, (belt + roof) / 2, (zFT + zRT) / 2 - 0.1], [0.05, roof - belt, 0.07], body);                      // B pillar
    m.seg(new THREE.Vector3(x, belt, zRB), new THREE.Vector3(x, roof, zRT), 0.04, body);                        // C pillar
    m.box([sx * (W / 2 + 0.005), belt - 0.25, (zFT + zRT) / 2 + 0.55], [0.01, 0.5, 0.02], trim()); m.box([sx * (W / 2 + 0.005), belt - 0.25, (zFT + zRT) / 2 - 0.65], [0.01, 0.5, 0.02], trim());   // door seams
    m.box([sx * (W / 2 + 0.01), belt - 0.12, (zFT + zRT) / 2 + 0.2], [0.02, 0.03, 0.18], chrome());              // door handle
    m.box([sx * (W / 2 + 0.08), belt + 0.05, zFB - 0.05], [0.14, 0.1, 0.18], body);                              // mirror
    if (type === 'police') m.box([sx * (W / 2 + 0.006), belt - 0.22, (zFT + zRT) / 2], [0.012, 0.4, 1.9], trim());   // black door panels
  }
  const wb = L * 0.62; wheels(m, [wb / 2, -wb / 2], W / 2 - 0.12, wr, 0.24); lights(m, L, W, belt - 0.2, belt - 0.22);
  if (type === 'suv') for (const sx of [-1, 1]) m.box([sx * (W / 2 - 0.3), roof + 0.1, (zFT + zRT) / 2], [0.05, 0.05, zFT - zRT - 0.1], chrome());   // roof rails
  if (type === 'taxi') { m.box([0, roof + 0.16, (zFT + zRT) / 2], [0.55, 0.16, 0.26], std(0xfff6c0, 0.2, 0.3, { emissive: 0xfff0a0, emissiveIntensity: 0.8 })); m.box([0, belt - 0.22, 0], [W + 0.005, 0.1, 1.2], trim()); }
  if (type === 'police') {
    m.box([0, roof + 0.12, (zFT + zRT) / 2], [0.9, 0.08, 0.32], trim());                                          // the light bar
    m.box([0, 0.55, L / 2 + 0.12], [W - 0.3, 0.3, 0.12], trim());                                                 // push bar
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.28), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xff2222 : 0x2266ff })); l.position.set(sx * 0.25, roof + 0.2, (zFT + zRT) / 2); siren.push(l); }
  }
  return { m, siren, hw: W / 2, seg: L / 2 - W / 2 };
}

function van(color: number) {
  const L = 5.3, W = 2.0, m = new Merge(), body = paint(color);
  m.box([0, 1.15, -0.625], [W, 1.65, 4.05], body);                                                              // cargo box (z -2.65 .. 1.4)
  m.box([0, 0.78, 2.15], [W, 0.95, 1.0], body);                                                                 // the nose (z 1.65 .. 2.65)
  greenhouse(m, 2.1, 1.65, 1.45, 1.45, 1.25, 1.85, W - 0.25);                                                   // windscreen sloping up to the cab roof
  m.box([0, 1.9, 1.55], [W - 0.1, 0.07, 0.3], body);
  for (const sx of [-1, 1]) {
    m.box([sx * (W / 2 + 0.006), 1.55, 1.85], [0.012, 0.5, 0.8], glass());                                      // cab side window
    m.box([sx * (W / 2 + 0.006), 1.0, -0.2], [0.012, 1.4, 0.025], trim()); m.box([sx * (W / 2 + 0.006), 1.0, -1.5], [0.012, 1.4, 0.025], trim());   // sliding door seams
    m.box([sx * (W / 2 + 0.08), 1.45, 2.0], [0.14, 0.22, 0.12], body);                                          // mirror
  }
  m.box([0, 0.55, -L / 2 + 0.05], [W - 0.1, 0.2, 0.1], trim());
  wheels(m, [1.75, -1.55], W / 2 - 0.12, 0.36, 0.25); lights(m, L, W, 0.85, 1.0);
  return { m, siren: [] as THREE.Mesh[], hw: W / 2, seg: L / 2 - W / 2 };
}
function pickup(color: number) {
  const L = 5.3, W = 2.0, m = new Merge(), body = paint(color);
  m.box([0, 0.68, 1.1], [W, 0.78, 3.1], body); m.ell([0, 0.7, 2.5], [W / 2 * 0.98, 0.4, 0.7], body);              // hood and cab base
  greenhouse(m, 1.15, 0.65, -0.25, -0.5, 1.07, 1.72, W - 0.25); m.box([0, 1.74, 0.2], [W - 0.2, 0.06, 1.0], body);
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.12); m.seg(new THREE.Vector3(x, 1.07, 1.15), new THREE.Vector3(x, 1.72, 0.65), 0.035, body); m.seg(new THREE.Vector3(x, 1.07, -0.5), new THREE.Vector3(x, 1.72, -0.25), 0.04, body);
    m.box([sx * (W / 2 + 0.08), 1.15, 1.1], [0.14, 0.1, 0.18], body); m.box([sx * (W / 2 + 0.005), 0.95, 0.45], [0.01, 0.55, 0.02], trim());
    m.box([sx * (W / 2 - 0.05), 0.95, -1.55], [0.1, 0.5, 2.3], body);                                           // bed sides
  }
  m.box([0, 0.72, -1.55], [W - 0.3, 0.06, 2.3], trim()); m.box([0, 0.95, -0.42], [W - 0.1, 0.5, 0.1], body); m.box([0, 0.95, -L / 2 + 0.05], [W - 0.1, 0.5, 0.1], body);   // bed floor, front wall, tailgate
  wheels(m, [1.7, -1.5], W / 2 - 0.12, 0.39, 0.27); lights(m, L, W, 0.9, 0.95);
  return { m, siren: [] as THREE.Mesh[], hw: W / 2, seg: L / 2 - W / 2 };
}
function bus(color: number) {
  const L = 9.6, W = 2.5, m = new Merge(), body = paint(color);
  m.box([0, 1.7, 0], [W, 2.9, L], body); m.box([0, 0.5, 0], [W + 0.02, 0.5, L - 0.2], trim());                   // body and the black skirt
  for (const sx of [-1, 1]) {
    m.box([sx * (W / 2 + 0.008), 2.15, -0.2], [0.012, 0.95, L - 1.2], glass());                                  // the window band
    for (let z = -3.6; z <= 3.7; z += 1.6) m.box([sx * (W / 2 + 0.012), 2.15, z], [0.014, 1.0, 0.07], body);     // pillars between the windows
  }
  m.box([-W / 2 - 0.01, 1.5, 2.6], [0.015, 1.9, 1.1], std(0x22303d, 0.7, 0.2)); m.box([-W / 2 - 0.01, 1.5, -1.0], [0.015, 1.9, 1.1], std(0x22303d, 0.7, 0.2));   // doors
  m.box([0, 2.25, L / 2 + 0.008], [W - 0.3, 1.2, 0.015], glass()); m.box([0, 2.95, L / 2 + 0.012], [1.6, 0.28, 0.02], std(0xffb300, 0.2, 0.3, { emissive: 0xff9800, emissiveIntensity: 0.9 }));   // windscreen and route sign
  m.box([0, 3.2, -0.5], [1.4, 0.25, 2.6], trim());                                                              // roof unit
  wheels(m, [3.2, -2.9], W / 2 - 0.12, 0.5, 0.3); lights(m, L, W, 0.95, 1.2);
  for (const sx of [-1, 1]) m.box([sx * (W / 2 + 0.2), 2.3, L / 2 - 0.4], [0.06, 0.45, 0.12], trim());          // mirrors
  return { m, siren: [] as THREE.Mesh[], hw: W / 2, seg: L / 2 - W / 2 };
}

const cache = new Map<string, THREE.Group>();
/** Build (or clone) a vehicle of this type. Police cars are built fresh because each has its own flashing lights. */
export function makeVehicle(type: VType, colorIdx = (Math.random() * PAINTS.length) | 0): Vehicle {
  const key = `${type}|${colorIdx}`, speed: [number, number] = type === 'bus' ? [8, 11] : type === 'van' || type === 'pickup' ? [9, 13] : type === 'police' ? [13, 13] : [9, 15];
  let hw = 1, seg = 1.4, siren: THREE.Mesh[] = [], group: THREE.Group;
  const spec = type === 'bus' ? { w: 1.25, s: 3.55 } : type === 'van' ? { w: 1.0, s: 1.65 } : type === 'pickup' ? { w: 1.0, s: 1.65 } : type === 'suv' ? { w: 0.98, s: 1.4 } : type === 'hatch' ? { w: 0.88, s: 1.07 } : { w: 0.93, s: 1.38 };
  hw = spec.w; seg = spec.s;
  const cached = type !== 'police' ? cache.get(key) : undefined;
  if (cached) group = cached.clone(true);
  else {
    const color = type === 'bus' ? BUS_PAINTS[colorIdx % BUS_PAINTS.length] : PAINTS[colorIdx % PAINTS.length];
    const r = type === 'bus' ? bus(color) : type === 'van' ? van(color) : type === 'pickup' ? pickup(color) : passenger(type, color);
    group = new THREE.Group(); for (const me of r.m.build()) group.add(me); siren = r.siren;
    if (type === 'police') for (const s of siren) group.add(s); else cache.set(key, group.clone(true));
  }
  return { group, type, halfWidth: hw, seg, speed, siren };
}
/** A random vehicle for the traffic, like a real city: mostly cars, a few vans, pickups and buses. */
export function randomTraffic(): VType {
  const r = Math.random() * 100;
  return r < 28 ? 'sedan' : r < 50 ? 'hatch' : r < 68 ? 'suv' : r < 78 ? 'taxi' : r < 87 ? 'van' : r < 95 ? 'pickup' : 'bus';
}
void rnd;
