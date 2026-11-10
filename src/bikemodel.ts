import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BikeDef } from './bike';
import { fitBike } from './models';

/** Builds a detailed motorbike and rider from primitives: tyres, rims or spokes, forks, frame, engine, exhaust, tank, fairings, headlight, rider.
 *  The bike faces +z, y is up; its right side is -x. Static parts are merged into a few meshes so many bikes stay cheap to draw. */
export interface BikeMesh { root: THREE.Group; lean: THREE.Group; steer: THREE.Group; wheels: THREE.Object3D[]; arms: { r: THREE.Object3D; l: THREE.Object3D }; legs: { r: THREE.Object3D; l: THREE.Object3D }; aura: THREE.Mesh }

type Pose = 'upright' | 'tuck' | 'stand' | 'cruise' | 'semi';
interface Style {
  wb: number; wr: number; seatY: number; seatZ: number; tank: [number, number, number, number, number];   // length, height, width, y, z
  bars: 'moto' | 'clip' | 'ape' | 'scooter'; fairing: 'none' | 'full' | 'hyper' | 'scooter'; exhaust: 'side' | 'under' | 'twin' | 'high' | 'scooter';
  head: 'round' | 'angular' | 'twin'; pose: Pose; spokes: boolean; tireW: number; eng: number; fender: 'short' | 'high' | 'full'; gold?: boolean; stripe?: boolean; neon?: number; plate?: boolean;
}
const STYLES: Record<string, Style> = {
  scooter: { wb: 1.1, wr: 0.26, seatY: 0.78, seatZ: -0.25, tank: [0, 0, 0, 0, 0], bars: 'scooter', fairing: 'scooter', exhaust: 'scooter', head: 'round', pose: 'upright', spokes: false, tireW: 0.09, eng: 0.6, fender: 'full' },
  street: { wb: 1.45, wr: 0.34, seatY: 0.84, seatZ: -0.2, tank: [0.55, 0.26, 0.3, 1.05, 0.2], bars: 'moto', fairing: 'none', exhaust: 'side', head: 'round', pose: 'upright', spokes: false, tireW: 0.1, eng: 1, fender: 'short' },
  dirt: { wb: 1.5, wr: 0.4, seatY: 1.04, seatZ: -0.25, tank: [0.5, 0.24, 0.26, 1.22, 0.18], bars: 'moto', fairing: 'none', exhaust: 'high', head: 'angular', pose: 'stand', spokes: true, tireW: 0.1, eng: 0.8, fender: 'high', gold: true, plate: true },
  sport: { wb: 1.4, wr: 0.33, seatY: 0.84, seatZ: -0.28, tank: [0.55, 0.24, 0.28, 1.02, 0.12], bars: 'clip', fairing: 'full', exhaust: 'under', head: 'angular', pose: 'tuck', spokes: false, tireW: 0.12, eng: 1, fender: 'short', stripe: true },
  classic: { wb: 1.5, wr: 0.35, seatY: 0.86, seatZ: -0.3, tank: [0.55, 0.3, 0.32, 1.06, 0.15], bars: 'clip', fairing: 'none', exhaust: 'twin', head: 'round', pose: 'semi', spokes: true, tireW: 0.1, eng: 1, fender: 'short', stripe: true },
  super: { wb: 1.45, wr: 0.34, seatY: 0.86, seatZ: -0.3, tank: [0.6, 0.26, 0.3, 1.04, 0.1], bars: 'clip', fairing: 'full', exhaust: 'under', head: 'twin', pose: 'tuck', spokes: false, tireW: 0.14, eng: 1.2, fender: 'short', stripe: true },
  cruiser: { wb: 1.78, wr: 0.36, seatY: 0.66, seatZ: -0.25, tank: [0.62, 0.36, 0.44, 0.94, 0.2], bars: 'ape', fairing: 'none', exhaust: 'twin', head: 'round', pose: 'cruise', spokes: true, tireW: 0.13, eng: 1.4, fender: 'full' },
  hyper: { wb: 1.5, wr: 0.34, seatY: 0.88, seatZ: -0.32, tank: [0.6, 0.26, 0.3, 1.06, 0.08], bars: 'clip', fairing: 'hyper', exhaust: 'under', head: 'angular', pose: 'tuck', spokes: false, tireW: 0.15, eng: 1.3, fender: 'short', neon: 0x9b59ff },
};

