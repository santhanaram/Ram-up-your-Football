# Ram up your Football

A phone-first 3D football game for the web, hosted on Vercel with a Supabase backend.

See [docs/Plan.md](docs/Plan.md) for the roadmap. The original single-file prototype lives in [prototype/](prototype/).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

Copy `.env.example` to `.env.local` and add your Supabase URL and anon key once the Supabase project exists (Stage 3). The game runs without them.

## Deploy

Import the repo in Vercel; it detects Vite automatically (build `npm run build`, output `dist`). Add the two `VITE_SUPABASE_*` variables in the Vercel project settings when ready.

## How to play

Landscape, Blue Lions attack to the right. The three buttons change with possession, like Dream League Soccer:

| | Attacking | Defending |
|---|---|---|
| Blue (J) | Pass to the best teammate in the joystick direction | Tackle, or slide tackle from further away |
| Red (L or Space) | Shoot (or header / volley when the ball is in the air) | Hold to press the ball carrier |
| Orange (K) | Through ball, or a cross from wide | Switch player |

Move with the joystick or WASD / arrow keys. A match is two 2.5-minute halves.

## Code layout

- `src/game/sim/` holds the match engine (ball physics, AI, keepers, restarts, clock). It has no rendering, so it can be stepped headless.
- `src/game/render/` holds the stadium, players, ball and broadcast camera.
- `src/game/game.ts` runs the loop and wires the engine to the HUD (`hud.ts`), controls (`input.ts`) and sound (`audio.ts`).
