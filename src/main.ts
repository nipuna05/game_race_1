import * as THREE from 'three';
import { buildCity, configure, MAPS, P, R, K, HALF, rnd, clamp, type City, type MapDef } from './city';
import { Agent } from './agents';
import { Bike, aiInput, MAX_SPEED, BIKES, type Input } from './bike';
import { Sound } from './audio';
import { opt, initMenu, showHome, showPause, mapDef, bikeDef, bikeColor, loadBest, saveBest, fmt } from './menu';

const $ = (id: string) => document.getElementById(id)!;
const QS = new URLSearchParams(location.search);

// ---------- renderer / scene ----------
const canvas = $('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fbbe8);
scene.fog = new THREE.Fog(0x8fbbe8, 120, 420);
const camera = new THREE.PerspectiveCamera(65, 1, 0.3, 700);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(120, 200, 80); scene.add(sun);
let city: City | null = null;
const hemi = new THREE.HemisphereLight(0xdbe9ff, 0x4a4f58, 1.15); scene.add(hemi);
const headlight = new THREE.PointLight(0xfff0d0, 0, 60, 1.4); scene.add(headlight);
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();

// ---------- route ----------
// the race route is a loop of junctions that fits the map's size: a ring with two detours through the middle
let NODE: { x: number; z: number }[] = [], N = 8;
function buildRoute() {
  const r = K - 1, h = Math.max(1, Math.floor(r / 3));
  const g: [number, number][] = [[0, -r], [0, -h], [r, -h], [r, r], [0, r], [0, h], [-r, h], [-r, -r]];
  NODE = g.map(([i, j]) => ({ x: i * P, z: j * P })); N = NODE.length;
}
const node = (n: number) => NODE[((n % N) + N) % N];

// ---------- input ----------
const keys = new Set<string>();
const sound = new Sound();
let ui: 'home' | 'play' | 'pause' = 'home';
addEventListener('pointerdown', () => { sound.start(); $('sndhint').style.display = 'none'; });
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code); sound.start(); $('sndhint').style.display = 'none';
  if (ui === 'play' && game && !e.repeat) {
    if (e.code === 'KeyQ') game.attack(game.player, 'punch', -1); else if (e.code === 'KeyE') game.attack(game.player, 'punch', 1); else if (e.code === 'KeyF') game.attack(game.player, 'kick');
  }
  if (e.code === 'Escape') { if (ui === 'play') setPause(true); else if (ui === 'pause') setPause(false); }
  if (e.code === 'KeyR' && ui === 'play' && game) game.resetPlayer();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const readInput = (): Input => ({
  throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
  steer: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
  hand: keys.has('Space'), boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
});

// ---------- the game ----------
const toast = (msg: string, ms = 1600, color = '#fff') => {
  const el = $('toast'); el.textContent = msg; el.style.color = color; el.classList.add('on');
  window.clearTimeout((toast as any).t); (toast as any).t = window.setTimeout(() => el.classList.remove('on'), ms);
};

type LootType = 'nitro' | 'turbo' | 'shield' | 'power';
const LOOT: Record<LootType, { name: string; letter: string; color: string; hex: number; text: string }> = {
  nitro: { name: 'NITRO', letter: 'N', color: '#3aa8ff', hex: 0x3aa8ff, text: 'Boost refilled and a burst of speed' },
  turbo: { name: 'SUPER SPEED', letter: 'S', color: '#ff5a3a', hex: 0xff5a3a, text: 'Much higher top speed for 6 seconds' },
  shield: { name: 'SHIELD', letter: 'D', color: '#3ddc84', hex: 0x3ddc84, text: 'Nobody can knock you off for 8 seconds' },
  power: { name: 'POWER HITS', letter: 'P', color: '#c77dff', hex: 0xc77dff, text: 'Your punches and kicks knock riders down for 10 seconds' },
};
interface Loot { type: LootType; x: number; z: number; cd: number; mesh: THREE.Group }
interface Pad { x: number; z: number; axis: 'x' | 'z'; mesh: THREE.Group }
const lootMats: Partial<Record<LootType, THREE.MeshBasicMaterial>> = {};
function lootMat(t: LootType): THREE.MeshBasicMaterial {
  if (lootMats[t]) return lootMats[t]!;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = LOOT[t].color; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '800 44px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LOOT[t].letter, 32, 36);
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(2, 2, 60, 60);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  return (lootMats[t] = new THREE.MeshBasicMaterial({ map: tx }));
}
let padMatCache: THREE.MeshBasicMaterial | null = null;
function padMat(): THREE.MeshBasicMaterial {
  if (padMatCache) return padMatCache;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20,24,34,.85)'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#ffb21a'; g.lineWidth = 9; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const x = 18 + i * 34; g.beginPath(); g.moveTo(x, 12); g.lineTo(x + 20, 32); g.lineTo(x, 52); g.stroke(); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  return (padMatCache = new THREE.MeshBasicMaterial({ map: tx, transparent: true }));
}

