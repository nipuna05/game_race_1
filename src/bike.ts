import * as THREE from 'three';
import { clamp, collideWorld } from './city';

export interface Input { throttle: number; steer: number; hand: boolean; boost: boolean }
export const MAX_SPEED = 40, BOOST_SPEED = 56;

const frame = new THREE.MeshLambertMaterial({ color: 0x23272e }), tyre = new THREE.MeshLambertMaterial({ color: 0x0c0d10 });
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 14);
const bodyGeo = new THREE.BoxGeometry(0.34, 0.45, 1.5), tankGeo = new THREE.BoxGeometry(0.4, 0.32, 0.6), torsoGeo = new THREE.BoxGeometry(0.46, 0.7, 0.3), headGeo = new THREE.SphereGeometry(0.24, 10, 8);
const armGeo = new THREE.BoxGeometry(0.12, 0.12, 0.55), legGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);

export function makeBikeMesh(color: number): { root: THREE.Group; lean: THREE.Group; wheels: THREE.Mesh[] } {
  const root = new THREE.Group(), lean = new THREE.Group(); root.add(lean);
  const wheels: THREE.Mesh[] = [];
  for (const z of [0.85, -0.85]) { const w = new THREE.Mesh(wheelGeo, tyre); w.rotation.z = Math.PI / 2; w.position.set(0, 0.42, z); lean.add(w); wheels.push(w); }
  const col = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, frame); body.position.set(0, 0.7, 0); lean.add(body);
  const tank = new THREE.Mesh(tankGeo, col); tank.position.set(0, 1.0, 0.25); lean.add(tank);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.7), col); tail.position.set(0, 0.95, -0.55); lean.add(tail);
  const torso = new THREE.Mesh(torsoGeo, col); torso.position.set(0, 1.55, -0.15); torso.rotation.x = 0.35; lean.add(torso);
  const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })); head.position.set(0, 2.05, 0.05); lean.add(head);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, col); arm.position.set(s * 0.3, 1.5, 0.35); arm.rotation.x = 0.4; lean.add(arm);
    const leg = new THREE.Mesh(legGeo, frame); leg.position.set(s * 0.26, 0.85, -0.1); lean.add(leg);
  }
  return { root, lean, wheels };
}

export class Bike {
  x = 0; z = 0; h = 0; speed = 0; lat = 0; boostLeft = 1; leanAngle = 0; boosting = false;
  mesh: ReturnType<typeof makeBikeMesh>; crash = 0;
  skill = 1;
  constructor(color: number) { this.mesh = makeBikeMesh(color); }
  get fwd() { return { x: Math.sin(this.h), z: Math.cos(this.h) }; }

  /** Moves the bike. Returns the impact strength when it hits something solid (0 otherwise). */
  step(inp: Input, dt: number): number {
    this.boosting = inp.boost && this.boostLeft > 0.02 && inp.throttle > 0;
    if (this.boosting) this.boostLeft = Math.max(0, this.boostLeft - dt * 0.28); else this.boostLeft = Math.min(1, this.boostLeft + dt * 0.07);
    const top = (this.boosting ? BOOST_SPEED : MAX_SPEED) * this.skill;
    if (inp.throttle > 0) {
      const a = (this.boosting ? 30 : 17) * Math.pow(Math.max(0, 1 - this.speed / top), 0.6) + 1.5;
      this.speed += this.speed > top ? -10 * dt : a * dt;
    } else if (inp.throttle < 0) this.speed -= (this.speed > 0 ? 32 : 8) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (2.5 + Math.abs(this.speed) * 0.07) * dt);
    if (inp.hand) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 20 * dt);
    this.speed = clamp(this.speed, -7, BOOST_SPEED + 4);

    const agile = clamp(Math.abs(this.speed) / 6, 0, 1), turnRate = (2.5 - clamp(Math.abs(this.speed) / 45, 0, 1) * 1.55) * (inp.hand ? 1.5 : 1);
    this.h -= inp.steer * turnRate * agile * (this.speed < 0 ? -1 : 1) * dt;
    const f = this.fwd, sx = -Math.cos(this.h), sz = Math.sin(this.h);
    if (inp.hand) this.lat += inp.steer * Math.abs(this.speed) * 0.9 * dt;
    this.lat *= Math.exp(-dt * (inp.hand ? 1.4 : 7));
    this.x += (f.x * this.speed + sx * this.lat) * dt; this.z += (f.z * this.speed + sz * this.lat) * dt;

    let impact = 0;
    const c = collideWorld(this, 0.8);
    if (c.hit) {
      impact = Math.max(0, -(f.x * c.nx + f.z * c.nz) * this.speed);
      if (impact > 3) { this.speed *= impact > 12 ? 0.4 : 0.7; this.crash = Math.max(this.crash, impact); }
      else this.speed *= 1 - 0.6 * dt;
      // slide along the wall: steer the heading a little away from it
      const side = f.x * c.nz - f.z * c.nx; this.h += clamp(side, -1, 1) * 0.5 * dt * Math.min(3, impact + 1);
    }
    const lean = clamp(inp.steer * clamp(Math.abs(this.speed) / 25, 0, 1) * 0.55, -0.6, 0.6);
    this.leanAngle += (lean - this.leanAngle) * Math.min(1, dt * 8);
    this.syncMesh(dt);
    return impact;
  }

  syncMesh(dt: number) {
    const m = this.mesh;
    m.root.position.set(this.x, 0, this.z); m.root.rotation.y = this.h;
    m.lean.rotation.z = this.leanAngle;
    for (const w of m.wheels) w.rotation.x += this.speed * dt / 0.42;
  }
}

/** Steering for a computer-driven rider following a leg of the route along a road. */
export function aiInput(b: Bike, ax: number, az: number, bx: number, bz: number, lane: number, slow: number): Input {
  // project onto the leg a->b, aim a bit ahead on it, shifted to the rider's lane
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  const t = (b.x - ax) * ux + (b.z - az) * uz;
  const rx = -uz, rz = ux;                                  // a unit vector at a right angle to the leg
  const look = clamp(8 + Math.abs(b.speed) * 0.55, 10, 30);
  const aimX = ax + ux * (t + look) + rx * lane, aimZ = az + uz * (t + look) + rz * lane;
  const want = Math.atan2(aimX - b.x, aimZ - b.z);
  let dh = want - b.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
  const steer = clamp(-dh * 2.2, -1, 1);
  const tooFast = Math.abs(dh) > 0.5 && b.speed > 22 * slow;
  return { throttle: tooFast ? -0.4 : 1, steer, hand: false, boost: false };
}
