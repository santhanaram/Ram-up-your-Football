# Plan: 3D Football Striker → Online Web App

**Owner:** Santhanaram · **Drafted:** 22 Oct 2026 · **Hosting:** Vercel · **Backend:** Supabase

## 1. Goal

Turn the single-file prototype (`3d_football_pro.html`) into a phone-first web game where people can jump in as a guest, play a landscape, side-on 5-a-side match against the AI or a real opponent online, and climb a leaderboard.

## 2. Decisions so far

| # | Question | Answer |
|---|----------|--------|
| 1 | What does the backend do? | Accounts, saved stats, leaderboards **and** real-time online matches. Landscape view, goals on the left and right. |
| 2 | Online match format | **1 vs 1**: each person controls a whole team (auto-switch to the player nearest the ball) with AI teammates. |
| 3 | Priority devices | **Phones in landscape** first; desktop is a bonus. |
| 4 | Sign-in | **Guest play** with a nickname; optional Google/email upgrade to keep stats. Random matchmaking. |
| 5 | Who builds | Claude builds in a new GitHub repo, stage by stage; Santhanaram reviews and play-tests each stage. |

**Assumptions (change any of these):** 5-a-side (4 outfield + keeper per team); matches of two 3-minute halves; free to play, no payments in v1; English only.

## 3. What the prototype already has, and what changes

**Keep and port:** Three.js player models (body, arms, legs, kit numbers), stadium and goal building, ball physics with gravity, pass/cross/shoot/header logic, AI teammate and keeper behaviour, WebAudio synth sounds, radar minimap, goal celebration modal, virtual joystick.

**Change:**
- **Camera and pitch:** rotate the pitch so it runs left to right, with a side-on broadcast camera that follows the ball horizontally. Home attacks right in the first half; ends swap at half time.
- **Both teams attack and defend.** Today the user only attacks and the AI only defends. Add defending actions (tackle, slide, jockey, switch player) and an attacking AI for whichever side is not human.
- **Real match flow:** kick-off, throw-ins/goal kicks (simplified), half time, full time, result screen. The clock currently never ends.
- **Code structure:** split the 1,600-line file into modules; move from Three.js r128 on a CDN to a current npm version; replace Tailwind CDN with a build-time setup.

## 4. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Vite + TypeScript + Three.js** (vanilla, no React in the game canvas) | Fast to load on phones; the game loop stays close to the current code. |
| UI screens (menus, lobby, leaderboard) | Small Preact or plain TS + Tailwind | Lightweight; keeps the bundle small. |
| Hosting | **Vercel** (static build + preview deploys per pull request) | Every stage gets a URL you can play-test on your phone. |
| Auth | **Supabase Auth**: anonymous sign-in, later linked to Google or email | Matches the guest-first decision without losing stats on upgrade. |
| Database | **Supabase Postgres** with Row Level Security | Profiles, matches, stats, ratings. |
| Real-time | **Supabase Realtime** (Broadcast + Presence channels) | Carries match inputs/state between the two phones; Vercel functions can't hold long-lived sockets. |
| Trusted logic | **Supabase Edge Functions** + Postgres functions | Matchmaking and result recording, so clients can't write their own wins. |
| Installable | PWA manifest with `orientation: landscape`, offline play vs AI | "Add to home screen" feels like an app. |

## 5. Landscape on phones

- PWA manifest sets landscape. On Android, request fullscreen and lock orientation with the Screen Orientation API when the match starts.
- iOS Safari can't lock orientation, so show a "Rotate your phone" overlay in portrait and pause the game.
- Respect notches with `env(safe-area-inset-*)`; keep the joystick bottom-left and action buttons bottom-right, sized for thumbs (at least 56 px).
- Controls, phone: joystick to move; **Pass**, **Shoot** (hold for power), **Cross/Lob**, **Sprint**. When defending, the same buttons become **Tackle**, **Slide**, **Switch player**, **Sprint**.
- Controls, desktop: WASD/arrows to move, J/K/L/Space as today, plus Shift sprint and Q switch. Gamepad support later.
- Performance budget: 60 fps on a mid-range Android phone. Cap pixel ratio at 2 (1.5 on low-end), simple shadows, instanced crowd, under 2 MB initial download.

## 6. Online multiplayer design

**Model: host-authoritative peer simulation over Supabase Realtime.**

1. Matchmaking puts two players in a match and picks one as **host**.
2. Both join a private Realtime channel `match:<id>`.
3. The guest sends its **inputs** (joystick + buttons) about 30 times a second.
4. The host runs the one true simulation at a fixed 60 Hz tick (both teams' AI included) and broadcasts **snapshots** (ball, 10 players, clock, score) about 15–20 times a second.
5. The guest **interpolates** between snapshots (~100 ms buffer) and **predicts** its own controlled player so movement feels instant.
6. Presence tracks disconnects: 15 seconds to reconnect, otherwise the remaining player wins by forfeit.

**Why this model:** it needs no game server of our own, fits Supabase's free/pro tiers, and is the fastest path to playable online. **Trade-offs:** the host has a small latency advantage, and a modified client could cheat. v1 mitigations: both clients report the final score, and the Edge Function only records a result when they agree (otherwise it's flagged and not rated).

