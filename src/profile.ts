/** The player's profile, kept in the browser (localStorage): name, level, career stats, recent races. */
const KEY = 'bikerace.profile.v1';

export interface RaceResult { t: number; map: string; bike: string; pos: number; of: number; time: number; dnf: boolean; diff?: string }
export interface Profile {
  name: string; xp: number; coins: number; owned: string[];
  races: number; wins: number; podiums: number; dnf: number;
  distanceKm: number; playSec: number; topKmh: number;
  knockdowns: number; fallen: number; wrecks: number; busted: number; pedHits: number; loot: number;
  bikeUse: Record<string, number>; history: RaceResult[]; best: Record<string, number>; daily: Daily; sets: Record<string, SetState>;   // best: records of the game types (checkpoints, seconds, coins, knock-offs)
}
export interface RunStats { dist: number; top: number; ko: number; fell: number; wrecks: number; busted: number; ped: number; loot: number; coins: number; sec: number }
export const STARTERS = ['scooter', 'street'];

const blank = (): Profile => ({ name: 'Rider', xp: 0, coins: 0, owned: [...STARTERS], races: 0, wins: 0, podiums: 0, dnf: 0, distanceKm: 0, playSec: 0, topKmh: 0, knockdowns: 0, fallen: 0, wrecks: 0, busted: 0, pedHits: 0, loot: 0, bikeUse: {}, history: [], best: {}, daily: { day: '', last: '', streak: 0, claimed: false, tasks: [], bonus: false }, sets: {} });
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
    if (o.best && typeof o.best === 'object') for (const [k, v] of Object.entries(o.best).slice(0, 40)) p.best[String(k).slice(0, 24)] = num(v);
    p.daily = readDaily(o.daily); p.sets = readSets(o.sets);
    if (Array.isArray(o.history)) p.history = o.history.slice(0, 10).filter((h: RaceResult) => h && typeof h.map === 'string').map((h: RaceResult) => ({ t: num(h.t), map: String(h.map).slice(0, 16), bike: String(h.bike).slice(0, 16), pos: num(h.pos), of: num(h.of), time: num(h.time), dnf: !!h.dnf, diff: typeof h.diff === 'string' ? h.diff.slice(0, 8) : undefined }));
  } catch { /* a fresh profile */ }
  return p;
}
export function cleanName(n: string): string { return (n.replace(/[^\w \-.]/g, '').trim().slice(0, 14)) || 'Rider'; }

