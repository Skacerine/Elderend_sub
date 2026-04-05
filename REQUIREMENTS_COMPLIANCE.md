# IS213 G1T7 — ElderWatch Requirements Compliance

## Project: Daily Safety Application for Elderly

---

## Minimum Technical Requirements Checklist

### 1. Three Most Interesting User Scenarios

| # | Scenario | Services Involved | Why Interesting |
|---|----------|-------------------|-----------------|
| 1 | **Home Surveillance Movement Detection** | Motion Detector (OutSystems mock) -> Verify Event (OutSystems composite) -> Elderly (OutSystems atomic) -> Healthcare Provider (OutSystems mock) -> Guardian (OutSystems atomic) -> SMU Lab SMS API (external) -> Alert Dashboard | Handles emergency escalation: if no movement is detected in 12 hours, the system contacts a healthcare provider AND notifies the guardian. Demonstrates business exception handling (what happens when the elderly is unresponsive). |
| 2 | **Elderly Location Tracking + Fall Detection** | Phone PWA (GPS sender) -> gps_ms (Process Coordinates + Check within Radius) -> RabbitMQ AMQP Broker -> notification_ms (Notify Guardian + Alert Device) -> alert_ms (Alert Dashboard + SSE) -> Guardian UI (Display on Map). Fall: Phone PWA -> alert_ms -> gps_ms -> notification_ms -> OutSystems ElderlyLog | Three tracking modes (Default/Live/On-Demand) with different business logic per mode. Geofence detection publishes to AMQP with fan-out to two subscribers. Fall detection orchestrates 3 services. |
| 3 | **Medication Reminder** | Guardian UI -> medicine_ms (Manage Medicine composite) -> Medication (OutSystems atomic) -> Elderly (OutSystems atomic) -> notification_ms -> SMU Lab SMS + Email API (external) | Guardian manages medication CRUD, stock tracking with restock warnings, day-specific scheduling. Medicine reminders sent via SMS and email through notification_ms reuse. |

---

### 2. Minimum 3 Atomic Microservices for 3 Different Data Entities

| Atomic Microservice | Data Entity | Platform | API Endpoint | Used In Scenarios |
|---------------------|-------------|----------|-------------|-------------------|
| **Guardian** | Guardian records (name, contact, password, elderly_id) | OutSystems | `https://qmo.outsystemscloud.com/GuardianServices/rest/Guardian` | 1, 2, 3 |
| **Elderly** | Elderly records (name, contact, address, guardian_id) | OutSystems | `https://qmo.outsystemscloud.com/ElderlyServices/rest/Elderly` | 1, 2, 3 |
| **Elderly Log** | Coordinate/event history (lat, lng, status, timestamp) | OutSystems | `https://qmo.outsystemscloud.com/ElderlyLogServices/rest/ElderlyLog` | 1, 2 |
| **Medication** | Medicine records (name, dose, schedule, stock, instructions) | OutSystems | `https://personal-s93qqbah.outsystemscloud.com/ManageMedicine/rest/Medicine` | 3 |

All 4 atomic services are hosted on OutSystems with their own database tables.

---

### 3. At Least 1 Atomic Service Built on OutSystems

All 4 atomic services listed above are built and exposed on OutSystems:
- **Guardian** — `RegisterGuardian`, `LoginGuardian`, `GetGuardianById`
- **Elderly** — `RegisterElderly`, `LoginElderly`, `LinkGuardian`
- **Elderly Log** — `CreateElderlyLog`
- **Medication** — CRUD operations for medicines, schedules, stock

---

### 4. At Least 1 Microservice Reused Across Different User Scenarios

| Reused Microservice | Scenario 1 | Scenario 2 | Scenario 3 |
|---------------------|-----------|-----------|-----------|
| **notification_ms** | Verify Event triggers SMS to Guardian via Alert Dashboard | Geofence breach -> RabbitMQ -> notification_ms sends SMS. Fall detected -> alert_ms -> notification_ms sends SMS + email | medicine_ms -> notification_ms sends medicine reminder SMS + email |
| **Guardian (atomic)** | Verify Event fetches Guardian info for SMS | auth_ms calls Guardian for login | Guardian UI calls Guardian for login |
| **Elderly (atomic)** | Verify Event fetches Elderly info (home address) | auth_ms calls Elderly for login | medicine_ms fetches medicines by ElderlyId |

**notification_ms** is the most prominently reused — it serves all 3 scenarios with different message types:
- **File**: `notification_ms/server.js`
- Geofence alerts: via RabbitMQ consumer (queue `notify_guardian`)
- Fall alerts: via HTTP `POST /internal/send-fall-alert` (called by `alert_ms/server.js`)
- Medicine reminders: via HTTP `POST /internal/send-fall-alert` with override (called by `medicine_ms/server.js`)

