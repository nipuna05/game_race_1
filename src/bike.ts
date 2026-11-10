import * as THREE from 'three';
import { clamp, collideWorld, GRIP } from './city';

export interface Input { throttle: number; steer: number; hand: boolean; boost: boolean }
export const MAX_SPEED = 40, BOOST_SPEED = 56;

/** The bikes you can ride. Numbers are multipliers on the base feel; wheel / len / color change the look. */
export interface BikeDef { id: string; category: string; cc: number; name: string; desc: string; top: number; accel: number; turn: number; brake: number; boost: number; wheel: number; len: number; color: number; fairing?: boolean; upright?: number; wide?: boolean }
export const BIKES: BikeDef[] = [
  { id: 'scooter', category: 'Scooter', cc: 125, name: 'Scooter', desc: 'Slow, but turns and stops on a coin. Great in traffic.', top: 0.72, accel: 1.2, turn: 1.45, brake: 1.3, boost: 0.6, wheel: 0.7, len: 0.8, color: 0x2ecc71, upright: 1 },
  { id: 'street', category: 'Naked', cc: 400, name: 'Street', desc: 'Balanced all-rounder.', top: 1, accel: 1, turn: 1, brake: 1, boost: 1, wheel: 1, len: 1, color: 0xffd24a },
  { id: 'dirt', category: 'Off-road', cc: 450, name: 'Enduro', desc: 'Light and punchy with a tall frame. Quick to turn, lower top speed.', top: 0.88, accel: 1.25, turn: 1.25, brake: 1.1, boost: 0.9, wheel: 1.3, len: 1.05, color: 0xff7a1a, upright: 1 },
  { id: 'sport', category: 'Sport', cc: 600, name: 'Sport', desc: 'Fast and sharp, but twitchy at speed.', top: 1.12, accel: 1.15, turn: 1.1, brake: 1.1, boost: 1, wheel: 0.95, len: 1.05, color: 0xe74c3c, fairing: true },
  { id: 'classic', category: 'Classic', cc: 750, name: 'Cafe Racer', desc: 'Good looks, good balance, a bit more power than the Street.', top: 1.06, accel: 1.05, turn: 1.05, brake: 1.05, boost: 1, wheel: 1.05, len: 1.1, color: 0x8b5a2b },
  { id: 'super', category: 'Superbike', cc: 1000, name: 'Superbike', desc: 'Very high top speed and a big boost. Hard to turn.', top: 1.25, accel: 1.1, turn: 0.82, brake: 1.15, boost: 1.35, wheel: 1.05, len: 1.2, color: 0x3498db, fairing: true },
  { id: 'cruiser', category: 'Cruiser', cc: 1200, name: 'Cruiser', desc: 'Heavy and stable. Slow to pick up speed.', top: 0.95, accel: 0.75, turn: 0.85, brake: 0.9, boost: 0.8, wheel: 1.1, len: 1.3, color: 0x2c3e50, upright: 1, wide: true },
  { id: 'hyper', category: 'Hyperbike', cc: 1400, name: 'Hyperbike', desc: 'The fastest of all with a huge boost. Wild to control: for experts.', top: 1.38, accel: 1.3, turn: 0.7, brake: 1.2, boost: 1.55, wheel: 1.0, len: 1.25, color: 0x9b59b6, fairing: true },
];

const frame = new THREE.MeshLambertMaterial({ color: 0x23272e }), tyre = new THREE.MeshLambertMaterial({ color: 0x0c0d10 });
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 14);
const bodyGeo = new THREE.BoxGeometry(0.34, 0.45, 1.5), tankGeo = new THREE.BoxGeometry(0.4, 0.32, 0.6), torsoGeo = new THREE.BoxGeometry(0.46, 0.7, 0.3), headGeo = new THREE.SphereGeometry(0.24, 10, 8);
const armGeo = new THREE.BoxGeometry(0.12, 0.12, 0.55), legGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);

