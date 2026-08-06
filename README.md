# final-api

LLM API gateway with transparent proxying and session-affinity routing.

## Tech Stack

- **Backend**: Rust + Axum + SQLx + PostgreSQL
- **Frontend**: React + Vite + TailwindCSS
- **Dev**: VSCode Dev Container

## Key Design

Unlike new-api which fully serializes/deserializes requests for format conversion, final-api **transparently proxies** requests to upstream providers. It only modifies:
- Auth headers (replaces API key)
- Model name (if model mapping is configured)
- Body fields (if body override is configured)

### Routing Strategy

Uses **deterministic prefix-matching** (inspired by opencode console) instead of random load balancing:

1. Extract `stickyId` from session header → token ID → IP
2. Look up `{model}/{stickyId}` in `sticky_provider` table
3. If found, reuse the same channel (preserves prompt cache)
4. If not, select deterministically via hash(stickyId) % weighted_channels
5. On success (HTTP 200), persist the mapping

### Failover

- `sticky_mode: "strict"` — no retry, fail immediately
- `sticky_mode: "prefer"` — retry with different channel (up to `max_retries`)
- `sticky_mode: "none"` — same as prefer

## Quick Start

```bash
# Copy config
cp .env.example .env

# Run database migrations
sqlx migrate run

# Start backend
cargo run

# Start frontend (in another terminal)
cd frontend && npm install && npm run dev
```

## Default Admin

- Username: `root`
- Password: `123456`

## API Endpoints

### Relay (Token Auth — `sk-xxx`)
- `POST /v1/chat/completions`
- `POST /v1/completions`
- `POST /v1/messages` (Claude)
- `POST /v1/embeddings`
- `POST /v1/responses`
- `GET /v1/models`

### Management (JWT Auth)
- `POST /api/user/login` | `POST /api/user/register`
- `GET /api/user/self`
- `GET|POST /api/token` | `DELETE|PUT /api/token/:id`
- `GET|POST /api/channel` | `PUT|DELETE /api/channel/:id`
- `GET /api/log`