---

### 5. At Least 1 External Service

| External Service | Description | Used In | Reference |
|-----------------|-------------|---------|-----------|
| **SMU Lab Utilities SMS API** | Sends SMS messages to a phone number | Scenarios 1, 2, 3 | `notification_ms/server.js` -> `SendSMS` endpoint |
| **SMU Lab Utilities Email API** | Sends HTML emails | Scenarios 2, 3 | `notification_ms/server.js` -> `SendEmail` endpoint |
| **OneMap Singapore API** | Geocodes Singapore postal codes to lat/lng | Scenario 2 (home location setup) | `guardian-ui/src/ElderWatch.jsx` -> OneMap elastic search |
| **Browser Geolocation API** | Real GPS tracking on elderly's phone | Scenario 2 | `phone-pwa (elderly-ui)/src/App.jsx` -> `navigator.geolocation.watchPosition()` |
| **Healthcare Provider (Mock)** | Simulated healthcare dispatch | Scenario 1 | OutSystems: `https://personal-s93qqbah.outsystemscloud.com/HealthCare/rest/Dispatch` |

---

### 6. At Least 2 User Scenarios with Service Orchestration

#### Orchestration 1: Fall Detection (Scenario 2)
**Orchestrator**: `alert_ms` (composite microservice)
**File**: `alert_ms/server.js`, endpoint `POST /motion/sample`

Flow:
1. Receives motion sensor data from Phone PWA
2. Scores fall risk using `scoreDropRisk()` algorithm
3. If fall detected:
   - **HTTP GET** -> `gps_ms/location/:elderlyId` to fetch real-time GPS coordinates
   - **HTTP POST** -> OutSystems Elderly Log to persist the incident
   - **HTTP POST** -> `notification_ms/internal/send-fall-alert` to dispatch SMS + email to guardian
   - **WebSocket broadcast** -> all connected Guardian UI clients

#### Orchestration 2: Geofence Breach (Scenario 2)
**Orchestrator**: `gps_ms` (composite microservice)
**File**: `gps_ms/server.js`, function `checkRadius()`

Flow:
1. Processes incoming GPS coordinates
2. Calculates distance from home using Haversine formula
3. If status boundary crossed (Home <-> Outside):
   - **AMQP publish** -> RabbitMQ exchange `elderwatch.geofence` with routing key `geofence.left` or `geofence.entered` (consumed by notification_ms)
   - **HTTP POST** -> `alert_ms/internal/geofence-event` to store alert + push SSE to Guardian UI

#### Orchestration 3: Home Surveillance Emergency (Scenario 1)
**Orchestrator**: Verify Event (OutSystems composite microservice)

Flow:
1. Receives movement data from Motion Detector
2. If no movement detected (empty array):
   - **HTTP GET** -> Elderly atomic service to fetch home address + Guardian ID
   - **HTTP POST** -> Healthcare Provider to dispatch emergency response
   - **HTTP GET** -> Guardian atomic service to fetch phone number
   - **HTTP POST** -> SMU Lab SMS API to alert guardian with case ID
   - **HTTP POST** -> Alert Dashboard to update Guardian UI

---

### 7. Each Microservice Has Exclusive Access to Its Own Data Store

| Microservice | Data Store Type | Data Stored | File Evidence |
|-------------|----------------|-------------|---------------|
| **gps_ms** | In-memory (JS object) | Coordinate history per elderly, tracking registry | `gps_ms/server.js` line 13: `const db = {}` |
| **alert_ms** | In-memory (JS array) | Geofence alerts, fall incidents | `alert_ms/server.js` line 16: `const alerts = []`, line 32: `const incidents = []` |
| **medicine_ms** | In-memory (JS object) | Schedule day overrides per medicine | `medicine_ms/server.js` line 12: `const scheduleOverrides = {}` |
| **notification_ms** | In-memory (JS array) | Notification log (SMS/email/device alerts sent) | `notification_ms/server.js` line 17: `const notifications = []` |
| **Guardian (OutSystems)** | OutSystems DB | Guardian records | OutSystems platform |
| **Elderly (OutSystems)** | OutSystems DB | Elderly records | OutSystems platform |
| **Elderly Log (OutSystems)** | OutSystems DB | Coordinate/incident logs | OutSystems platform |
| **Medication (OutSystems)** | OutSystems DB | Medicine records + schedules | OutSystems platform |

No microservice accesses another's data store directly — all cross-service data access is via HTTP or AMQP.

---

### 8. At Least 1 Microservice Uses a DB as Data Store

The OutSystems atomic services all use database tables:
- **Guardian** — OutSystems entity with DB table for guardian records
- **Elderly** — OutSystems entity with DB table for elderly records
- **Elderly Log** — OutSystems entity with DB table for coordinate/event logs
- **Medication** — OutSystems entity with DB table for medicine records + schedule entries