interface Rider { bike: Bike; passed: number; finishedAt: number; name: string; lane: number; isPlayer: boolean }

class Game {
  player: Rider; riders: Rider[] = []; agents: Agent[] = [];
  mode = opt.mode as 'race' | 'free'; police = opt.police === '1'; traffic = Number(opt.traffic); laps = Number(opt.laps);
  t = 0; raceT = 0; phase: 'count' | 'go' | 'done' = 'go'; countT = 0; penalty = 0;
  heat = 0; bust = 0; lastBeep = 4;
  camH = 0; beacon: THREE.Mesh; ring: THREE.Mesh;
  placed = 0; camPos = new THREE.Vector3();
  loots: Loot[] = []; pads: Pad[] = []; aiCd = new Map<Rider, number>();

  constructor() {
    const mine = BIKES.find((b) => b.id === opt.bike) ?? BIKES[0];
    this.player = { bike: new Bike(bikeColor(), mine), passed: 0, finishedAt: 0, name: 'You', lane: 0, isPlayer: true };
    scene.add(this.player.bike.mesh.root); this.riders.push(this.player);
    if (this.mode === 'race') {
      const cols = [0x3498db, 0xe74c3c, 0x2ecc71, 0x9b59b6, 0xe67e22];
      for (let i = 0; i < Number(opt.rivals); i++) {
        const rd = opt.field === 'mixed' ? BIKES[(Math.random() * BIKES.length) | 0] : mine;
        const r: Rider = { bike: new Bike(cols[i % cols.length], rd), passed: 0, finishedAt: 0, name: `Rider ${i + 1}`, lane: rnd(2, 4.5), isPlayer: false };
        r.bike.skill = rnd(0.9, 0.99); scene.add(r.bike.mesh.root); this.riders.push(r);
      }
    }
    const tm = mapDef().traffic, nCars = Math.round([0, 36, 72][this.traffic] * tm), nPeds = Math.round([0, 60, 130][this.traffic] * tm), nPol = this.police ? [2, 3, 5][this.traffic] : 0;
    for (let i = 0; i < nCars; i++) this.addAgent('car');
    for (let i = 0; i < nPeds; i++) this.addAgent('ped');
    for (let i = 0; i < nPol; i++) this.addAgent('police');
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 90, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(R / 2 - 1.5, 0.35, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.4;
    if (this.mode === 'race') scene.add(this.beacon, this.ring);
    this.placeLoot();
    this.resetStart();
  }

  addAgent(kind: 'car' | 'ped' | 'police') {
    const a = new Agent(kind); a.placeOnRoad(this.player.bike, 50); this.agents.push(a); scene.add(a.mesh);
  }

  dispose() {
    for (const r of this.riders) scene.remove(r.bike.mesh.root);
    for (const a of this.agents) scene.remove(a.mesh);
    for (const l of this.loots) scene.remove(l.mesh);
    for (const p of this.pads) scene.remove(p.mesh);
    scene.remove(this.beacon, this.ring);
  }

  resetStart() {
    if (this.mode === 'race') {
      this.phase = 'count'; this.countT = 3.2; this.lastBeep = 4;
      this.riders.forEach((r, i) => {
        const b = r.bike, row = Math.floor(i / 2), col = i % 2;
        b.x = node(0).x - 26 - row * 6; b.z = node(0).z + (col ? 3.2 : -3.2) + (r.isPlayer ? 0 : 0); b.h = Math.PI / 2; b.speed = 0; b.lat = 0; b.boostLeft = 1; b.syncMesh(0);
      });
      // keep traffic off the starting grid
      for (const a of this.agents) if (Math.hypot(a.x - node(0).x + 26, a.z - node(0).z) < 40) a.placeOnRoad(this.player.bike, 120);
    } else {
      this.phase = 'go';
      const b = this.player.bike; b.x = 0; b.z = 0; b.h = Math.PI / 2; b.speed = 0; b.syncMesh(0);
    }
    this.camH = this.player.bike.h; this.updateCamera(1, true);
  }

  resetPlayer() {
    const b = this.player.bike, f = b.fwd;
    const x0 = Math.round(b.x / P) * P, z0 = Math.round(b.z / P) * P;
    if (Math.abs(b.x - x0) < Math.abs(b.z - z0)) { b.x = x0; b.h = f.z >= 0 ? 0 : Math.PI; } else { b.z = z0; b.h = f.x >= 0 ? Math.PI / 2 : -Math.PI / 2; }
    b.speed = 0; b.lat = 0; b.crash = 0; b.syncMesh(0);
  }

  nextNode(r: Rider) { return node(r.passed); }

  progress(r: Rider) { const n = this.nextNode(r), d = Math.hypot(n.x - r.bike.x, n.z - r.bike.z); return r.passed * 10000 - d; }
  rank(): number { const mine = this.progress(this.player); let rk = 1; for (const r of this.riders) if (r !== this.player && (r.finishedAt && !this.player.finishedAt ? true : this.progress(r) > mine)) rk++; return rk; }

  crime(amount: number, why: string) {
    if (!this.police) return;
    const b = this.player.bike;
    let seen = this.heat > 0;
    for (const a of this.agents) if (a.kind === 'police' && Math.hypot(a.x - b.x, a.z - b.z) < 110) seen = true;
    if (!seen) return;
    const was = Math.ceil(this.heat); this.heat = Math.min(5, this.heat + amount);
    if (Math.ceil(this.heat) > was) toast(`Police alerted: ${why}`, 1400, '#ff7a7a');
  }

  update(dt: number) {
    this.t += dt;
    const me = this.player.bike;
    if (this.phase === 'count') {
      this.countT -= dt; const n = Math.ceil(this.countT);
      if (n !== this.lastBeep && n > 0) { this.lastBeep = n; toast(String(n), 900, '#ffd24a'); sound.beep(false); }
      if (this.countT <= 0) { this.phase = 'go'; this.raceT = 0; toast('GO!', 900, '#3ddc84'); sound.beep(true); }
    } else if (this.phase === 'go' && this.mode === 'race') this.raceT += dt;
    const live = this.phase !== 'count';

    // riders
    for (const r of this.riders) {
      const b = r.bike;
      let inp: Input = { throttle: 0, steer: 0, hand: false, boost: false };
      if (live) {
        if (r.isPlayer) inp = readInput();
        else {
          const to = this.nextNode(r), from = node(r.passed - 1);
          inp = aiInput(b, from.x, from.z, to.x, to.z, r.lane, 1);
          this.aiFight(r, dt);
        }
      }
      const wasFallen = b.fall > 0;
      const impact = b.step(inp, dt);
      if (!wasFallen && b.fall > 0 && r.isPlayer) toast('You fell off! Getting up...', 1600, '#ffb36b');
      if (live && b.fall <= 0) this.pickups(r);
      if (r.isPlayer && impact > 5) { sound.thump(impact); if (impact > 12) { flash(); this.crime(0.7, 'crash'); } }
      if (this.mode === 'race' && live) {
        const n = this.nextNode(r);
        if (Math.hypot(n.x - b.x, n.z - b.z) < R + 2) {
          r.passed++;
          if (r.isPlayer && r.passed <= this.laps * N + 1) {
            if (r.passed === this.laps * N + 1) this.finish();
            else { sound.beep(false); if (r.passed % N === 0) toast(`Lap ${r.passed / N + 1}/${this.laps}`, 1500, '#ffd24a'); }
          } else if (!r.isPlayer && r.passed >= this.laps * N + 1 && !r.finishedAt) { r.finishedAt = this.raceT; this.placed++; }
        }
      }
    }
    // riders bump each other; coming up fast from behind knocks the rider in front off
    for (let i = 0; i < this.riders.length; i++) for (let j = i + 1; j < this.riders.length; j++) {
      const ra = this.riders[i], rc = this.riders[j], a = ra.bike, c = rc.bike, dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
      if (d < 1.4 && d > 1e-4) {
        const k = (1.4 - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; c.x += dx * k; c.z += dz * k;
        const aRear = dx * a.fwd.x + dz * a.fwd.z > 0.3 && dx * c.fwd.x + dz * c.fwd.z > 0;     // c is ahead of a, both facing the same way
        const cRear = -dx * c.fwd.x - dz * c.fwd.z > 0.3 && -dx * a.fwd.x - dz * a.fwd.z > 0;
        const rear = aRear ? ra : cRear ? rc : null, front = aRear ? rc : ra;
        const closing = rear ? rear.bike.speed - front.bike.speed : 0;
        if (rear && closing > 5) this.knock(rear, front, rear.bike.power > 0 ? 2 : clamp(closing / 13, 0.2, 1.2), 'rear');
      }
    }

    // traffic, people, police
    const pl = { x: me.x, z: me.z, speed: me.speed };
    const wantChasers = this.police && this.heat > 0 ? Math.min(5, 1 + Math.floor(this.heat)) : 0;
    let chasers = 0, closest = 999, speedTrap = false;
    for (const a of this.agents) {
      const wasDown = a.down > 0;
      const dm = Math.hypot(a.x - me.x, a.z - me.z);
      a.mesh.visible = dm < 260 && !(a.kind !== 'police' && dm > 200);
      if (dm > 280 && a.kind !== 'police' && a.mode !== 'chase' && !a.down) { a.update(dt, this.agents, pl, this.t); continue; }
      a.update(dt, this.agents, pl, this.t);
      if (wasDown && a.down <= 0) a.placeOnRoad(me, 70);
      if (a.mode === 'chase') { chasers++; closest = Math.min(closest, dm); }
      if (a.kind === 'police' && a.mode === 'drive' && dm < 40 && me.speed > 30) speedTrap = true;
    }
    if (this.police) {
      if (speedTrap) this.crime(dt * 0.5, 'speeding');
      if (chasers < wantChasers) this.sendChaser();
      if (this.heat > 0) {
        this.heat = Math.max(0, this.heat - dt * (closest < 70 ? 0.02 : 0.1));
        if (this.heat <= 0) { this.endChase(); toast('You lost the police', 1800, '#8affb0'); }
      }
      if (closest < 5 && me.speed < 12 && chasers > 0) { this.bust += dt; if (this.bust > 2) this.busted(); } else this.bust = Math.max(0, this.bust - dt);
    }
    this.collideAgents(dt);
    for (const l of this.loots) {
      if (l.cd > 0) { l.cd -= dt; if (l.cd <= 0) l.mesh.visible = true; }
      l.mesh.rotation.y += dt * 2.2; l.mesh.position.y = 1.6 + Math.sin(this.t * 3 + l.x) * 0.25;
    }
    sound.update(me.speed, me.boosting, closest < 90 && this.heat > 0 ? clamp(1 - closest / 90, 0.2, 1) : 0, me.fall > 0 ? 0 : clamp(Math.abs(me.lat) / 5, 0, 1) * Math.min(1, Math.abs(me.speed) / 15));
    this.updateCamera(dt, false);
    if (mapDef().night) { const f = me.fwd; headlight.position.set(me.x + f.x * 6, 5, me.z + f.z * 6); }
    // checkpoint beacon
    if (this.mode === 'race') { const n = this.nextNode(this.player); this.beacon.position.set(n.x, 45, n.z); this.ring.position.set(n.x, 0.4, n.z); this.beacon.visible = this.phase !== 'done'; this.ring.visible = this.beacon.visible; }
  }

  sendChaser() {
    const me = this.player.bike;
    let best: Agent | null = null, bd = 1e9;
    for (const a of this.agents) if (a.kind === 'police' && a.mode === 'drive') { const d = Math.hypot(a.x - me.x, a.z - me.z); if (d < bd) { bd = d; best = a; } }
    if (!best) return;
    if (bd > 170) for (let k = 0; k < 25; k++) { best.placeOnRoad(me, 100); if (Math.hypot(best.x - me.x, best.z - me.z) < 180) break; }
    best.mode = 'chase'; best.speed = 10;
  }
  endChase() { for (const a of this.agents) if (a.mode === 'chase') a.placeOnRoad(this.player.bike, 140); this.bust = 0; }
  busted() {
    toast('BUSTED! +10 s', 2500, '#ff6b6b'); this.penalty += 10; this.raceT += 10; this.heat = 0; this.endChase(); this.bust = 0;
    const b = this.player.bike, back = this.mode === 'race' ? node(this.player.passed - 1) : { x: 0, z: 0 };
    b.x = back.x; b.z = back.z; b.speed = 0; b.lat = 0;
    if (this.mode === 'race') { const to = node(this.player.passed); b.h = Math.atan2(to.x - back.x, to.z - back.z); } this.resetPlayer();
  }

  collideAgents(dt: number) {
    for (const r of this.riders) {
      const b = r.bike;
      for (const a of this.agents) {
        if (a.down > 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z; if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
        const d = Math.hypot(dx, dz), rr = a.radius + 0.7;
        if (d >= rr || d < 1e-4) continue;
        if (a.kind === 'ped') {
          if (Math.abs(b.speed) > 4) {
            const f = b.fwd; a.knock(f.x * b.speed * 0.8 + rnd(-2, 2), f.z * b.speed * 0.8 + rnd(-2, 2)); b.speed *= 0.93;
            if (r.isPlayer) { this.penalty += 2; this.raceT += this.mode === 'race' ? 2 : 0; toast('Watch out! +2 s', 1000, '#ffb36b'); this.crime(0.8, 'hit a pedestrian'); sound.thump(6); }
          }
          continue;
        }
        // cars: push out, lose speed
        const nx = dx / d, nz = dz / d, push = rr - d; b.x += nx * push; b.z += nz * push;
        const f = b.fwd, closing = -(f.x * nx + f.z * nz) * b.speed + (Math.sin(a.h) * nx + Math.cos(a.h) * nz) * a.speed;
        if (closing > 4) { if (r.isPlayer) { sound.thump(closing); flash(); if (a.kind !== 'police') this.crime(0.6, 'crash'); } b.speed *= 0.5; a.stun = 0.8; }
        else b.speed *= 1 - 0.8 * dt;
        void dt;
      }
    }
  }

  /** A punch (Q left hand, E right hand) or a kick (F, nearest side). Hits a rider next to you. */
  attack(a: Rider, kind: 'punch' | 'kick', side?: 1 | -1): boolean {
    const b = a.bike;
    if (b.fall > 0 || (this.phase === 'count') || (kind === 'punch' ? b.punchCd > 0 : b.kickCd > 0)) return false;
    const fx = b.fwd.x, fz = b.fwd.z, rx = -Math.cos(b.h), rz = Math.sin(b.h);
    const reach = (kind === 'kick' ? 3 : 2.6) + (b.power > 0 ? 1 : 0);
    let best: Rider | null = null, bd = 99, bs: 1 | -1 = 1;
    for (const o of this.riders) {
      if (o === a || o.bike.fall > 0) continue;
      const dx = o.bike.x - b.x, dz = o.bike.z - b.z, f = dx * fx + dz * fz, r = dx * rx + dz * rz;
      if (Math.abs(f) > 2.4 || Math.abs(r) > reach || Math.abs(r) < 0.1) continue;
      const sd: 1 | -1 = r > 0 ? 1 : -1; if (side && sd !== side) continue;
      const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = o; bs = sd; }
    }
    b.swing(kind, side ?? bs);
    if (!best) return false;
    this.knock(a, best, b.power > 0 ? 2 : kind === 'kick' ? 0.5 : 0.3, kind, bs);
    return true;
  }
  /** Apply a hit from one rider to another and tell the player what happened. */
  knock(from: Rider, to: Rider, mag: number, how: 'punch' | 'kick' | 'rear', side: 1 | -1 = 1) {
    const t = to.bike, f = from.bike;
    // push the victim away from the attacker, in the victim's own left/right
    let shove: number;
    if (how === 'rear') shove = (t.x - f.x) * -Math.cos(t.h) + (t.z - f.z) * Math.sin(t.h);
    else { const px = -Math.cos(f.h) * side, pz = Math.sin(f.h) * side; shove = px * -Math.cos(t.h) + pz * Math.sin(t.h); if (how === 'punch' || how === 'kick') { t.x += px * 0.6; t.z += pz * 0.6; } }
    const res = t.hit(mag, clamp(shove, -1, 1) * (how === 'kick' ? 1.6 : 1));
    if (how === 'rear') f.speed *= 0.92;
    if (res === 'ignored') { if (from.isPlayer || to.isPlayer) toast(to.bike.shield > 0 ? 'Shield blocked it!' : '', 600, '#8affb0'); return; }
    if (from.isPlayer || to.isPlayer) {
      if (res === 'fell') sound.fall(); else sound.punch();
      if (res === 'fell') toast(from.isPlayer ? `${to.name} is down!` : `${from.name} knocked you off!`, 1400, from.isPlayer ? '#8affb0' : '#ff8a8a');
      else toast(how === 'rear' ? 'Bumped!' : how === 'kick' ? 'Kick!' : 'Punch!', 500, '#ffd24a');
    }
    if (from.isPlayer && how !== 'rear') this.crime(0.35, 'fighting');
  }
  /** Computer riders throw a punch or kick at a rider alongside them. */
  aiFight(r: Rider, dt: number) {
    if (this.raceT < 3 && this.mode === 'race') return;
    const cd = (this.aiCd.get(r) ?? rnd(0, 1)) - dt; this.aiCd.set(r, cd);
    if (cd > 0) return;
    const b = r.bike;
    for (const o of this.riders) {
      if (o === r || o.bike.fall > 0) continue;
      const dx = o.bike.x - b.x, dz = o.bike.z - b.z, f = dx * b.fwd.x + dz * b.fwd.z, rr = dx * -Math.cos(b.h) + dz * Math.sin(b.h);
      if (Math.abs(f) < 2 && Math.abs(rr) > 0.4 && Math.abs(rr) < 2.4) { this.attack(r, Math.random() < 0.35 ? 'kick' : 'punch', rr > 0 ? 1 : -1); this.aiCd.set(r, rnd(1.2, 3)); return; }
    }
    this.aiCd.set(r, 0.2);
  }

  placeLoot() {
    const types: LootType[] = ['nitro', 'turbo', 'shield', 'power'];
    const crate = (x: number, z: number) => {
      const g = new THREE.Group(), type = types[(Math.random() * types.length) | 0];
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), lootMat(type)); g.add(box);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 6, 24), new THREE.MeshBasicMaterial({ color: LOOT[type].hex })); glow.rotation.x = Math.PI / 2; g.add(glow);
      g.position.set(x, 1.6, z); scene.add(g); this.loots.push({ type, x, z, cd: 0, mesh: g });
    };
    const pad = (x: number, z: number, axis: 'x' | 'z') => {
      const g = new THREE.Group(), p = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), padMat()); p.rotation.x = -Math.PI / 2; g.add(p);
      g.rotation.y = axis === 'z' ? -Math.PI / 2 : 0; g.position.set(x, 0.06, z); scene.add(g); this.pads.push({ x, z, axis, mesh: g });
    };
    if (this.mode === 'race') {
      for (let k = 0; k < N; k++) {
        const a = node(k), c = node(k + 1), dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, rx = -uz, rz = ux, axis: 'x' | 'z' = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
        for (const t of [0.3, 0.7]) { const o = rnd(-R / 2 + 3, R / 2 - 3); crate(a.x + dx * t + rx * o, a.z + dz * t + rz * o); }
        const o = (k % 2 ? 1 : -1) * Math.min(3, R / 4); pad(a.x + dx * 0.5 + rx * o, a.z + dz * 0.5 + rz * o, axis);
      }
    }
    for (let i = 0; i < 14; i++) { const ax = Math.random() < 0.5, line = Math.floor(rnd(-K, K + 1)) * P, pos = rnd(-HALF + 25, HALF - 25), o = rnd(-R / 2 + 3, R / 2 - 3); crate(ax ? pos : line + o, ax ? line + o : pos); }
    for (let i = 0; i < 6; i++) { const ax: 'x' | 'z' = Math.random() < 0.5 ? 'x' : 'z', line = Math.floor(rnd(-K, K + 1)) * P, pos = rnd(-HALF + 30, HALF - 30), o = rnd(-R / 4, R / 4); pad(ax === 'x' ? pos : line + o, ax === 'x' ? line + o : pos, ax); }
  }

  pickups(r: Rider) {
    const b = r.bike;
    for (const l of this.loots) {
      if (l.cd > 0) continue;
      if (Math.abs(l.x - b.x) < 2.6 && Math.abs(l.z - b.z) < 2.6) {
        b.grant(l.type); l.cd = 14; l.mesh.visible = false;
        if (r.isPlayer) { toast(`${LOOT[l.type].name}!  ${LOOT[l.type].text}`, 1800, LOOT[l.type].color); sound.loot(); }
      }
    }
    for (const p of this.pads) {
      const hx = p.axis === 'x' ? 4.5 : 2.5, hz = p.axis === 'x' ? 2.5 : 4.5;
      if (Math.abs(p.x - b.x) < hx && Math.abs(p.z - b.z) < hz && b.padT < 0.3) { b.padT = 1.6; b.speed = Math.min(b.speed + 8, 62); if (r.isPlayer) sound.pad(); }
    }
  }

  finish() {
    this.phase = 'done'; this.player.finishedAt = this.raceT;
    const rk = this.rank(); const t = this.raceT;
    const best = loadBest(); let note = '';
    if (!best || t < best) { saveBest(t); note = '  New best!'; }
    sound.fanfare();
    toast(`Finished ${rk}${['st', 'nd', 'rd'][rk - 1] ?? 'th'}  ${fmt(t)}${note}`, 6000, '#ffd24a');
  }

  updateCamera(dt: number, snap: boolean) {
    const b = this.player.bike;
    let dh = b.h - this.camH; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    this.camH += dh * (snap ? 1 : Math.min(1, dt * 5));
    const back = 7.5 + Math.abs(b.speed) * 0.05, up = 3.3 + Math.abs(b.speed) * 0.01;
    const want = new THREE.Vector3(b.x - Math.sin(this.camH) * back, up, b.z - Math.cos(this.camH) * back);
    if (snap) this.camPos.copy(want); else this.camPos.lerp(want, Math.min(1, dt * 9));
    camera.position.copy(this.camPos);
    camera.lookAt(b.x + Math.sin(this.camH) * 6, 1.6, b.z + Math.cos(this.camH) * 6);
    const fov = 64 + clamp(b.speed / 55, 0, 1) * 16 + (b.boosting ? 8 : 0);
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }

  hud() {
    const b = this.player.bike;
    $('spd').textContent = String(Math.round(Math.abs(b.speed) * 3.6));
    ($('boostfill') as HTMLElement).style.width = `${Math.round(b.boostLeft * 100)}%`;
    if (this.mode === 'race') {
      const lap = clamp(Math.floor(Math.max(0, this.player.passed - 1) / N) + 1, 1, this.laps), tm = this.phase === 'done' ? this.player.finishedAt : this.raceT;
      $('race').innerHTML = `<b>${this.rank()}</b> / ${this.riders.length}<br>Lap ${lap} / ${this.laps}<br>Time ${fmt(tm)}${this.penalty ? ` <small style="color:#ffb36b">(+${this.penalty}s)</small>` : ''}`;
    } else $('race').innerHTML = '<b>Free ride</b><br>Explore the city';
    const ps: string[] = [];
    if (b.turbo > 0) ps.push(`<span style="color:${LOOT.turbo.color}">SUPER SPEED ${Math.ceil(b.turbo)}s</span>`);
    if (b.shield > 0) ps.push(`<span style="color:${LOOT.shield.color}">SHIELD ${Math.ceil(b.shield)}s</span>`);
    if (b.power > 0) ps.push(`<span style="color:${LOOT.power.color}">POWER HITS ${Math.ceil(b.power)}s</span>`);
    if (b.padT > 0) ps.push('<span style="color:#ffb21a">BOOST PAD</span>');
    $('powers').innerHTML = ps.join('<br>');
    const stars = Math.ceil(this.heat);
    $('heat').innerHTML = this.police && stars > 0 ? `<span style="color:#ff5a5a">${'★'.repeat(stars)}</span><span style="color:#555">${'★'.repeat(5 - stars)}</span><small>${this.bust > 0 ? 'Being arrested...' : 'Wanted: get away!'}</small>` : '';
    this.minimap();
  }

  minimap() {
    const c = $('mini') as HTMLCanvasElement, g = c.getContext('2d')!, W = c.width, s = W / 2 / 170, me = this.player.bike;
    g.clearRect(0, 0, W, W); g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 7); g.clip(); g.translate(W / 2, W / 2);
    g.fillStyle = '#1b2230'; g.fillRect(-W, -W, W * 2, W * 2);
    g.strokeStyle = '#4b5565'; g.lineWidth = R * s;
    for (let l = -K; l <= K; l++) { g.beginPath(); g.moveTo((l * P - me.x) * s, -W); g.lineTo((l * P - me.x) * s, W); g.stroke(); g.beginPath(); g.moveTo(-W, (l * P - me.z) * s); g.lineTo(W, (l * P - me.z) * s); g.stroke(); }
    const dot = (x: number, z: number, col: string, r: number) => { g.fillStyle = col; g.beginPath(); g.arc((x - me.x) * s, (z - me.z) * s, r, 0, 7); g.fill(); };
    if (this.mode === 'race') {
      g.strokeStyle = 'rgba(255,210,74,.55)'; g.lineWidth = 3; g.beginPath(); NODE.forEach((n, i) => { const x = (n.x - me.x) * s, z = (n.z - me.z) * s; i ? g.lineTo(x, z) : g.moveTo(x, z); }); g.closePath(); g.stroke();
      const n = this.nextNode(this.player); dot(n.x, n.z, '#ffd24a', 9);
    }
    for (const l of this.loots) if (l.cd <= 0 && Math.hypot(l.x - me.x, l.z - me.z) < 170) dot(l.x, l.z, LOOT[l.type].color, 4);
    g.fillStyle = '#ffb21a'; for (const p of this.pads) if (Math.hypot(p.x - me.x, p.z - me.z) < 170) g.fillRect((p.x - me.x) * s - 3, (p.z - me.z) * s - 3, 6, 6);
    for (const a of this.agents) if (a.kind === 'police') dot(a.x, a.z, a.mode === 'chase' ? '#ff3b3b' : '#5aa0ff', a.mode === 'chase' ? 6 : 4);
    for (const r of this.riders) if (!r.isPlayer) dot(r.bike.x, r.bike.z, '#59c1ff', 5);
    g.rotate(0); g.fillStyle = '#fff'; g.save(); g.rotate(-me.h + Math.PI); g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
    g.restore();
  }
}

