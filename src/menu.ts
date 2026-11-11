import { MAPS, clamp, type MapDef } from './city';
import { BIKES, setSteer, type BikeDef } from './bike';
import type { Sound } from './audio';
import { net, defaultServer } from './net';
import { profile, onProfile, levelInfo, titleOf, setName, resetProfile, favouriteBike, owns, buyBike, upLevel, upCost, buyUpgrade, UP_MAX, UP_STEP, loginInfo, claimLogin, claimDaily, claimDailyBonus, dailyBonusReady, claimSetTask, claimSetReward, hasClaimable, dailyList, setList, setStatus, msToReset, SETS, LOGIN_REWARDS } from './profile';

const $ = (id: string) => document.getElementById(id)!;
const QS = new URLSearchParams(location.search);
const OPT_KEY = 'bikerace.opts.v1';

/** The player's choices. Saved in the browser; the query string can override them for quick tests (?map=neon&bike=hyper&police=0). */
export const opt: Record<string, string> = { map: 'downtown', bike: 'street', color: '', field: 'same', mode: 'race', police: '1', traffic: '1', laps: '2', rivals: '3', steer: '100', diff: 'normal', pub: '1' };
try { Object.assign(opt, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch { /* defaults */ }
for (const k of Object.keys(opt)) if (QS.has(k)) opt[k] = QS.get(k)!;
const save = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(opt)); } catch { /* ignore */ } };

setSteer((Number(opt.steer) || 100) / 100);
/** The game types. laps / rivals say which options apply. */
export const MODES: { id: string; name: string; short: string; desc: string; laps?: boolean; rivals?: boolean }[] = [
  { id: 'race', name: 'Race', short: 'Beat the rivals', desc: 'Race rival riders around the route. First across the line after the laps wins.', laps: true, rivals: true },
  { id: 'power', name: 'Power Race', short: 'Oil, bombs, rockets', desc: 'A race with powers. The crates give you oil, smoke, bombs, EMP bombs, a hook, a homing rocket or a warp jump (press G to use the one you hold), or a stick or a chain to swing with Q / E.', laps: true, rivals: true },
  { id: 'trial', name: 'Time Trial', short: 'Ride for a medal', desc: 'Ride the route alone against the clock. Beat the bronze, silver or gold time.', laps: true },
  { id: 'rush', name: 'Checkpoint Rush', short: 'Beat the clock', desc: 'You start with 40 seconds. Every checkpoint adds 7 more. How many can you reach?' },
  { id: 'knockout', name: 'Knockout', short: 'Last one standing', desc: 'Every 25 seconds the rider in last place is knocked out. Be the last one left.', rivals: true },
  { id: 'escape', name: 'Police Escape', short: 'Survive 2 minutes', desc: 'You start with four stars and the whole police force after you. Stay free for 2 minutes.' },
  { id: 'brawl', name: 'Brawl', short: 'Knock them off', desc: '90 seconds of street fighting. Knock off more riders than anyone else. Grab the crates: some hold a stick or a chain!', rivals: true },
  { id: 'coins', name: 'Coin Rush', short: 'Grab the gold', desc: '100 seconds to collect as many gold coins as you can across the city.' },
  { id: 'free', name: 'Free ride', short: 'Just explore', desc: 'Ride wherever you like. No rules, no clock.' },
];
/** The game types a room can play online: id, name, what it is. */
const MP_TYPES: [string, string, string, string?][] = [['coins', 'Coin Rush', '100 seconds: collect the most coins (each coin goes to whoever reaches it first)', 'Coins'], ['rush', 'Checkpoint Rush', 'Start with 40 seconds, every checkpoint adds 7: the most checkpoints wins', 'Rush'], ['race', 'Race', 'First over the line after the laps wins'], ['brawl', 'Brawl', '90 seconds: the most knock-offs wins'], ['knockout', 'Knockout', 'Every 25 seconds the last rider is out']];
MP_TYPES.push(...MP_TYPES.splice(0, 2));   // Race, Brawl, Knockout first
MP_TYPES.push(['power', 'Power Race', 'A race with powers from the crates (oil, smoke, bombs, EMP, hook, rocket, warp): press G to use one', 'Power']);
MP_TYPES.push(['escape', 'Police Escape', 'Everyone starts wanted by the police: stay free for 2 minutes', 'Escape']);
const mpType = (id: string) => MP_TYPES.find((x) => x[0] === id) ?? MP_TYPES[0];
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
type Tab = 'play' | 'online' | 'garage' | 'maps' | 'rewards' | 'profile' | 'controls' | 'settings';
const TABS: [Tab, string, string][] = [['play', 'PLAY', 'Start a race'], ['online', 'ONLINE', 'Race friends'], ['garage', 'GARAGE', 'Bikes and colours'], ['maps', 'MAPS', 'Pick a city'], ['rewards', 'REWARDS', 'Daily gifts and tasks'], ['profile', 'PROFILE', 'Stats and level'], ['controls', 'CONTROLS', 'Keys'], ['settings', 'SETTINGS', 'Sound']];
const COLORS = ['', '#e74c3c', '#ff7a1a', '#ffd24a', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#ff5fa8', '#ecf0f1', '#2c3e50'];

let sound: Sound, hooks: Hooks, tab: Tab = 'play', playSub: 'type' | 'rules' = 'type', profSub: 'stats' | 'records' | 'history' = 'stats', rwSub: 'daily' | 'sets' = 'daily', setSel = 'rookie', rewardMsg = '';

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
  net.h.lobby = () => { if (tab === 'online' && !$('home').classList.contains('off')) render(); };
  net.h.rooms = net.h.lobby;
  net.h.chat = (c) => { const log = document.getElementById('chatlog'); if (!log) return; const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = c.name.replace(/[<>&"]/g, ''); d.append(b, ' ' + c.text.replace(/[<>&"]/g, '')); log.appendChild(d); log.scrollTop = log.scrollHeight; };
  window.setInterval(() => { if (tab === 'online' && !net.lobby && net.status === 'on' && !$('home').classList.contains('off')) net.list(); }, 4000);   // keep the room list fresh
  onProfile(renderChip); onProfile(renderBadge); renderChip(); renderBadge();
  setTab('play', true);
}
function renderBadge() { document.querySelector('#nav [data-t=rewards]')?.classList.toggle('has', hasClaimable()); }
function renderChip() {
  const li = levelInfo();
  $('chip').innerHTML = `<b>${profile.name}</b><span>LV ${li.level}</span><small>${titleOf(li.level)} &middot; <i style="color:#ffd24a;font-style:normal"><i class="coin"></i> ${profile.coins.toLocaleString()}</i></small><div class="xpbar"><u style="width:${Math.round(li.frac * 100)}%"></u></div>`;
}
let lastHover: Element | null = null;

