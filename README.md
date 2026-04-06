# ElderAll — Elderly Safety Monitoring System

ElderAll is an elderly safety system built on a microservices architecture. It uses a smartphone to detect falls, track location with geofencing, and manage medication schedules. When a fall is detected or a geofence boundary is crossed, the system sends real-time alerts (WebSocket, SSE, SMS, email) to a guardian dashboard.

Please run docker compose up --build

## Architecture

```
Phone PWA (Elderly's phone)          Guardian Dashboard (React)
  ├── Motion sensors -> fall detect     ├── ElderWatch    — Live GPS map + geofence
  ├── GPS location -> backend           ├── Medicare      — Medicine schedule + inventory
  └── Medicine schedule viewer          ├── ElderWatch(Dev) — Dev controls + replay
        │                               └── GuardianUI(Dev) — Event stream viewer
        │                                       │
        └──────────────┬────────────────────────┘
                       ▼
               ┌──────────────┐
               │  gateway_ms  │  API Gateway (port 4000)
               │  HTTP proxy  │  WebSocket proxy
               └──────┬───────┘
          ┌────┬──────┼──────┬──────┐
          ▼    ▼      ▼      ▼      ▼
      gps_ms alert_ms med_ms auth notification_ms
      :4001  :4002    :4003  :4004  :4005
          │                          ▲
          │    ┌──────────┐          │
          └───>│ RabbitMQ │──────────┘
               │  (AMQP)  │
               └──────────┘
```

## Microservices

| Service | Port | Responsibility |
|---------|------|---------------|
| **gateway_ms** | 4000 | API gateway — proxies all requests, WebSocket proxy |
| **gps_ms** | 4001 | GPS tracking, geofence check, coordinate history, publishes to RabbitMQ |
| **alert_ms** | 4002 | Alert storage, fall detection scoring, SSE streaming, WebSocket broadcast |
| **medicine_ms** | 4003 | Medicine CRUD via OutSystems, schedule overrides, reminders |
| **auth_ms** | 4004 | Guardian + Elderly login/registration via OutSystems |
| **notification_ms** | 4005 | SMS + email dispatch, RabbitMQ consumer for geofence alerts |
| **RabbitMQ** | 5673 | AMQP message broker for geofence event fan-out |

## External Services (OutSystems)

| Service | Purpose |
|---------|---------|
| Guardian (`qmo.outsystemscloud.com/GuardianServices`) | Guardian auth & profile |
| Elderly (`qmo.outsystemscloud.com/ElderlyServices`) | Elderly auth & profile |
| Elderly Log (`qmo.outsystemscloud.com/ElderlyLogServices`) | Coordinate/incident logs |
| Medicine (`personal-s93qqbah.outsystemscloud.com/ManageMedicine`) | Medicine CRUD & schedules |
| Notification (`smuedu-dev.outsystemsenterprise.com/SMULab_Notification`) | SMS & Email dispatch |

## Quick Start

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Gateway (API) | http://localhost:4000 |
| Guardian UI | http://localhost:5173 |
| Phone PWA | http://localhost:5174 |
| RabbitMQ Management | http://localhost:15673 (guest/guest) |

> Only need `--build` when you've changed code. Otherwise `docker compose up` is fine.

## Test Accounts

| Role     | Phone      | Password |
|----------|------------|----------|
| Guardian | 6592369965 | guard123 |
| Elderly  | 6592369965 | elder123 |

## Notification Settings

SMS and email recipients default to environment variables in `docker-compose.yml`:

```yaml
- DEFAULT_GUARDIAN_PHONE=+6592369965
- DEFAULT_GUARDIAN_EMAIL=alec.ong.2024@computing.smu.edu.sg
```

Can also be changed at runtime via the Settings page in the Guardian UI.

## Fall Detection Algorithm

The system uses a two-stage pipeline to detect phone drops (potential falls):

### Stage 1 — Client-Side Filtering (`phone-pwa/src/motionSensor.js`)

The phone's browser captures accelerometer and gyroscope data via the `DeviceMotionEvent` API, maintaining a **3-second rolling window** of samples.

Each sensor reading is checked against quick thresholds to see if the motion is **suspicious**:

| Check | Threshold | What it catches |
|-------|-----------|-----------------|
| Freefall | `minAcceleration < 6 m/s²` | Sudden drop in acceleration (gravity disappears during freefall) |
| High impact | `peakAcceleration > 11 m/s²` | Spike on hitting the ground |
| Rapid spin | `peakRotationRate > 90°/s` | Phone tumbling mid-air |
| Post-impact stillness | `> 1000 ms` | Phone lying motionless after impact |

If any threshold is met, the system waits **450 ms** to collect more data, then sends the feature vector to the server. After sending, there is a **3-second cooldown** before the next detection can fire.

### Stage 2 — Server-Side Scoring (`alert_ms/server.js`)

The server runs a **weighted scoring algorithm** on the received features:

| Condition | Points |
|-----------|--------|
| `minAcceleration < 6` | +25 |
| `minAcceleration < 3` | +15 bonus |
| `peakRotationRate > 100` | +20 |
| `peakRotationRate > 180` | +10 bonus |
| `peakAcceleration > 12` | +25 |
| `peakAcceleration > 18` | +15 bonus |
| Impact + stillness > 1000 ms | +10 |
| Impact + stillness > 2000 ms | +10 bonus |

The total score determines the severity:

| Score | Severity | Action |
|-------|----------|--------|
| **>= 100** | `ElEVATED` | High-risk fall — alert created, WebSocket broadcast, SMS/email sent, logged to OutSystems |
| **70 – 99** | `FALLEN` | Fall detected — alert created, WebSocket broadcast, SMS/email sent, logged to OutSystems |
| 50 – 69 | `NORMAL` | No alert |
| < 50 | `ATREST` | No alert |

### Flow

```
Phone sensor event
  → Client checks thresholds (isSuspicious)
  → 450ms collection window
  → POST /motion/sample to alert_ms
  → Server scores features
  → If score >= 70: create incident → notify guardians via WebSocket, SMS, email
```

## Project Structure

```
Elderend_sub/
├── gateway_ms/          # API Gateway (port 4000)
├── gps_ms/              # GPS + geofence service (port 4001)
├── alert_ms/            # Alert + fall detection service (port 4002)
├── medicine_ms/         # Medicine management service (port 4003)
├── auth_ms/             # Authentication service (port 4004)
├── notification_ms/     # Notification service (port 4005)
├── guardian-ui/         # Guardian React dashboard (port 5173)
├── phone-pwa (elderly-ui)/  # Elderly phone PWA (port 5174)
├── docker-compose.yml   # Full stack deployment
└── REQUIREMENTS_COMPLIANCE.md  # ESD requirements mapping
```

## Stopping

```bash
docker compose down
```
