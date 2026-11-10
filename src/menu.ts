import { MAPS, clamp, type MapDef } from './city';
import { BIKES, type BikeDef } from './bike';
import type { Sound } from './audio';
import { profile, onProfile, levelInfo, titleOf, setName, resetProfile, favouriteBike, owns, buyBike } from './profile';

const $ = (id: string) => document.getElementById(id)!;
const QS = new URLSearchParams(location.search);
const OPT_KEY = 'bikerace.opts.v1';

/** The player's choices. Saved in the browser; the query string can override them for quick tests (?map=neon&bike=hyper&police=0). */
export const opt: Record<string, string> = { map: 'downtown', bike: 'street', color: '', field: 'same', mode: 'race', police: '1', traffic: '1', laps: '2', rivals: '3' };
try { Object.assign(opt, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch { /* defaults */ }
for (const k of Object.keys(opt)) if (QS.has(k)) opt[k] = QS.get(k)!;
const save = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(opt)); } catch { /* ignore */ } };

export const mapDef = (): MapDef => MAPS.find((x) => x.id === opt.map) ?? MAPS[0];
if (!owns(opt.bike)) opt.bike = 'street';
export const bikeDef = (): BikeDef => BIKES.find((x) => x.id === opt.bike) ?? BIKES[0];
let viewId = opt.bike;   // the bike shown in the garage (may be one you do not own yet)
export const previewDef = (): BikeDef => BIKES.find((x) => x.id === viewId) ?? bikeDef();
export const bikeColor = (): number => (/^#[0-9a-f]{6}$/i.test(opt.color) ? parseInt(opt.color.slice(1), 16) : bikeDef().color);
export const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const bestKey = (m: string) => `bikerace.best.v1.${m}`;
export const loadBest = (m = opt.map): number => { try { return Number(localStorage.getItem(bestKey(m))) || 0; } catch { return 0; } };
export const saveBest = (t: number, m = opt.map) => { try { localStorage.setItem(bestKey(m), String(t)); } catch { /* ignore */ } };

export interface Hooks { start(): void; preview(): void; mapChanged(): void; tab(name: string): void; resume(): void; restart(): void; toMain(): void }
type Tab = 'play' | 'garage' | 'maps' | 'profile' | 'controls' | 'settings';
const TABS: [Tab, string, string][] = [['play', 'PLAY', 'Start a race'], ['garage', 'GARAGE', 'Bikes and colours'], ['maps', 'MAPS', 'Pick a city'], ['profile', 'PROFILE', 'Stats and level'], ['controls', 'CONTROLS', 'Keys'], ['settings', 'SETTINGS', 'Sound']];
const COLORS = ['', '#e74c3c', '#ff7a1a', '#ffd24a', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#ff5fa8', '#ecf0f1', '#2c3e50'];

let sound: Sound, hooks: Hooks, tab: Tab = 'play';

export function initMenu(h: Hooks, s: Sound) {
  hooks = h; sound = s;
  $('nav').innerHTML = TABS.map(([id, name, sub]) => `<button data-t="${id}">${name}<small>${sub}</small></button>`).join('');
  $('nav').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) setTab(b.dataset.t as Tab); });
  // button sounds for everything in the home page and pause menu
  for (const id of ['home', 'pause', 'wreck']) {
    $(id).addEventListener('click', (e) => { const el = e.target as HTMLElement; if (el.closest('button, .card, .sw, .tile')) sound.ui(el.closest('.go') ? 'start' : el.closest('.card, .sw') ? 'select' : 'click'); });
    $(id).addEventListener('mouseover', (e) => { const el = (e.target as HTMLElement).closest('button, .card, .sw, .tile'); if (el && el !== lastHover) { lastHover = el; sound.ui('hover'); } });
  }
  $('p-resume').addEventListener('click', () => hooks.resume());
  $('p-restart').addEventListener('click', () => hooks.restart());
  $('p-main').addEventListener('click', () => hooks.toMain());
  $('chip').addEventListener('click', () => setTab('profile'));
  onProfile(renderChip); renderChip();
  setTab('play', true);
}
function renderChip() {
  const li = levelInfo();
  $('chip').innerHTML = `<b>${profile.name}</b><span>LV ${li.level}</span><small>${titleOf(li.level)} &middot; <i style="color:#ffd24a;font-style:normal">&#9679; ${profile.coins.toLocaleString()}</i></small><div class="xpbar"><u style="width:${Math.round(li.frac * 100)}%"></u></div>`;
}
let lastHover: Element | null = null;

