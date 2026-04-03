# Medicare Microservice — Docker Compose

This guide demonstrates how the Medicare medication management system runs as an **independent microservice** using Docker Compose, separate from the rest of the ElderAll platform.

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

The `medicare-service/` is a **standalone microservice** (~180 lines) that only handles medicine operations and authentication. No GPS tracking, no fall detection, no WebSocket — just Medicare.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

## Quick Start

```bash
# From the Elderend_sub directory:
docker compose -f docker-compose.medicare.yml up --build
```

Wait for both containers to be ready:
```
medicare-backend  | Medicare service listening on port 4001
medicare-ui       | VITE ready on http://localhost:5173
```

## Usage

### 1. Open the app

Go to **http://localhost:5175** in your browser.

### 2. Login

Use the Guardian account:
- **Phone:** `6588888888`
- **Password:** `guard123`

### 3. Navigate to Medicare tab

Click the **Medicare** tab in the top navigation bar.

### 4. Add a medicine

- Click the **Inventory** tab
- Click **+ Add**
- Fill in: medicine name, time, stock, dose, instructions
- Select which days (Mon–Sun) the medicine should be taken
- Click **Add Medicine**

### 5. View the schedule

- **Schedule tab** — see medicines for each day of the week
- **Calendar tab** — monthly view, click any date to see that day's medicines
- **Inventory tab** — manage stock, restock, delete medicines, change day schedules

## Docker Compose Features Demonstrated

| Feature | How it's used |
|---------|--------------|
| **Multi-container orchestration** | Frontend + Backend as separate services |
| **Service dependencies** | `medicare-ui` waits for `medicare-backend` to be healthy before starting |
| **Health checks** | Backend checked every 10s via `/health` endpoint |
| **Custom networking** | Both containers communicate over `medicare-net` bridge network |
| **Environment variables** | Frontend configured to point to backend via `VITE_API_BASE_URL` |
| **Port mapping** | Backend on 4001, Frontend on 5175 |
| **Restart policy** | `unless-stopped` — auto-restart on failure |

## Verify Health

```bash
# Check container status
docker compose -f docker-compose.medicare.yml ps

# Backend health
curl http://localhost:4001/health
# Expected: {"ok":true,"service":"medicare-service"}

# Medicine API health
curl http://localhost:4001/medicine/health
# Expected: {"status":"online","service":"medicare-medicine-proxy"}
```

## Stopping

```bash
docker compose -f docker-compose.medicare.yml down
```

## Full App (All Services)

To run the complete ElderAll platform instead (all tabs functional):

```bash
docker compose up --build
```

This starts the full backend (port 4000), Guardian UI (port 5173), and Phone PWA (port 5174).

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
│   ├── src/Medicare.jsx           # Medicare component
│   └── Dockerfile
└── backend/                       # Full backend (used by docker-compose.yml)
```
