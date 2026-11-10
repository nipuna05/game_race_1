import type * as THREE from 'three';
import { clamp, collideWorld, GRIP } from './city';
import { makeBikeMesh, type BikeMesh } from './bikemodel';

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

export { makeBikeMesh, type BikeMesh };

export class Bike {
  x = 0; z = 0; h = 0; speed = 0; lat = 0; boostLeft = 1; leanAngle = 0; boosting = false;
  mesh: BikeMesh; crash = 0; steerAngle = 0;
  skill = 1;
  // fighting and falling
  balance = 1; fall = 0; fallDir = 1; inv = 0; punchCd = 0; kickCd = 0; swingT = 0; swingKind: 'punch' | 'kick' = 'punch'; swingSide: 1 | -1 = 1;
  // power-ups (seconds left)
  turbo = 0; shield = 0; power = 0; padT = 0;
  def: BikeDef;
  constructor(color: number, def: BikeDef = BIKES[0]) { this.def = def; this.mesh = makeBikeMesh(color, def); }
  get fwd() { return { x: Math.sin(this.h), z: Math.cos(this.h) }; }

  /** Moves the bike. Returns the impact strength when it hits something solid (0 otherwise). */
  step(inp: Input, dt: number): number {
    const d = this.def;
    this.punchCd = Math.max(0, this.punchCd - dt); this.kickCd = Math.max(0, this.kickCd - dt); this.swingT = Math.max(0, this.swingT - dt);
    this.turbo = Math.max(0, this.turbo - dt); this.shield = Math.max(0, this.shield - dt); this.power = Math.max(0, this.power - dt); this.padT = Math.max(0, this.padT - dt); this.inv = Math.max(0, this.inv - dt);
    if (this.fall > 0) return this.stepFall(dt);
    this.balance = Math.min(1, this.balance + dt * 0.22);
    this.steerAngle += (inp.steer * 0.4 - this.steerAngle) * Math.min(1, dt * 10);
    this.boosting = inp.boost && this.boostLeft > 0.02 && inp.throttle > 0;
    if (this.boosting) this.boostLeft = Math.max(0, this.boostLeft - dt * 0.28 / d.boost); else this.boostLeft = Math.min(1, this.boostLeft + dt * 0.07);
    const top = (this.boosting ? BOOST_SPEED * (1 + (d.boost - 1) * 0.5) : MAX_SPEED) * d.top * this.skill * (this.turbo > 0 ? 1.3 : 1) * (this.padT > 0 ? 1.2 : 1);
    if (inp.throttle > 0) {
      const a = (this.boosting ? 30 : 17) * d.accel * (this.turbo > 0 ? 1.5 : 1) * (this.padT > 0 ? 1.6 : 1) * Math.pow(Math.max(0, 1 - this.speed / top), 0.6) + 1.5;
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
      if (impact > 3) { this.speed *= impact > 12 ? (this.shield > 0 ? 0.7 : 0.4) : 0.7; this.crash = Math.max(this.crash, impact); if (impact > 12) this.hit(0.55, 0); }
      else this.speed *= 1 - 0.6 * dt;
      // slide along the wall: steer the heading a little away from it
      const side = f.x * c.nz - f.z * c.nx; this.h += clamp(side, -1, 1) * 0.5 * dt * Math.min(3, impact + 1);
    }
    const lean = clamp(inp.steer * clamp(Math.abs(this.speed) / 25, 0, 1) * 0.55, -0.6, 0.6);
    this.leanAngle += (lean - this.leanAngle) * Math.min(1, dt * 8);
    this.syncMesh(dt);
    return impact;
  }

  /** Something hits the rider: `mag` is how much balance it takes (>= 1 knocks them off), `shove` pushes the bike sideways (positive = to its right). Returns what happened. */
  hit(mag: number, shove: number): 'ignored' | 'hit' | 'fell' {
    if (this.inv > 0 || this.shield > 0 || this.fall > 0) return 'ignored';
    this.balance -= mag; this.lat += shove * 3; this.speed *= 0.93; this.inv = 0.2;
    if (this.balance <= 0) { this.fall = 2.3; this.fallDir = shove < 0 ? -1 : 1; this.balance = 0; return 'fell'; }
    return 'hit';
  }
  /** Start a punch (with the right or left hand) or a kick. */
  swing(kind: 'punch' | 'kick', side: 1 | -1) { this.swingKind = kind; this.swingSide = side; this.swingT = kind === 'kick' ? 0.35 : 0.25; if (kind === 'punch') this.punchCd = 0.45; else this.kickCd = 0.8; }
  grant(type: 'nitro' | 'turbo' | 'shield' | 'power') {
    if (type === 'nitro') { this.boostLeft = 1; this.speed = Math.min(this.speed + 9, BOOST_SPEED + 4); }
    else if (type === 'turbo') this.turbo = 6; else if (type === 'shield') this.shield = 8; else this.power = 10;
  }
  private stepFall(dt: number): number {
    this.fall -= dt;
    const sg = Math.sign(this.speed); this.speed -= sg * Math.min(Math.abs(this.speed), 15 * dt);
    this.lat *= Math.exp(-dt * 2);
    const f = this.fwd, sx = -Math.cos(this.h), sz = Math.sin(this.h);
    this.x += (f.x * this.speed + sx * this.lat) * dt; this.z += (f.z * this.speed + sz * this.lat) * dt;
    collideWorld(this, 0.8);
    this.leanAngle += (this.fallDir * 1.5 - this.leanAngle) * Math.min(1, dt * 10);
    if (this.fall <= 0) { this.speed = 0; this.lat = 0; this.leanAngle = 0; this.balance = 1; this.inv = 1.4; }
    this.syncMesh(dt);
    return 0;
  }

  syncMesh(dt: number) {
    const m = this.mesh;
    m.root.position.set(this.x, this.fall > 0 ? 0.3 : 0, this.z); m.root.rotation.y = this.h;
    m.root.visible = this.inv <= 0 || this.fall > 0 || Math.floor(this.inv * 12) % 2 === 0;
    m.lean.rotation.z = this.leanAngle;
    // punch / kick animation: the arm or leg swings out to the side; the front wheel and bars turn with the steering
    m.steer.rotation.y = -this.steerAngle;
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / (this.swingKind === 'kick' ? 0.35 : 0.25)) * Math.PI) : 0;
    for (const side of [1, -1] as const) {
      const arm = side === 1 ? m.arms.r : m.arms.l, leg = side === 1 ? m.legs.r : m.legs.l, on = this.swingSide === side ? sw : 0, dir = side === 1 ? -1 : 1;
      arm.rotation.y = this.swingKind === 'punch' ? dir * on * 1.3 : 0;
      leg.rotation.z = this.swingKind === 'kick' ? dir * -on * 1.2 : 0;
    }
    // aura for the active power-up
    const au = m.aura; au.visible = this.shield > 0 || this.power > 0 || this.turbo > 0;
    if (au.visible) (au.material as import('three').MeshBasicMaterial).color.setHex(this.shield > 0 ? 0x66ff99 : this.power > 0 ? 0xc77dff : 0xff6a4a);
    for (const w of m.wheels) w.rotation.x += this.speed * dt / 0.35;
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