export function showHome(on: boolean) { $('home').classList.toggle('off', !on); if (on) setTab(tab, true); }
export function showPause(on: boolean) { $('pause').classList.toggle('on', on); }

export function setTab(t: Tab, quiet = false) {
  tab = t; if (!quiet) sound?.ui('tab');
  if (t !== 'garage' && viewId !== opt.bike) { viewId = opt.bike; hooks?.preview(); }
  $('nav').querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.t === t));
  render(); hooks?.tab(t);
}

const seg = (key: string, label: string, vals: [string, string][]) =>
  `<div class="row"><span>${label}</span><div class="seg" data-k="${key}">${vals.map(([v, n]) => `<button data-v="${v}" class="${opt[key] === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
const bar = (label: string, v: number, lo: number, hi: number) => `<div class="stat"><span>${label}</span><i><u style="width:${Math.round(clamp((v - lo) / (hi - lo), 0.06, 1) * 100)}%"></u></i></div>`;

/** A little skyline picture for a map, drawn from its own colours. */
function mapPic(m: MapDef): string {
  let seed = m.id.length * 977 + m.K * 31; const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  let bs = ''; for (let i = 0; i < 16; i++) { const h = 14 + r() * (m.id === 'desert' ? 22 : 50), x = i * 28 + 2, c = m.pal[(r() * m.pal.length) | 0]; bs += `<rect x="${x}" y="${76 - 14 - h}" width="24" height="${h + 2}" fill="${c[0]}"/>`; for (let k = 0; k < 4; k++) if (r() > 0.4) bs += `<rect x="${x + 4 + (k % 2) * 9}" y="${76 - 12 - h + 6 + Math.floor(k / 2) * 12}" width="5" height="6" fill="${c[1]}" opacity=".9"/>`; }
  return `<svg viewBox="0 0 448 76" preserveAspectRatio="none"><defs><linearGradient id="g${m.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(m.sky)}"/><stop offset="1" stop-color="${hex(m.night ? 0x2a1040 : m.sky)}" stop-opacity=".6"/></linearGradient></defs><rect width="448" height="76" fill="url(#g${m.id})"/>${bs}<rect y="62" width="448" height="14" fill="${hex(m.asphalt)}"/><rect y="68" width="448" height="2" fill="${m.night ? '#aab4d8' : '#e8d36a'}" opacity=".7"/></svg>`;
}