The local microservices (gps_ms, alert_ms, etc.) use bounded in-memory stores as lightweight alternatives suitable for the prototype scope.

---

### 9. HTTP Communication Between Microservices

| From | To | Method | Endpoint | Purpose |
|------|-----|--------|----------|---------|
| **gateway_ms** | all 5 services | * | `/*` (proxy) | API gateway routing |
| **gps_ms** | **alert_ms** | POST | `/internal/geofence-event` | Notify alert service of geofence breach |
| **alert_ms** | **gps_ms** | GET | `/location/:elderlyId` | Fetch GPS position for fall alert |
| **alert_ms** | **notification_ms** | POST | `/internal/send-fall-alert` | Send SMS + email for fall detection |
| **alert_ms** | **OutSystems** | POST | `/ElderlyLog/CreateElderlyLog` | Persist incident to OutSystems DB |
| **medicine_ms** | **notification_ms** | POST | `/internal/send-fall-alert` | Send medicine reminder SMS + email |
| **medicine_ms** | **OutSystems** | GET/POST/PUT/DELETE | `/ManageMedicine/rest/Medicine/*` | Medicine CRUD |
| **auth_ms** | **OutSystems** | POST | `/RegisterGuardian`, `/LoginGuardian`, etc. | Authentication |
| **notification_ms** | **OutSystems** | POST | `/Notification/SendSMS`, `/Notification/SendEmail` | Dispatch notifications |

---

### 10. Message-Based Communication (AMQP/RabbitMQ)

**RabbitMQ** is used for the geofence notification flow in Scenario 2.

| Component | Role | File | Code Evidence |
|-----------|------|------|---------------|
| **gps_ms** | Publisher | `gps_ms/server.js` | `amqpChannel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(entry)))` |
| **RabbitMQ** | Broker | `docker-compose.yml` | `rabbitmq:3-management-alpine` service |
| **notification_ms** | Consumer | `notification_ms/server.js` | `ch.consume(q1.queue, ...)` on queues `notify_guardian` and `alert_elderly_device` |

**Exchange**: `elderwatch.geofence` (type: `topic`, durable: true)
**Routing keys**: `geofence.left`, `geofence.entered`

**Queue 1 — `notify_guardian`**:
- Bound to `geofence.*`
- Consumer: sends SMS to guardian with geofence alert message
- File: `notification_ms/server.js`, lines ~106-118

**Queue 2 — `alert_elderly_device`**:
- Bound to `geofence.*`
- Consumer: logs device alert (VIBRATE+RINGTONE for left, CHIME for entered)
- File: `notification_ms/server.js`, lines ~121-131

**Why AMQP here**: The geofence notification is inherently asynchronous — GPS processing should not block waiting for SMS delivery. The fan-out pattern (one event, two subscribers) is a natural fit for a topic exchange. If notification_ms is temporarily down, messages queue in RabbitMQ and are delivered when it recovers.

---

### 11. Web-Based GUI

| GUI | Framework | Port | Key Features |
|-----|-----------|------|-------------|
| **Guardian UI** | React + Vite | 5173 | Dashboard, ElderWatch map with live tracking, Medicare management (schedule, inventory, calendar), Settings, Login/Register |
| **Phone PWA** | React + Vite | 5174 | Medicine schedule display, fall protection monitoring, GPS tracking, emergency alert button |

Both are containerized in Docker and communicate with the backend exclusively through the gateway_ms on port 4000.

---

### 12. JSON Data

All inter-service communication uses JSON:
- HTTP request/response bodies (all services use `express.json()` and return `res.json()`)
- RabbitMQ message payloads (`Buffer.from(JSON.stringify(entry))`)
- WebSocket messages (`JSON.stringify({ type: "drop_alert", data: incident })`)
- SSE event data (`data: ${JSON.stringify(alert)}\n\n`)
- OutSystems API request/response bodies

---

### 13. Docker

8 Dockerfiles, all using `node:20-alpine` with health checks:

| Service | Dockerfile | Port |
|---------|-----------|------|
| gateway_ms | `gateway_ms/Dockerfile` | 4000 |
| gps_ms | `gps_ms/Dockerfile` | 4001 |
| alert_ms | `alert_ms/Dockerfile` | 4002 |
| medicine_ms | `medicine_ms/Dockerfile` | 4003 |
| auth_ms | `auth_ms/Dockerfile` | 4004 |
| notification_ms | `notification_ms/Dockerfile` | 4005 |
| guardian-ui | `guardian-ui/Dockerfile` | 5173 |
| phone-pwa | `phone-pwa (elderly-ui)/Dockerfile` | 5174 |

---

### 14. Docker Compose

**File**: `docker-compose.yml`

