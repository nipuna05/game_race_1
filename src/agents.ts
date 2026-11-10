import * as THREE from 'three';
import { K, P, R, HALF, clamp, rnd, collideWorld } from './city';
import { makeVehicle, randomTraffic } from './vehicles';

export type Kind = 'car' | 'ped' | 'police';
const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x7f8c8d, 0x8e44ad, 0xe67e22, 0x16a085, 0x2c3e50];
const PED_COLORS = [0xd35400, 0x2980b9, 0x27ae60, 0x8e44ad, 0xc0392b, 0xf39c12, 0x16a085, 0xbdc3c7];

const carBody = new THREE.BoxGeometry(2.1, 0.9, 4.4), carCab = new THREE.BoxGeometry(1.8, 0.8, 2.2), carWheels = new THREE.BoxGeometry(2.2, 0.6, 3.4);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x15171c }), glassMat = new THREE.MeshLambertMaterial({ color: 0x20303f });
const pedBody = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6), pedHead = new THREE.SphereGeometry(0.26, 8, 6);
const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48f });
const lightGeo = new THREE.BoxGeometry(0.5, 0.25, 0.4);

/** One thing that moves around the city: a car, a walking person or a police car (which can leave its lane and chase). */
export class Agent {
  /** Difficulty: how fast police chasers are, compared with normal. */
  static pol = 1;
  kind: Kind; mesh: THREE.Group;
  axis: 'x' | 'z' = 'x'; dir: 1 | -1 = 1; line = 0; pos = 0;           // lane following
  x = 0; z = 0; h = 0; speed = 0; max: number; radius: number;
  seg = 0;                                                             // half the length of the straight part of the capsule that is the vehicle's collision shape
  side: 1 | -1 = 1;                                                    // which edge of the road a pedestrian walks on
  mode: 'drive' | 'chase' = 'drive';
  down = 0;                                                            // pedestrian knocked over: seconds left
  stun = 0;                                                            // car stopped after a crash
  vx = 0; vz = 0;
  siren: THREE.Mesh[] = [];
  bustT = 0;
  free = false;                                                        // a chaser that is close drives straight at the player
  goal: { x: number; z: number } | null = null;
  constructor(kind: Kind) {
    this.kind = kind; this.mesh = new THREE.Group();
    if (kind === 'ped') {
      const m = new THREE.Mesh(pedBody, new THREE.MeshLambertMaterial({ color: PED_COLORS[(Math.random() * PED_COLORS.length) | 0] }));
      m.position.y = 0.9; const hd = new THREE.Mesh(pedHead, skin); hd.position.y = 1.72; this.mesh.add(m, hd);
      this.max = rnd(1.3, 2.2); this.radius = 0.45;
    } else {
      const v = makeVehicle(kind === 'police' ? 'police' : randomTraffic());
      this.mesh.add(v.group); this.siren = v.siren;
      this.max = rnd(v.speed[0], v.speed[1]); this.radius = v.halfWidth; this.seg = v.seg;
    }
  }
  /** Lateral distance of the lane / sidewalk line from the road centre line. */
  private lane(): number {
    if (this.kind === 'ped') return this.side * (R / 2 + 2.2);
    return (this.axis === 'x' ? this.dir : -this.dir) * R / 4;
  }
  target(): { x: number; z: number } {
    return this.axis === 'x' ? { x: this.pos, z: this.line * P + this.lane() } : { x: this.line * P + this.lane(), z: this.pos };
  }
  placeOnRoad(avoid: { x: number; z: number } | null, minDist: number) {
    for (let tries = 0; tries < 30; tries++) {
      this.axis = Math.random() < 0.5 ? 'x' : 'z'; this.dir = Math.random() < 0.5 ? 1 : -1; this.side = Math.random() < 0.5 ? 1 : -1;
      this.line = Math.floor(rnd(-K, K + 1)); this.pos = rnd(-HALF + 10, HALF - 10);
      const t = this.target();
      if (avoid && Math.hypot(t.x - avoid.x, t.z - avoid.z) < minDist) continue;
      this.x = t.x; this.z = t.z; break;
    }
    this.h = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
    this.speed = this.max * rnd(0.6, 1); this.mode = 'drive'; this.down = 0; this.stun = 0; this.bustT = 0;
    this.mesh.rotation.set(0, this.h, 0); this.mesh.position.set(this.x, 0, this.z);
  }