function render() {
  const p = $('panel'); const clone = p.cloneNode(false) as HTMLElement; // restart the entrance animation
  let h = '';
  if (tab === 'play') {
    const b = bikeDef(), m = mapDef(), best = loadBest();
    h = `<h2>Play</h2>
      <div class="mini"><div class="tile" data-go="garage"><small>Bike</small><b>${b.name}</b><span>${b.cc} cc &middot; ${b.category}</span></div><div class="tile" data-go="maps"><small>Map</small><b>${m.name}</b><span>${m.desc.split('.')[0]}</span></div></div>
      ${seg('mode', 'Mode', [['race', 'Race'], ['free', 'Free ride']])}
      ${seg('police', 'Police', [['1', 'On'], ['0', 'Off']])}
      ${seg('traffic', 'Traffic and people', [['0', 'Empty'], ['1', 'Normal'], ['2', 'Busy']])}
      ${opt.mode === 'race' ? seg('laps', 'Laps', [['1', '1'], ['2', '2'], ['3', '3']]) + seg('rivals', 'Rival riders', [['0', '0'], ['3', '3'], ['5', '5'], ['8', '8'], ['11', '11']]) + seg('field', 'Rivals ride', [['same', 'Same as me'], ['mixed', 'Mixed bikes']]) : ''}
      <button class="go" id="go">${opt.mode === 'race' ? 'START RACE' : 'START RIDING'}</button>
      <div class="best">${best && opt.mode === 'race' ? `Your best on ${m.name}: ${fmt(best)}` : '&nbsp;'}</div>`;
  } else if (tab === 'garage') {
    const b = previewDef(), have = owns(b.id), ownedN = BIKES.filter((x) => owns(x.id)).length;
    h = `<h2>Garage <span class="cnt">&#9679; ${profile.coins.toLocaleString()} coins &middot; collection ${ownedN}/${BIKES.length}</span></h2>
      <div class="cards">${BIKES.map((x) => `<div class="card ${x.id === b.id ? 'on' : ''} ${owns(x.id) ? '' : 'locked'}" data-bike="${x.id}"><em>${owns(x.id) ? (x.id === opt.bike ? 'RIDING' : x.cc + 'cc') : '&#128274; ' + x.price.toLocaleString()}</em><b>${x.name}</b><small>${x.cc}cc &middot; ${x.category}</small></div>`).join('')}</div>
      <h3>${b.name} &middot; ${b.category} &middot; ${b.cc} cc</h3>
      <div class="desc">${b.desc}</div>
      ${bar('Speed', b.top, 0.6, 1.4)}${bar('Pickup', b.accel, 0.6, 1.35)}${bar('Handling', b.turn, 0.65, 1.5)}${bar('Braking', b.brake, 0.8, 1.35)}${bar('Boost', b.boost, 0.5, 1.6)}
      ${have ? (b.id === opt.bike ? '<div class="owned">&#10003; Your bike</div>' : `<button class="go small" data-use="${b.id}">RIDE THIS BIKE</button>`) : `<button class="go small buy" data-buy="${b.id}" ${profile.coins >= b.price ? '' : 'disabled'}>BUY &middot; &#9679; ${b.price.toLocaleString()}${profile.coins >= b.price ? '' : ` (need ${(b.price - profile.coins).toLocaleString()} more)`}</button>`}
      <h3>Colour</h3>
      <div class="swatches">${COLORS.map((c) => `<div class="sw ${opt.color === c ? 'on' : ''}" data-color="${c}" style="background:${c || `linear-gradient(135deg, #ffd24a 50%, #e74c3c 50%)`}" title="${c ? c : 'Bike\'s own colour'}"></div>`).join('')}</div>`;
  } else if (tab === 'maps') {
    h = `<h2>Maps</h2><div class="cards" style="grid-template-columns:1fr">${MAPS.map((m) => { const bt = loadBest(m.id); return `<div class="card map ${m.id === opt.map ? 'on' : ''}" data-map="${m.id}">${mapPic(m)}<div class="mt"><b>${m.name}</b>${bt ? `<em>${fmt(bt)}</em>` : ''}<small>${m.desc}</small></div></div>`; }).join('')}</div>`;
  } else if (tab === 'profile') {
    const li = levelInfo(), fav = favouriteBike(), favName = BIKES.find((b) => b.id === fav)?.name ?? 'None yet';
    const n = (v: number, d = 0) => v.toFixed(d), t = profile.playSec, played = t >= 3600 ? `${(t / 3600).toFixed(1)} h` : `${Math.round(t / 60)} min`;
    const box = (v: string, l: string) => `<div><b>${v}</b><small>${l}</small></div>`;
    h = `<h2>Profile</h2>
      <div class="who"><input id="pname" maxlength="14" value="${profile.name}" spellcheck="false" /><span>LV ${li.level} &middot; ${titleOf(li.level)}</span></div>
      <div class="xpbar"><u style="width:${Math.round(li.frac * 100)}%"></u></div><div class="foot" style="margin:4px 0 0">${li.into} / ${li.need} XP to level ${li.level + 1}</div>
      <div class="pgrid">${box(String(profile.races), 'Races')}${box(String(profile.wins), 'Wins')}${box(String(profile.podiums), 'Podiums')}
        ${box(n(profile.distanceKm, 1) + ' km', 'Distance')}${box(Math.round(profile.topKmh) + ' km/h', 'Top speed')}${box(played, 'Time played')}
        ${box(String(profile.knockdowns), 'Riders knocked off')}${box(String(profile.fallen), 'Times you fell')}${box(String(profile.wrecks), 'Wrecks')}
        ${box(String(profile.busted), 'Busted')}${box(String(profile.pedHits), 'People hit')}${box(String(profile.loot), 'Crates')}
        ${box(profile.coins.toLocaleString(), 'Coins')}${box(`${BIKES.filter((x) => owns(x.id)).length} / ${BIKES.length}`, 'Bikes owned')}${box(String(profile.owned.length), 'Collection')}</div>
      <h3>Favourite bike</h3><div class="list"><div><span>${favName}</span><em>${fav ? profile.bikeUse[fav] + ' rides' : ''}</em></div></div>
      <h3>Best times</h3><div class="list">${MAPS.map((mp) => { const bt = loadBest(mp.id); return `<div><span>${mp.name}</span><em>${bt ? fmt(bt) : '<span class="dim">-</span>'}</em></div>`; }).join('')}</div>
      <h3>Recent races</h3><div class="list">${profile.history.length ? profile.history.slice(0, 6).map((r) => `<div><span>${MAPS.find((x) => x.id === r.map)?.name ?? r.map} &middot; ${BIKES.find((x) => x.id === r.bike)?.name ?? r.bike}</span><em>${r.dnf ? 'DNF' : `${r.pos}/${r.of} &middot; ${fmt(r.time)}`}</em></div>`).join('') : '<div class="dim">No races yet</div>'}</div>
      <button class="danger" id="resetp">Reset profile</button>`;
  } else if (tab === 'controls') {
    const k = (...a: string[]) => a.map((x) => `<kbd>${x}</kbd>`).join('');
    h = `<h2>Controls</h2><div class="keys">
      <span>${k('W', '&uarr;')}</span><span>Gas</span><span>${k('S', '&darr;')}</span><span>Brake and reverse</span><span>${k('A', 'D')} ${k('&larr;', '&rarr;')}</span><span>Steer</span>
      <span>${k('Space')}</span><span>Handbrake (drift)</span><span>${k('Shift')}</span><span>Boost (the bar refills when you let go)</span>
      <span>${k('Q')} ${k('E')}</span><span>Punch with the left / right hand</span><span>${k('F')}</span><span>Kick</span>
      <span>${k('R')}</span><span>Put the bike back on the road</span><span>${k('Esc')}</span><span>Pause</span></div>
      <h3>Tips</h3><div class="desc">Hit riders beside you, or come up fast behind one, to knock them off. Grab the coloured crates (N nitro, S super speed, D shield, P power hits) and ride over orange arrow pads for speed. Hitting people or crashing makes the police chase you.</div>`;
  } else {
    const v = sound.vol, sl = (k: 'master' | 'music' | 'sfx', n: string) => `<div class="slider"><span>${n}</span><input type="range" min="0" max="100" value="${Math.round(v[k] * 100)}" data-vol="${k}"><span id="v-${k}">${Math.round(v[k] * 100)}%</span></div>`;
    h = `<h2>Settings</h2>${sl('master', 'Master')}${sl('music', 'Music')}${sl('sfx', 'Effects')}<div class="desc">Music changes between the menu and the race. Effects include the engine, which sounds different for each bike.</div>`;
  }
  clone.innerHTML = h; p.replaceWith(clone); clone.id = 'panel'; bind(clone);
}

function bind(p: HTMLElement) {
  p.querySelectorAll<HTMLElement>('.seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return; opt[s.dataset.k!] = b.dataset.v!; save();
    if (s.dataset.k === 'mode') render(); else s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  p.querySelectorAll<HTMLElement>('[data-go]').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.go as Tab, true)));
  p.querySelectorAll<HTMLElement>('[data-bike]').forEach((c) => c.addEventListener('click', () => { viewId = c.dataset.bike!; if (owns(viewId)) { opt.bike = viewId; save(); sound.setBike(bikeDef().cc); } render(); hooks.preview(); }));
  p.querySelectorAll<HTMLElement>('[data-use]').forEach((c) => c.addEventListener('click', () => { opt.bike = c.dataset.use!; viewId = opt.bike; save(); sound.setBike(bikeDef().cc); render(); hooks.preview(); }));
  p.querySelectorAll<HTMLElement>('[data-buy]').forEach((c) => c.addEventListener('click', () => { const b = BIKES.find((x) => x.id === c.dataset.buy)!; if (buyBike(b.id, b.price)) { opt.bike = b.id; viewId = b.id; save(); sound.loot(); render(); hooks.preview(); } }));
  p.querySelectorAll<HTMLElement>('[data-color]').forEach((c) => c.addEventListener('click', () => { opt.color = c.dataset.color!; save(); render(); hooks.preview(); }));
  p.querySelectorAll<HTMLElement>('[data-map]').forEach((c) => c.addEventListener('click', () => { opt.map = c.dataset.map!; save(); render(); hooks.mapChanged(); }));
  p.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((r) => r.addEventListener('input', () => { const k = r.dataset.vol as 'master' | 'music' | 'sfx'; sound.setVol(k, Number(r.value) / 100); $('v-' + k).textContent = `${r.value}%`; }));
  p.querySelectorAll<HTMLInputElement>('[data-vol="sfx"]').forEach((r) => r.addEventListener('change', () => sound.thump(6)));
  $('go')?.addEventListener('click', () => hooks.start());
  const pn = p.querySelector<HTMLInputElement>('#pname'); if (pn) { pn.addEventListener('change', () => { setName(pn.value); pn.value = profile.name; }); pn.addEventListener('keydown', (e) => e.stopPropagation()); }
  p.querySelector('#resetp')?.addEventListener('click', () => { if (confirm('Reset your name, level, stats, coins and bikes? Best times are kept.')) { resetProfile(); render(); } });
}