9 services deployed on a single bridge network (`elderall-net`):
1. `rabbitmq` — Message broker (RabbitMQ 3 with management plugin)
2. `gps_ms` — GPS tracking service (depends on RabbitMQ)
3. `alert_ms` — Alert + fall detection service
4. `medicine_ms` — Medicine management service
5. `auth_ms` — Authentication service
6. `notification_ms` — Notification dispatch service (depends on RabbitMQ)
7. `gateway_ms` — API gateway (depends on all services)
8. `guardian-ui` — Guardian web dashboard
9. `phone-pwa` — Elderly phone PWA

**Deploy command**: `docker compose up --build`

---

## Beyond-the-Labs Components

| BTL Component | Description | File(s) | Justification |
|--------------|-------------|---------|---------------|
| **API Gateway** | Central proxy routing all requests to microservices, WebSocket proxy, aggregated health check | `gateway_ms/server.js` | Proper microservice architecture requires a single entry point. The gateway handles CORS centrally and routes based on path prefix. |
| **WebSocket Real-Time Alerts** | Fall detection alerts broadcast instantly to all connected Guardian UI clients via WebSocket | `alert_ms/server.js` (WS server), `gateway_ms/server.js` (WS proxy) | Real-time push is critical for fall emergencies — polling would introduce unacceptable delay. |
| **Server-Sent Events (SSE)** | Geofence alerts streamed to Guardian UI via SSE with heartbeat | `alert_ms/server.js` (`/alerts/stream` endpoint) | SSE provides efficient one-way push for geofence status updates without WebSocket overhead. |
| **Fall Detection Scoring Algorithm** | Multi-feature risk scoring based on accelerometer, gyroscope, and post-impact stillness data | `alert_ms/server.js` (`scoreDropRisk()`) | Custom algorithm evaluating 4 sensor features with weighted scoring to determine fall severity (FALLEN/NORMAL/ATREST). |
| **Browser Motion Sensor Integration** | Device accelerometer and gyroscope monitoring in the Phone PWA | `phone-pwa (elderly-ui)/src/motionSensor.js` | Leverages `DeviceMotionEvent` API to collect real sensor data from the elderly's phone for fall detection. |
| **Real GPS Tracking** | Continuous GPS position tracking using browser Geolocation API | `phone-pwa (elderly-ui)/src/App.jsx` (`navigator.geolocation.watchPosition()`) | Provides actual GPS coordinates from the elderly's device, sent to backend every 10 seconds. |
| **Haversine Geofencing** | Mathematical distance calculation for geofence boundary detection | `gps_ms/server.js` (`haversine()` function) | Accurately calculates real-world distance in meters between two GPS coordinates on Earth's surface. |
| **OneMap Postal Code Geocoding** | Singapore postal code to lat/lng conversion via OneMap API | `guardian-ui/src/ElderWatch.jsx` | Allows guardians to set home location by postal code instead of manually entering coordinates. |

---

## Architecture Summary

### Service Architecture (SOA Layers)

```
┌─────────────────────────────────────────────────┐
│                  PRESENTATION                    │
│   Guardian UI (React)    Phone PWA (React)        │
└────────────────────┬────────────────────────────┘
                     │ HTTP / WebSocket
┌────────────────────┴────────────────────────────┐
│               API GATEWAY (gateway_ms)           │
│           Port 4000 — Proxy + WS Proxy           │
└──┬──────┬──────┬──────┬──────┬───────────────────┘
   │      │      │      │      │
┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐
│ GPS ││Alert││ Med ││Auth ││Notif│  COMPOSITE
│ _ms ││ _ms ││ _ms ││ _ms ││ _ms │  SERVICES
│4001 ││4002 ││4003 ││4004 ││4005 │
└──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘
   │      │      │      │      │
   │   ┌──┴──────┴──────┴──┐   │
   │   │    OutSystems      │   │
   │   │  Guardian  Elderly │   │  ATOMIC
   │   │  ElderlyLog  Med   │   │  SERVICES
   │   └────────────────────┘   │
   │                            │
   │      ┌──────────┐         │
   └──────┤ RabbitMQ ├─────────┘
          │  (AMQP)  │
          └──────────┘
            MESSAGE
            BROKER
```

### Inter-Service Communication Map

```
gps_ms ──AMQP──> RabbitMQ ──AMQP──> notification_ms
gps_ms ──HTTP──> alert_ms
alert_ms ──HTTP──> gps_ms (location lookup)
alert_ms ──HTTP──> notification_ms (fall SMS/email)
alert_ms ──HTTP──> OutSystems ElderlyLog
medicine_ms ──HTTP──> notification_ms (medicine reminders)
medicine_ms ──HTTP──> OutSystems Medication
auth_ms ──HTTP──> OutSystems Guardian + Elderly
notification_ms ──HTTP──> OutSystems SMU Lab SMS + Email
```
