import * as THREE from 'three';
import { buildCity, configure, MAPS, P, R, K, HALF, rnd, clamp, type City, type MapDef } from './city';
import { Agent } from './agents';
import { Bike, aiInput, MAX_SPEED, BIKES, type Input } from './bike';
import { Sound } from './audio';

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

// ---------- settings (menu) ----------
const savedBike = (() => { try { return localStorage.getItem('bikerace.bike.v1') || 'street'; } catch { return 'street'; } })();
const opt: Record<string, string> = { map: (() => { try { return localStorage.getItem('bikerace.map.v1') || 'downtown'; } catch { return 'downtown'; } })(), bike: savedBike, field: 'same', mode: 'race', police: '1', traffic: '1', laps: '2', rivals: '3' };
document.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    seg.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); opt[seg.dataset.k!] = b.dataset.v!;
  }));
});
for (const k of Object.keys(opt)) if (QS.has(k)) {   // ?mode=free&police=0&traffic=2 ... for quick tests
  opt[k] = QS.get(k)!; document.querySelectorAll<HTMLElement>(`.seg[data-k=${k}] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === opt[k]));
}
const mapSeg = document.querySelector<HTMLElement>('.seg[data-k=map]')!;
MAPS.forEach((m) => { const el = document.createElement('button'); el.dataset.v = m.id; el.textContent = m.name; mapSeg.appendChild(el); });
const pickMap = (id: string) => {
  const m = MAPS.find((x) => x.id === id) ?? MAPS[0]; opt.map = m.id;
  mapSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.v === m.id));
  $('mapinfo').innerHTML = `<b>${m.name}</b> ${m.desc}`; showBest();
  try { localStorage.setItem('bikerace.map.v1', m.id); } catch { /* ignore */ }
};
mapSeg.addEventListener('click', (e) => { const v = (e.target as HTMLElement).dataset?.v; if (v) pickMap(v); });
const bikeSeg = document.querySelector<HTMLElement>('.seg[data-k=bike]')!;
BIKES.forEach((b) => { const el = document.createElement('button'); el.dataset.v = b.id; el.textContent = `${b.name} ${b.cc}cc`; bikeSeg.appendChild(el); });
const pickBike = (id: string) => {
  const b = BIKES.find((x) => x.id === id) ?? BIKES[0]; opt.bike = b.id;
  bikeSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.v === b.id));
  const bar = (v: number, lo: number, hi: number) => `<i style="width:${Math.round(clamp((v - lo) / (hi - lo), 0.08, 1) * 100)}%"></i>`;
  $('bikeinfo').innerHTML = `<b>${b.name}</b> <span style="color:#8fb0d0">${b.category} class &middot; ${b.cc} cc</span><br>${b.desc}<div class="stats"><span>Speed${bar(b.top, 0.6, 1.3)}</span><span>Pickup${bar(b.accel, 0.6, 1.3)}</span><span>Handling${bar(b.turn, 0.7, 1.5)}</span><span>Boost${bar(b.boost, 0.5, 1.4)}</span></div>`;
  try { localStorage.setItem('bikerace.bike.v1', b.id); } catch { /* ignore */ }
};
bikeSeg.addEventListener('click', (e) => { const v = (e.target as HTMLElement).dataset?.v; if (v) pickBike(v); });
pickBike(opt.bike);
const bestKey = () => `bikerace.best.v1.${opt.map}`;
const loadBest = (): number => { try { return Number(localStorage.getItem(bestKey())) || 0; } catch { return 0; } };
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const showBest = () => { const b = loadBest(); $('best').textContent = b ? `Best race time on ${mapDef().name}: ${fmt(b)}` : ''; };
const mapDef = (): MapDef => MAPS.find((x) => x.id === opt.map) ?? MAPS[0];
pickMap(opt.map);

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
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code); sound.start();
  if (e.code === 'Escape' && game) toggleMenu();
  if (e.code === 'KeyR' && game && !menuOpen) game.resetPlayer();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const readInput = (): Input => ({
  throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
  steer: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
  hand: keys.has('Space'), boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
});

// ---------- menu ----------
let menuOpen = true;
function toggleMenu(force?: boolean) {
  menuOpen = force ?? !menuOpen;
  $('menu').classList.toggle('off', !menuOpen);
  $('go').textContent = game ? 'Restart with these settings' : 'Start';
}
$('go').addEventListener('click', () => { sound.start(); startGame(); });

// ---------- the game ----------
const toast = (msg: string, ms = 1600, color = '#fff') => {
  const el = $('toast'); el.textContent = msg; el.style.color = color; el.classList.add('on');
  window.clearTimeout((toast as any).t); (toast as any).t = window.setTimeout(() => el.classList.remove('on'), ms);
};

interface Rider { bike: Bike; passed: number; finishedAt: number; name: string; lane: number; isPlayer: boolean }

class Game {
  player: Rider; riders: Rider[] = []; agents: Agent[] = [];
  mode = opt.mode as 'race' | 'free'; police = opt.police === '1'; traffic = Number(opt.traffic); laps = Number(opt.laps);
  t = 0; raceT = 0; phase: 'count' | 'go' | 'done' = 'go'; countT = 0; penalty = 0;
  heat = 0; bust = 0; lastBeep = 4;
  camH = 0; beacon: THREE.Mesh; ring: THREE.Mesh;
  placed = 0; camPos = new THREE.Vector3();

  constructor() {
    const mine = BIKES.find((b) => b.id === opt.bike) ?? BIKES[0];
    this.player = { bike: new Bike(mine.color, mine), passed: 0, finishedAt: 0, name: 'You', lane: 0, isPlayer: true };
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
    this.resetStart();
  }

  addAgent(kind: 'car' | 'ped' | 'police') {
    const a = new Agent(kind); a.placeOnRoad(this.player.bike, 50); this.agents.push(a); scene.add(a.mesh);
  }

  dispose() {
    for (const r of this.riders) scene.remove(r.bike.mesh.root);
    for (const a of this.agents) scene.remove(a.mesh);
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
        }
      }
      const impact = b.step(inp, dt);
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
    // riders bump each other
    for (let i = 0; i < this.riders.length; i++) for (let j = i + 1; j < this.riders.length; j++) {
      const a = this.riders[i].bike, c = this.riders[j].bike, dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
      if (d < 1.4 && d > 1e-4) { const k = (1.4 - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; c.x += dx * k; c.z += dz * k; }
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
    sound.update(me.speed, me.boosting, closest < 90 && this.heat > 0 ? clamp(1 - closest / 90, 0.2, 1) : 0);
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

  finish() {
    this.phase = 'done'; this.player.finishedAt = this.raceT;
    const rk = this.rank(); const t = this.raceT;
    const best = loadBest(); let note = '';
    if (!best || t < best) { try { localStorage.setItem(bestKey(), String(t)); } catch { /* ignore */ } note = '  New best!'; showBest(); }
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
    for (const a of this.agents) if (a.kind === 'police') dot(a.x, a.z, a.mode === 'chase' ? '#ff3b3b' : '#5aa0ff', a.mode === 'chase' ? 6 : 4);
    for (const r of this.riders) if (!r.isPlayer) dot(r.bike.x, r.bike.z, '#59c1ff', 5);
    g.rotate(0); g.fillStyle = '#fff'; g.save(); g.rotate(-me.h + Math.PI); g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
    g.restore();
  }
}

function flash() { const f = $('flash'); f.style.opacity = '1'; window.setTimeout(() => (f.style.opacity = '0'), 160); }

let game: Game | null = null;
function startGame() {
  game?.dispose();
  const m = mapDef();
  if (city) { scene.remove(city.group); city.group.traverse((o) => { const me = o as THREE.Mesh; me.geometry?.dispose?.(); }); }
  configure(m); buildRoute(); city = buildCity(scene, m);
  scene.background = new THREE.Color(m.sky); scene.fog = new THREE.Fog(m.sky, m.fog[0], m.fog[1]);
  hemi.intensity = m.hemi; sun.intensity = m.sun; headlight.intensity = m.night ? 2200 : 0;
  game = new Game(); (window as any).__game = game;
  $('hud').classList.add('on'); toggleMenu(false);
}
if (QS.has('auto')) startGame();

// ---------- main loop ----------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game && !menuOpen) { game.update(dt); game.hud(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void MAX_SPEED; void HALF;
