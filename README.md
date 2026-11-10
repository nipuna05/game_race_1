# Bike Race

A 3D browser bike race through a busy city, built with TypeScript and Three.js. Race rival riders, or just ride around. Switch the police on or off, and set the traffic and people to empty, normal or busy.

## Run it

```
npm install
npm run dev                # dev copy, http://localhost:5180 (updates as you edit)
npm run test-env:build     # build a fixed test copy
npm run test-env:client    # serve it, http://localhost:5181
npm run typecheck
npm run build
```

## Controls

| Key | Action |
| --- | --- |
| W / Up | Gas |
| S / Down | Brake / reverse |
| A D / Left Right | Steer |
| Space | Handbrake (drift) |
| Shift | Boost (the bar refills when you let go) |
| Q / E | Punch with the left / right hand |
| F | Kick |
| R | Put the bike back on the road |
| Esc | Menu |

## Multiplayer

```
npm run server      # the game server, ws://localhost:8090
npm run dev         # the game page
```

On the home page, ONLINE: one player creates a room and shares the 4-letter code, others join with it. The host picks the map and laps and starts the race. Everyone sees the other riders, fights (punches, kicks and rear hits land on the other player's page), and grabs the same crates (the first to take a crate gets it). Results show when everyone has finished (or 45 seconds after the first finisher). Online races have no police or traffic yet.

Each page simulates its own bike and the server relays the states, picks the start time and a shared seed, and keeps the room (`server/index.ts`, messages in `shared/protocol.ts`). On a home network the game page uses the same PC for the server, so friends just open the page address.

## Bikes and maps

- **10 bikes** (tyres, spoked or cast wheels, forks that turn with the bars, frame, engine, exhaust, tank, fairings and a rider) by category and engine size: Scooter 125cc, Vespa 150cc, Mini Chopper 300cc, Street 400cc, Enduro 450cc, Sport 600cc, Cafe Racer 750cc, Superbike 1000cc, Cruiser 1200cc, Hyperbike 1400cc. Each has its own speed, pickup, handling, brakes, boost and look.
- **6 maps**: Downtown, Neon Night, Desert Highway (wide, fast), Old Town (tight streets), Snow Village (slippery), Toy Town (built from Kenney's building models).
- **Downloaded models** (optional): `public/models/bikes/` can hold `sv650.glb`, `poly.glb`, `vrmobil.glb`, `military.glb` and `vespa.glb`, which replace the Sport, Cruiser, Scooter, Enduro and Vespa bodies; Kenney's trucks drive in the traffic. See `CREDITS.md`. The model preview page is `/modelpreview.html?f=/models/bikes/sv650.glb`.

## Fighting

Hit riders next to you with a punch (Q / E) or a kick (F). Each hit costs the rider balance; at zero they fall off and lose a couple of seconds. Coming up fast from behind and bumping a rider also knocks them off. Rivals fight back.

## Profile, coins and the bike collection

- **Profile** (saved in your browser): name, level and XP, career stats (races, wins, podiums, distance, top speed, riders knocked off, falls, wrecks, crates), favourite bike, best time per map and your last races.
- **Coins:** gold coins lie along the race route and around the roads (5 each). You also earn coins for finishing a race (more for a higher place and a bigger field) and 15 for each rider you knock off.
- **Bike collection:** Scooter and Street are yours from the start. Buy the rest in the Garage: Enduro 800, Sport 1500, Cafe Racer 2200, Cruiser 3000, Superbike 4000, Hyperbike 7000. Up to 11 rival bots in a race.

## Wrecks and respawns

A very hard hit (a building or car at full speed, or a police ram), or being knocked off three times within 20 seconds, wrecks the bike. You get Respawn, Retry or Main menu. In a race you have 3 respawns (hearts on the HUD); each respawn puts you back at the last checkpoint for +8 s and clears your power-ups. With none left it is a DNF. Free ride has unlimited respawns.

## Power-ups and boost pads

Crates on the roads (N nitro, S super speed, D shield, P power hits) and orange arrow pads that give a speed burst. Crates come back after 14 seconds.

## Modes and options

- **Race**: a route of 8 checkpoints around the city, 1-3 laps, 0-5 computer riders. Best time is saved in the browser.
- **Free ride**: roam the city.
- **Police**: patrol cars drive around. Hit a person, crash hard or speed past a patrol car and you get stars. Police chase you through the streets and ram you. Stay near them at low speed for 2 seconds and you are busted (+10 s). Get away and the stars fade.
- **Traffic and people**: empty, normal or busy.

## Code

- `src/city.ts`: road grid, buildings, world collision.
- `src/bike.ts`: bike physics, stats and the rider AI.
- `src/bikemodel.ts`: the detailed bike and rider models, built from shapes in code (no model files).
- `src/menu.ts`: the home page, garage, maps, settings and pause menu.
- `src/agents.ts`: cars, pedestrians and police cars.
- `src/main.ts`: game loop, race, police logic, HUD and minimap.
- `src/audio.ts`: engine, siren and crash sounds.

Play on your network: run `npm run test-env:build` and `npm run test-env:client`, then others on the same Wi-Fi or LAN open `http://<your-PC-IP>:5181`. Everyone gets their own single-player game until multiplayer is built.

Hosting: the GitHub Actions workflow in `.github/workflows/pages.yml` publishes it on GitHub Pages (set Settings, Pages, Source to "GitHub Actions").
