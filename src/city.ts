import * as THREE from 'three';
import { TOWN_BUILDINGS, getModel } from './models';

/** The city is a grid: roads run along x = i*P and z = j*P; the blocks between them hold the buildings, ringed by a sidewalk. */
export interface MapDef {
  id: string; name: string; desc: string;
  B: number; R: number; K: number;          // block size, road width, roads run for i = -K..K
  sky: number; fog: [number, number]; ground: number; asphalt: number; pave: number; lamp: number;
  pal: [string, string, string][];          // building colour, lit window, dark window
  hMin: number; hMax: number; hDown: number; // building heights (and the downtown maximum)
  night: boolean; sun: number; hemi: number; // lighting
  grip: number; trees: 'none' | 'green' | 'snow' | 'palm'; traffic: number; roof: number;
  kit?: 'town';                              // build the blocks from downloaded building models (Kenney)
}
export const MAPS: MapDef[] = [
  { id: 'downtown', name: 'Downtown', desc: 'Sunny city with tall towers in the middle. Balanced streets.', B: 56, R: 16, K: 4, sky: 0x8fbbe8, fog: [120, 420], ground: 0x2c3a2a, asphalt: 0x2b2d33, pave: 0x6b6e75, lamp: 0xffe9a8,
    pal: [['#4a5568', '#ffe9a0', '#1d2430'], ['#6b4f43', '#ffd890', '#2a1f1c'], ['#3f5a6b', '#bfe6ff', '#18242e'], ['#5a5a66', '#fff2c0', '#22222a'], ['#6d6a52', '#ffe9a0', '#26241a'], ['#4d3f5e', '#ffd6f0', '#1f1829']],
    hMin: 10, hMax: 42, hDown: 110, night: false, sun: 1.6, hemi: 1.15, grip: 1, trees: 'green', traffic: 1, roof: 0x3a3d44 },
  { id: 'neon', name: 'Neon Night', desc: 'Dark city lit by glowing signs. Wide avenues and lots of traffic.', B: 56, R: 18, K: 4, sky: 0x0a0d1f, fog: [60, 300], ground: 0x0c1118, asphalt: 0x14161c, pave: 0x2a2d38, lamp: 0xff7be5,
    pal: [['#151a2e', '#ff4fd8', '#0a0d1a'], ['#1a1530', '#37e8ff', '#0c0a18'], ['#10202c', '#ffe14a', '#08121a'], ['#221522', '#ff6a3d', '#0e0a0e'], ['#10251c', '#5dffa0', '#08140e']],
    hMin: 14, hMax: 55, hDown: 130, night: true, sun: 0.15, hemi: 0.55, grip: 0.95, trees: 'none', traffic: 1.2, roof: 0x1b1d28 },
  { id: 'desert', name: 'Desert Highway', desc: 'Wide sandy roads and low buildings. The fastest map: long straights.', B: 64, R: 24, K: 3, sky: 0xf2cf94, fog: [160, 520], ground: 0xd6b377, asphalt: 0x4a4744, pave: 0xc9a66b, lamp: 0xfff0c0,
    pal: [['#c9a46c', '#3b5a78', '#7a5f3a'], ['#d8b98a', '#2f4d66', '#8a6c45'], ['#b88a5a', '#486a86', '#6b4e2c'], ['#e3cfa6', '#3b5a78', '#947a50']],
    hMin: 5, hMax: 16, hDown: 14, night: false, sun: 2.0, hemi: 1.25, grip: 0.92, trees: 'palm', traffic: 0.7, roof: 0xb89460 },
  { id: 'oldtown', name: 'Old Town', desc: 'Tight narrow streets at sunset. Lots of corners, so a nimble bike wins.', B: 40, R: 11, K: 5, sky: 0xf0a266, fog: [70, 280], ground: 0x3d4a2c, asphalt: 0x3a3836, pave: 0x8a7a68, lamp: 0xffcf7a,
    pal: [['#9c5a3c', '#ffd890', '#3a2218'], ['#b0774e', '#ffe0a0', '#44281c'], ['#7d4a38', '#ffcf80', '#2e1a14'], ['#c49a6c', '#ffe6b0', '#4a3524'], ['#8a6a5a', '#ffd890', '#33241c']],
    hMin: 8, hMax: 22, hDown: 28, night: false, sun: 1.2, hemi: 1.0, grip: 1, trees: 'green', traffic: 1.3, roof: 0x7a3f2c },
  { id: 'snow', name: 'Snow Village', desc: 'Icy roads. Bikes slide in corners and the brakes are weak.', B: 52, R: 16, K: 4, sky: 0xc9d8e8, fog: [70, 300], ground: 0xe8eef4, asphalt: 0x6a717c, pave: 0xdfe6ee, lamp: 0xfff1c8,
    pal: [['#8a6a52', '#ffe9a0', '#3c2c22'], ['#6f7f8f', '#ffe9a0', '#2a3440'], ['#a45a4a', '#ffe0a0', '#3d2420'], ['#7c8a70', '#fff0b0', '#2c3a2a']],
    hMin: 6, hMax: 20, hDown: 24, night: false, sun: 1.3, hemi: 1.3, grip: 0.55, trees: 'snow', traffic: 0.8, roof: 0xf4f8fc },
];

