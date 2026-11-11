/** Messages between the game pages and the multiplayer server (JSON over WebSocket). Shared by the client and the server. */
export const PROTOCOL_VERSION = 7;
export const MAX_PLAYERS = 12;
export const BIKE_IDS = ['scooter', 'vespa', 'chopper', 'street', 'dirt', 'sport', 'classic', 'super', 'cruiser', 'hyper'];
/** The game types a room can play online. */
export const MP_MODES = ['race', 'brawl', 'knockout', 'coins', 'rush', 'escape'];
export const BRAWL_SECONDS = 90, KNOCKOUT_FIRST = 30, KNOCKOUT_EVERY = 25, COINS_SECONDS = 100, RUSH_START = 40, RUSH_CAP = 300, ESCAPE_SECONDS = 120;   // RUSH_CAP: a Checkpoint Rush is ended after this long, whoever is still riding
export const MAP_IDS = ['downtown', 'neon', 'desert', 'oldtown', 'snow', 'town'];

export interface PlayerInfo { id: number; name: string; bike: string; color: string }
export interface Settings { map: string; laps: number; police: boolean; traffic: number; mode: string }   // traffic: 0 empty, 1 normal, 2 busy; mode: one of MP_MODES
/** One open room in the list. */
export interface RoomInfo { code: string; host: string; players: number; map: string; laps: number }

/** One rider's moving state, sent about 15 times a second while racing. */
export interface RiderState {
  x: number; z: number; h: number;       // position and heading
  v: number; l: number;                  // speed and sideways slide
  st: number; ln: number;                // steering angle and lean
  f: number; fd: number;                 // fallen (0/1) and which way
  pw: number;                            // power-ups: 1 super speed, 2 shield, 4 power hits
  p: number;                             // checkpoints passed
  pr: number;                            // how far along the route (Knockout: the server puts out the rider with the lowest)
  sw: number;                            // punch/kick in progress: 1 punch right, 2 punch left, 3 kick right, 4 kick left
}

export type C2S =
  | { t: 'create'; ver: number; name: string; bike: string; color: string; pub?: boolean; cid?: string }   // cid: a random id kept by the browser, so a ban holds when the player rejoins
  | { t: 'quick'; ver: number; name: string; bike: string; color: string; cid?: string }   // quick match: join the fullest open room, or create a public one
  | { t: 'join'; ver: number; code: string; name: string; bike: string; color: string; cid?: string }
  | { t: 'me'; name: string; bike: string; color: string }
  | { t: 'settings'; map: string; laps: number; pub?: boolean; police?: boolean; traffic?: number; mode?: string }
  | { t: 'list' }
  | { t: 'chat'; text: string }
  | { t: 'kick'; id: number; ban?: boolean }   // host only: remove a player (ban: they cannot rejoin this room)
  | { t: 'start' }
  | ({ t: 's' } & RiderState)
  | { t: 'hit'; to: number; mag: number; shove: number; how: 'punch' | 'kick' | 'rear' }
  | { t: 'loot'; i: number }
  | { t: 'coin'; i: number }                    // Coin Rush: I rode over this coin (the first to say so gets it)
  | { t: 'done' }                               // Checkpoint Rush: my clock ran out; Police Escape: I was busted
  | { t: 'ko'; by: number }                     // I was knocked off my bike by this player (the one who fell reports it)
  | { t: 'fin'; time: number }
  | { t: 'leave' };

export interface ResultRow { id: number; name: string; time: number | null; score?: number }   // score: knock-offs (Brawl), riders outlasted (Knockout), coins (Coin Rush), checkpoints (Checkpoint Rush) or seconds free (Police Escape)

export type S2C =
  | { t: 'room'; code: string; you: number; host: number; players: PlayerInfo[]; settings: Settings; status: 'lobby' | 'racing'; pub: boolean }
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'chat'; id: number; name: string; text: string }
  | { t: 'start'; inMs: number; seed: number; settings: Settings; players: PlayerInfo[] }
  | ({ t: 's'; id: number } & RiderState)
  | { t: 'hit'; from: number; to: number; mag: number; shove: number; how: 'punch' | 'kick' | 'rear' }
  | { t: 'loot'; id: number; i: number }
  | { t: 'ko'; by: number; to: number }         // a knock-off, counted by the server
  | { t: 'out'; id: number }                    // Knockout: this rider is out; Checkpoint Rush: this rider's clock ran out; Police Escape: busted
  | { t: 'coin'; id: number; i: number }        // Coin Rush: this player got this coin
  | { t: 'fin'; id: number; time: number }
  | { t: 'results'; list: ResultRow[]; mode: string }
  | { t: 'left'; id: number }
  | { t: 'kicked'; ban: boolean }   // sent to the player the host removed
  | { t: 'err'; msg: string };
