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
