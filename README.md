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

## Bikes and maps

- **8 bikes** by category and engine size: Scooter 125cc, Street 400cc, Enduro 450cc, Sport 600cc, Cafe Racer 750cc, Superbike 1000cc, Cruiser 1200cc, Hyperbike 1400cc. Each has its own speed, pickup, handling, brakes, boost and look.
- **5 maps**: Downtown, Neon Night, Desert Highway (wide, fast), Old Town (tight streets), Snow Village (slippery).

## Fighting

Hit riders next to you with a punch (Q / E) or a kick (F). Each hit costs the rider balance; at zero they fall off and lose a couple of seconds. Coming up fast from behind and bumping a rider also knocks them off. Rivals fight back.

## Power-ups and boost pads

Crates on the roads (N nitro, S super speed, D shield, P power hits) and orange arrow pads that give a speed burst. Crates come back after 14 seconds.

## Modes and options

- **Race**: a route of 8 checkpoints around the city, 1-3 laps, 0-5 computer riders. Best time is saved in the browser.
- **Free ride**: roam the city.
- **Police**: patrol cars drive around. Hit a person, crash hard or speed past a patrol car and you get stars. Police chase you through the streets and ram you. Stay near them at low speed for 2 seconds and you are busted (+10 s). Get away and the stars fade.
- **Traffic and people**: empty, normal or busy.

## Code

- `src/city.ts`: road grid, buildings, world collision.
- `src/bike.ts`: bike physics, model and the rider AI.
- `src/agents.ts`: cars, pedestrians and police cars.
- `src/main.ts`: game loop, race, police logic, HUD and minimap.
- `src/audio.ts`: engine, siren and crash sounds.

Hosting: the GitHub Actions workflow in `.github/workflows/pages.yml` publishes it on GitHub Pages (set Settings, Pages, Source to "GitHub Actions").
