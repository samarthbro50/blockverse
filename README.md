# Blockverse — browser game creator

An independent browser-based game creation platform prototype. Not affiliated with Roblox.

## MVP
- Accounts with bcrypt password hashing and JWT sessions
- Discover published worlds
- Build simple 3D block scenes, save drafts, publish, and play
- PostgreSQL persistence

## Run locally
Requires Node.js 20+ and PostgreSQL. Copy `server/.env.example` to `server/.env`, configure `DATABASE_URL` and `JWT_SECRET`, then run:
```sh
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```
Open http://localhost:5173. API is on port 4000.

## Render
Create a new Blueprint in Render and connect this repository. Render reads `render.yaml`.

## Important limitations
This is an early MVP, not a full Roblox replacement. 30-player realtime multiplayer is not implemented. No user scripting, sandbox runtime, avatars, chat, moderation dashboard, payments, email verification, or password reset yet. Do not invite the public until moderation, reporting, privacy/terms, backups, and abuse controls are implemented. Published worlds contain validated JSON block scenes, not executable code.
