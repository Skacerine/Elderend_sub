# Medicare Microservice — Docker Compose

Demonstrates the Medicare medication management system running as an **independent microservice**, separate from the rest of ElderAll.

## Architecture

```
docker-compose.medicare.yml
├── medicare-backend   (port 4001)  — Lightweight Express server
│   ├── /medicine/*                 — Medicine CRUD (proxy to OutSystems)
│   └── /auth/login/*              — Guardian & Elderly authentication
│
└── medicare-ui        (port 5175)  — Guardian UI frontend
    └── Medicare tab                — Schedule, Calendar, Inventory
```

The `medicare-service/` is a standalone microservice (~180 lines) that only handles medicine operations and authentication. No GPS tracking, no fall detection, no WebSocket.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

## Quick Start

```bash
docker compose -f docker-compose.medicare.yml up --build
```

Wait for both containers:
```
medicare-backend  | Medicare service listening on port 4001
medicare-ui       | VITE ready on http://localhost:5173
```

## Usage

1. Open **http://localhost:5175**
2. Login with phone `6588888888`, password `guard123`
3. Click the **Medicare** tab
4. **Inventory tab** — Add medicines with name, time, stock, dose, days
5. **Schedule tab** — View medicines per day of the week
6. **Calendar tab** — Monthly view, click any date to see that day's medicines

## Docker Compose Features

| Feature | How it's used |
|---------|--------------|
| Multi-container orchestration | Frontend + Backend as separate services |
| Service dependencies | `medicare-ui` waits for `medicare-backend` to be healthy |
| Health checks | Backend checked every 10s via `/health` endpoint |
| Custom networking | Both containers on `medicare-net` bridge network |
| Environment variables | Frontend configured via `VITE_API_BASE_URL` |
| Port mapping | Backend 4001, Frontend 5175 |
| Restart policy | `unless-stopped` — auto-restart on failure |

## Health Checks

```bash
docker compose -f docker-compose.medicare.yml ps

curl http://localhost:4001/health
# {"ok":true,"service":"medicare-service"}

curl http://localhost:4001/medicine/health
# {"status":"online","service":"medicare-medicine-proxy"}
```

## Stopping

```bash
docker compose -f docker-compose.medicare.yml down
```

## Full App Instead

To run the complete ElderAll platform (all tabs, GPS, fall detection):

```bash
docker compose up --build
```

Starts backend (4000), Guardian UI (5173), and Phone PWA (5174).

## File Structure

```
Elderend_sub/
├── docker-compose.medicare.yml    # Medicare-only compose (this guide)
├── docker-compose.yml             # Full app compose
├── medicare-service/              # Standalone Medicare backend
│   ├── server.js                  # Express server (~180 lines)
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── guardian-ui/                   # Frontend (shared with full app)
│   └── src/Medicare.jsx           # Medicare component
└── backend/                       # Full backend (used by docker-compose.yml)
```