export function showHome(on: boolean) { $('home').classList.toggle('off', !on); if (on) setTab(tab, true); }
export function showPause(on: boolean) { $('pause').classList.toggle('on', on); }

export const syncMe = () => net.me(profile.name, opt.bike, opt.color);
export function setTab(t: Tab, quiet = false) {
  tab = t; if (!quiet) sound?.ui('tab');
  if (t !== 'garage' && viewId !== opt.bike) { viewId = opt.bike; hooks?.preview(); }
  $('nav').querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.t === t));
  render(); hooks?.tab(t);
  if (t === 'online' && !net.lobby) net.ensure(net.url || defaultServer()).then(() => net.list()).catch(() => { /* shown in the panel */ });
}

const seg = (key: string, label: string, vals: [string, string][]) =>
  `<div class="row"><span>${label}</span><div class="seg" data-k="${key}">${vals.map(([v, n]) => `<button data-v="${v}" class="${opt[key] === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
/** A stat bar of a bike you own: the bar includes your upgrades, and the button buys the next level. */
const upBar = (label: string, i: number, b: BikeDef, v: number, lo: number, hi: number) => {
  const lv = upLevel(b.id, i), cost = upCost(b.price, lv), w = Math.round(clamp((v * (1 + UP_STEP * lv) - lo) / (hi - lo), 0.06, 1) * 100);
  const btn = lv >= UP_MAX ? '<em class="max">MAX</em>' : `<button class="upb" data-up="${i}" ${profile.coins >= cost ? '' : 'disabled'} title="Upgrade ${label} to level ${lv + 1} of ${UP_MAX} (+${Math.round(UP_STEP * 100)}%)${profile.coins >= cost ? '' : ': you need ' + (cost - profile.coins).toLocaleString() + ' more coins'}">${'&#9679;'.repeat(lv)}${'&#9675;'.repeat(UP_MAX - lv)} <i class="coin"></i>${cost.toLocaleString()}</button>`;
  return `<div class="stat up"><span>${label}</span><i class="${lv ? 'tuned' : ''}"><u style="width:${w}%"></u></i>${btn}</div>`;
};
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
    const b = bikeDef(), m = mapDef(), md = MODES.find((x) => x.id === opt.mode) ?? MODES[0], best = loadBest(md.id === 'trial' ? 'trial.' + opt.map : opt.map);
    const dsc = { easy: 'Slower rivals and police, 5 respawns, forgiving crashes. Rewards x0.7.', normal: 'The standard challenge. Rewards x1.', hard: 'Fast aggressive rivals who use boost, quicker police, 2 respawns, harsh crashes. Rewards x1.5.' }[opt.diff] ?? '';
    const typePage = `<div class="cards modes">${MODES.map((x) => `<div class="card ${x.id === opt.mode ? 'on' : ''}" data-mode="${x.id}"><b>${x.name}</b><small>${x.short}</small></div>`).join('')}</div>
      <div class="desc" style="margin:10px 0 4px">${md.desc}</div>
      <div class="rulesum">Rules: <b>${({ easy: 'Easy', normal: 'Normal', hard: 'Hard' } as Record<string, string>)[opt.diff] ?? 'Normal'}</b> &middot; ${md.id === 'escape' || opt.police === '1' ? 'Police on' : 'Police off'} &middot; Traffic ${['empty', 'normal', 'busy'][Number(opt.traffic)] ?? 'normal'}${md.laps ? ` &middot; ${opt.laps} lap${opt.laps === '1' ? '' : 's'}` : ''}${md.rivals ? ` &middot; ${Math.max(Number(opt.rivals), md.id === 'race' || md.id === 'power' ? 0 : 5)} rivals` : ''}</div>`;
    const rulesPage = `${seg('diff', 'Difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}
      <div class="desc" style="margin:-4px 0 8px;font-size:14px">${dsc}</div>
      ${md.id === 'escape' ? '' : seg('police', 'Police', [['1', 'On'], ['0', 'Off']])}
      ${seg('traffic', 'Traffic and people', [['0', 'Empty'], ['1', 'Normal'], ['2', 'Busy']])}
      ${md.laps ? seg('laps', 'Laps', [['1', '1'], ['2', '2'], ['3', '3']]) : ''}${md.rivals ? seg('rivals', md.id === 'race' ? 'Rival riders' : 'Rival riders (at least 5)', [['0', '0'], ['3', '3'], ['5', '5'], ['8', '8'], ['11', '11']]) : ''}${md.id === 'race' ? seg('field', 'Rivals ride', [['same', 'Same as me'], ['mixed', 'Mixed bikes']]) : ''}`;
    h = `<h2>Play</h2>
      <div class="pbody">
      <div class="mini slim"><div class="tile" data-go="garage"><small>Bike</small><b>${b.name}</b><span>${b.cc} cc &middot; ${b.category}</span></div><div class="tile" data-go="maps"><small>Map</small><b>${m.name}</b><span>${m.desc.split('.')[0]}</span></div></div>
      <div class="subbar" id="psub"><button data-sub="type" class="${playSub === 'type' ? 'on' : ''}">Game type</button><button data-sub="rules" class="${playSub === 'rules' ? 'on' : ''}">Rules</button></div>
      ${playSub === 'type' ? typePage : rulesPage}
      </div>
      <div class="pfoot"><button class="go" id="go">START ${md.name.toUpperCase()}</button>
      <div class="best">${best && (md.id === 'race' || md.id === 'trial') ? `Your best ${md.id === 'trial' ? 'trial ' : ''}time on ${m.name}: ${fmt(best)}` : '&nbsp;'}</div></div>`;
  } else if (tab === 'online') {
    const L = net.lobby, clean = (t: string) => t.replace(/[<>&"]/g, '');
    if (!L) {
      const rl = net.rooms;
      h = `<h2>Online</h2>
        <div class="desc">Race other players. Join an open room, or create one and share the code with friends.</div>
        <h3>Open rooms <button class="mini" id="refresh">Refresh</button></h3>
        <div class="plist">${rl.length ? rl.map((r) => `<div class="pl"><span>${clean(r.host)}'s room <small>${MAPS.find((x) => x.id === r.map)?.name ?? r.map} &middot; ${r.laps} lap${r.laps > 1 ? 's' : ''} &middot; ${r.players}/12</small></span><button class="go small" data-room="${r.code}" style="width:90px;margin:0;padding:7px">JOIN</button></div>`).join('') : `<div class="desc">${net.status === 'on' ? 'No open rooms right now. Create one!' : net.status === 'connecting' ? (net.waking ? 'Waking up the server... free servers sleep when nobody plays, this can take up to a minute.' : 'Connecting...') : 'Not connected to the server.'}</div>`}</div>
        <h3>Join with a code</h3><div class="joinrow"><input id="code" class="txt" maxlength="4" placeholder="CODE" spellcheck="false" /><button class="go" id="joinbtn">JOIN</button></div>
        <div style="display:flex;gap:10px;margin-top:14px"><button class="go" id="quickbtn" style="margin:0" title="Join the fullest open room, or start a public one if there is none">QUICK MATCH</button><button class="go" id="createbtn" style="margin:0">CREATE A ROOM</button></div>
        <label class="chk"><input type="checkbox" id="pubchk" ${opt.pub === '0' ? '' : 'checked'} /> Public: list my room for everyone</label>
        ${net.error ? `<div class="err">${net.error}</div>` : ''}
        <h3>Server</h3><input id="srv" class="txt" value="${net.url || defaultServer()}" spellcheck="false" />
        <div class="foot" style="margin-top:10px">Your bike, colour and name from the Garage and Profile are used. The host chooses police and traffic; each player sees their own cars and the police chase only you.</div>`;
    } else {
      const host = net.isHost, st = L.settings;
      h = `<h2>Room <span class="code">${L.code}</span></h2>
        <div class="desc">${L.pub ? 'Public room' : 'Private room: share the code'} &middot; ${L.players.length} / 12 players${L.status === 'racing' ? ' &middot; race in progress' : ''}</div>
        <div class="plist">${L.players.map((p) => `<div class="pl ${p.id === L.you ? 'me' : ''}"><span>${p.name}${p.id === L.host ? '<i>HOST</i>' : ''}${p.id === L.you ? '<i>YOU</i>' : ''}</span><small>${BIKES.find((b) => b.id === p.bike)?.name ?? ''}${host && p.id !== L.you ? `<button class="kb" data-kick="${p.id}" title="Remove this player from the room">Kick</button><button class="kb ban" data-ban="${p.id}" title="Remove this player and stop them rejoining">Ban</button>` : ''}</small></div>`).join('')}</div>
        ${host ? `<h3>Race settings</h3>
          <div class="row"><span>Game type</span><div class="seg" id="mpmode">${MP_TYPES.map(([v, nm, d, sh]) => `<button data-v="${v}" title="${nm}: ${d}" class="${st.mode === v ? 'on' : ''}">${sh ?? nm}</button>`).join('')}</div></div>
          <div class="row"><span>Map</span><div class="seg" id="mpmap">${MAPS.map((x) => `<button data-v="${x.id}" class="${st.map === x.id ? 'on' : ''}">${x.name}</button>`).join('')}</div></div>
          ${st.mode === 'race' || st.mode === 'power' ? `<div class="row"><span>Laps</span><div class="seg" id="mplaps">${[1, 2, 3].map((n) => `<button data-v="${n}" class="${st.laps === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>` : `<div class="row"><span>Rules</span><small style="color:#8fb0d0;font-weight:600">${mpType(st.mode)[2]}${L.players.length < 2 ? ' &middot; needs 2 players' : ''}</small></div>`}
          <div class="row"><span>Police</span><div class="seg" id="mppol"><button data-v="1" class="${st.police ? 'on' : ''}">On</button><button data-v="0" class="${st.police ? '' : 'on'}">Off</button></div></div>
          <div class="row"><span>Traffic and people</span><div class="seg" id="mptraf">${[['0', 'Empty'], ['1', 'Normal'], ['2', 'Busy']].map(([v, nm]) => `<button data-v="${v}" class="${st.traffic === Number(v) ? 'on' : ''}">${nm}</button>`).join('')}</div></div>
          <div class="row"><span>Room</span><div class="seg" id="mppub"><button data-v="1" class="${L.pub ? 'on' : ''}">Public</button><button data-v="0" class="${L.pub ? '' : 'on'}">Private</button></div></div>
          <button class="go" id="mpstart" ${L.status === 'racing' ? 'disabled' : ''}>START ${mpType(st.mode)[1].toUpperCase()}</button>`
        : `<h3>Race settings</h3><div class="desc"><b>${mpType(st.mode)[1]}</b>: ${mpType(st.mode)[2]}<br>${MAPS.find((x) => x.id === st.map)?.name ?? st.map}${st.mode === 'race' || st.mode === 'power' ? ` &middot; ${st.laps} lap${st.laps > 1 ? 's' : ''}` : ''} &middot; Police ${st.police ? 'on' : 'off'} &middot; Traffic ${['empty', 'normal', 'busy'][st.traffic] ?? 'normal'}<br>Waiting for the host to start...</div>`}
        <h3>Chat</h3><div class="chat" id="chatlog">${net.chatLog.map((c) => `<div><b>${clean(c.name)}</b> ${clean(c.text)}</div>`).join('')}</div>
        <input id="chatin" class="txt" maxlength="120" placeholder="Type a message and press Enter" spellcheck="false" style="margin-top:6px" />
        <button class="danger" id="mpleave">Leave room</button>${net.error ? `<div class="err">${net.error}</div>` : ''}`;
    }
  } else if (tab === 'garage') {
    const b = previewDef(), have = owns(b.id), ownedN = BIKES.filter((x) => owns(x.id)).length;
    h = `<h2>Garage <span class="cnt"><i class="coin"></i> ${profile.coins.toLocaleString()} &middot; collection ${ownedN}/${BIKES.length}</span></h2>
      <div class="pbody">
      <div class="cards bikes">${BIKES.map((x) => `<div class="card ${x.id === b.id ? 'on' : ''} ${owns(x.id) ? '' : 'locked'}" data-bike="${x.id}"><b>${x.name}</b><em>${owns(x.id) ? (x.id === opt.bike ? 'RIDING' : x.cc + 'cc') : '&#128274; ' + x.price.toLocaleString()}</em></div>`).join('')}</div>
      <h3>${b.name} &middot; ${b.category} &middot; ${b.cc} cc${have ? ` &middot; upgrades ${[0, 1, 2, 3, 4].reduce((s, i) => s + upLevel(b.id, i), 0)}/${UP_MAX * 5}` : ''}</h3>
      <div class="desc" style="margin-bottom:6px">${b.desc}</div>
      <div class="statgrid">${([['Speed', b.top, 0.6, 1.4], ['Pickup', b.accel, 0.6, 1.35], ['Handling', b.turn, 0.65, 1.5], ['Braking', b.brake, 0.8, 1.35], ['Boost', b.boost, 0.5, 1.6]] as [string, number, number, number][]).map(([l, v, lo, hi], i) => have ? upBar(l, i, b, v, lo, hi) : bar(l, v, lo, hi)).join('')}</div>
      <div class="row" style="margin:10px 0 0"><span>Colour</span><div class="swatches">${COLORS.map((c) => `<div class="sw ${opt.color === c ? 'on' : ''}" data-color="${c}" style="background:${c || `linear-gradient(135deg, #ffd24a 50%, #e74c3c 50%)`}" title="${c ? c : 'Bike\'s own colour'}"></div>`).join('')}</div></div>
      </div>
      <div class="pfoot">${have ? (b.id === opt.bike ? '<div class="owned" style="text-align:center">&#10003; Your bike</div>' : `<button class="go small" data-use="${b.id}">RIDE THIS BIKE</button>`) : `<button class="go small buy" data-buy="${b.id}" ${profile.coins >= b.price ? '' : 'disabled'}>BUY &middot; <i class="coin"></i> ${b.price.toLocaleString()}${profile.coins >= b.price ? '' : ` (need ${(b.price - profile.coins).toLocaleString()} more)`}</button>`}</div>`;
  } else if (tab === 'maps') {
    const sel = mapDef();
    h = `<h2>Maps</h2><div class="cards maps">${MAPS.map((x) => { const bt = loadBest(x.id); return `<div class="card map ${x.id === opt.map ? 'on' : ''}" data-map="${x.id}">${mapPic(x)}<div class="mt"><b>${x.name}</b>${bt ? `<em>${fmt(bt)}</em>` : ''}</div></div>`; }).join('')}</div>
      <div class="desc" style="margin-top:10px"><b style="color:var(--gold)">${sel.name}.</b> ${sel.desc}</div>`;
  } else if (tab === 'rewards') {
    const info = loginInfo(), left = msToReset(), hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);
    const banner = rewardMsg ? `<div class="rwmsg">${rewardMsg}</div>` : ''; rewardMsg = '';
    const num2 = (v: number) => String(Math.floor(v * 10) / 10);
    const row = (def: { text: string; target: number; coins: number; xp: number }, pr: number, c: boolean, key: string) => {
      const done = pr >= def.target;
      return `<div class="trow ${c ? 'got' : done ? 'ready' : ''}"><div class="tt"><b>${def.text}</b><div class="tbar"><u style="width:${Math.round(Math.min(1, pr / def.target) * 100)}%"></u></div><small>${num2(Math.min(pr, def.target))} / ${def.target} &middot; <i class="coin"></i> ${def.coins} + ${def.xp} XP</small></div><button class="claim" data-claim="${key}" ${done && !c ? '' : 'disabled'}>${c ? '&#10003;' : 'CLAIM'}</button></div>`;
    };
    let page = '';
    if (rwSub === 'daily') {
      const days = LOGIN_REWARDS.map((cn, i) => { const st = info.claimed ? (i <= info.idx ? 'done' : '') : (i < info.idx ? 'done' : i === info.idx ? 'today' : ''); return `<div class="day ${st}"><small>Day ${i + 1}</small><b><i class="coin"></i> ${cn}</b>${st === 'done' ? '<span>&#10003;</span>' : ''}</div>`; }).join('');
      const bonus = `<div class="trow ${profile.daily.bonus ? 'got' : dailyBonusReady() ? 'ready' : ''}"><div class="tt"><b>Finish all three tasks: bonus chest</b><small><i class="coin"></i> 300 + 100 XP</small></div><button class="claim" data-claim="dbonus" ${dailyBonusReady() ? '' : 'disabled'}>${profile.daily.bonus ? '&#10003;' : 'OPEN'}</button></div>`;
      page = `<h3>Login reward <span class="rs">streak ${info.streak} day${info.streak === 1 ? '' : 's'}</span></h3><div class="days">${days}</div>
        <button class="go small" data-claim="login" ${info.claimed ? 'disabled' : ''}>${info.claimed ? 'Claimed today &middot; come back tomorrow' : `CLAIM DAY ${info.idx + 1} &middot; <i class="coin"></i> ${info.reward}`}</button>
        <h3>Today's tasks <span class="rs">new tasks in ${hh} h ${mm} min</span></h3>${dailyList().map((x, i) => row(x.def, x.p, x.c, 'd:' + i)).join('')}${bonus}`;
    } else {
      const chips = SETS.map((s) => { const st = setStatus(s.id); return `<button data-setsel="${s.id}" class="${s.id === setSel ? 'on' : ''}">${s.name}<i>${st.rewardTaken ? '&#10003;' : st.claimed + '/' + st.total}</i></button>`; }).join('');
      const cur = SETS.find((x) => x.id === setSel) ?? SETS[0], stt = setStatus(cur.id);
      page = `<div class="setchips">${chips}</div>
        <div class="desc" style="margin:8px 0 2px">Finish every task in the set and claim the set reward. These count your whole career, not just today.</div>
        ${setList(cur.id).map((x) => row(x.def, x.p, x.c, `s:${cur.id}:${x.def.id}`)).join('')}
        <div class="trow setreward ${stt.rewardTaken ? 'got' : stt.ready ? 'ready' : ''}"><div class="tt"><b>Set reward: ${cur.reward.text}</b><small>${/coins/.test(cur.reward.text) ? '' : cur.reward.coins + ' coins + '}${cur.reward.xp} XP &middot; ${stt.claimed} / ${stt.total} tasks claimed</small></div><button class="claim" data-claim="sr:${cur.id}" ${stt.ready ? '' : 'disabled'}>${stt.rewardTaken ? '&#10003;' : 'CLAIM SET'}</button></div>`;
    }
    h = `<h2>Rewards</h2>${banner}
      <div class="subbar" id="rwsub"><button data-sub="daily" class="${rwSub === 'daily' ? 'on' : ''}">Daily</button><button data-sub="sets" class="${rwSub === 'sets' ? 'on' : ''}">Challenge sets</button></div>
      <div class="pbody">${page}</div>`;
  } else if (tab === 'profile') {
    const li = levelInfo(), fav = favouriteBike(), favName = BIKES.find((b) => b.id === fav)?.name ?? 'None yet';
    const n = (v: number, d = 0) => v.toFixed(d), t = profile.playSec, played = t >= 3600 ? `${(t / 3600).toFixed(1)} h` : `${Math.round(t / 60)} min`;
    const box = (v: string, l: string) => `<div><b>${v}</b><small>${l}</small></div>`;
    const stats = `<div class="who"><input id="pname" maxlength="14" value="${profile.name}" spellcheck="false" /><span>LV ${li.level} &middot; ${titleOf(li.level)}</span></div>
      <div class="xpbar"><u style="width:${Math.round(li.frac * 100)}%"></u></div><div class="foot" style="margin:4px 0 0">${li.into} / ${li.need} XP to level ${li.level + 1}</div>
      <div class="pgrid">${box(String(profile.races), 'Races')}${box(String(profile.wins), 'Wins')}${box(String(profile.podiums), 'Podiums')}${box(profile.coins.toLocaleString(), 'Coins')}
        ${box(n(profile.distanceKm, 1) + ' km', 'Distance')}${box(Math.round(profile.topKmh) + ' km/h', 'Top speed')}${box(played, 'Time played')}${box(`${BIKES.filter((x) => owns(x.id)).length} / ${BIKES.length}`, 'Bikes')}
        ${box(String(profile.knockdowns), 'Knocked off')}${box(String(profile.fallen), 'You fell')}${box(String(profile.wrecks), 'Wrecks')}${box(String(profile.busted), 'Busted')}
        ${box(String(profile.pedHits), 'People hit')}${box(String(profile.loot), 'Crates')}</div>`;
    const records = `<div class="list"><div><span>Favourite bike</span><em>${favName}${fav ? ' &middot; ' + profile.bikeUse[fav] + ' rides' : ''}</em></div>
      ${[['rush', 'Checkpoint Rush', 'checkpoints'], ['escape', 'Police Escape', 's'], ['coins', 'Coin Rush', 'coins'], ['brawl', 'Brawl', 'knock-offs']].map(([k, nm, u]) => `<div><span>${nm}</span><em>${profile.best[k] !== undefined ? profile.best[k] + (u === 's' ? ' s' : ' ' + u) : '<span class="dim">-</span>'}</em></div>`).join('')}</div>
      <h3>Best times</h3><div class="list">${MAPS.map((mp) => { const bt = loadBest(mp.id); return `<div><span>${mp.name}</span><em>${bt ? fmt(bt) : '<span class="dim">-</span>'}${loadBest('trial.' + mp.id) ? ' &middot; trial ' + fmt(loadBest('trial.' + mp.id)) : ''}</em></div>`; }).join('')}</div>`;
    const history = `<div class="list">${profile.history.length ? profile.history.slice(0, 8).map((r) => `<div><span>${MAPS.find((x) => x.id === r.map)?.name ?? r.map} &middot; ${BIKES.find((x) => x.id === r.bike)?.name ?? r.bike}</span><em>${r.dnf ? 'DNF' : `${r.pos}/${r.of} &middot; ${fmt(r.time)}`}${r.diff && r.diff !== 'normal' ? ` &middot; ${r.diff}` : ''}</em></div>`).join('') : '<div class="dim">No races yet</div>'}</div>
      <button class="danger" id="resetp">Reset profile</button>`;
    h = `<h2>Profile</h2>
      <div class="subbar" id="prsub">${([['stats', 'Stats'], ['records', 'Records'], ['history', 'Recent races']] as const).map(([id, nm]) => `<button data-sub="${id}" class="${profSub === id ? 'on' : ''}">${nm}</button>`).join('')}</div>
      <div class="pbody">${profSub === 'stats' ? stats : profSub === 'records' ? records : history}</div>`;
  } else if (tab === 'controls') {
    const k = (...a: string[]) => a.map((x) => `<kbd>${x}</kbd>`).join('');
    h = `<h2>Controls</h2><div class="keys">
      <span>${k('W', '&uarr;')}</span><span>Gas</span><span>${k('S', '&darr;')}</span><span>Brake and reverse</span><span>${k('A', 'D')} ${k('&larr;', '&rarr;')}</span><span>Steer</span>
      <span>${k('Space')}</span><span>Handbrake (drift)</span><span>${k('Shift')}</span><span>Boost (the bar refills when you let go)</span>
      <span>${k('Q')} ${k('E')}</span><span>Punch with the left / right hand</span><span>${k('F')}</span><span>Kick</span>
      <span>${k('R')}</span><span>Put the bike back on the road</span><span>${k('Esc')}</span><span>Pause</span></div>
      <h3 class="controls-tips">Tips</h3><div class="desc controls-tips">Hit riders beside you, or come up fast behind one, to knock them off. Grab the coloured crates (N nitro, S super speed, D shield, P power hits) and ride over orange arrow pads for speed. Hitting people or crashing makes the police chase you.</div>`;
  } else {
    const v = sound.vol, sl = (k: 'master' | 'music' | 'sfx', n: string) => `<div class="slider"><span>${n}</span><input type="range" min="0" max="100" value="${Math.round(v[k] * 100)}" data-vol="${k}"><span id="v-${k}">${Math.round(v[k] * 100)}%</span></div>`;
    h = `<h2>Settings</h2>${sl('master', 'Master')}${sl('music', 'Music')}${sl('sfx', 'Effects')}<div class="slider"><span>Steering</span><input type="range" min="60" max="160" step="5" value="${Number(opt.steer) || 100}" data-steer><span id="v-steer">${Number(opt.steer) || 100}%</span></div><div class="desc">Steering: higher makes the bike turn sharper. Tip: let go of the gas a little before a corner, and use Space to drift round tight ones. Music changes between the menu and the race. Effects include the engine, which sounds different for each bike.</div>`;
  }
  clone.className = (tab === 'play' || tab === 'garage' || tab === 'profile' || tab === 'rewards') ? 'fx' : '';   // these pages: a scrolling body (only if the window is very small) and a footer that stays in view
  clone.innerHTML = h; p.replaceWith(clone); clone.id = 'panel'; bind(clone);
}

function bind(p: HTMLElement) {
  p.querySelectorAll<HTMLElement>('.seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return; opt[s.dataset.k!] = b.dataset.v!; save();
    if (s.dataset.k === 'diff') render(); else s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  p.querySelectorAll<HTMLElement>('#psub [data-sub]').forEach((b2) => b2.addEventListener('click', () => { playSub = b2.dataset.sub as 'type' | 'rules'; render(); }));
  p.querySelectorAll<HTMLElement>('#rwsub [data-sub]').forEach((b2) => b2.addEventListener('click', () => { rwSub = b2.dataset.sub as 'daily' | 'sets'; render(); }));
  p.querySelectorAll<HTMLElement>('[data-setsel]').forEach((b2) => b2.addEventListener('click', () => { setSel = b2.dataset.setsel!; render(); }));
  p.querySelectorAll<HTMLElement>('[data-claim]').forEach((b2) => b2.addEventListener('click', () => {
    const k = b2.dataset.claim!; let msg = '';
    const pay = (x: { coins: number; xp: number } | null, what: string) => { if (x) msg = `${what}: +${x.coins} coins, +${x.xp} XP`; };
    if (k === 'login') pay(claimLogin(), 'Daily reward claimed');
    else if (k === 'dbonus') pay(claimDailyBonus(), 'Bonus chest opened');
    else if (k.startsWith('d:')) pay(claimDaily(Number(k.slice(2))), 'Task reward');
    else if (k.startsWith('s:')) { const [, sid, tid] = k.split(':'); pay(claimSetTask(sid, tid), 'Task reward'); }
    else if (k.startsWith('sr:')) { const x = claimSetReward(k.slice(3)); if (x) msg = `SET COMPLETE! You got ${x.text}`; }
    if (msg) { rewardMsg = msg; sound.loot(); render(); }
  }));
  p.querySelectorAll<HTMLElement>('#prsub [data-sub]').forEach((b2) => b2.addEventListener('click', () => { profSub = b2.dataset.sub as 'stats' | 'records' | 'history'; render(); }));
  p.querySelectorAll<HTMLElement>('[data-mode]').forEach((c) => c.addEventListener('click', () => { opt.mode = c.dataset.mode!; save(); render(); }));
  p.querySelectorAll<HTMLElement>('[data-go]').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.go as Tab, true)));
  p.querySelectorAll<HTMLElement>('[data-bike]').forEach((c) => c.addEventListener('click', () => { viewId = c.dataset.bike!; if (owns(viewId)) { opt.bike = viewId; save(); sound.setBike(bikeDef().cc); syncMe(); } render(); hooks.preview(); }));
  p.querySelectorAll<HTMLElement>('[data-use]').forEach((c) => c.addEventListener('click', () => { opt.bike = c.dataset.use!; viewId = opt.bike; save(); sound.setBike(bikeDef().cc); syncMe(); render(); hooks.preview(); }));
  p.querySelectorAll<HTMLElement>('[data-buy]').forEach((c) => c.addEventListener('click', () => { const b = BIKES.find((x) => x.id === c.dataset.buy)!; if (buyBike(b.id, b.price)) { opt.bike = b.id; viewId = b.id; save(); sound.loot(); syncMe(); render(); hooks.preview(); } }));
  p.querySelectorAll<HTMLElement>('[data-up]').forEach((c) => c.addEventListener('click', () => { const b = previewDef(); if (buyUpgrade(b.id, Number(c.dataset.up), b.price)) { sound.loot(); render(); } }));
  p.querySelectorAll<HTMLElement>('[data-color]').forEach((c) => c.addEventListener('click', () => { opt.color = c.dataset.color!; save(); syncMe(); render(); hooks.preview(); }));
  p.querySelectorAll<HTMLElement>('[data-map]').forEach((c) => c.addEventListener('click', () => { opt.map = c.dataset.map!; save(); render(); hooks.mapChanged(); }));
  p.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((r) => r.addEventListener('input', () => { const k = r.dataset.vol as 'master' | 'music' | 'sfx'; sound.setVol(k, Number(r.value) / 100); $('v-' + k).textContent = `${r.value}%`; }));
  p.querySelectorAll<HTMLInputElement>('[data-steer]').forEach((r) => r.addEventListener('input', () => { opt.steer = r.value; save(); setSteer(Number(r.value) / 100); $('v-steer').textContent = `${r.value}%`; }));
  p.querySelectorAll<HTMLInputElement>('[data-vol="sfx"]').forEach((r) => r.addEventListener('change', () => sound.thump(6)));
  $('go')?.addEventListener('click', () => hooks.start());
  const connectThen = (act: () => void) => { const u = (p.querySelector<HTMLInputElement>('#srv')?.value || net.url || defaultServer()).trim(); net.ensure(u).then(act).catch(() => { /* the error is shown in the panel */ }); };
  p.querySelector('#quickbtn')?.addEventListener('click', () => connectThen(() => net.quick(profile.name, opt.bike, opt.color)));
  p.querySelector('#createbtn')?.addEventListener('click', () => { const pub = p.querySelector<HTMLInputElement>('#pubchk')?.checked !== false; opt.pub = pub ? '1' : '0'; save(); connectThen(() => net.create(profile.name, opt.bike, opt.color, pub)); });
  p.querySelectorAll<HTMLElement>('[data-room]').forEach((b) => b.addEventListener('click', () => connectThen(() => net.join(b.dataset.room!, profile.name, opt.bike, opt.color))));
  p.querySelector('#refresh')?.addEventListener('click', () => { net.ensure(net.url || defaultServer()).then(() => net.list()).catch(() => { /* shown in the panel */ }); });
  p.querySelector('#mppol')?.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b && net.lobby) net.settings(net.lobby.settings.map, net.lobby.settings.laps, undefined, b.dataset.v === '1'); });
  p.querySelector('#mptraf')?.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b && net.lobby) net.settings(net.lobby.settings.map, net.lobby.settings.laps, undefined, undefined, Number(b.dataset.v)); });
  p.querySelector('#mppub')?.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b && net.lobby) net.settings(net.lobby.settings.map, net.lobby.settings.laps, b.dataset.v === '1'); });
  const doJoin = () => { const code = (p.querySelector<HTMLInputElement>('#code')?.value || '').trim(); if (code.length === 4) connectThen(() => net.join(code, profile.name, opt.bike, opt.color)); };
  p.querySelector('#joinbtn')?.addEventListener('click', doJoin);
  p.querySelectorAll<HTMLInputElement>('.txt').forEach((i) => { i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { if (i.id === 'code') doJoin(); else if (i.id === 'chatin' && i.value.trim()) { net.chat(i.value); i.value = ''; } } }); });
  p.querySelector('#mpmap')?.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b && net.lobby) net.settings(b.dataset.v!, net.lobby.settings.laps); });
  p.querySelector('#mpmode')?.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b && net.lobby) net.settings(net.lobby.settings.map, net.lobby.settings.laps, undefined, undefined, undefined, b.dataset.v); });
  p.querySelector('#mplaps')?.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b && net.lobby) net.settings(net.lobby.settings.map, Number(b.dataset.v)); });
  p.querySelectorAll<HTMLElement>('[data-kick]').forEach((b) => b.addEventListener('click', () => net.kick(Number(b.dataset.kick))));
  p.querySelectorAll<HTMLElement>('[data-ban]').forEach((b) => b.addEventListener('click', () => net.kick(Number(b.dataset.ban), true)));
  p.querySelector('#mpstart')?.addEventListener('click', () => net.start());
  p.querySelector('#mpleave')?.addEventListener('click', () => { net.leaveRoom(); render(); net.list(); });
  const log = p.querySelector('#chatlog'); if (log) log.scrollTop = log.scrollHeight;
  const pn = p.querySelector<HTMLInputElement>('#pname'); if (pn) { pn.addEventListener('change', () => { setName(pn.value); pn.value = profile.name; syncMe(); }); pn.addEventListener('keydown', (e) => e.stopPropagation()); }
  p.querySelector('#resetp')?.addEventListener('click', () => { if (confirm('Reset your name, level, stats, coins and bikes? Best times are kept.')) { resetProfile(); render(); } });
}
