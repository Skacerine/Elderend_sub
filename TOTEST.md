# Testing Guide

## Prerequisites

- Docker Desktop running
- Chrome browser (recommended for DevTools + motion sensor simulation)
- OutSystems ManageMedicine API online (check with your teammate if medicines aren't loading)

---

## Part 1: Build & Start

```bash
cd Elderend_sub
docker compose up --build
```

Wait for all 3 services:
- `elderall-backend` — "Backend listening on port 4000"
- `guardian-ui` — Vite ready on port 5173
- `phone-pwa` — Vite ready on port 5174

### Health checks

| Endpoint | Expected |
|----------|----------|
| http://localhost:4000/health | `{"ok":true, ...}` |
| http://localhost:4000/medicine/health | `{"status":"online","service":"medicine-proxy"}` |
| http://localhost:4000/gps/health | `{"status":"online", ...}` |

```bash
docker compose ps    # all 3 containers should show as running/healthy
```

---

## Part 2: Guardian UI (http://localhost:5173)

### 2a. Login
- Open http://localhost:5173 — should redirect to login
- Login: phone `6588888888`, password `guard123`
- Should redirect to dashboard

### 2b. GuardianUI tab (main dashboard)
- "System Armed" / "Live Feed" badges visible
- Subtitle: "Real-time fall monitoring and guardian alert system"
- Status shows "Active"
- No technical jargon visible (no "WebSocket", "risk threshold", "motion features")
- Click "Enable Sound" — should say "Alert Sound Enabled"
- Click "Test Alarm Sound" — alarm plays
- Click "Stop Alarm" — alarm stops

### 2c. ElderWatch tab
- Map loads with home marker and 500m boundary circle
- Red dot (elderly) moves on its own every ~3 seconds (simulated tracking)
- Trail line appears behind the marker
- Right sidebar: status (HOME/OUTSIDE), quick actions, recent alerts
- No dev controls visible (no D-pad, no simulation speed, no tracking mode)
- Marker is NOT draggable
- If marker drifts past 500m boundary, toast + alert: "Left Home Zone"
- "Call Elderly" and "Emergency SOS" buttons show alert dialog

### 2d. Medicare tab
- **Schedule tab**: 7 day buttons (Mon-Sun), today highlighted. Click different days — medicine list changes per day
- **Calendar tab**: Monthly calendar. Navigate with < > arrows. Click dates to see that day's medicines
- **Inventory tab**:
  - Click "+ Add" — form opens with name, time, stock, dose, instructions, day picker
  - Add a medicine with specific days (e.g. Mon/Wed/Fri only)
  - Verify it only appears on those days in Schedule tab
  - Day pills persist after page reload
  - Restock button opens inline +/- input
  - Delete (x) button removes a medicine
- If OutSystems is down, you'll see "Could not reach medication service" or medicines won't persist after refresh

### 2e. ElderWatch(Dev) tab
- Full dev controls: D-pad, simulation speed slider, tracking mode selector
- Scenario replay buttons (Wander + Alert, Park Walk, Hospital Visit)
- Marker is draggable
- Bottom panel: ALERTS, AMQP BROKER, COORD LOG tabs
- Health indicators in header (GPS Svc, Log Svc, etc.)

### 2f. GuardianUI(Dev) tab
- Extended dev panels: Event Stream, Live Payload, System Notes
- All original dev features work

---

## Part 3: Phone PWA — Elderly Side (http://localhost:5174)

### 3a. Login
- Open http://localhost:5174
- Login: phone `6591234567`, password `elder123`
- Greeting shows ("Good morning/afternoon/evening")

### 3b. Medicine day filtering
- Title says "Today's Medicines"
- Only medicines scheduled for today appear (not all medicines)
- E.g. if today is Friday and a med is set for Mon/Wed only, it should NOT show
- If no meds for today: "No medicines scheduled today" with checkmark

### 3c. Fall protection
- "Enable Protection" button works
- Status changes to "Protected" with green indicator
- "Alert My Guardian" button sends simulated fall alert
- "Pause" button pauses monitoring

---

## Part 4: Cross-Service Communication

### 4a. Fall alert flow
1. On phone-pwa: click "Alert My Guardian!"
2. On guardian-ui (GuardianUI tab): popup should appear with fall alert details
3. Alarm should sound (if enabled)
4. "Dismiss" closes the popup

### 4b. Container resilience
```bash
docker compose restart elderall-backend
```
- Guardian UI Medicare tab auto-recovers after ~30 seconds
- No crash on either frontend

---

## Part 5: Vercel / Render Deployment

After pushing to `main`:
1. Vercel auto-deploys Guardian UI and Phone PWA
2. Render auto-deploys backend (check https://elderend-backend.onrender.com/health)
3. Re-run the above tests on the live URLs:
   - Guardian: https://guardianphonedropper.vercel.app
   - Phone: https://phonedropper9000-xi.vercel.app

---

## Part 6: Medicare Microservice Only (optional)

To test Medicare in isolation:

```bash
docker compose -f docker-compose.medicare.yml up --build
```

- Medicare Backend: http://localhost:4001
- Medicare UI: http://localhost:5175
- Login and test the Medicare tab only (no GPS, no fall detection)