// ======================================================== daily rewards and tasks
export interface TaskDef { id: string; text: string; kind: string; target: number; coins: number; xp: number; max?: boolean }
export interface TaskState { p: number; c: boolean }
export interface Daily { day: string; last: string; streak: number; claimed: boolean; tasks: { id: string; p: number; c: boolean }[]; bonus: boolean }
export interface SetState { t: Record<string, TaskState>; done: boolean }
export interface SetDef { id: string; name: string; tasks: TaskDef[]; reward: { coins: number; xp: number; bike?: string; text: string } }
const T = (id: string, text: string, kind: string, target: number, coins: number, xp: number, max = false): TaskDef => ({ id, text, kind, target, coins, xp, max });
/** What the 7 days of the login streak give. */
export const LOGIN_REWARDS = [50, 75, 100, 150, 200, 300, 500];
/** Every day three of these are picked (the same three for the whole day). */
export const DAILY_POOL: TaskDef[] = [
  T('d_finish3', 'Finish 3 games', 'finish', 3, 150, 40), T('d_win1', 'Win a race or a game', 'win', 1, 200, 60), T('d_ko5', 'Knock off 5 riders', 'ko', 5, 150, 40),
  T('d_coins60', 'Collect 60 coins on the road', 'coins', 60, 120, 30), T('d_crates4', 'Grab 4 power-up crates', 'crates', 4, 120, 30), T('d_dist8', 'Ride 8 km', 'dist', 8, 150, 40),
  T('d_speed160', 'Reach 160 km/h', 'speed', 160, 100, 30, true), T('d_trial', 'Finish a Time Trial', 'trial', 1, 180, 50), T('d_rush8', 'Reach 8 checkpoints in Checkpoint Rush', 'rush', 8, 200, 60, true),
  T('d_escape', 'Escape the police', 'escape', 1, 250, 70),
];
/** Challenge sets: tasks that count your whole career. Finish every task in a set for the set reward. */
export const SETS: SetDef[] = [
  { id: 'rookie', name: 'Rookie Rider', tasks: [T('s1_finish', 'Finish 3 games', 'finish', 3, 60, 20), T('s1_ko', 'Knock off 10 riders', 'ko', 10, 80, 25), T('s1_coins', 'Collect 100 coins on the road', 'coins', 100, 80, 25), T('s1_crates', 'Grab 5 power-up crates', 'crates', 5, 60, 20)], reward: { coins: 500, xp: 150, text: '500 coins' } },
  { id: 'racer', name: 'Street Racer', tasks: [T('s2_win', 'Win 3 games', 'win', 3, 100, 30), T('s2_trial', 'Finish 2 Time Trials', 'trial', 2, 100, 30), T('s2_speed', 'Reach 180 km/h', 'speed', 180, 100, 30, true), T('s2_dist', 'Ride 20 km', 'dist', 20, 120, 35)], reward: { coins: 300, xp: 200, bike: 'dirt', text: 'the Enduro bike' } },
  { id: 'outlaw', name: 'City Outlaw', tasks: [T('s3_escape', 'Escape the police twice', 'escape', 2, 200, 50), T('s3_ko', 'Knock off 40 riders', 'ko', 40, 150, 40), T('s3_coins', 'Collect 400 coins on the road', 'coins', 400, 150, 40), T('s3_rush', 'Reach 12 checkpoints in Checkpoint Rush', 'rush', 12, 200, 50, true)], reward: { coins: 1500, xp: 300, text: '1,500 coins' } },
  { id: 'legend', name: 'Legend', tasks: [T('s4_finish', 'Finish 30 games', 'finish', 30, 250, 60), T('s4_win', 'Win 15 games', 'win', 15, 300, 80), T('s4_dist', 'Ride 100 km', 'dist', 100, 300, 80), T('s4_coins', 'Collect 1,500 coins on the road', 'coins', 1500, 300, 80), T('s4_crates', 'Grab 40 power-up crates', 'crates', 40, 250, 60)], reward: { coins: 1000, xp: 500, bike: 'classic', text: 'the Cafe Racer bike and 1,000 coins' } },
];
const ALL_TASKS = [...DAILY_POOL, ...SETS.flatMap((s) => s.tasks)];
const defOf = (id: string) => ALL_TASKS.find((t) => t.id === id);
function readDaily(o: any): Daily {
  const d: Daily = { day: '', last: '', streak: 0, claimed: false, tasks: [], bonus: false };
  if (!o || typeof o !== 'object') return d;
  d.day = typeof o.day === 'string' ? o.day.slice(0, 10) : ''; d.last = typeof o.last === 'string' ? o.last.slice(0, 10) : ''; d.streak = Math.min(9999, num(o.streak)); d.claimed = !!o.claimed; d.bonus = !!o.bonus;
  if (Array.isArray(o.tasks)) d.tasks = o.tasks.slice(0, 3).filter((t: any) => t && DAILY_POOL.some((x) => x.id === t.id)).map((t: any) => ({ id: String(t.id), p: num(t.p), c: !!t.c }));
  return d;
}
function readSets(o: any): Record<string, SetState> {
  const out: Record<string, SetState> = {}; if (!o || typeof o !== 'object') return out;
  for (const s of SETS) { const v = o[s.id]; if (!v || typeof v !== 'object') continue; const st: SetState = { t: {}, done: !!v.done }; for (const t of s.tasks) { const x = v.t?.[t.id]; if (x) st.t[t.id] = { p: Math.min(t.target, num(x.p)), c: !!x.c }; } out[s.id] = st; }
  return out;
}

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
export function recordRace(r: Omit<RaceResult, 't'>, mult = 1): { xp: number; coins: number; levelUp: boolean } {
  profile.races++; if (r.dnf) profile.dnf++; else { if (r.pos === 1) profile.wins++; if (r.pos <= 3) profile.podiums++; }
  const field = Math.max(1, r.of - 1);                         // bigger fields are worth more
  const xp = Math.round((r.dnf ? 10 : 50 + Math.round((r.pos === 1 ? 200 : r.pos === 2 ? 120 : r.pos === 3 ? 70 : 30) * (0.5 + Math.min(field, 8) / 8))) * mult);
  profile.history.unshift({ ...r, t: Date.now() }); profile.history.length = Math.min(profile.history.length, 10);
  const coins = Math.round((r.dnf ? 0 : 100 + Math.round((r.pos === 1 ? 400 : r.pos === 2 ? 250 : r.pos === 3 ? 150 : 50) * (0.5 + Math.min(field, 8) / 8))) * mult);
  profile.coins += coins;
  const levelUp = addXp(xp); changed(); return { xp, coins, levelUp };
}

