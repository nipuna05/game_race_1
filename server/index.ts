/** Bike Race multiplayer server: rooms with a 4-letter code, a lobby, and a relay for riders' states during a race.
 *  Each player's page simulates its own bike; the server keeps the room, the start time, the shared random seed and the results. */
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL_VERSION, MAX_PLAYERS, BIKE_IDS, MAP_IDS, type C2S, type S2C, type PlayerInfo, type Settings, type ResultRow, type RoomInfo } from '../shared/protocol';

const PORT = Number(process.env.PORT) || 8090;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);   // empty = any origin (fine on a home network)
const MAX_ROOMS = 40, MAX_PER_IP = 8;

interface Player { id: number; ws: WebSocket; name: string; bike: string; color: string; fin: number | null; msgs: number; lastChat: number }
interface Room { code: string; host: number; players: Map<number, Player>; status: 'lobby' | 'racing'; pub: boolean; settings: Settings; seed: number; finTimer: NodeJS.Timeout | null }
const rooms = new Map<string, Room>();
const rooms_ = () => rooms;
const where = new WeakMap<WebSocket, { room: Room; me: Player }>();
const perIp = new Map<string, number>();
let nextId = 1;

const clean = (s: unknown) => String(s ?? '').replace(/[^\w \-.]/g, '').trim().slice(0, 14) || 'Rider';
const cleanBike = (b: unknown) => (BIKE_IDS.includes(String(b)) ? String(b) : 'street');
const cleanColor = (c: unknown) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : '');
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
  const rows: ResultRow[] = [...r.players.values()].map((p) => ({ id: p.id, name: p.name, time: p.fin }));
  rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
  r.status = 'lobby'; broadcast(r, { t: 'results', list: rows }); snapshot(r);
}
function leave(ws: WebSocket) {
  const w = where.get(ws); if (!w) return; where.delete(ws);
  const { room: r, me } = w; r.players.delete(me.id);
  if (r.players.size === 0) { if (r.finTimer) clearTimeout(r.finTimer); rooms.delete(r.code); return; }
  if (r.host === me.id) r.host = Math.min(...r.players.keys());
  broadcast(r, { t: 'left', id: me.id });
  if (r.status === 'racing' && [...r.players.values()].every((p) => p.fin !== null)) results(r); else snapshot(r);
}

const wss = new WebSocketServer({ port: PORT, maxPayload: 4096, perMessageDeflate: false });
// heartbeat: ping every connection every 15 s and drop the ones that do not answer, so a closed laptop or a lost network frees its place in the room
// (and the room's host moves on). It also keeps quiet lobby connections from being closed by the proxy in front of the server.
const alive = new WeakMap<WebSocket, boolean>();
setInterval(() => { for (const ws of wss.clients) { if (alive.get(ws) === false) { ws.terminate(); continue; } alive.set(ws, false); try { ws.ping(); } catch { /* closing */ } } }, 15000);

