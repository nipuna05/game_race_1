/** Bike Race multiplayer server: rooms with a 4-letter code, a lobby, and a relay for riders' states during a race.
 *  Each player's page simulates its own bike; the server keeps the room, the start time, the shared random seed and the results. */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL_VERSION, MAX_PLAYERS, BIKE_IDS, MAP_IDS, MP_MODES, BRAWL_SECONDS, KNOCKOUT_FIRST, KNOCKOUT_EVERY, COINS_SECONDS, RUSH_CAP, type C2S, type S2C, type PlayerInfo, type Settings, type ResultRow, type RoomInfo } from '../shared/protocol';

const PORT = Number(process.env.PORT) || 8090;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);   // empty = any origin (fine on a home network)
const MAX_ROOMS = 40, MAX_PER_IP = 16;   // per address: a full room of 12 from one office or home network, plus a few spare

interface Player { id: number; ws: WebSocket; name: string; bike: string; color: string; fin: number | null; msgs: number; lastChat: number; cid: string; ip: string; ko: number; out: boolean; prog: number; lastKo: number }
interface Room { code: string; host: number; players: Map<number, Player>; status: 'lobby' | 'racing'; pub: boolean; settings: Settings; seed: number; finTimer: NodeJS.Timeout | null; banned: Set<string>; outOrder: number[]; taken: Set<number> }
const rooms = new Map<string, Room>();
const rooms_ = () => rooms;
const where = new WeakMap<WebSocket, { room: Room; me: Player }>();
const perIp = new Map<string, number>();
let nextId = 1;

const clean = (s: unknown) => String(s ?? '').replace(/[^\w \-.]/g, '').trim().slice(0, 14) || 'Rider';
const cleanBike = (b: unknown) => (BIKE_IDS.includes(String(b)) ? String(b) : 'street');
const cleanColor = (c: unknown) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : '');
const cleanCid = (c: unknown) => (/^[\w-]{8,40}$/.test(String(c)) ? String(c) : '');
const num = (v: unknown, lim = 5000) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : 0);
const send = (ws: WebSocket, m: S2C) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
const info = (p: Player): PlayerInfo => ({ id: p.id, name: p.name, bike: p.bike, color: p.color });
const list = (r: Room) => [...r.players.values()].sort((a, b) => a.id - b.id).map(info);
const newCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ'; for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += A[(Math.random() * A.length) | 0]; if (!rooms.has(c)) return c; } };

function snapshot(r: Room) { for (const p of r.players.values()) send(p.ws, { t: 'room', code: r.code, you: p.id, host: r.host, players: list(r), settings: r.settings, status: r.status, pub: r.pub }); }
function broadcast(r: Room, m: S2C, except?: number) { const s = JSON.stringify(m); for (const p of r.players.values()) if (p.id !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(s); }

function results(r: Room) {
  if (r.status !== 'racing') return;
  if (r.finTimer) { clearTimeout(r.finTimer); r.finTimer = null; }
  const ps = [...r.players.values()], mode = r.settings.mode; let rows: ResultRow[];
  if (mode === 'brawl' || mode === 'coins' || mode === 'rush') rows = ps.map((p) => ({ id: p.id, name: p.name, time: null, score: p.ko })).sort((a, b) => b.score - a.score);   // most knock-offs, coins or checkpoints first
  else if (mode === 'knockout') {                                // the last rider standing first, then the others from the last one out to the first
    const beaten = (p: Player) => (p.out ? r.outOrder.indexOf(p.id) : r.outOrder.length);
    rows = ps.map((p) => ({ id: p.id, name: p.name, time: null, score: beaten(p) })).sort((a, b) => b.score - a.score);
  } else { rows = ps.map((p) => ({ id: p.id, name: p.name, time: p.fin })); rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9)); }
  r.status = 'lobby'; broadcast(r, { t: 'results', list: rows, mode }); snapshot(r);
}
/** Knockout: the rider furthest behind is out; the game ends when one is left. */
function knockOut(r: Room) {
  r.finTimer = null; if (r.status !== 'racing') return;
  const alive = [...r.players.values()].filter((p) => !p.out);
  if (alive.length <= 1) { results(r); return; }
  const loser = alive.reduce((a, b) => (b.prog < a.prog ? b : a));
  loser.out = true; r.outOrder.push(loser.id); broadcast(r, { t: 'out', id: loser.id });
  if (alive.length - 1 <= 1) results(r); else r.finTimer = setTimeout(() => knockOut(r), KNOCKOUT_EVERY * 1000);
}
/** Is the game over now that someone left? A race when everyone left has finished; Brawl and Knockout when fewer than two are still playing. */
const over = (r: Room) => { const ps = [...r.players.values()]; return r.settings.mode === 'race' || r.settings.mode === 'rush' ? ps.every((p) => p.fin !== null) : ps.filter((p) => !p.out).length < 2; };
function leave(ws: WebSocket) {
  const w = where.get(ws); if (!w) return; where.delete(ws);
  const { room: r, me } = w; r.players.delete(me.id);
  if (r.players.size === 0) { if (r.finTimer) clearTimeout(r.finTimer); rooms.delete(r.code); return; }
  if (r.host === me.id) r.host = Math.min(...r.players.keys());
  broadcast(r, { t: 'left', id: me.id });
  if (r.status === 'racing' && over(r)) results(r); else snapshot(r);
}