  /** Cars slow down for the vehicle in front of them in the same lane. */
  private gapAhead(all: Agent[]): number {
    let g = 99;
    for (const o of all) {
      if (o === this || o.kind === 'ped' || o.mode === 'chase' || o.axis !== this.axis || o.line !== this.line || o.dir !== this.dir) continue;
      const d = (o.pos - this.pos) * this.dir;
      if (d > 0 && d < g) g = d;
    }
    return g;
  }

  update(dt: number, all: Agent[], player: { x: number; z: number; speed: number }, t: number) {
    if (this.kind === 'ped') return this.updatePed(dt);
    if (this.stun > 0) { this.stun -= dt; this.speed = Math.max(0, this.speed - 20 * dt); }
    if (this.mode === 'chase') {
      if (Math.hypot(player.x - this.x, player.z - this.z) < 30) { this.free = true; return this.updateChase(dt, player, t); }
      if (this.free) { this.free = false; this.snapToRoad(); }
      this.goal = player;       // far away: follow the streets, turning towards the player at each junction
      this.speed += clamp((this.stun > 0 ? 0 : 31 * Agent.pol) - this.speed, -30 * dt, 12 * dt);
      this.advance(this.speed * dt); this.follow(dt, 9);
      const on = Math.floor(t * 8) % 2 === 0;
      (this.siren[0].material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff2222 : 0x330000); (this.siren[1].material as THREE.MeshBasicMaterial).color.setHex(on ? 0x001133 : 0x2266ff);
      return;
    }
    const gap = this.stun > 0 ? 0 : this.gapAhead(all);
    const want = gap < 11 ? Math.max(0, this.max * (gap - 5.5) / 5.5) : this.max;
    this.speed += clamp(want - this.speed, -22 * dt, 6 * dt);
    this.advance(this.speed * dt);
    this.follow(dt, 9);
    if (this.kind === 'police') { const on = Math.floor(t * 6) % 2 === 0; (this.siren[0].material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff2222 : 0x330000); (this.siren[1].material as THREE.MeshBasicMaterial).color.setHex(on ? 0x001133 : 0x2266ff); }
  }

  private updatePed(dt: number) {
    if (this.down > 0) {
      this.down -= dt; this.x += this.vx * dt; this.z += this.vz * dt; this.vx *= 0.94; this.vz *= 0.94;
      this.mesh.rotation.x = Math.min(Math.PI / 2, this.mesh.rotation.x + dt * 6); this.mesh.position.set(this.x, 0.35, this.z);
      return;
    }
    this.speed = this.max; this.advance(this.speed * dt); this.follow(dt, 10);
  }

  private updateChase(dt: number, player: { x: number; z: number; speed: number }, t: number) {
    const dx = player.x - this.x, dz = player.z - this.z, want = Math.atan2(dx, dz);
    let dh = want - this.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    this.h += clamp(dh, -2.2 * dt, 2.2 * dt);
    const dist = Math.hypot(dx, dz), top = 38 * Agent.pol;
    this.speed += clamp((this.stun > 0 ? 0 : top) - this.speed, -30 * dt, 15 * dt);
    this.x += Math.sin(this.h) * this.speed * dt; this.z += Math.cos(this.h) * this.speed * dt;
    const c = collideWorld(this, 2.1);
    if (c.hit) this.speed *= 0.82;
    void dist;
    this.mesh.rotation.y = this.h; this.mesh.position.set(this.x, 0, this.z);
    const on = Math.floor(t * 8) % 2 === 0;
    (this.siren[0].material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff2222 : 0x330000); (this.siren[1].material as THREE.MeshBasicMaterial).color.setHex(on ? 0x001133 : 0x2266ff);
  }

