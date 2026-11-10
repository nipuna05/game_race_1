import * as THREE from 'three';

/** The city is a grid: roads run along x = i*P and z = j*P; the blocks between them hold the buildings, ringed by a sidewalk. */
export const B = 56;            // block size
export const R = 16;            // road width
export const P = B + R;         // pitch: distance between road centre lines
export const SW = 4;            // sidewalk width inside each block
export const K = 4;             // roads run for i = -K..K  => 9 roads each way
export const HALF = K * P + R / 2;   // the city's half extent

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const gridPos = (i: number) => i * P;

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

/** Push a circle out of any building / the city edge. Returns the push-out vector (0,0 if free) and how hard it hit. */
export function collideWorld(p: { x: number; z: number }, r: number): { hit: boolean; nx: number; nz: number } {
  let hit = false, nx = 0, nz = 0;
  // the city edge is a wall
  const lim = HALF - r;
  if (p.x > lim) { p.x = lim; hit = true; nx = -1; } else if (p.x < -lim) { p.x = -lim; hit = true; nx = 1; }
  if (p.z > lim) { p.z = lim; hit = true; nz = -1; } else if (p.z < -lim) { p.z = -lim; hit = true; nz = 1; }
  const b = blockAt(p.x, p.z);
  if (!b || !inCity(b.i, b.j)) {
    // the circle's edge may still touch a block next to us: test the neighbouring blocks too
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const ci = Math.floor(p.x / P) + di, cj = Math.floor(p.z / P) + dj;
      if (!inCity(ci, cj)) continue;
      pushOut(p, r, ci, cj, (n1, n2) => { hit = true; nx = n1; nz = n2; });
    }
    return { hit, nx, nz };
  }
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const ci = b.i + di, cj = b.j + dj;
    if (!inCity(ci, cj)) continue;
    pushOut(p, r, ci, cj, (n1, n2) => { hit = true; nx = n1; nz = n2; });
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

function windowTexture(base: string, lit: string, dark: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = Math.random() < 0.55 ? lit : dark;
    g.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export interface City { group: THREE.Group; towers: THREE.Mesh[] }

export function buildCity(scene: THREE.Scene): City {
  const group = new THREE.Group(); scene.add(group);
  const ext = HALF + 400;
  // ground: grass outside, asphalt for the whole grid, then blocks drawn over
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ext * 2, ext * 2), new THREE.MeshLambertMaterial({ color: 0x2c3a2a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; group.add(ground);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ color: 0x2b2d33 }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0; group.add(asphalt);

  // lane markings: one dashed strip per road line
  const dash = new THREE.MeshBasicMaterial({ color: 0xe8d36a });
  const dashGeoX = new THREE.PlaneGeometry(3, 0.3), dashGeoZ = new THREE.PlaneGeometry(0.3, 3);
  const nd = (2 * K + 1) * Math.floor((HALF * 2) / 8);
  const dashesX = new THREE.InstancedMesh(dashGeoX, dash, nd), dashesZ = new THREE.InstancedMesh(dashGeoZ, dash, nd);
  const m = new THREE.Matrix4(); let cx = 0;
  for (let l = -K; l <= K; l++) for (let t = -HALF + 4; t < HALF - 2 && cx < nd; t += 8) {
    const u = ((t % P) + P) % P;
    if (u < R / 2 + 1 || u > P - R / 2 - 1) continue;   // skip the intersections
    m.makeRotationX(-Math.PI / 2); m.setPosition(t, 0.03, l * P);
    dashesX.setMatrixAt(cx, m.clone()); m.makeRotationX(-Math.PI / 2); m.setPosition(l * P, 0.03, t); dashesZ.setMatrixAt(cx, m.clone()); cx++;
  }
  dashesX.count = cx; dashesZ.count = cx; group.add(dashesX, dashesZ);

  // blocks: pavement slab + 4 buildings (2x2) of random height / colour
  const paveMat = new THREE.MeshLambertMaterial({ color: 0x6b6e75 });
  const palettes: [string, string, string][] = [['#4a5568', '#ffe9a0', '#1d2430'], ['#6b4f43', '#ffd890', '#2a1f1c'], ['#3f5a6b', '#bfe6ff', '#18242e'], ['#5a5a66', '#fff2c0', '#22222a'], ['#6d6a52', '#ffe9a0', '#26241a'], ['#4d3f5e', '#ffd6f0', '#1f1829']];
  const mats = palettes.map(([b, l, d]) => new THREE.MeshLambertMaterial({ map: windowTexture(b, l, d) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  const towers: THREE.Mesh[] = [];
  for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) {
    const f = footprint(i, j), bw = f.x1 - f.x0 + SW * 2, bd = f.z1 - f.z0 + SW * 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.4, bd), paveMat);
    slab.position.set((f.x0 + f.x1) / 2, 0.2, (f.z0 + f.z1) / 2); group.add(slab);
    const downtown = Math.hypot(i + 0.5, j + 0.5) < 2.2;
    const wx = (f.x1 - f.x0) / 2, wz = (f.z1 - f.z0) / 2;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const w = wx - 1.2, d = wz - 1.2;
      const h = downtown ? rnd(40, 110) : rnd(10, 42);
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      // scale the window texture per face so windows keep their size on every building
      for (let face = 0; face < 6; face++) {
        const fw = face < 2 ? d : face < 4 ? w : face < 6 ? w : w;
        for (let v = 0; v < 4; v++) { const k = face * 4 + v; if (face === 2 || face === 3) { uv.setXY(k, 0.01, 0.01); continue; } uv.setXY(k, uv.getX(k) * (fw / 8), uv.getY(k) * (h / 8)); }
      }
      const mat = mats[(Math.random() * mats.length) | 0];
      const mesh = new THREE.Mesh(geo, [mat, mat, roofMat, roofMat, mat, mat]);
      mesh.position.set(f.x0 + wx * (a + 0.5), h / 2 + 0.4, f.z0 + wz * (b + 0.5));
      group.add(mesh); if (h > 60) towers.push(mesh);
    }
  }
  // street lights on the corners of each intersection
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x1c1f26 }), lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const nLamps = (2 * K + 1) * (2 * K + 1) * 2;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), poleMat, nLamps);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), lampMat, nLamps);
  let n = 0;
  for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) for (const s of [-1, 1]) {
    const x = i * P + s * (R / 2 + 1), z = j * P + s * (R / 2 + 1);
    m.makeTranslation(x, 3.5, z); poles.setMatrixAt(n, m); m.makeTranslation(x, 7.2, z); lamps.setMatrixAt(n, m); n++;
  }
  group.add(poles, lamps);
  return { group, towers };
}