**Escape hatch:** if play-testing shows lag is unacceptable across regions, move the simulation to a small authoritative server (e.g. Colyseus on Fly.io) without changing the database or UI. Decide after Stage 4 testing.

**Game code prerequisite:** separate simulation (pure, fixed timestep, no Three.js) from rendering. This is needed for networking and makes the AI-vs-AI and offline modes reuse the same code.

## 7. Supabase data model

```
profiles        id (= auth user id), nickname, avatar_kit, is_guest, rating (default 1000), created_at
matches         id, status (waiting|live|finished|abandoned|disputed), mode (online|vs_ai),
                home_id, away_id, host_id, home_score, away_score, winner_id, started_at, ended_at
match_reports   match_id, reporter_id, home_score, away_score, goals jsonb, submitted_at
player_stats    user_id, played, won, drawn, lost, goals_for, goals_against, shots, passes  (updated by function)
match_queue     user_id, rating, joined_at
```

- **Leaderboard:** a view over `profiles` ordered by `rating` (Elo, K = 32), filtered to players with 5+ rated games. Weekly board later.
- **RLS:** anyone signed in can read profiles and the leaderboard; users update only their own nickname/kit; `matches`, `player_stats` and ratings are written only by functions (service role).
- **Matchmaking:** a Postgres function `find_match()` locks the queue (`FOR UPDATE SKIP LOCKED`), pairs the player with the closest rating (widening over time), creates the `matches` row and returns it. Clients wait on a Realtime notification. After 30 seconds with nobody, offer "Play vs AI while you wait".
- **Edge Functions:** `submit-result` (compares both reports, writes match, stats and Elo) and `link-account` helpers if needed.
- **Guest upgrade:** anonymous user calls `linkIdentity` (Google) or `updateUser` (email), keeping the same user id and all stats. Clean up guest accounts idle for 30+ days.

## 8. Screens

1. **Home:** Play Online, Play vs AI, Leaderboard, Profile. Guest nickname prompt on first visit.
2. **Matchmaking:** searching animation, cancel, "play AI while waiting".
3. **Match:** scoreboard, clock, radar, controls, pause (vs AI only), connection indicator (online).
4. **Result:** score, goals timeline, rating change, Rematch / Home.
5. **Leaderboard:** top 100 plus your own rank.
6. **Profile:** nickname, kit colour, stats, "Save your progress" (upgrade to Google/email).

## 9. Delivery stages

Each stage ends with a Vercel preview link for you to play-test on your phone, and a pull request to review.

| Stage | Outcome | Rough effort |
|-------|---------|--------------|
| **0. Setup** | GitHub repo, Vite + TS project, Vercel project linked, Supabase project created, CI (typecheck, lint, build). Prototype runs unchanged inside the new app. | 1–2 days |
| **1. Landscape single-player** | Side-on pitch and camera, goals left/right, rotate overlay, PWA manifest, phone controls tuned. | 3–4 days |
| **2. Full match vs AI** | 5-a-side both directions, attacking + defending AI, tackles, player switching, kick-off/half time/full time, result screen. Simulation split from rendering. | 1–1.5 weeks |
| **3. Accounts & stats** | Guest sign-in, nickname, profile, vs-AI results saved, Google/email upgrade. | 3–4 days |
| **4. Online 1v1** | Matchmaking, Realtime channel, host simulation + snapshots, guest prediction/interpolation, disconnect handling. | 1.5–2 weeks |
| **5. Ranked & leaderboard** | Result verification, Elo ratings, leaderboard screen, basic anti-abuse (rate limits, disputed results). | 3–4 days |
| **6. Polish & launch** | Sound and crowd, goal replays, tutorial, performance pass on low-end phones, analytics, custom domain. | 1 week |

Total: roughly 6–8 weeks of build time, depending on how much play-testing feedback each stage gets.

## 10. Risks and how we handle them

| Risk | Mitigation |
|------|-----------|
| Online lag feels bad on mobile networks | Prediction + interpolation; region-aware matchmaking later; escape hatch to a dedicated server (section 6). |
| Cheating via modified client | Dual result reports, function-only writes, flag disputes; authoritative server if it becomes a real problem. |
| Low-end phones drop frames | Performance budget, quality setting (Low/High), test on a real mid-range Android early in Stage 1. |
| iOS can't lock landscape | Rotate overlay and auto-pause. |
| Supabase Realtime message limits | 15–20 snapshots/s × short matches fits the Pro plan; monitor usage and compress snapshots (quantised numbers). |
| Not enough players online to match | "Play vs AI while you wait", and later invite-a-friend links. |

## 11. Later ideas (not in v1)

Friends list and invite links, 2v2, tournaments and weekly leagues, custom teams and kits, gamepad support, spectating, replays to share, cosmetics shop.

## 12. What's needed from you to start Stage 0

1. An **empty GitHub repository** (e.g. `football-striker`) connected to this project, so I can push code.
2. Confirmation that I can create the **Vercel** and **Supabase** projects using your connected accounts (free tiers are fine to start).
3. Any change to the assumptions in section 2 (team size, match length).
