# ElderAll — Elderly Safety Monitoring System

ElderAll is an elderly safety system that uses a smartphone to detect falls, track location, and manage medication schedules. When a fall is detected, the system sends real-time alerts (popup, SMS, email) to a guardian dashboard.

## Live Deployment

| Service | URL |
|---------|-----|
| Guardian Dashboard | https://guardianphonedropper.vercel.app |
| Phone PWA (Elderly) | https://phonedropper9000-xi.vercel.app |
| Backend | https://elderend-backend.onrender.com |

## System Overview

```
Phone PWA (Elderly's phone)
  ├── Motion sensors → fall detection
  ├── GPS location → backend
  └── Medicine schedule viewer
        │
        ▼
Backend (Express + WebSocket)
  ├── Fall scoring algorithm
  ├── GPS tracking + geofence (500m home zone)
  ├── Medicine CRUD (proxy to OutSystems)
  ├── Auth (proxy to OutSystems)
  └── Notifications (SMS + Email via OutSystems)
        │
        ▼
Guardian Dashboard (React)
  ├── GuardianUI     — Real-time fall alerts with alarm
  ├── ElderWatch     — Live GPS map with geofence boundary
  ├── Medicare       — Medicine schedule, calendar, inventory
  ├── ElderWatch(Dev) — Dev controls (D-pad, replay scenarios)
  └── GuardianUI(Dev) — Dev panels (event stream, payload viewer)
```

## External Services

| Service | URL | Purpose |
|---------|-----|---------|
| OutSystems (Guardian) | `qmo.outsystemscloud.com/GuardianServices/rest/Guardian` | Guardian auth & profile |
| OutSystems (Elderly) | `qmo.outsystemscloud.com/ElderlyServices/rest/Elderly` | Elderly auth & profile |
| OutSystems (Medicine) | `personal-s93qqbah.outsystemscloud.com/ManageMedicine/rest/Medicine` | Medicine CRUD & schedules |
| OutSystems (Notification) | `smuedu-dev.outsystemsenterprise.com/SMULab_Notification/rest/Notification` | SMS & Email alerts |

## Quick Start (Docker)

### Full app (all services)

```bash
cd Elderend_sub
docker compose up --build
```

| Service | Port |
|---------|------|
| Backend | http://localhost:4000 |
| Guardian UI | http://localhost:5173 |
| Phone PWA | http://localhost:5174 |

### Medicare microservice only

```bash
docker compose -f docker-compose.medicare.yml up --build
```

| Service | Port |
|---------|------|
| Medicare Backend | http://localhost:4001 |
| Medicare UI | http://localhost:5175 |

> Only need `--build` when you've changed code. Otherwise `docker compose up` is fine.

## Test Accounts

| Role | Phone | Password |
|------|-------|----------|
| Guardian | 6588888888 | guard123 |
| Elderly | 6591234567 | elder123 |

## Notification Setup

SMS and email alerts are sent to a hardcoded phone number and email. To change the recipient, edit:

```
backend/services/notificationService.js
```

Update these two lines at the top of the file:

```js
const GUARDIAN_PHONE = "+6592369965";       // change to your phone number
const GUARDIAN_EMAIL = "alec.ong.2024@computing.smu.edu.sg";  // change to your email
```

Rebuild after changing: `docker compose up --build`

## How Fall Detection Works

The phone PWA reads motion sensors and watches for a pattern that resembles a fall:

1. Sudden drop in acceleration
2. Strong impact
3. Rapid spin or rotation
4. Stillness after impact

These signals are scored by the backend. If the score is high enough (`>= 100`), it triggers a real-time alert to the guardian dashboard with popup, alarm sound, SMS, and email.

## Project Structure

```
Elderend_sub/
├── backend/                 # Main Express server (port 4000)
│   ├── routes/              # API routes (motion, gps, medicine, auth, alerts)
│   ├── services/            # Notification service (SMS + email)
│   └── store/               # In-memory coordinate store
├── guardian-ui/             # Guardian React dashboard (port 5173)
│   └── src/
│       ├── GuardianUI.jsx   # Fall alert dashboard
│       ├── ElderWatch.jsx   # GPS tracking map
│       ├── Medicare.jsx     # Medicine management
│       └── AuthContext.jsx  # Auth state (localStorage)
├── phone-pwa/               # Elderly phone app (port 5174)
│   └── src/App.jsx          # Motion detection + medicine viewer
├── medicare-service/        # Standalone Medicare microservice (port 4001)
├── docker-compose.yml       # Full stack compose
├── docker-compose.medicare.yml  # Medicare-only compose
└── TOTEST.md                # Testing guide
```

## Stopping

```bash
docker compose down
```