MAPS.push({ id: 'town', name: 'Toy Town', desc: 'A bright, friendly little town built from Kenney building models. Easy to read, easy to love.', B: 56, R: 16, K: 4, sky: 0x9fd8ff, fog: [150, 460], ground: 0x78c85a, asphalt: 0x4d525c, pave: 0xe9e2d2, lamp: 0xfff1c8,
  pal: [['#d9776a', '#fff3c8', '#7a3b34'], ['#6aa3d9', '#fff3c8', '#2e4a66'], ['#e0c25a', '#fff3c8', '#6a5a22']], hMin: 8, hMax: 20, hDown: 24, night: false, sun: 1.8, hemi: 1.35, grip: 1, trees: 'green', traffic: 1, roof: 0xd0d0d8, kit: 'town' });

export let B = 56, R = 16, P = B + R, SW = 4, K = 4, HALF = K * P + R / 2, GRIP = 1;
/** Switch the grid sizes to a map's. Everything that reads P, R, K, HALF sees the new values. */
export function configure(m: MapDef) { B = m.B; R = m.R; P = B + R; K = m.K; HALF = K * P + R / 2; GRIP = m.grip; }

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Which block (cell indices) a point is in, or null when it is on a road. */
export function blockAt(x: number, z: number): { i: number; j: number } | null {
  const ux = x - Math.floor(x / P) * P, uz = z - Math.floor(z / P) * P;
  if (ux < R / 2 || ux > P - R / 2 || uz < R / 2 || uz > P - R / 2) return null;
  return { i: Math.floor(x / P), j: Math.floor(z / P) };
}

/** Block i,j covers x in [i*P+R/2, (i+1)*P-R/2]. Building footprint is that shrunk by the sidewalk. */
export function footprint(i: number, j: number) {
  const x0 = i * P + R / 2 + SW, x1 = (i + 1) * P - R / 2 - SW, z0 = j * P + R / 2 + SW, z1 = (j + 1) * P - R / 2 - SW;
  return { x0, x1, z0, z1 };
}
const inCity = (i: number, j: number) => i >= -K && i < K && j >= -K && j < K;

/** Push a circle out of any building / the city edge. Returns whether it hit and the push-out direction. */
export function collideWorld(p: { x: number; z: number }, r: number): { hit: boolean; nx: number; nz: number } {
  let hit = false, nx = 0, nz = 0;
  const lim = HALF - r;
  if (p.x > lim) { p.x = lim; hit = true; nx = -1; } else if (p.x < -lim) { p.x = -lim; hit = true; nx = 1; }
  if (p.z > lim) { p.z = lim; hit = true; nz = -1; } else if (p.z < -lim) { p.z = -lim; hit = true; nz = 1; }
  const ci = Math.floor(p.x / P), cj = Math.floor(p.z / P);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    if (!inCity(ci + di, cj + dj)) continue;
    pushOut(p, r, ci + di, cj + dj, (n1, n2) => { hit = true; nx = n1; nz = n2; });
  }
  return { hit, nx, nz };
}
function pushOut(p: { x: number; z: number }, r: number, i: number, j: number, on: (nx: number, nz: number) => void) {
  const f = footprint(i, j);
  const cx = clamp(p.x, f.x0, f.x1), cz = clamp(p.z, f.z0, f.z1);
  let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-6) { const d = Math.sqrt(d2); dx /= d; dz /= d; p.x = cx + dx * r; p.z = cz + dz * r; on(dx, dz); return; }
  // centre inside the footprint: leave through the nearest side
  const l = p.x - f.x0, rr = f.x1 - p.x, t = p.z - f.z0, bt = f.z1 - p.z, m = Math.min(l, rr, t, bt);
  if (m === l) { p.x = f.x0 - r; on(-1, 0); } else if (m === rr) { p.x = f.x1 + r; on(1, 0); } else if (m === t) { p.z = f.z0 - r; on(0, -1); } else { p.z = f.z1 + r; on(0, 1); }
}