function flash() { const f = $('flash'); f.style.opacity = '1'; window.setTimeout(() => (f.style.opacity = '0'), 160); }

let game: Game | null = null;

// ---------- city, sky and lights for the chosen map ----------
let cityMap = '';
function ensureCity() {
  const m = mapDef();
  if (city && cityMap === m.id) return;
  if (city) { scene.remove(city.group); city.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); }); }
  configure(m); buildRoute(); city = buildCity(scene, m); cityMap = m.id;
  scene.background = new THREE.Color(m.sky); scene.fog = new THREE.Fog(m.sky, m.fog[0], m.fog[1]);
  hemi.intensity = m.hemi; sun.intensity = m.sun; headlight.intensity = m.night ? 2200 : 0;
}

// ---------- home page: the city behind the menu with the chosen bike on a turntable ----------
let showBike: Bike | null = null; let plinth: THREE.Group | null = null; let homeTab = 'play'; let camR = 14, camHgt = 4.5, homeT = 0;
function buildShowcase() {
  if (showBike) scene.remove(showBike.mesh.root); if (plinth) scene.remove(plinth);
  const def = bikeDef(); showBike = new Bike(bikeColor(), def); showBike.x = 0; showBike.z = 0; showBike.syncMesh(0); showBike.mesh.root.position.y = 0.2; scene.add(showBike.mesh.root);
  plinth = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.2, 40), new THREE.MeshLambertMaterial({ color: 0x1a2030 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.09, 8, 60), new THREE.MeshBasicMaterial({ color: 0xffd24a })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
  plinth.add(disc, ring); plinth.position.y = 0.1; scene.add(plinth);
}
function homeFrame(dt: number) {
  homeT += dt;
  const garage = homeTab === 'garage', tr = garage ? 8.6 : 15, th = garage ? 2.4 : 5.5;
  camR += (tr - camR) * Math.min(1, dt * 2.5); camHgt += (th - camHgt) * Math.min(1, dt * 2.5);
  const ang = homeT * (garage ? 0.28 : 0.1) + 0.6;
  camera.position.set(Math.sin(ang) * camR, camHgt, Math.cos(ang) * camR); camera.lookAt(0, garage ? 0.9 : 1.2, 0);
  camera.fov = 52; camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight); camera.updateProjectionMatrix();
  if (showBike) { showBike.mesh.root.rotation.y = garage ? homeT * 0.5 : Math.PI * 0.3; for (const w of showBike.mesh.wheels) w.rotation.x += dt * 2; }
}
function enterHome() {
  ui = 'home'; ensureCity(); buildShowcase();
  $('hud').classList.remove('on'); showPause(false); showHome(true);
  sound.setBike(bikeDef().cc); sound.engine(false); sound.music('menu');
}
function setPause(on: boolean) { ui = on ? 'pause' : 'play'; showPause(on); sound.engine(!on); sound.ui(on ? 'back' : 'click'); }

function startGame() {
  game?.dispose();
  ensureCity(); buildRoute();
  if (showBike) { scene.remove(showBike.mesh.root); showBike = null; } if (plinth) { scene.remove(plinth); plinth = null; }
  camera.clearViewOffset(); camera.fov = 65; camera.updateProjectionMatrix();
  game = new Game(); (window as any).__game = game;
  ui = 'play'; showHome(false); showPause(false); $('hud').classList.add('on');
  sound.setBike(bikeDef().cc); sound.engine(true); sound.music('race');
}

initMenu({
  start: () => { sound.start(); startGame(); },
  preview: () => { buildShowcase(); },
  mapChanged: () => { ensureCity(); buildShowcase(); },
  tab: (t) => { homeTab = t; },
  resume: () => setPause(false),
  restart: () => { startGame(); },
  toMain: () => { game?.dispose(); game = null; enterHome(); },
}, sound);
(window as any).__ui = () => ui;
enterHome();
if (new URLSearchParams(location.search).has('auto')) startGame();

// ---------- main loop ----------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (ui === 'play' && game) { game.update(dt); game.hud(); } else if (ui === 'home') homeFrame(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void MAX_SPEED; void HALF;
