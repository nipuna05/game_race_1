import { PROTOCOL_VERSION, type C2S, type S2C, type PlayerInfo, type Settings, type RiderState, type ResultRow } from '../shared/protocol';

/** The connection to the multiplayer server and the room you are in. */
export interface Lobby { code: string; you: number; host: number; players: PlayerInfo[]; settings: Settings; status: 'lobby' | 'racing' }
export interface NetHandlers {
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
export const defaultServer = () => { try { const s = localStorage.getItem(URL_KEY); if (s) return s; } catch { /* ignore */ } return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:8090`; };

export const net = {
  ws: null as WebSocket | null, lobby: null as Lobby | null, status: 'off' as 'off' | 'connecting' | 'on', error: '', url: '',
  h: {} as NetHandlers,

  get inRoom() { return !!this.lobby; },
  get isHost() { return !!this.lobby && this.lobby.host === this.lobby.you; },

  connect(url: string): Promise<void> {
    this.close(); this.url = url.trim(); this.error = ''; this.status = 'connecting'; this.h.lobby?.();
    try { localStorage.setItem(URL_KEY, this.url); } catch { /* ignore */ }
    return new Promise((resolve, reject) => {
      let ws: WebSocket; try { ws = new WebSocket(this.url); } catch { this.status = 'off'; this.error = 'That server address is not valid.'; this.h.lobby?.(); reject(); return; }
      this.ws = ws;
      const timer = window.setTimeout(() => { if (this.status === 'connecting') { this.error = 'Could not reach the server.'; ws.close(); } }, 6000);
      ws.onopen = () => { window.clearTimeout(timer); this.status = 'on'; resolve(); };
      ws.onerror = () => { if (this.status === 'connecting') this.error = 'Could not reach the server. Is it running, and is the address right?'; };
      ws.onclose = () => { window.clearTimeout(timer); const was = this.status; this.status = 'off'; this.ws = null; this.lobby = null; if (was === 'connecting') { if (!this.error) this.error = 'Could not reach the server.'; reject(); } else this.h.closed?.(); this.h.lobby?.(); };
      ws.onmessage = (e) => { try { this.onMsg(JSON.parse(String(e.data)) as S2C); } catch { /* ignore */ } };
    });
  },
  send(m: C2S) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); },
  close() { if (this.ws) { try { this.send({ t: 'leave' }); this.ws.close(); } catch { /* ignore */ } } this.ws = null; this.lobby = null; this.status = 'off'; },

  create(name: string, bike: string, color: string) { this.send({ t: 'create', ver: PROTOCOL_VERSION, name, bike, color }); },
  join(code: string, name: string, bike: string, color: string) { this.send({ t: 'join', ver: PROTOCOL_VERSION, code, name, bike, color }); },
  me(name: string, bike: string, color: string) { if (this.lobby) this.send({ t: 'me', name, bike, color }); },
  settings(map: string, laps: number) { this.send({ t: 'settings', map, laps }); },
  start() { this.send({ t: 'start' }); },
  state(s: RiderState) { this.send({ t: 's', ...s }); },
  hit(to: number, mag: number, shove: number, how: 'punch' | 'kick' | 'rear') { this.send({ t: 'hit', to, mag, shove, how }); },
  loot(i: number) { this.send({ t: 'loot', i }); },
  fin(time: number) { this.send({ t: 'fin', time }); },
  leaveRoom() { this.send({ t: 'leave' }); this.lobby = null; this.h.lobby?.(); },

  onMsg(m: S2C) {
    switch (m.t) {
      case 'room': this.lobby = { code: m.code, you: m.you, host: m.host, players: m.players, settings: m.settings, status: m.status }; this.error = ''; this.h.lobby?.(); break;
      case 'err': this.error = m.msg; this.h.lobby?.(); break;
      case 'start': this.h.start?.(m); break;
      case 's': this.h.state?.(m); break;
      case 'hit': this.h.hit?.(m); break;
      case 'loot': this.h.loot?.(m); break;
      case 'fin': this.h.fin?.(m); break;
      case 'results': this.h.results?.(m.list); break;
      case 'left': this.h.left?.(m.id); break;
    }
  },
};
