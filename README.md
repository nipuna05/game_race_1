# Bike Race

A 3D browser bike race through a busy city, built with TypeScript and Three.js. Race rival riders, or just ride around. Switch the police on or off, and set the traffic and people to empty, normal or busy.

## Run it

```
npm install
npm run dev        # http://localhost:5173 (or the port Vite prints)
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
| R | Put the bike back on the road |
| Esc | Menu |

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