function windowTexture(base: string, lit: string, dark: string, glow: boolean): { map: THREE.CanvasTexture; emissive?: THREE.CanvasTexture } {
  const mk = () => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; return c; };
  const c = mk(), e = glow ? mk() : null, g = c.getContext('2d')!, ge = e?.getContext('2d') ?? null;
  g.fillStyle = base; g.fillRect(0, 0, 128, 128); if (ge) { ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 128); }
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const on = Math.random() < (glow ? 0.4 : 0.55);
    g.fillStyle = on ? lit : dark; g.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
    if (ge && on) { ge.fillStyle = lit; ge.fillRect(x * 32 + 6, y * 32 + 7, 20, 18); }
  }
  const tex = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: tex(c), emissive: e ? tex(e) : undefined };
}

export interface City { group: THREE.Group; /** Shows the traffic lights as they are at time t (seconds). */ update(t: number): void }

/** Traffic lights. Every intersection runs an 18-second cycle: the x-road gets green (6.5 s), amber (2 s), then red while the z-road has its turn.
 *  Neighbouring intersections start at different points of the cycle, so the whole city does not stop at once. */
export type Signal = 'g' | 'a' | 'r';
export function signalAt(axis: 'x' | 'z', i: number, j: number, t: number): Signal {
  const shift = ((((i * 5 + j * 11) % 3) + 3) % 3) * 6;
  const ph = (((t + shift + (axis === 'z' ? 9 : 0)) % 18) + 18) % 18;
  return ph < 6.5 ? 'g' : ph < 8.5 ? 'a' : 'r';
}