/** Rider position for bikes that use a downloaded model whose seat is not where the built-in bike's is. */
const MODEL_STYLES: Record<string, Style> = { dirt: { ...STYLES.dirt, seatY: 0.8, seatZ: -0.2, pose: 'semi', wr: 0.34, fender: 'short' } };
STYLES.vespa = STYLES.scooter;   // the Vespa is built like the scooter (rider position)

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function std(color: number, metal = 0.1, rough = 0.6, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${metal}|${rough}|${JSON.stringify(extra)}`; let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra }); matCache.set(key, m); }
  return m;
}
const CHROME = () => std(0xd8dce2, 1, 0.18), BLACK = () => std(0x15171b, 0.4, 0.5), RUBBER = () => std(0x0e0e10, 0, 0.95), ALLOY = () => std(0xa9afb8, 0.9, 0.3), ENGINE = () => std(0x4a4f57, 0.8, 0.4), GOLD = () => std(0xd4a017, 1, 0.25);

/** Collects geometry placed in bike space, then merges it into one mesh per material. */
class Merge {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, m: THREE.Material, mx: THREE.Matrix4) { const c = g.clone(); c.applyMatrix4(mx); (this.parts.get(m) ?? this.parts.set(m, []).get(m)!).push(c); }
  ell(c: [number, number, number], r: [number, number, number], m: THREE.Material, rot: [number, number, number] = [0, 0, 0]) { this.add(new THREE.SphereGeometry(1, 14, 10), m, compose(c, r, rot)); }
  box(c: [number, number, number], s: [number, number, number], m: THREE.Material, rot: [number, number, number] = [0, 0, 0]) { this.add(new THREE.BoxGeometry(1, 1, 1), m, compose(c, s, rot)); }
  seg(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, radial = 8) {
    const d = b.clone().sub(a), len = d.length(); if (len < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.add(new THREE.CylinderGeometry(r, r, 1, radial), m, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1)));
  }
  build(): THREE.Mesh[] { const out: THREE.Mesh[] = []; for (const [m, gs] of this.parts) out.push(new THREE.Mesh(mergeGeometries(gs, false)!, m)); return out; }
}
function compose(p: [number, number, number], s: [number, number, number], r: [number, number, number]) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function wheel(R: number, tireW: number, spokes: boolean, rimMat: THREE.Material): THREE.Group {
  const g = new THREE.Group(), tube = tireW * 0.5 + 0.02;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - tube, tube, 10, 28), RUBBER()); tyre.rotation.y = Math.PI / 2; tyre.scale.set(1, 1, tireW / tube * 0.9); g.add(tyre);
  const rimR = R - tube * 1.6, m = new Merge();
  m.add(new THREE.TorusGeometry(rimR, 0.014, 6, 24), rimMat, compose([0, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0]));
  m.add(new THREE.CylinderGeometry(0.05, 0.05, tireW * 0.9, 10), CHROME(), compose([0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
  if (spokes) for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; m.seg(V(0, 0, 0), V(0, Math.cos(a) * rimR, Math.sin(a) * rimR), 0.004, CHROME(), 4); }
  else { m.add(new THREE.CylinderGeometry(rimR, rimR, tireW * 0.5, 22), rimMat, compose([0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; m.seg(V(tireW * 0.3, 0, 0), V(tireW * 0.3, Math.cos(a) * rimR * 0.9, Math.sin(a) * rimR * 0.9), 0.02, BLACK(), 5); } }
  m.add(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.012, 20), ALLOY(), compose([tireW * 0.55, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
  for (const me of m.build()) g.add(me);
  return g;
}

function limb(origin: THREE.Vector3, pts: THREE.Vector3[], radii: number[], mats: THREE.Material[]): THREE.Group {
  const g = new THREE.Group(); g.position.copy(origin); const m = new Merge();
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i].clone().sub(origin), b = pts[i + 1].clone().sub(origin); m.seg(a, b, radii[i], mats[i], 8);
    m.ell([b.x, b.y, b.z], [radii[i] * 1.15, radii[i] * 1.15, radii[i] * 1.15], mats[i]);
  }
  for (const me of m.build()) g.add(me);
  return g;
}

export function makeBikeMesh(color: number, def: BikeDef): BikeMesh {
  const glb = fitBike(def.id, color), st = (glb && MODEL_STYLES[def.id]) || STYLES[def.id] || STYLES.street, root = new THREE.Group(), lean = new THREE.Group(); root.add(lean);
  const body = std(color, 0.55, 0.28, { envMapIntensity: 1.2 }), dark = std(new THREE.Color(color).multiplyScalar(0.45).getHex(), 0.5, 0.4);
  const fixed = new Merge(), steerM = new Merge();
  const hz = st.wb / 2, axleF = V(0, st.wr, hz), axleR = V(0, st.wr, -hz);
  const headY = st.seatY + 0.24, headZ = hz - 0.36, head = V(0, headY, headZ);
  const forkDir = head.clone().sub(axleF).normalize(), forkTop = head.clone().add(forkDir.clone().multiplyScalar(0.14));
  const forkMat = st.gold ? GOLD() : CHROME();

  // ---- steering assembly: front wheel, fork, bars, front fender, headlight (turns with the bars)
  const steer = new THREE.Group(); steer.position.copy(head);
  const off = (v: THREE.Vector3) => v.clone().sub(head);
  const front = wheel(st.wr, st.tireW, st.spokes, st.spokes ? CHROME() : ALLOY()); front.position.copy(off(axleF)); steer.add(front);
  for (const sx of [-1, 1]) {
    const a = off(axleF).add(V(sx * 0.1, 0, 0)), t = off(forkTop).add(V(sx * 0.1, 0, 0));
    steerM.seg(a, a.clone().lerp(t, 0.45), 0.024, forkMat, 8); steerM.seg(a.clone().lerp(t, 0.42), t, 0.034, st.gold ? BLACK() : dark, 8);
  }
  steerM.box([0, off(forkTop).y, off(forkTop).z], [0.26, 0.04, 0.06], BLACK());
  const bt = off(forkTop).add(V(0, 0.05, -0.06));
  let hw = 0.36, by = bt.y, bz = bt.z;
  if (st.bars === 'clip') { hw = 0.22; by -= 0.06; bz += 0.05; steerM.seg(V(-hw, by, bz), V(-0.1, by + 0.05, bz - 0.08), 0.017, BLACK()); steerM.seg(V(hw, by, bz), V(0.1, by + 0.05, bz - 0.08), 0.017, BLACK()); }
  else if (st.bars === 'ape') { hw = 0.52; by += 0.34; for (const sx of [-1, 1]) { steerM.seg(V(sx * 0.1, bt.y, bt.z), V(sx * 0.16, by, bz), 0.02, CHROME()); steerM.seg(V(sx * 0.16, by, bz), V(sx * hw, by - 0.04, bz + 0.08), 0.02, CHROME()); } bz += 0.08; by -= 0.04; }
  else if (st.bars === 'scooter') { hw = 0.3; by += 0.26; steerM.seg(V(0, bt.y - 0.2, bt.z), V(0, by, bz), 0.035, BLACK()); steerM.seg(V(-hw, by, bz), V(hw, by, bz), 0.02, BLACK()); }
  else { steerM.seg(V(-hw, by, bz), V(hw, by, bz), 0.02, BLACK()); if (st.gold) steerM.seg(V(-0.2, by, bz), V(0.2, by + 0.02, bz), 0.025, BLACK()); }
  for (const sx of [-1, 1]) steerM.seg(V(sx * hw, by, bz), V(sx * (hw + 0.1), by, bz), 0.03, std(0x0a0a0a, 0, 0.9));   // grips
  // mirrors
  if (st.fairing === 'none' || st.fairing === 'scooter') for (const sx of [-1, 1]) { steerM.seg(V(sx * (hw - 0.02), by, bz), V(sx * (hw + 0.05), by + 0.2, bz - 0.04), 0.006, BLACK(), 4); steerM.ell([sx * (hw + 0.06), by + 0.22, bz - 0.04], [0.05, 0.035, 0.012], CHROME()); }
  // front fender
  { const R2 = st.wr + 0.05, fm = st.fender === 'high' ? 0.35 : 0.0;
    const fg = new THREE.CylinderGeometry(R2, R2, 0.13, 20, 1, true, Math.PI * (st.fender === 'full' ? 0.05 : 0.15), Math.PI * (st.fender === 'full' ? 0.85 : 0.6));
    steerM.add(fg, std(color, 0.4, 0.4, { side: THREE.DoubleSide }), compose([0, off(axleF).y + fm * 0.4, off(axleF).z], [1, 1, 1], [0, 0, Math.PI / 2]));
    if (st.fender === 'high') steerM.box([0, off(axleF).y + 0.5, off(axleF).z + 0.28], [0.12, 0.03, 0.36], std(color, 0.4, 0.4), [0.5, 0, 0]); }
  // headlight
  const lens = std(0xfff4cf, 0.2, 0.1, { emissive: 0xfff0c0, emissiveIntensity: 0.9 });
  const hl = off(forkTop).add(V(0, 0.04, 0.14));
  if (st.fairing === 'none' || st.fairing === 'scooter') {
    if (st.head === 'angular') { steerM.box([0, hl.y, hl.z + 0.02], [0.2, 0.16, 0.1], BLACK(), [-0.2, 0, 0]); steerM.box([0, hl.y, hl.z + 0.08], [0.15, 0.11, 0.02], lens); }
    else { steerM.ell([0, hl.y, hl.z], [0.13, 0.13, 0.11], CHROME()); steerM.ell([0, hl.y, hl.z + 0.07], [0.1, 0.1, 0.05], lens); }
  }
  for (const me of steerM.build()) steer.add(me);   // everything above is already relative to the head tube
  lean.add(steer);

  // ---- frame, engine, swingarm, rear wheel
  const rear = wheel(st.wr, st.tireW + 0.03, st.spokes, st.spokes ? CHROME() : ALLOY()); rear.position.copy(axleR); lean.add(rear);
  const seatTop = V(0, st.seatY, st.seatZ);
  if (st.fairing !== 'scooter') {
    fixed.seg(head.clone().add(V(0, -0.04, -0.02)), V(0, st.seatY - 0.04, st.seatZ + 0.05), 0.04, BLACK());                 // spine
    fixed.seg(head, V(0, 0.34, -0.05), 0.035, BLACK());                                                                      // down tube
    fixed.seg(V(0, 0.34, -0.05), V(0, st.seatY - 0.1, st.seatZ - 0.02), 0.03, BLACK());
    for (const sx of [-1, 1]) {
      fixed.seg(V(sx * 0.11, 0.42, -0.22), axleR.clone().add(V(sx * 0.1, 0, 0)), 0.026, std(0xb6bcc6, 0.9, 0.3));            // swingarm
      fixed.seg(V(sx * 0.1, st.seatY - 0.12, st.seatZ - 0.05), axleR.clone().add(V(sx * 0.1, 0.05, 0)), 0.018, BLACK());       // subframe
      fixed.box([sx * 0.16, st.wr * 0.9, st.seatZ + 0.05], [0.025, 0.045, 0.2], ALLOY(), [0, 0, 0]);                              // footpeg plate
    }
    fixed.seg(V(0, 0.5, -0.24), V(0, st.seatY - 0.08, st.seatZ - 0.02), 0.022, std(0xc0392b, 0.5, 0.4));                       // rear shock
    // engine
    const e = st.eng;
    fixed.ell([0, 0.44, 0.02], [0.16 * Math.min(e, 1.2), 0.17, 0.3], ENGINE());
    fixed.box([0, 0.66, 0.2], [0.2 * Math.min(e, 1.3), 0.22 * Math.min(e, 1.2), 0.2], ENGINE(), [-0.5, 0, 0]);
    for (let i = 0; i < 4; i++) fixed.box([0, 0.55 + i * 0.045, 0.17 + i * 0.015], [0.24 * Math.min(e, 1.3), 0.012, 0.2], std(0x2b2f35, 0.7, 0.4), [-0.5, 0, 0]);   // cooling fins
    if (st.fairing !== 'full' && st.fairing !== 'hyper') fixed.box([0, 0.7, -0.02], [0.18, 0.12, 0.16], ENGINE());
  } else {
    // scooter: floorboard, engine pod, swing arm
    fixed.box([0, 0.3, 0.1], [0.4, 0.05, 0.6], std(0x2a2d33, 0.3, 0.6)); fixed.ell([0, 0.42, -0.35], [0.18, 0.2, 0.34], ENGINE());
    fixed.seg(V(0, 0.45, -0.3), axleR, 0.04, BLACK());
  }
  // exhaust
  const ex = st.exhaust, pipe = CHROME();
  if (ex === 'side' || ex === 'twin' || ex === 'high') for (const sx of ex === 'side' ? [-1] : [-1, 1]) {
    const x = sx * 0.2, top = ex === 'high' ? 0.95 : 0.3;
    fixed.seg(V(sx * 0.07, 0.62, 0.3), V(x, 0.3, 0.2), 0.022, pipe, 8); fixed.seg(V(x, 0.3, 0.2), V(x, ex === 'high' ? 0.8 : 0.34, -0.5), 0.045, ex === 'high' ? std(0x3a3d44, 0.8, 0.3) : pipe, 10);
    if (ex === 'high') fixed.seg(V(x, 0.8, -0.5), V(x, 0.95, -0.82), 0.05, ALLOY()); else fixed.seg(V(x, 0.34, -0.5), V(x, top + 0.06, -st.wb / 2 - 0.1), 0.055, pipe, 10);
  } else if (ex === 'under') { fixed.seg(V(0.1, 0.34, 0.2), V(0.16, 0.34, -0.55), 0.05, ENGINE(), 10); fixed.seg(V(0.16, 0.38, -0.55), V(0.2, 0.55, -st.wb / 2 - 0.1), 0.065, std(0x2c3036, 0.9, 0.3), 10); fixed.seg(V(0.2, 0.55, -st.wb / 2 - 0.1), V(0.2, 0.55, -st.wb / 2 - 0.16), 0.05, std(0xe3b04b, 1, 0.3), 10); }
  else { fixed.seg(V(0.14, 0.33, -0.3), V(0.17, 0.4, -st.wb / 2 - 0.05), 0.06, pipe, 10); }

  // ---- bodywork
  const [tl, th, tw, ty, tz] = st.tank, bodyM = body;
  if (st.fairing === 'scooter') {
    fixed.ell([0, 0.62, hz - 0.28], [0.26, 0.38, 0.12], bodyM, [-0.35, 0, 0]);                         // leg shield
    fixed.box([0, 0.3, 0.1], [0.34, 0.07, 0.55], bodyM);                                                  // floor
    fixed.ell([0, 0.56, -0.38], [0.24, 0.3, 0.5], bodyM);                                                 // rear body
    fixed.box([0, st.seatY - 0.04, st.seatZ - 0.05], [0.28, 0.08, 0.55], std(0x1a1a1c, 0, 0.8));          // seat
    fixed.ell([0, 0.7, -hz - 0.0], [0.08, 0.06, 0.04], std(0xff2a2a, 0.2, 0.3, { emissive: 0xff1111, emissiveIntensity: 0.9 }));
    fixed.box([0, 0.95, -0.3], [0.3, 0.22, 0.3], std(0x1a1a1c, 0.2, 0.6));                                // top box
  } else {
    fixed.ell([0, ty, tz], [tw / 2, th / 2, tl / 2], bodyM);                                               // tank
    if (st.stripe) fixed.ell([0, ty + th * 0.35, tz], [0.03, th / 2, tl / 2 + 0.01], std(0xf2f2f2, 0.3, 0.4));
    fixed.ell([0, st.seatY, st.seatZ - 0.02], [0.17, 0.07, 0.42], std(0x1a1a1c, 0, 0.85));               // seat
    if (st.fairing === 'none') { fixed.ell([0, st.seatY + 0.02, st.seatZ - 0.5], [0.12, 0.06, 0.2], bodyM); }
    if (st.pose === 'tuck' || st.pose === 'semi') fixed.ell([0, st.seatY + 0.07, st.seatZ - 0.42], [0.15, 0.09, 0.26], bodyM);   // seat hump / tail
    if (st.plate) fixed.box([0, st.seatY + 0.14, -hz + 0.05], [0.2, 0.2, 0.02], std(0xf5f5f5, 0, 0.6), [0.3, 0, 0]);
    // tail light + number plate
    fixed.box([0, st.seatY - 0.02, -hz - 0.14], [0.14, 0.04, 0.02], std(0xff2a2a, 0.2, 0.3, { emissive: 0xff1111, emissiveIntensity: 1.0 }));
    // rear fender
    const R2 = st.wr + 0.05; fixed.add(new THREE.CylinderGeometry(R2, R2, 0.16, 18, 1, true, Math.PI * (st.fender === 'full' ? 0.3 : 0.45), Math.PI * (st.fender === 'full' ? 0.7 : 0.5)), std(color, 0.4, 0.4, { side: THREE.DoubleSide }), compose([0, st.wr, -hz], [1, 1, 1], [0, 0, Math.PI / 2]));
  }
  if (st.fairing === 'full' || st.fairing === 'hyper') {
    const fy = headY - 0.1, fz = headZ + 0.2;
    fixed.ell([0, fy, fz], [0.2, 0.2, 0.36], bodyM, [-0.2, 0, 0]);                                       // nose
    for (const sx of [-1, 1]) {
      fixed.ell([sx * 0.2, fy - 0.15, fz - 0.4], [0.07, 0.26, 0.44], bodyM, [0, 0, sx * 0.1]);          // side panels
      if (st.fairing === 'hyper') { fixed.box([sx * 0.34, fy - 0.05, fz - 0.15], [0.26, 0.02, 0.14], std(0x1b1d22, 0.6, 0.3), [0, sx * 0.3, 0]); }   // winglets
    }
    fixed.ell([0, 0.34, 0.0], [0.2, 0.1, 0.5], dark);                                                       // belly pan
    fixed.box([0, fy + 0.26, fz - 0.14], [0.26, 0.2, 0.02], std(0x8fb4d0, 0.1, 0.1, { transparent: true, opacity: 0.45 }), [-0.9, 0, 0]);   // windscreen
    fixed.ell([0, st.seatY + 0.05, -hz + 0.05], [0.18, 0.13, 0.4], bodyM);                                  // tail unit
    const hlz = fz + 0.3, hly = fy + 0.0;
    if (st.head === 'twin') for (const sx of [-1, 1]) fixed.ell([sx * 0.09, hly, hlz], [0.08, 0.06, 0.04], lens); else fixed.box([0, hly, hlz], [0.2, 0.05, 0.03], lens);
    if (st.fairing === 'hyper') { for (const sx of [-1, 1]) fixed.box([sx * 0.215, fy - 0.1, fz - 0.4], [0.012, 0.03, 0.7], std(st.neon ?? 0x9b59ff, 0, 0.3, { emissive: st.neon ?? 0x9b59ff, emissiveIntensity: 1.5 })); }
  }
  const bodyParts: THREE.Object3D[] = [steer, rear];
  for (const me of fixed.build()) { lean.add(me); bodyParts.push(me); }

  // ---- rider
  const suit = std(0x23262d, 0.1, 0.6), leather = std(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.1).getHex(), 0.1, 0.55), helmet = std(def.id === 'hyper' ? 0x1a1a22 : 0xf4f4f6, 0.3, 0.25), visor = std(0x0a0c12, 0.9, 0.1), glove = std(0x101012, 0, 0.7);
  const tilt = { upright: 0.2, tuck: 1.08, stand: 0.6, cruise: -0.12, semi: 0.62 }[st.pose];
  const hip = V(0, st.seatY + (st.pose === 'stand' ? 0.34 : 0.14), st.seatZ + 0.02), td = V(0, Math.cos(tilt), Math.sin(tilt));
  const shoulderC = hip.clone().add(td.clone().multiplyScalar(0.52)), rid = new Merge();
  rid.seg(hip, shoulderC, 0.14, leather, 10); rid.ell([hip.x, hip.y, hip.z], [0.15, 0.13, 0.15], suit); rid.ell([shoulderC.x, shoulderC.y, shoulderC.z], [0.2, 0.1, 0.12], leather);
  const hc = shoulderC.clone().add(td.clone().multiplyScalar(0.27)).add(V(0, 0, 0.04));
  rid.ell([hc.x, hc.y, hc.z], [0.14, 0.16, 0.18], helmet); rid.ell([hc.x, hc.y - 0.01, hc.z + 0.08], [0.115, 0.07, 0.11], visor);
  if (st.pose !== 'cruise') rid.ell([hc.x, hc.y + 0.08, hc.z - 0.1], [0.035, 0.03, 0.12], std(color, 0.3, 0.4)); // helmet stripe
  for (const me of rid.build()) lean.add(me);
  const pegY = { upright: 0.3, tuck: 0.46, stand: 0.4, cruise: 0.28, semi: 0.4 }[st.pose], pegZ = { upright: -0.02, tuck: -0.22, stand: -0.08, cruise: 0.42, semi: -0.14 }[st.pose];
  const mkArm = (sx: number) => {
    const sh = V(sx * 0.2, shoulderC.y, shoulderC.z), hand = V(sx * hw, by + head.y, bz + head.z), el = sh.clone().lerp(hand, 0.5).add(V(sx * 0.1, -0.08, -0.02));
    return limb(sh, [sh, el, hand], [0.055, 0.05], [leather, leather]);
  };
  const mkLeg = (sx: number) => {
    const hp = V(sx * 0.14, hip.y - 0.02, hip.z + 0.02), foot = V(sx * 0.2, pegY, pegZ), kn = hp.clone().lerp(foot, 0.5).add(V(sx * 0.1, 0.1, 0.22));
    return limb(hp, [hp, kn, foot, foot.clone().add(V(0, 0, 0.13))], [0.075, 0.06, 0.05], [suit, suit, std(0x0b0b0d, 0, 0.8)]);
  };
  const arms = { r: mkArm(-1), l: mkArm(1) }, legs = { r: mkLeg(-1), l: mkLeg(1) };
  lean.add(arms.r, arms.l, legs.r, legs.l);
  // grips follow the steering: put the hands' bars in the steer group already (arms are static, the small steer angle hides the gap)

  // a downloaded model (when available) replaces the built-in frame, wheels and bodywork; the rider stays
  if (glb) { for (const p of bodyParts) lean.remove(p); lean.add(glb); }

  // soft shadow under the bike, and the power-up aura
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, st.wb + 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; root.add(sh);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(1.9, 14, 10), new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.22, depthWrite: false }));
  aura.position.y = 1.1; aura.visible = false; root.add(aura);
  return { root, lean, steer, wheels: glb ? [] : [front, rear], arms, legs, aura };
}