/** The distance, fights and so on of one ride, added when the ride ends. Returns XP earned and whether the level went up. */
export function recordRun(s: RunStats, bike: string, mult = 1): { xp: number; coins: number; levelUp: boolean } {
  profile.distanceKm += s.dist / 1000; profile.playSec += s.sec; profile.topKmh = Math.max(profile.topKmh, s.top);
  profile.knockdowns += s.ko; profile.fallen += s.fell; profile.wrecks += s.wrecks; profile.busted += s.busted; profile.pedHits += s.ped; profile.loot += s.loot;
  if (s.sec > 20) profile.bikeUse[bike] = (profile.bikeUse[bike] ?? 0) + 1;
  const xp = Math.round((s.ko * 10 + Math.round(s.dist / 1000 * 20) + s.loot * 2) * mult);
  const coins = Math.round((s.coins + s.ko * 15) * mult); profile.coins += coins;
  const levelUp = addXp(xp); changed(); return { xp, coins, levelUp };
}

export const owns = (id: string) => profile.owned.includes(id);
/** Buy a bike with coins. Returns false when it is already owned or there are not enough coins. */
export function buyBike(id: string, price: number): boolean { if (owns(id) || profile.coins < price) return false; profile.coins -= price; profile.owned.push(id); changed(); return true; }

/** Coins and XP from a game type. Returns whether the level went up. */
export function grant(coins: number, xp: number): { levelUp: boolean } { profile.coins += Math.max(0, Math.round(coins)); const levelUp = addXp(xp); changed(); return { levelUp }; }
/** Keep the best value for a record; returns true when this one is a new record. */
export function recordBest(key: string, v: number, lowerIsBetter = false): boolean {
  const cur = profile.best[key]; if (cur !== undefined && (lowerIsBetter ? v >= cur : v <= cur)) return false;
  profile.best[key] = v; changed(); return true;
}

