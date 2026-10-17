# Aetherion server

Authoritative game server for *Aetherion: The Fifteen Oaths*. Node 22, ESM, one dependency (`ws`).

- **HTTP** serves the built client from `game/dist`: MIME types (incl. `.webmanifest`, `.glb`, `.wasm`), cached brotli/gzip,
  ETags, `immutable` caching for hashed assets, `no-cache` for HTML / service worker, SPA fallback.
- **WebSocket** at `/ws` runs `shared/sim` (the same simulation the browser uses offline): 20 Hz ticks,
  10 Hz delta-compressed, interest-managed snapshots, schema validation, rate limits, heartbeat, token resume.
- **`/health`** and **`/stats`** return JSON (players, bots, mobs, tick time p50/p99 wall and CPU, bandwidth, memory).
- **Persistence**: one JSON file per character in `server/data/characters/` (atomic temp-file + rename writes),
  saved on disconnect, every 60 s, and on shutdown (SIGINT/SIGTERM).

## Run locally

```bash
cd server && npm install            # installs ws
(cd ../game && npx vite build)      # optional: build the client so / serves it
npm start                           # http://localhost:8787  (ws://localhost:8787/ws)
```

During client development run `npm start` here and `npx vite` in `game/`; Vite proxies `/ws` to `:8787`.

| env | default | |
|---|---|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | bind address |
| `BOTS` | `40` | AI adventurers kept in the world while fewer than this many humans are online |
| `MAX_PLAYERS` | `600` | connection cap |
| `DATA_DIR` | `server/data` | character saves |
| `STATIC_DIR` | `game/dist` | client build to serve |
| `WORLD_SEED` | `15015` | camp / loot seed |
| `FLUSH_HZ` | `10` | `10` = events ride on each client's snapshot frame; `20` = flush every tick (lower latency, more frames) |

## Tests and load

```bash
npm test                                   # sim unit tests + HTTP/WS integration test (random port)
node loadtest.mjs --clients 300 --duration 60   # boots a server, 300 headless clients moving + casting
node bench.mjs --players 300 --seconds 60       # same workload against the sim without networking (CPU per tick)
```

## Client connection

The client (`game/src/net`) connects to `?server=wss://host/ws` when given, otherwise same-origin `/ws`.
If no server answers within ~2.5 s (or with `?offline=1`, e.g. a static Vercel deploy) it runs the
simulation in a Web Worker with identical messages and AI adventurers.

## Deploy

**Docker (any VPS)** - build from the repository root:

```bash
docker build -f server/Dockerfile -t aetherion .
docker run -d -p 80:8787 -v aetherion-data:/app/server/data --restart unless-stopped aetherion
```

Put a TLS proxy (Caddy: `reverse_proxy localhost:8787`) in front for `wss://`. WebSockets pass through unchanged.

**Fly.io** - from the repository root: `fly launch --dockerfile server/Dockerfile --internal-port 8787 --no-deploy`,
then `fly volumes create aetherion_data --size 1`, mount it at `/app/server/data` in `fly.toml`
(`[mounts] source="aetherion_data" destination="/app/server/data"`), and `fly deploy`. Keep one machine
(the world is a single process); `auto_stop_machines = false` keeps the world running.

**Render** - New Web Service -> Docker, Dockerfile path `server/Dockerfile`, docker context `.`, add a disk mounted
at `/app/server/data`, health check path `/health`.

**Static client elsewhere** (Vercel/Netlify): deploy `game/dist`, then open
`https://your-client/?server=wss://your-game-server/ws`; without `?server=` the client plays offline.

## Layout

- `index.js` - entry point (env config, graceful shutdown)
- `app.js` - `startServer(opts)`: HTTP, WebSocket sessions, tick loop, stats
- `lib/validate.js` - message schemas, `lib/persistence.js` - character store, `lib/static.js` - static files
- `../shared/sim/` - the simulation (combat, mobs, quests, NPCs, events, bots), shared with the browser