  /** Move along the lane; at each intersection maybe turn. */
  private advance(d: number) {
    const prev = this.pos; this.pos += d * this.dir;
    const a = Math.floor(prev / P), b = Math.floor(this.pos / P);
    if (a === b) return;
    const k = this.dir > 0 ? b : a;                  // the road line we just crossed
    const turn = Math.random() < (this.kind === 'ped' ? 0.3 : 0.35);
    const straightOk = Math.abs(k + this.dir) <= K;
    if (this.mode === 'chase' && this.goal) {
      // pick the way (straight, left or right) that ends closest to the player; never turn back
      const crossLine = this.line, cx = this.axis === 'x' ? k * P : crossLine * P, cz = this.axis === 'x' ? crossLine * P : k * P;
      const opts: { axis: 'x' | 'z'; dir: 1 | -1; d: number }[] = [];
      const tryOpt = (axis: 'x' | 'z', dir: 1 | -1) => {
        const nx = cx + (axis === 'x' ? dir * P : 0), nz = cz + (axis === 'z' ? dir * P : 0);
        if (Math.abs(nx) > K * P + 1 || Math.abs(nz) > K * P + 1) return;
        opts.push({ axis, dir, d: Math.hypot(this.goal!.x - nx, this.goal!.z - nz) });
      };
      tryOpt(this.axis, this.dir); tryOpt(this.axis === 'x' ? 'z' : 'x', 1); tryOpt(this.axis === 'x' ? 'z' : 'x', -1);
      opts.sort((p, q) => p.d - q.d);
      const o = opts[0];
      if (o && (o.axis !== this.axis)) { this.axis = o.axis; this.dir = o.dir; this.line = k; this.pos = crossLine * P; }
      else if (!o) { this.dir = (this.dir * -1) as 1 | -1; }
      return;
    }
    if (turn || !straightOk) {
      const crossLine = this.line;
      const dirs: (1 | -1)[] = [];
      if (Math.abs(crossLine + 1) <= K) dirs.push(1); if (Math.abs(crossLine - 1) <= K) dirs.push(-1);
      const nd = dirs[(Math.random() * dirs.length) | 0] ?? 1;
      this.axis = this.axis === 'x' ? 'z' : 'x'; this.line = k; this.pos = crossLine * P; this.dir = nd;
    }
  }

  private follow(dt: number, rate: number) {
    const t = this.target(), k = Math.min(1, dt * rate);
    const px = this.x, pz = this.z;
    this.x += (t.x - this.x) * k; this.z += (t.z - this.z) * k;
    const mx = this.x - px, mz = this.z - pz;
    if (mx * mx + mz * mz > 1e-6) {
      const want = Math.atan2(mx, mz); let dh = want - this.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      this.h += dh * Math.min(1, dt * 10);
    }
    this.mesh.rotation.set(0, this.h, 0); this.mesh.position.set(this.x, 0, this.z);
  }

  /** After driving free, get back onto the nearest street so lane following can continue. */
  private snapToRoad() {
    const f = { x: Math.sin(this.h), z: Math.cos(this.h) };
    if (Math.abs(f.x) > Math.abs(f.z)) { this.axis = 'x'; this.dir = f.x >= 0 ? 1 : -1; this.line = clamp(Math.round(this.z / P), -K, K); this.pos = this.x; }
    else { this.axis = 'z'; this.dir = f.z >= 0 ? 1 : -1; this.line = clamp(Math.round(this.x / P), -K, K); this.pos = this.z; }
  }

  /** Knock a pedestrian over. */
  knock(vx: number, vz: number) { this.down = 3; this.vx = vx; this.vz = vz; }
}
