/// <reference types="vite/client" />
import { PROTOCOL_VERSION, type C2S, type S2C, type PlayerInfo, type Settings, type RiderState, type ResultRow, type RoomInfo } from '../shared/protocol';

/** The connection to the multiplayer server and the room you are in. */
export interface Lobby { code: string; you: number; host: number; players: PlayerInfo[]; settings: Settings; status: 'lobby' | 'racing'; pub: boolean }
export interface NetHandlers {
  rooms?: () => void;                                                            // the list of open rooms arrived
  chat?: (m: { id: number; name: string; text: string }) => void;
  raceChat?: (m: { id: number; name: string; text: string }) => void;             // the same message, for the line shown during a race
  kicked?: (ban: boolean) => void;                                               // the host removed you from the room
  lobby?: () => void;                                                            // the room changed (players, settings, host)
  start?: (m: Extract<S2C, { t: 'start' }>) => void;
  state?: (m: Extract<S2C, { t: 's' }>) => void;
  hit?: (m: Extract<S2C, { t: 'hit' }>) => void;
  loot?: (m: Extract<S2C, { t: 'loot' }>) => void;
  fin?: (m: Extract<S2C, { t: 'fin' }>) => void;
  results?: (list: ResultRow[]) => void;
  left?: (id: number) => void;
  closed?: () => void;
}

const URL_KEY = 'bikerace.server.v1';
/** Default server: the same machine that served the page, port 8090 (so people on the network get it automatically). */
/** The public server (set when the website is built, see .github/workflows/pages.yml): used by the https website, which may only use secure sockets. */
const PUBLIC_SERVER = (import.meta.env.VITE_WS_URL as string | undefined) || '';
export const defaultServer = () => {
  try { const s = localStorage.getItem(URL_KEY); if (s) return s; } catch { /* ignore */ }
  if (location.protocol === 'https:' && PUBLIC_SERVER) return PUBLIC_SERVER;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:8090`;
};

/** A random id kept by this browser: the server uses it so a ban from a room holds when you try to rejoin. */
const clientId = () => {
  const K = 'bikerace.cid.v1';
  try { let c = localStorage.getItem(K); if (!c) { c = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(K, c); } return c; } catch { return ''; }
};

export const net = {
  rooms: [] as RoomInfo[], chatLog: [] as { id: number; name: string; text: string }[], pending: null as Promise<void> | null,
  waking: false,                                                                  // connecting is taking long: the (free) server is probably waking up
  ws: null as WebSocket | null, lobby: null as Lobby | null, status: 'off' as 'off' | 'connecting' | 'on', error: '', url: '',
  h: {} as NetHandlers,

  get inRoom() { return !!this.lobby; },
  get isHost() { return !!this.lobby && this.lobby.host === this.lobby.you; },

  connect(url: string): Promise<void> {
    this.close(); this.url = url.trim(); this.error = ''; this.status = 'connecting'; this.waking = false; this.h.lobby?.();
    try { localStorage.setItem(URL_KEY, this.url); } catch { /* ignore */ }
    return new Promise((resolve, reject) => {
      let ws: WebSocket; try { ws = new WebSocket(this.url); } catch { this.status = 'off'; this.error = 'That server address is not valid.'; this.h.lobby?.(); reject(); return; }
      this.ws = ws;
      const slow = window.setTimeout(() => { if (this.ws === ws && this.status === 'connecting') { this.waking = true; this.h.lobby?.(); } }, 4000);
      const timer = window.setTimeout(() => { window.clearTimeout(slow); if (this.status === 'connecting') { this.error = 'Could not reach the server.'; ws.close(); } }, 75000);   // a sleeping free server needs up to a minute
      ws.onopen = () => { if (this.ws !== ws) return; window.clearTimeout(timer); window.clearTimeout(slow); this.waking = false; this.status = 'on'; resolve(); };
      ws.onerror = () => { if (this.ws === ws && this.status === 'connecting') this.error = 'Could not reach the server. Is it running, and is the address right?'; };
      ws.onclose = () => { window.clearTimeout(timer); if (this.ws !== ws && this.ws !== null) return; const was = this.status; this.status = 'off'; this.ws = null; this.lobby = null; if (was === 'connecting') { if (!this.error) this.error = 'Could not reach the server.'; reject(); } else this.h.closed?.(); this.h.lobby?.(); };
      ws.onmessage = (e) => { try { this.onMsg(JSON.parse(String(e.data)) as S2C); } catch { /* ignore */ } };
    });
  },
  /** Connect if not connected to this address yet (so the room list and creating a room share one connection). */
  ensure(url: string): Promise<void> {
    const u = url.trim();
    if (this.status === 'on' && this.url === u) return Promise.resolve();
    if (this.status === 'connecting' && this.pending && this.url === u) return this.pending;
    return (this.pending = this.connect(u));
  },
  list() { this.send({ t: 'list' }); },
  chat(text: string) { this.send({ t: 'chat', text }); },
  send(m: C2S) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); },
  close() { if (this.ws) { try { this.send({ t: 'leave' }); this.ws.close(); } catch { /* ignore */ } } this.ws = null; this.lobby = null; this.status = 'off'; },

  create(name: string, bike: string, color: string, pub = true) { this.send({ t: 'create', ver: PROTOCOL_VERSION, name, bike, color, pub, cid: clientId() }); },
  join(code: string, name: string, bike: string, color: string) { this.send({ t: 'join', ver: PROTOCOL_VERSION, code, name, bike, color, cid: clientId() }); },
  me(name: string, bike: string, color: string) { if (this.lobby) this.send({ t: 'me', name, bike, color }); },
  settings(map: string, laps: number, pub?: boolean, police?: boolean, traffic?: number) { this.send({ t: 'settings', map, laps, pub, police, traffic }); },
  kick(id: number, ban = false) { this.send({ t: 'kick', id, ban }); },
  start() { this.send({ t: 'start' }); },
  state(s: RiderState) { this.send({ t: 's', ...s }); },
  hit(to: number, mag: number, shove: number, how: 'punch' | 'kick' | 'rear') { this.send({ t: 'hit', to, mag, shove, how }); },
  loot(i: number) { this.send({ t: 'loot', i }); },
  fin(time: number) { this.send({ t: 'fin', time }); },
  leaveRoom() { this.send({ t: 'leave' }); this.lobby = null; this.h.lobby?.(); },

  onMsg(m: S2C) {
    switch (m.t) {
      case 'rooms': this.rooms = m.rooms; this.h.rooms?.(); break;
      case 'chat': this.chatLog.push({ id: m.id, name: m.name, text: m.text }); if (this.chatLog.length > 40) this.chatLog.shift(); this.h.chat?.(m); this.h.raceChat?.(m); break;
      case 'room': if (!this.lobby) this.chatLog = []; this.lobby = { code: m.code, you: m.you, host: m.host, players: m.players, settings: m.settings, status: m.status, pub: m.pub }; this.error = ''; this.h.lobby?.(); break;
      case 'err': this.error = m.msg; this.h.lobby?.(); break;
      case 'start': this.h.start?.(m); break;
      case 's': this.h.state?.(m); break;
      case 'hit': this.h.hit?.(m); break;
      case 'loot': this.h.loot?.(m); break;
      case 'fin': this.h.fin?.(m); break;
      case 'results': this.h.results?.(m.list); break;
      case 'left': this.h.left?.(m.id); break;
      case 'kicked': this.lobby = null; this.error = m.ban ? 'The host banned you from that room.' : 'The host removed you from that room.'; this.h.kicked?.(m.ban); this.h.lobby?.(); break;
    }
  },
};