export function makeBikeMesh(color: number, def: BikeDef = BIKES[0]): { root: THREE.Group; lean: THREE.Group; wheels: THREE.Mesh[] } {
  const root = new THREE.Group(), lean = new THREE.Group(); root.add(lean);
  const wheels: THREE.Mesh[] = [];
  for (const z of [0.85 * def.len, -0.85 * def.len]) { const w = new THREE.Mesh(wheelGeo, tyre); w.rotation.z = Math.PI / 2; w.scale.set(def.wheel, 1, def.wheel); w.position.set(0, 0.42 * def.wheel, z); lean.add(w); wheels.push(w); }
  const col = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, frame); body.position.set(0, 0.7, 0); body.scale.z = def.len; lean.add(body);
  const tank = new THREE.Mesh(tankGeo, col); tank.position.set(0, 1.0, 0.25 * def.len); if (def.id === 'scooter') tank.scale.set(1.1, 0.5, 1.2); lean.add(tank);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.7), col); tail.position.set(0, 0.95, -0.55 * def.len); lean.add(tail);
  const torso = new THREE.Mesh(torsoGeo, col); torso.position.set(0, 1.55, -0.15 * def.len); torso.rotation.x = def.fairing ? 0.7 : def.upright ? 0.05 : 0.35; lean.add(torso);
  const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })); head.position.set(0, def.fairing ? 1.9 : 2.05, def.fairing ? 0.3 : 0.05); lean.add(head);
  // handlebars, and a fairing (sport bikes) or a tall front fender (enduro)
  const bars = new THREE.Mesh(new THREE.BoxGeometry(def.wide ? 1.1 : 0.7, 0.07, 0.07), frame); bars.position.set(0, def.upright ? 1.45 : 1.2, 0.62 * def.len); lean.add(bars);
  if (def.fairing) { const fr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.55), col); fr.position.set(0, 1.05, 0.75 * def.len); fr.rotation.x = -0.35; lean.add(fr); }
  if (def.id === 'dirt') { const fe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.6), col); fe.position.set(0, 1.25, 0.95 * def.len); fe.rotation.x = 0.25; lean.add(fe); }
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
  def: BikeDef;
  constructor(color: number, def: BikeDef = BIKES[0]) { this.def = def; this.mesh = makeBikeMesh(color, def); }
  get fwd() { return { x: Math.sin(this.h), z: Math.cos(this.h) }; }

  /** Moves the bike. Returns the impact strength when it hits something solid (0 otherwise). */
  step(inp: Input, dt: number): number {
    const d = this.def;
    this.boosting = inp.boost && this.boostLeft > 0.02 && inp.throttle > 0;
    if (this.boosting) this.boostLeft = Math.max(0, this.boostLeft - dt * 0.28 / d.boost); else this.boostLeft = Math.min(1, this.boostLeft + dt * 0.07);
    const top = (this.boosting ? BOOST_SPEED * (1 + (d.boost - 1) * 0.5) : MAX_SPEED) * d.top * this.skill;
    if (inp.throttle > 0) {
      const a = (this.boosting ? 30 : 17) * d.accel * Math.pow(Math.max(0, 1 - this.speed / top), 0.6) + 1.5;
      this.speed += this.speed > top ? -10 * dt : a * dt;
    } else if (inp.throttle < 0) this.speed -= (this.speed > 0 ? 32 * d.brake * (0.5 + GRIP * 0.5) : 8) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (2.5 + Math.abs(this.speed) * 0.07) * dt);
    if (inp.hand) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 20 * dt);
    this.speed = clamp(this.speed, -7, BOOST_SPEED + 4);

    const agile = clamp(Math.abs(this.speed) / 6, 0, 1), turnRate = (2.5 - clamp(Math.abs(this.speed) / 45, 0, 1) * 1.55) * (inp.hand ? 1.5 : 1) * d.turn;
    this.h -= inp.steer * turnRate * agile * (this.speed < 0 ? -1 : 1) * dt;
    const f = this.fwd, sx = -Math.cos(this.h), sz = Math.sin(this.h);
    if (inp.hand) this.lat += inp.steer * Math.abs(this.speed) * 0.9 * dt;
    if (GRIP < 1) this.lat -= inp.steer * Math.abs(this.speed) * (1 - GRIP) * 1.5 * dt;   // slippery road: the bike slides out of corners
    this.lat *= Math.exp(-dt * (inp.hand ? 1.4 : 7 * GRIP));
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
