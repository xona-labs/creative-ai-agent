# Xona Agent

Autonomous creative AI agent on Solana, built for the [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon).

Xona Agent combines free AI image and video generation with autonomous Colosseum forum participation. It runs as a long-lived process that serves public API endpoints, posts curated content to the hackathon forum on a schedule, and maintains a heartbeat with the Colosseum platform.

---

## Features

**Free AI Generation API** — No auth, no payment. Any agent or client can call these endpoints.

- **Image generation** via three models: Google Nano Banana, ByteDance Seedream 4.5, xAI Grok Imagine
- **Video generation** via Grok Video (10-second clips)
- **PumpFun token intelligence** — trending tokens and top movers with DexScreener data and AI summaries
- **Solana trending** — topics and tokens from X via Grok x_search

**Autonomous Forum Posting** — Cron-scheduled pipelines that generate and post content to the Colosseum forum:

| Pipeline | Schedule (UTC) | Description |
|----------|---------------|-------------|
| X News | 02:00, 08:00, 14:00, 20:00 | Fetches latest news from @solana, @dexteraisol, @zauthx402, @payainetwork, @relayaisolana. Generates AI banners. |
| Image Showcase | 05:00, 17:00 | Generates creative images with rotating models and writes quality reviews. |
| PumpFun Intel | 03:00, 15:00 | Analyzes PumpFun trending tokens and top movers with AI summaries. |

**Colosseum Integration** — Registration, heartbeat (30-min interval), project management, poll responses, and forum participation.

**Solana Integration** — x402 USDC micropayments, Jupiter API for token swap data, PumpFun on-chain analytics, SPL token transfers, nacl signature verification, and an MCP server for agent-to-agent interactions.

---

## Project Structure

```
xona-agent/
  index.js              # Entry point — starts agent, server, and cron
  server.js             # Express API server with all endpoints
  agent/
    colosseum.js        # Colosseum hackathon client (registration, heartbeat, forum, project)
  services/
    daily-news.js       # Autonomous forum posting pipelines and cron scheduler
    grok.js             # xAI Grok API client (chat, x_search)
    image-gen.js        # Image generation (Nano Banana, Seedream, Grok Imagine)
    video-gen.js        # Video generation (Grok Video)
    pumpfun.js          # PumpFun trending tokens and movers
    upload.js           # DigitalOcean Spaces CDN upload
    x-poster.js         # X (Twitter) posting
  scripts/
    register.js         # One-time Colosseum registration script
```

---

## Prerequisites

- Node.js 20+
- An [xAI API key](https://console.x.ai/) (for Grok-powered generation and search)
- A [Replicate API token](https://replicate.com/) (for Nano Banana and Seedream models)
- DigitalOcean Spaces credentials (for CDN image/video storage)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/xona-labs/creative-ai-agent.git
cd creative-ai-agent
npm install
```

### 2. Configure environment

```bash
cp env.example .env
```

Edit `.env` and fill in your keys. See [Environment Variables](#environment-variables) below for details.

### 3. Register with Colosseum

```bash
npm run register
```

This registers your agent and prints an **API key** and **claim code**. The API key is shown once — save it immediately. Add both to your `.env`:

```
COLOSSEUM_API_KEY=<your-api-key>
COLOSSEUM_CLAIM_CODE=<your-claim-code>
```

Then visit the printed claim URL in a browser to link the agent to your Colosseum account.

### 4. Start the agent

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

---

## Docker

Build and run with Docker Compose:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f
```

Stop:

```bash
docker compose down
```

The container reads your `.env` file automatically.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COLOSSEUM_AGENT_NAME` | Yes | Agent name for registration |
| `COLOSSEUM_API_KEY` | Yes* | API key from registration (set after `npm run register`) |
| `COLOSSEUM_CLAIM_CODE` | No | Claim code from registration |
| `COLOSSEUM_REPO_LINK` | Yes | Public GitHub repository URL |
| `COLOSSEUM_DEMO_LINK` | No | Live demo URL |
| `PORT` | No | Server port (default: `3002`) |
| `XAI_API_KEY` | Yes | xAI API key for Grok chat, image, video, and x_search |
| `GEMINI_API_KEY` | No | Google Gemini API key |
| `REPLICATE_API_TOKEN` | Yes | Replicate API token for image generation models |
| `DO_SPACES_ENDPOINT` | Yes | DigitalOcean Spaces endpoint |
| `DO_SPACES_KEY` | Yes | DigitalOcean Spaces access key |
| `DO_SPACES_SECRET` | Yes | DigitalOcean Spaces secret key |
| `DO_SPACES_BUCKET` | Yes | DigitalOcean Spaces bucket name |
| `DO_SPACES_CDN_URL` | Yes | DigitalOcean Spaces CDN URL |
| `DO_SPACES_REGION` | No | DigitalOcean Spaces region (default: `nyc3`) |

*The server starts without `COLOSSEUM_API_KEY`, but autonomous forum posting and live triggers will be disabled. Preview/test endpoints still work.

---

## API Endpoints

### Generation (free, no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/generate-image` | Generate an AI image. Body: `{ "prompt": "...", "model": "nano-banana" }` |
| `POST` | `/generate-video` | Generate a 10-second AI video. Body: `{ "prompt": "..." }` |
| `GET` | `/models` | List available image generation models |

**Image models:** `nano-banana`, `seedream`, `grok-imagine`

### PumpFun Intelligence

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/pumpfun/trending?limit=10` | Trending PumpFun tokens with AI analysis |
| `GET` | `/pumpfun/movers?limit=10` | Top PumpFun movers with AI analysis |

### Solana Trending (via Grok x_search)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/solana/trending-topics?limit=10` | Trending Solana topics from X |
| `GET` | `/solana/trending-tokens?limit=10` | Trending Solana tokens from X |

### Test / Preview (dry-run, no forum posting)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/test/x-news?account=solana` | Preview an X News forum post |
| `GET` | `/test/image-showcase?model=nano-banana` | Preview an Image Showcase forum post |
| `GET` | `/test/pumpfun?type=trending` | Preview a PumpFun Intel forum post |

### Live Triggers (posts to Colosseum forum)

Requires `COLOSSEUM_API_KEY` to be set.

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/trigger/x-news` | `{ "account": "solana" }` | Trigger X News pipeline and post to forum |
| `POST` | `/trigger/image-showcase` | `{ "model": "nano-banana" }` | Trigger Image Showcase and post to forum |
| `POST` | `/trigger/pumpfun` | `{ "type": "trending" }` | Trigger PumpFun Intel and post to forum |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Agent info and endpoint list |
| `GET` | `/health` | Health check |

---

## How It Works

On startup, the agent:

1. Connects to Colosseum — verifies API key, fetches hackathon status, creates/updates the project, posts a forum introduction.
2. Starts the API server — serves all public endpoints on the configured port.
3. Starts the heartbeat — pings Colosseum every 30 minutes, responds to active polls, and logs announcements.
4. Starts autonomous cron jobs — generates content and posts to the Colosseum forum on the schedule described above.

The agent handles graceful shutdown on `SIGINT`/`SIGTERM`, stopping the heartbeat, cron jobs, and HTTP server cleanly.

---

## License

MIT — Built by [Xona Labs](https://github.com/xona-labs).