// a plain web request gets a friendly 200 (hosts use it as a health check); WebSocket connections are handled on the same port
const web = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('Bike Race game server is running\n'); });
const wss = new WebSocketServer({ server: web, maxPayload: 4096, perMessageDeflate: false });
// heartbeat: ping every connection every 15 s and drop the ones that do not answer, so a closed laptop or a lost network frees its place in the room
// (and the room's host moves on). It also keeps quiet lobby connections from being closed by the proxy in front of the server.
const alive = new WeakMap<WebSocket, boolean>();
setInterval(() => { for (const ws of wss.clients) { if (alive.get(ws) === false) { ws.terminate(); continue; } alive.set(ws, false); try { ws.ping(); } catch { /* closing */ } } }, 15000);

wss.on('connection', (ws, req) => {
  alive.set(ws, true); ws.on('pong', () => alive.set(ws, true));
  const origin = req.headers.origin;
  if (ALLOWED.length && origin && !ALLOWED.includes(origin)) { ws.close(1008, 'origin'); return; }
  // behind a host's proxy (Fly, Render) every connection comes from the proxy's address, so take the player's address from the proxy's header
  const ip = String(req.headers['fly-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress);
  if ((perIp.get(ip) ?? 0) >= MAX_PER_IP) { send(ws, { t: 'err', msg: 'Too many connections from your network. Close other game tabs and try again in a minute.' }); ws.close(1013, 'too many connections'); return; }
  perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
  ws.on('close', () => { leave(ws); perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1)); });
  ws.on('error', () => { /* ignore */ });
  let count = 0; const tick = setInterval(() => { count = 0; }, 1000); ws.on('close', () => clearInterval(tick));

  ws.on('message', (raw) => {
    if (++count > 120) return;                                  // more than 120 messages a second: ignore
    let m: C2S; try { m = JSON.parse(String(raw)); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const w = where.get(ws);

    if (m.t === 'create' || m.t === 'join' || m.t === 'quick') {
      if (w) return;
      if (m.ver !== PROTOCOL_VERSION) { send(ws, { t: 'err', msg: 'This version of the game is out of date. Reload the page.' }); return; }
      let r: Room | undefined;
      const banKey = cleanCid(m.cid) || 'ip:' + ip;
      if (m.t === 'quick') r = [...rooms.values()].filter((x) => x.pub && x.status === 'lobby' && x.players.size < MAX_PLAYERS && !x.banned.has(banKey)).sort((a, b) => b.players.size - a.players.size)[0];   // the fullest open room
      if (m.t === 'create' || (m.t === 'quick' && !r)) {
        if (rooms.size >= MAX_ROOMS) { send(ws, { t: 'err', msg: 'The server is full. Try again later.' }); return; }
        r = { code: newCode(), host: 0, players: new Map(), status: 'lobby', pub: m.t === 'create' ? m.pub !== false : true, settings: { map: 'downtown', laps: 2, police: true, traffic: 1, mode: 'race' }, seed: 1, finTimer: null, banned: new Set(), outOrder: [], taken: new Set() }; rooms.set(r.code, r);
      } else if (m.t === 'join') {
        r = rooms.get(String(m.code).toUpperCase().trim());
        if (!r) { send(ws, { t: 'err', msg: 'No room with that code.' }); return; }
        if (r.status !== 'lobby') { send(ws, { t: 'err', msg: 'A race is in progress. Try again when it ends.' }); return; }
        if (r.banned.has(banKey)) { send(ws, { t: 'err', msg: 'The host banned you from this room.' }); return; }
        if (r.players.size >= MAX_PLAYERS) { send(ws, { t: 'err', msg: 'The room is full.' }); return; }
      }
      if (!r) return;
      const me: Player = { id: nextId++, ws, name: clean(m.name), bike: cleanBike(m.bike), color: cleanColor(m.color), fin: null, msgs: 0, lastChat: 0, cid: cleanCid(m.cid), ip, ko: 0, out: false, prog: 0, lastKo: 0 };
      r.players.set(me.id, me); if (!r.host) r.host = me.id; where.set(ws, { room: r, me }); snapshot(r); return;
    }
    if (m.t === 'list') {   // the open rooms: public, waiting in the lobby and not full
      const rooms: RoomInfo[] = [...rooms_().values()].filter((r) => r.pub && r.status === 'lobby' && r.players.size < MAX_PLAYERS).slice(0, 30)
        .map((r) => ({ code: r.code, host: r.players.get(r.host)?.name ?? '?', players: r.players.size, map: r.settings.map, laps: r.settings.laps }));
      send(ws, { t: 'rooms', rooms }); return;
    }
    if (!w) return;
    const { room: r, me } = w;

    if (m.t === 'me') { if (r.status !== 'lobby') return; me.name = clean(m.name); me.bike = cleanBike(m.bike); me.color = cleanColor(m.color); snapshot(r); }
    else if (m.t === 'settings') { if (r.host !== me.id || r.status !== 'lobby') return; r.settings = { map: MAP_IDS.includes(m.map) ? m.map : 'downtown', laps: Math.max(1, Math.min(3, Math.round(num(m.laps, 9)) || 2)),
        police: typeof m.police === 'boolean' ? m.police : r.settings.police, traffic: m.traffic === undefined ? r.settings.traffic : Math.max(0, Math.min(2, Math.round(num(m.traffic, 9)))),
        mode: MP_MODES.includes(String(m.mode)) ? String(m.mode) : r.settings.mode }; if (typeof m.pub === 'boolean') r.pub = m.pub; snapshot(r); }
    else if (m.t === 'chat') {
      const now = Date.now(); if (now - me.lastChat < 700) return; me.lastChat = now;      // at most one message every 0.7 s
      const text = String(m.text ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120); if (!text) return;
      broadcast(r, { t: 'chat', id: me.id, name: me.name, text });
    }
    else if (m.t === 'kick') {   // the host removes a player, in the lobby or during a race; they stay connected and can join other rooms
      const to = r.players.get(m.id); if (r.host !== me.id || !to || to.id === me.id) return;
      if (m.ban) r.banned.add(to.cid || 'ip:' + to.ip);
      send(to.ws, { t: 'kicked', ban: !!m.ban }); leave(to.ws);
    }
    else if (m.t === 'start') {
      if (r.host !== me.id || r.status !== 'lobby') return;
      const mode = r.settings.mode;
      if (mode !== 'race' && r.players.size < 2) { send(ws, { t: 'err', msg: 'Brawl and Knockout need at least two players.' }); return; }
      r.status = 'racing'; r.seed = (Math.random() * 2 ** 31) | 0; r.outOrder = []; r.taken = new Set(); for (const p of r.players.values()) { p.fin = null; p.ko = 0; p.out = false; p.prog = 0; }
      broadcast(r, { t: 'start', inMs: 4500, seed: r.seed, settings: r.settings, players: list(r) }); snapshot(r);
      if (r.finTimer) clearTimeout(r.finTimer); r.finTimer = null;      // the server keeps the clock of the timed game types
      if (mode === 'brawl') r.finTimer = setTimeout(() => results(r), 4500 + BRAWL_SECONDS * 1000);
      else if (mode === 'knockout') r.finTimer = setTimeout(() => knockOut(r), 4500 + KNOCKOUT_FIRST * 1000);
      else if (mode === 'coins') r.finTimer = setTimeout(() => results(r), 4500 + COINS_SECONDS * 1000);
      else if (mode === 'rush') r.finTimer = setTimeout(() => results(r), 4500 + RUSH_CAP * 1000);
    }
    else if (m.t === 's') {
      if (r.status !== 'racing') return;
      me.prog = num(m.pr, 1e7);
      if (r.settings.mode === 'rush' && me.fin === null) me.ko = Math.max(0, num(m.p, 999) | 0);   // Checkpoint Rush: the score is the checkpoints passed
      broadcast(r, { t: 's', id: me.id, pr: me.prog, x: num(m.x), z: num(m.z), h: num(m.h, 100), v: num(m.v, 200), l: num(m.l, 200), st: num(m.st, 2), ln: num(m.ln, 3), f: m.f ? 1 : 0, fd: m.fd < 0 ? -1 : 1, pw: num(m.pw, 15) | 0, p: Math.max(0, num(m.p, 999) | 0), sw: num(m.sw, 4) | 0 }, me.id);
    }
    else if (m.t === 'hit') {
      const to = r.players.get(m.to); if (!to || r.status !== 'racing' || to.id === me.id) return;
      send(to.ws, { t: 'hit', from: me.id, to: to.id, mag: Math.max(0, Math.min(2, num(m.mag, 5))), shove: Math.max(-2, Math.min(2, num(m.shove, 5))), how: m.how === 'kick' ? 'kick' : m.how === 'rear' ? 'rear' : 'punch' });
    }
    else if (m.t === 'ko') {   // the rider who fell says who did it; at most one every 1.5 s
      const by = r.players.get(m.by), now = Date.now(); if (r.status !== 'racing' || !by || by === me || now - me.lastKo < 1500) return;
      me.lastKo = now; by.ko++; broadcast(r, { t: 'ko', by: by.id, to: me.id });
    }
    else if (m.t === 'coin') {   // Coin Rush: the first player to reach a coin gets it
      const i = num(m.i, 5000) | 0; if (r.status !== 'racing' || r.settings.mode !== 'coins' || i < 0 || r.taken.has(i)) return;
      r.taken.add(i); me.ko++; broadcast(r, { t: 'coin', id: me.id, i });
    }
    else if (m.t === 'done') {   // Checkpoint Rush: this rider's clock ran out; the game ends when everyone's has
      if (r.status !== 'racing' || r.settings.mode !== 'rush' || me.fin !== null) return;
      me.fin = 1; broadcast(r, { t: 'out', id: me.id }); if (over(r)) results(r);
    }
    else if (m.t === 'loot') { if (r.status === 'racing') broadcast(r, { t: 'loot', id: me.id, i: Math.max(0, num(m.i, 999) | 0) }, me.id); }
    else if (m.t === 'fin') {
      if (r.status !== 'racing' || me.fin !== null || r.settings.mode !== 'race') return;
      me.fin = Math.max(1, num(m.time, 3600)); broadcast(r, { t: 'fin', id: me.id, time: me.fin });
      if ([...r.players.values()].every((p) => p.fin !== null)) results(r);
      else if (!r.finTimer) r.finTimer = setTimeout(() => results(r), 45000);   // the others have 45 seconds after the first finisher
    }
    else if (m.t === 'leave') leave(ws);
  });
});
web.listen(PORT, '0.0.0.0', () => console.log(`Bike Race server listening on port ${PORT} (http and ws)`));
