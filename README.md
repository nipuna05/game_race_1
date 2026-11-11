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
| H | Show the racing tips |
| M | Enlarge / shrink the city map |
| Esc | Menu |

## Multiplayer

```
npm run server      # the game server, ws://localhost:8090
npm run dev         # the game page
```

On the home page, ONLINE: one player creates a room and shares the 4-letter code, others join with it. The host picks the game type, the map and the laps and starts. Online game types: **Race**; **Brawl** (90 seconds, the most knock-offs wins; the rider who falls reports who did it and the server keeps the score and the clock); **Knockout** (30 seconds in, then every 25 seconds, the server puts out the rider furthest behind, until one is left). **Coin Rush** (100 seconds, everyone sees the same coins and each coin goes to whoever reaches it first); **Checkpoint Rush** (everyone starts with 40 seconds and every checkpoint adds 7; it ends when every clock has run out, or after 5 minutes, and the most checkpoints wins). **Police Escape** (everyone starts wanted, each chased by their own police; stay free for 2 minutes, and everyone still free at the end has escaped). Everything except the Race needs at least two players. **QUICK MATCH** on the ONLINE tab joins the fullest open room, or starts a public one if there is none. Everyone sees the other riders, fights (punches, kicks and rear hits land on the other player's page), and grabs the same crates (the first to take a crate gets it). The ONLINE tab lists the **open rooms** (public rooms that are waiting in the lobby), so players can join with one click without a code; the host can make a room private (then only people with the code can join). Everyone in a room can **chat** in the lobby, and during a race too: press **T** (or Enter), type a line and press Enter; messages show at the left for a few seconds. The host can **Kick** a player out of the lobby, or **Ban** them so they cannot rejoin that room (the ban is remembered for the browser they used, and ends when the room closes). Results show when everyone has finished (or 45 seconds after the first finisher). The host also chooses Police (on/off) and Traffic (empty, normal, busy) for the room. Traffic, people and police are simulated on each player's own screen: the police chase only you, and you see your own cars (other players see different ones).

Each page simulates its own bike and the server relays the states, picks the start time and a shared seed, and keeps the room (`server/index.ts`, messages in `shared/protocol.ts`). On a home network the game page uses the same PC for the server, so friends just open the page address.

## Directions and the map

In a race the directions are shown where you are already looking: a big gold sign over the next junction (like a motorway gantry) says TURN LEFT, TURN RIGHT or STRAIGHT ON with an arrow, glowing chevrons mark the line to ride along the road and curve through each junction, and a compass arrow at the top of the screen points at where to go (it swings round as you arrive at the turn) with plain words and the distance. It turns red with TURN AROUND if you head the wrong way.

## Difficulty

PLAY has Easy, Normal and Hard (single player; online races always use Normal).

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Rival riders | slower, brake early, rarely fight | standard | faster, use boost, fight often |
| Police | 20% slower, bust after 3 s, wanted level drops fast | standard | 20% faster, bust after 1.3 s, one extra chaser, wanted level drops slowly |
| Respawns in a race | 5 (+5 s each) | 3 (+8 s) | 2 (+12 s) |
| Crashes | wreck only at very high impact | standard | wreck sooner |
| XP and coins | x0.7 | x1 | x1.5 |

## Steering

Bikes turn sharper than before, the bars ease towards your keys (a quick tap turns a little), and leaning hard into a turn at speed scrubs some speed so junctions can be taken without braking first. SETTINGS has a Steering slider (60-160%) for people who find it too slow or too sharp.

## Putting multiplayer on the internet (Fly.io)

The same server runs on Fly.io, so friends anywhere can join from the GitHub Pages site. The Fly app is `game-race-1` (`https://game-race-1.fly.dev`).

1. Deploy: `flyctl deploy -a game-race-1` (builds the `Dockerfile`, Singapore region, one small machine that stays on).
   Do not use Fly's auto-generated Dockerfile for this repo: it serves the files as a static website, not the game server.
2. Automatic redeploys: create a deploy token (`flyctl tokens create deploy -a game-race-1`) and save it in the repository as the secret `FLY_API_TOKEN`. After that, every change to `server/`, `shared/`, `Dockerfile` or `fly.toml` redeploys the server.
3. The website uses `wss://game-race-1.fly.dev` by default (set in the Pages workflow); on a home network the page still uses the same PC on port 8090.
4. Check it works: open `https://game-race-1.fly.dev` in a browser (a working game server answers "Upgrade Required"), then create a room on the website.

## Hosting the server on Render (free)

Render's free web service runs the same server from the `Dockerfile`:

1. Render dashboard, New, Web Service, connect the `game_race_1` repository.
2. Name `game-race-1`, region Singapore, branch `main`, Language **Docker**, Instance Type **Free**.
3. Advanced: add the environment variable `ALLOWED_ORIGINS` = `https://nipuna05.github.io,http://localhost:5180,http://localhost:5181`, and set Build Filters (Included Paths) to `server/**`, `shared/**` and `Dockerfile` so changes to the game page do not restart the server.
4. After the deploy the server is at `wss://<service-name>.onrender.com`; put that in `VITE_WS_URL` in `.github/workflows/pages.yml`.

The free service sleeps after about 15 minutes with nobody connected. The first player then waits up to a minute (the Online tab says "Waking up the server..."), and rooms are lost when it sleeps.

## Power Race

A race where the crates hold powers instead of the usual power-ups. You hold one at a time (a new crate replaces it) and use it with **G**:

| Power | What it does |
| --- | --- |
| Oil | Dropped behind you. Riders who ride over it lose control and slide for a moment. |
| Smoke bomb | A cloud behind you for 10 seconds: a player inside sees nothing, computer riders slow right down. |
| Bomb | Thrown ahead. Knocks off the riders near where it lands. |
| EMP bomb | Thrown ahead. Engines near it cut out: slow for 3.5 seconds, boost emptied. |
| Hook | A rope to the rider ahead: they are dragged back and slowed, you are pulled forward. |
| Rocket | Follows the rider ahead and knocks them off. |
| Warp | Jumps you ahead along the road, up to 48 m, never past the next checkpoint. |

The crates can also hold a **stick** (25 seconds) or a **chain** (18 seconds). While you hold one, **Q / E** swing it instead of punching: it reaches further than a fist (the chain furthest) and one hit knocks a rider off. Sticks and chains are in the Brawl crates too.

A shield blocks all of them. Computer riders pick up and use powers too. It is on the Play tab and in online rooms (the host picks **Power**); online, each player's own page decides what a power does to their bike. Power Race best times are kept apart from normal race times.

## Traffic lights

Every intersection has traffic lights and zebra crossings. Each one runs an 18-second cycle (green, amber, red), and neighbouring intersections are out of step (the junction in the very centre of the city has none). Cars, buses and patrolling police stop at the line on red and queue behind each other; police that are chasing you ignore the lights. The lights are not a rule for you: nothing happens if you ride through a red one, but the cross traffic will be moving.

## Bikes and maps

- **Upgrades:** in the Garage, every bike you own can be upgraded in its five stats (Speed, Pickup, Handling, Braking, Boost), three levels each, +4% a level, paid with coins. Dearer bikes cost more to upgrade (the Street: 300, 600, 900 a stat). Upgrades are kept per bike, apply to your bike in every game type and online, and computer riders do not get them.

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

## Finish screen

When you cross the line in a race, a finish screen shows your place (a big gold, silver or bronze 1st, 2nd or 3rd), your time and your best on the map, the standings (finished riders by time, the rest by how far along they are), the coins and XP you earned, and Play again / Main menu. In an online race it shows while the others are still racing, then the final results replace it.

## Traffic vehicles

The cars on the road are built in code to look like real vehicles, with windows and pillars, wheels, grilles, lights, mirrors and number plates: sedans, hatchbacks, SUVs, taxis, vans, pickup trucks, city buses (with a route sign) and police cruisers (with a light bar). Colours are real car colours. Their collision shape follows their length, so a long bus is hit along its side instead of as a circle.

## Rewards

The REWARDS tab (a red dot on its button means something is ready to claim):

- **Daily login reward:** a 7-day streak, 50, 75, 100, 150, 200, 300 and 500 coins (day 7 also gives 100 XP). Miss a day and it starts again at day 1.
- **Daily tasks:** three new tasks every day (finish games, win, knock off riders, collect coins, grab crates, ride kilometres, reach a speed, a Time Trial, Checkpoint Rush, escape the police). Claim each one for coins and XP; claim all three to open the bonus chest (300 coins and 100 XP).
- **Challenge sets:** four sets of tasks that count your whole career (Rookie Rider, Street Racer, City Outlaw, Legend). Finish every task in a set for the set reward: coins, and the Enduro or the Cafe Racer bike.

## One screen

Every menu page fits on one screen without scrolling, down to about 900 x 520: denser grids on the Play, Garage and Maps pages, sub-tabs on Play, Profile and Rewards, and the Start / Buy button stays at the bottom of the page.

## Game types

Pick one on the PLAY tab, GAME TYPE page (the RULES page has difficulty, police, traffic, laps and rivals). Single player; online races are normal races:

| Type | What you do | Reward |
| --- | --- | --- |
| Race | Beat rival riders around the route | XP and coins by place |
| Time Trial | Ride the route alone and beat the bronze, silver or gold time | medal: 120 / 200 / 300 coins |
| Checkpoint Rush | 40 seconds, +7 seconds at every checkpoint | 20 coins per checkpoint |
| Knockout | Every 25 s the last rider is out; be the last left | 450 coins for the win |
| Police Escape | Four stars from the start; stay free for 2 minutes | 400 coins for escaping |
| Brawl | 90 s street fight; knock off more riders than anyone | 20 coins per knock-off, 250 for the win |
| Coin Rush | 100 s to collect as many gold coins as you can | 2 coins per coin collected, plus the coins themselves |
| Free ride | Explore | - |

Rewards are multiplied by the difficulty. Records (checkpoints, seconds, coins, knock-offs) and trial times are on the PROFILE tab.

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