export function buildCity(scene: THREE.Scene, mp: MapDef): City {
  const group = new THREE.Group(); scene.add(group);
  const ext = HALF + 500;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ext * 2, ext * 2), new THREE.MeshLambertMaterial({ color: mp.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; group.add(ground);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ color: mp.asphalt }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0; group.add(asphalt);

  // lane markings
  const dash = new THREE.MeshBasicMaterial({ color: mp.night ? 0xaab4d8 : 0xe8d36a });
  const nd = (2 * K + 1) * Math.floor((HALF * 2) / 8) + 8;
  const dashesX = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.3), dash, nd), dashesZ = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 3), dash, nd);
  const m = new THREE.Matrix4(); let cx = 0;
  for (let l = -K; l <= K; l++) for (let t = -HALF + 4; t < HALF - 2 && cx < nd; t += 8) {
    const u = ((t % P) + P) % P;
    if (u < R / 2 + 1 || u > P - R / 2 - 1) continue;   // skip the intersections
    m.makeRotationX(-Math.PI / 2); m.setPosition(t, 0.03, l * P);
    dashesX.setMatrixAt(cx, m.clone()); m.makeRotationX(-Math.PI / 2); m.setPosition(l * P, 0.03, t); dashesZ.setMatrixAt(cx, m.clone()); cx++;
  }
  dashesX.count = cx; dashesZ.count = cx; group.add(dashesX, dashesZ);

  const paveMat = new THREE.MeshLambertMaterial({ color: mp.pave });
  const mats = mp.pal.map(([b, l, d]) => {
    const w = windowTexture(b, l, d, mp.night);
    return new THREE.MeshLambertMaterial(w.emissive ? { map: w.map, emissiveMap: w.emissive, emissive: 0xffffff, emissiveIntensity: 1.1 } : { map: w.map });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: mp.roof });
  const kit = mp.kit === 'town' && TOWN_BUILDINGS.every((f) => getModel(f));
  const kitCells: { type: number; x: number; z: number; s: number; sy: number; rot: number }[] = [];
  for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) {
    const f = footprint(i, j), bw = f.x1 - f.x0 + SW * 2, bd = f.z1 - f.z0 + SW * 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.4, bd), paveMat);
    slab.position.set((f.x0 + f.x1) / 2, 0.2, (f.z0 + f.z1) / 2); group.add(slab);
    const downtown = Math.hypot(i + 0.5, j + 0.5) < 2.2;
    const wx = (f.x1 - f.x0) / 2, wz = (f.z1 - f.z0) / 2;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const w = wx - 1.2, d = wz - 1.2;
      if (kit) { const s = Math.min(w, d) + 1.2; kitCells.push({ type: (Math.random() * TOWN_BUILDINGS.length) | 0, x: f.x0 + wx * (a + 0.5), z: f.z0 + wz * (b + 0.5), s, sy: s * (downtown ? rnd(1.1, 1.8) : rnd(0.85, 1.3)), rot: ((Math.random() * 4) | 0) * Math.PI / 2 }); continue; }
      const h = downtown ? rnd(mp.hMin * 2, mp.hDown) : rnd(mp.hMin, mp.hMax);
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      // scale the window texture per face so windows keep their size on every building
      for (let face = 0; face < 6; face++) {
        const fw = face < 2 ? d : w;
        for (let v = 0; v < 4; v++) { const k = face * 4 + v; if (face === 2 || face === 3) { uv.setXY(k, 0.01, 0.01); continue; } uv.setXY(k, uv.getX(k) * (fw / 8), uv.getY(k) * (h / 8)); }
      }
      const mat = mats[(Math.random() * mats.length) | 0];
      const mesh = new THREE.Mesh(geo, [mat, mat, roofMat, roofMat, mat, mat]);
      mesh.position.set(f.x0 + wx * (a + 0.5), h / 2 + 0.4, f.z0 + wz * (b + 0.5));
      group.add(mesh);
    }
  }
  // the downloaded buildings: one instanced mesh per building type
  if (kit) TOWN_BUILDINGS.forEach((file, ti) => {
    const model = getModel(file)!; model.updateMatrixWorld(true); let mesh: THREE.Mesh | null = null; model.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    const cells = kitCells.filter((k) => k.type === ti); if (!mesh || !cells.length) return;
    const src = mesh as THREE.Mesh, im = new THREE.InstancedMesh(src.geometry, src.material, cells.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    cells.forEach((k, n) => { q.setFromAxisAngle(up, k.rot); mx.compose(new THREE.Vector3(k.x, 0.4, k.z), q, new THREE.Vector3(k.s, k.sy, k.s)).multiply(src.matrixWorld); im.setMatrixAt(n, mx); });
    im.frustumCulled = false; group.add(im);
  });
  // street lights on the corners of each intersection
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x1c1f26 }), lampMat = new THREE.MeshBasicMaterial({ color: mp.lamp });
  const nLamps = (2 * K + 1) * (2 * K + 1) * 2;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), poleMat, nLamps);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(mp.night ? 0.8 : 0.5, 8, 6), lampMat, nLamps);
  let n = 0;
  for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) for (const s of [-1, 1]) {
    const x = i * P + s * (R / 2 + 1), z = j * P + s * (R / 2 + 1);
    m.makeTranslation(x, 3.5, z); poles.setMatrixAt(n, m); m.makeTranslation(x, 7.2, z); lamps.setMatrixAt(n, m); n++;
  }
  group.add(poles, lamps);

  // zebra crossings on every arm of every intersection (not on the arms that leave the city)
  const zebraMat = new THREE.MeshBasicMaterial({ color: mp.night ? 0xb9c2dc : 0xeeeee6 });
  const nZeb = (2 * K + 1) * (2 * K + 1) * 2 * 9;
  const zebX = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.8), zebraMat, nZeb), zebZ = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.8, 3), zebraMat, nZeb);
  let zx = 0, zz = 0; const zOff = R / 2 + 2.6;
  for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) for (const s of [-1, 1]) for (let q = -4; q <= 4; q++) {
    const o = q * (R - 2.4) / 9, ax = i * P + s * zOff, az = j * P + s * zOff;
    if (Math.abs(ax) < HALF - 1) { m.makeRotationX(-Math.PI / 2); m.setPosition(ax, 0.04, j * P + o); zebX.setMatrixAt(zx++, m); }
    if (Math.abs(az) < HALF - 1) { m.makeRotationX(-Math.PI / 2); m.setPosition(i * P + o, 0.04, az); zebZ.setMatrixAt(zz++, m); }
  }
  zebX.count = zx; zebZ.count = zz; zebX.frustumCulled = false; zebZ.frustumCulled = false; group.add(zebX, zebZ);

  // traffic lights: one head for each of the four approaches of every intersection, on the driver's own side just before the junction.
  // The two for the z-roads hang on the street-light poles; the two for the x-roads get a pole of their own on the other two corners.
  const nI = (2 * K + 1) * (2 * K + 1), ca = R / 2 + 1;
  const sigPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.17, 5.4, 6), poleMat, nI * 2);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 2.1, 0.5), new THREE.MeshLambertMaterial({ color: 0x14171c }), nI * 4);
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }), nI * 12);
  const sig: { axis: 'x' | 'z'; i: number; j: number }[] = [];   // one for each head; its three bulbs are red, amber, green from the top
  const sq = new THREE.Quaternion(), yUp = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), sv = new THREE.Vector3();
  let np = 0;
  for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) {
    const cx2 = i * P, cz2 = j * P;
    // road, where it stands, which way its lamps look (towards the driver coming up to the junction), and whether it needs its own pole
    const spots: ['x' | 'z', number, number, number, boolean][] = [
      ['x', cx2 - ca, cz2 + ca, -Math.PI / 2, true], ['x', cx2 + ca, cz2 - ca, Math.PI / 2, true],
      ['z', cx2 - ca, cz2 - ca, Math.PI, false], ['z', cx2 + ca, cz2 + ca, 0, false],
    ];
    for (const [axis, x, z, ang, own] of spots) {
      const hd = sig.length; sig.push({ axis, i, j });
      if (own) { m.makeTranslation(x, 2.7, z); sigPoles.setMatrixAt(np++, m); }
      sq.setFromAxisAngle(yUp, ang); const fx = Math.sin(ang), fz = Math.cos(ang);
      m.compose(sv.set(x + fx * 0.3, 4.6, z + fz * 0.3), sq, one); heads.setMatrixAt(hd, m);
      for (let b = 0; b < 3; b++) { m.compose(sv.set(x + fx * 0.58, 5.25 - b * 0.65, z + fz * 0.58), sq, one); bulbs.setMatrixAt(hd * 3 + b, m); }
    }
  }
  for (const im of [sigPoles, heads, bulbs]) im.frustumCulled = false;
  group.add(sigPoles, heads, bulbs);
  const LIT = [0xff3b30, 0xffc21a, 0x2bff7a].map((c) => new THREE.Color(c)), DIM = [0x3a1513, 0x3a2f10, 0x103a1e].map((c) => new THREE.Color(c));
  let lastKey = -1;
  const update = (t: number) => {
    const key = Math.floor(t * 4); if (key === lastKey) return; lastKey = key;   // the lights only change on half-second steps: no need to repaint every frame
    sig.forEach((s, hd) => { const st = signalAt(s.axis, s.i, s.j, t), on = st === 'r' ? 0 : st === 'a' ? 1 : 2; for (let b = 0; b < 3; b++) bulbs.setColorAt(hd * 3 + b, b === on ? LIT[b] : DIM[b]); });
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  };
  update(0);
  // trees (or palms, or snowy trees) along the sidewalks: a few at every block corner
  if (mp.trees !== 'none') {
    const palm = mp.trees === 'palm', crownCol = mp.trees === 'snow' ? 0xf2f7fb : palm ? 0x4f8a3a : 0x2f7a3a, hgt = palm ? 6 : 3;
    const nt = 8 * (2 * K) * (2 * K);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, hgt, 6), new THREE.MeshLambertMaterial({ color: 0x5b4030 }), nt);
    const crowns = new THREE.InstancedMesh(palm ? new THREE.ConeGeometry(2.6, 2.4, 7) : new THREE.SphereGeometry(2.1, 8, 6), new THREE.MeshLambertMaterial({ color: crownCol }), nt);
    let q = 0; const off = R / 2 + 1.2;
    for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) for (const sx of [0, 1]) for (const sz of [0, 1]) for (const edge of [0, 1]) {
      if (Math.random() < 0.5) continue;
      const cxp = sx ? (i + 1) * P - off : i * P + off, czp = sz ? (j + 1) * P - off : j * P + off;
      const x = cxp + (edge ? (sx ? -7 : 7) : 0), z = czp + (edge ? 0 : (sz ? -7 : 7));
      m.makeTranslation(x, hgt / 2, z); trunks.setMatrixAt(q, m); m.makeTranslation(x, hgt + (palm ? 1.2 : 1.4), z); crowns.setMatrixAt(q, m); q++;
    }
    trunks.count = q; crowns.count = q; group.add(trunks, crowns);
  }
  return { group, update };
}
