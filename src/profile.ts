/** The player's profile, kept in the browser (localStorage): name, level, career stats, recent races. */
const KEY = 'bikerace.profile.v1';

export interface RaceResult { t: number; map: string; bike: string; pos: number; of: number; time: number; dnf: boolean }
export interface Profile {
  name: string; xp: number; coins: number; owned: string[];
  races: number; wins: number; podiums: number; dnf: number;
  distanceKm: number; playSec: number; topKmh: number;
  knockdowns: number; fallen: number; wrecks: number; busted: number; pedHits: number; loot: number;
  bikeUse: Record<string, number>; history: RaceResult[];
}
export interface RunStats { dist: number; top: number; ko: number; fell: number; wrecks: number; busted: number; ped: number; loot: number; coins: number; sec: number }
export const STARTERS = ['scooter', 'street'];

const blank = (): Profile => ({ name: 'Rider', xp: 0, coins: 0, owned: [...STARTERS], races: 0, wins: 0, podiums: 0, dnf: 0, distanceKm: 0, playSec: 0, topKmh: 0, knockdowns: 0, fallen: 0, wrecks: 0, busted: 0, pedHits: 0, loot: 0, bikeUse: {}, history: [] });
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);

function load(): Profile {
  const p = blank();
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (typeof o.name === 'string') p.name = cleanName(o.name);
    p.coins = Math.round(num(o.coins));
    if (Array.isArray(o.owned)) p.owned = [...new Set([...STARTERS, ...o.owned.filter((x: unknown) => typeof x === 'string').map((x: string) => x.slice(0, 16))])].slice(0, 20);
    for (const k of ['xp', 'races', 'wins', 'podiums', 'dnf', 'distanceKm', 'playSec', 'topKmh', 'knockdowns', 'fallen', 'wrecks', 'busted', 'pedHits', 'loot'] as const) p[k] = num(o[k]);
    if (o.bikeUse && typeof o.bikeUse === 'object') for (const [k, v] of Object.entries(o.bikeUse)) p.bikeUse[String(k).slice(0, 16)] = num(v);
    if (Array.isArray(o.history)) p.history = o.history.slice(0, 10).filter((h: RaceResult) => h && typeof h.map === 'string').map((h: RaceResult) => ({ t: num(h.t), map: String(h.map).slice(0, 16), bike: String(h.bike).slice(0, 16), pos: num(h.pos), of: num(h.of), time: num(h.time), dnf: !!h.dnf }));
  } catch { /* a fresh profile */ }
  return p;
}
export function cleanName(n: string): string { return (n.replace(/[^\w \-.]/g, '').trim().slice(0, 14)) || 'Rider'; }

export const profile: Profile = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ } };
const listeners: (() => void)[] = [];
export const onProfile = (f: () => void) => listeners.push(f);
const changed = () => { save(); listeners.forEach((f) => f()); };

/** Level n needs 120 * (n-1)^2 XP. */
export const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 120)) + 1;
export const levelStart = (lv: number) => 120 * (lv - 1) * (lv - 1);
export function levelInfo(xp = profile.xp) { const lv = levelOf(xp), a = levelStart(lv), b = levelStart(lv + 1); return { level: lv, into: xp - a, need: b - a, frac: (xp - a) / (b - a) }; }
export const LEVEL_NAMES = ['Rookie', 'Rookie', 'Street Rider', 'Street Rider', 'Racer', 'Racer', 'Pro', 'Pro', 'Veteran', 'Veteran', 'Legend'];
export const titleOf = (lv: number) => LEVEL_NAMES[Math.min(lv - 1, LEVEL_NAMES.length - 1)];

export function setName(n: string) { profile.name = cleanName(n); changed(); }

/** Add XP; returns whether the level went up. */
function addXp(n: number): boolean { const before = levelOf(profile.xp); profile.xp += Math.max(0, Math.round(n)); return levelOf(profile.xp) > before; }

/** A race finished (or ended as a DNF). Returns the XP earned and whether the player levelled up. */
export function recordRace(r: Omit<RaceResult, 't'>): { xp: number; coins: number; levelUp: boolean } {
  profile.races++; if (r.dnf) profile.dnf++; else { if (r.pos === 1) profile.wins++; if (r.pos <= 3) profile.podiums++; }
  const field = Math.max(1, r.of - 1);                         // bigger fields are worth more
  const xp = r.dnf ? 10 : 50 + Math.round((r.pos === 1 ? 200 : r.pos === 2 ? 120 : r.pos === 3 ? 70 : 30) * (0.5 + Math.min(field, 8) / 8));
  profile.history.unshift({ ...r, t: Date.now() }); profile.history.length = Math.min(profile.history.length, 10);
  const coins = r.dnf ? 0 : 100 + Math.round((r.pos === 1 ? 400 : r.pos === 2 ? 250 : r.pos === 3 ? 150 : 50) * (0.5 + Math.min(field, 8) / 8));
  profile.coins += coins;
  const levelUp = addXp(xp); changed(); return { xp, coins, levelUp };
}

/** The distance, fights and so on of one ride, added when the ride ends. Returns XP earned and whether the level went up. */
export function recordRun(s: RunStats, bike: string): { xp: number; coins: number; levelUp: boolean } {
  profile.distanceKm += s.dist / 1000; profile.playSec += s.sec; profile.topKmh = Math.max(profile.topKmh, s.top);
  profile.knockdowns += s.ko; profile.fallen += s.fell; profile.wrecks += s.wrecks; profile.busted += s.busted; profile.pedHits += s.ped; profile.loot += s.loot;
  if (s.sec > 20) profile.bikeUse[bike] = (profile.bikeUse[bike] ?? 0) + 1;
  const xp = s.ko * 10 + Math.round(s.dist / 1000 * 20) + s.loot * 2;
  const coins = s.coins + s.ko * 15; profile.coins += coins;
  const levelUp = addXp(xp); changed(); return { xp, coins, levelUp };
}

export const owns = (id: string) => profile.owned.includes(id);
/** Buy a bike with coins. Returns false when it is already owned or there are not enough coins. */
export function buyBike(id: string, price: number): boolean { if (owns(id) || profile.coins < price) return false; profile.coins -= price; profile.owned.push(id); changed(); return true; }

export function favouriteBike(): string | null { let best: string | null = null, n = 0; for (const [k, v] of Object.entries(profile.bikeUse)) if (v > n) { n = v; best = k; } return best; }
export function resetProfile() { const keep = profile.name; Object.assign(profile, blank(), { name: keep }); changed(); }