// ---------------------------------------------------------------- daily rewards
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayStr = () => dayStr(new Date());
const yesterdayStr = () => dayStr(new Date(Date.now() - 86400000));
/** Milliseconds until the daily tasks change (local midnight). */
export const msToReset = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime(); };
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function pickDaily(day: string) {
  let a = hash(day) || 1; const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  const pool = [...DAILY_POOL], out: { id: string; p: number; c: boolean }[] = [];
  while (out.length < 3) out.push({ id: pool.splice(Math.floor(rnd() * pool.length), 1)[0].id, p: 0, c: false });
  return out;
}
/** A new day: fresh tasks, and the streak breaks if yesterday's reward was missed. */
export function dailyRefresh(): boolean {
  const d = profile.daily, t = todayStr(); if (d.day === t && d.tasks.length === 3) return false;
  if (d.last !== yesterdayStr() && d.last !== t) d.streak = 0;
  d.day = t; d.claimed = d.last === t; d.tasks = pickDaily(t); d.bonus = false; changed(); return true;
}
dailyRefresh();
export function loginInfo() {
  dailyRefresh(); const d = profile.daily, idx = d.claimed ? ((d.streak - 1) % 7 + 7) % 7 : d.streak % 7;
  return { idx, reward: LOGIN_REWARDS[idx], claimed: d.claimed, streak: d.streak };
}
export function claimLogin(): { coins: number; xp: number } | null {
  dailyRefresh(); const d = profile.daily; if (d.claimed) return null;
  const idx = d.streak % 7, coins = LOGIN_REWARDS[idx], xp = idx === 6 ? 100 : 20;
  d.streak++; d.last = todayStr(); d.claimed = true; profile.coins += coins; addXp(xp); changed(); return { coins, xp };
}
let taskListener: ((text: string) => void) | null = null;
/** Called with the task's text when a task becomes complete. */
export const setTaskListener = (f: (text: string) => void) => { taskListener = f; };
const setState = (id: string): SetState => (profile.sets[id] ??= { t: {}, done: false });
/** The game reports what happened (finish, win, ko, coins, crates, dist, speed, trial, rush, escape); daily tasks and set tasks count it. */
export function bump(kind: string, amount: number) {
  if (!(amount > 0)) return; dailyRefresh(); let any = false;
  const apply = (st: TaskState, def: TaskDef) => {
    if (st.c || st.p >= def.target) return;
    const np = Math.min(def.target, def.max ? Math.max(st.p, amount) : st.p + amount);
    if (np !== st.p) { st.p = np; any = true; if (np >= def.target) taskListener?.(def.text); }
  };
  for (const t of profile.daily.tasks) { const def = defOf(t.id); if (def && def.kind === kind) apply(t, def); }
  for (const s of SETS) { const ss = setState(s.id); if (ss.done) continue; for (const def of s.tasks) if (def.kind === kind) apply((ss.t[def.id] ??= { p: 0, c: false }), def); }
  if (any) changed();
}
export const dailyList = () => { dailyRefresh(); return profile.daily.tasks.map((t) => ({ def: defOf(t.id)!, p: t.p, c: t.c })); };
export const setList = (id: string) => { const s = SETS.find((x) => x.id === id)!, ss = setState(id); return s.tasks.map((def) => { const t = ss.t[def.id] ?? { p: 0, c: false }; return { def, p: t.p, c: t.c }; }); };
export function setStatus(id: string) { const l = setList(id), ss = setState(id); return { total: l.length, claimed: l.filter((x) => x.c).length, complete: l.filter((x) => x.p >= x.def.target).length, rewardTaken: ss.done, ready: !ss.done && l.every((x) => x.c) }; }
const pay = (coins: number, xp: number) => { profile.coins += coins; addXp(xp); changed(); return { coins, xp }; };
export function claimDaily(i: number) { dailyRefresh(); const t = profile.daily.tasks[i], def = t && defOf(t.id); if (!t || !def || t.c || t.p < def.target) return null; t.c = true; return pay(def.coins, def.xp); }
export const dailyBonusReady = () => { const d = profile.daily; return !d.bonus && d.tasks.length === 3 && d.tasks.every((t) => t.c); };
export function claimDailyBonus() { if (!dailyBonusReady()) return null; profile.daily.bonus = true; return pay(300, 100); }
export function claimSetTask(setId: string, taskId: string) { const ss = setState(setId), def = defOf(taskId), t = ss.t[taskId]; if (!def || !t || t.c || t.p < def.target) return null; t.c = true; return pay(def.coins, def.xp); }
export function claimSetReward(setId: string): { text: string } | null {
  const s = SETS.find((x) => x.id === setId); if (!s || !setStatus(setId).ready) return null;
  setState(setId).done = true; let text = s.reward.text;
  if (s.reward.bike && !profile.owned.includes(s.reward.bike)) profile.owned.push(s.reward.bike); else if (s.reward.bike) { profile.coins += 600; text += ' (you had the bike: +600 coins)'; }
  pay(s.reward.coins, s.reward.xp); return { text };
}
/** Is there anything to claim? (shows the dot on the REWARDS button) */
export function hasClaimable(): boolean {
  dailyRefresh(); const d = profile.daily;
  if (!d.claimed || dailyBonusReady() || d.tasks.some((t) => { const def = defOf(t.id); return def && !t.c && t.p >= def.target; })) return true;
  return SETS.some((s) => { const st = setStatus(s.id); return st.ready || setList(s.id).some((x) => !x.c && x.p >= x.def.target); });
}

export function favouriteBike(): string | null { let best: string | null = null, n = 0; for (const [k, v] of Object.entries(profile.bikeUse)) if (v > n) { n = v; best = k; } return best; }
export function resetProfile() { const keep = profile.name; Object.assign(profile, blank(), { name: keep }); dailyRefresh(); changed(); }