wss.on('connection', (ws, req) => {
  alive.set(ws, true); ws.on('pong', () => alive.set(ws, true));
  const origin = req.headers.origin;
  if (ALLOWED.length && origin && !ALLOWED.includes(origin)) { ws.close(1008, 'origin'); return; }
  const ip = String(req.socket.remoteAddress);
  if ((perIp.get(ip) ?? 0) >= MAX_PER_IP) { ws.close(1013, 'too many connections'); return; }
  perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
  ws.on('close', () => { leave(ws); perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1)); });
  ws.on('error', () => { /* ignore */ });
  let count = 0; const tick = setInterval(() => { count = 0; }, 1000); ws.on('close', () => clearInterval(tick));

  ws.on('message', (raw) => {
    if (++count > 120) return;                                  // more than 120 messages a second: ignore
    let m: C2S; try { m = JSON.parse(String(raw)); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const w = where.get(ws);

    if (m.t === 'create' || m.t === 'join') {
      if (w) return;
      if (m.ver !== PROTOCOL_VERSION) { send(ws, { t: 'err', msg: 'This version of the game is out of date. Reload the page.' }); return; }
      let r: Room | undefined;
      if (m.t === 'create') {
        if (rooms.size >= MAX_ROOMS) { send(ws, { t: 'err', msg: 'The server is full. Try again later.' }); return; }
        r = { code: newCode(), host: 0, players: new Map(), status: 'lobby', pub: m.pub !== false, settings: { map: 'downtown', laps: 2 }, seed: 1, finTimer: null }; rooms.set(r.code, r);
      } else {
        r = rooms.get(String(m.code).toUpperCase().trim());
        if (!r) { send(ws, { t: 'err', msg: 'No room with that code.' }); return; }
        if (r.status !== 'lobby') { send(ws, { t: 'err', msg: 'A race is in progress. Try again when it ends.' }); return; }
        if (r.players.size >= MAX_PLAYERS) { send(ws, { t: 'err', msg: 'The room is full.' }); return; }
      }
      const me: Player = { id: nextId++, ws, name: clean(m.name), bike: cleanBike(m.bike), color: cleanColor(m.color), fin: null, msgs: 0, lastChat: 0 };
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
    else if (m.t === 'settings') { if (r.host !== me.id || r.status !== 'lobby') return; r.settings = { map: MAP_IDS.includes(m.map) ? m.map : 'downtown', laps: Math.max(1, Math.min(3, Math.round(num(m.laps, 9)) || 2)) }; if (typeof m.pub === 'boolean') r.pub = m.pub; snapshot(r); }
    else if (m.t === 'chat') {
      const now = Date.now(); if (now - me.lastChat < 700) return; me.lastChat = now;      // at most one message every 0.7 s
      const text = String(m.text ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120); if (!text) return;
      broadcast(r, { t: 'chat', id: me.id, name: me.name, text });
    }
    else if (m.t === 'start') {
      if (r.host !== me.id || r.status !== 'lobby') return;
      r.status = 'racing'; r.seed = (Math.random() * 2 ** 31) | 0; for (const p of r.players.values()) p.fin = null;
      broadcast(r, { t: 'start', inMs: 4500, seed: r.seed, settings: r.settings, players: list(r) }); snapshot(r);
    }
    else if (m.t === 's') {
      if (r.status !== 'racing') return;
      broadcast(r, { t: 's', id: me.id, x: num(m.x), z: num(m.z), h: num(m.h, 100), v: num(m.v, 200), l: num(m.l, 200), st: num(m.st, 2), ln: num(m.ln, 3), f: m.f ? 1 : 0, fd: m.fd < 0 ? -1 : 1, pw: num(m.pw, 15) | 0, p: Math.max(0, num(m.p, 999) | 0), sw: num(m.sw, 4) | 0 }, me.id);
    }
    else if (m.t === 'hit') {
      const to = r.players.get(m.to); if (!to || r.status !== 'racing' || to.id === me.id) return;
      send(to.ws, { t: 'hit', from: me.id, to: to.id, mag: Math.max(0, Math.min(2, num(m.mag, 5))), shove: Math.max(-2, Math.min(2, num(m.shove, 5))), how: m.how === 'kick' ? 'kick' : m.how === 'rear' ? 'rear' : 'punch' });
    }
    else if (m.t === 'loot') { if (r.status === 'racing') broadcast(r, { t: 'loot', id: me.id, i: Math.max(0, num(m.i, 999) | 0) }, me.id); }
    else if (m.t === 'fin') {
      if (r.status !== 'racing' || me.fin !== null) return;
      me.fin = Math.max(1, num(m.time, 3600)); broadcast(r, { t: 'fin', id: me.id, time: me.fin });
      if ([...r.players.values()].every((p) => p.fin !== null)) results(r);
      else if (!r.finTimer) r.finTimer = setTimeout(() => results(r), 45000);   // the others have 45 seconds after the first finisher
    }
    else if (m.t === 'leave') leave(ws);
  });
});
console.log(`Bike Race server listening on ws://0.0.0.0:${PORT}`);
