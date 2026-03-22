# Elderall Phone Drop Detection System

A comprehensive system for detecting falls in elderly populations using smartphone motion sensors. The system combines real-time motion analysis on the user's phone with a guardian dashboard for immediate alert notifications.

## 🏗 Project Architecture

```
├── backend/                    # Node.js microservice (Express + WebSocket)
│   ├── server.js               # Express app with WS server
│   ├── routes/                 # API endpoints
│   ├── services/               # Drop detection & incident management
│   └── store/                  # In-memory incident storage
│
├── phone-pwa/                  # React PWA (elderly's phone)
│   ├── src/
│   │   ├── App.jsx             # Main UI with monitoring controls
│   │   ├── motionSensor.js     # DeviceMotionEvent handler & feature extraction
│   │   └── api.js              # HTTP client for backend communication
│   └── public/sw.js            # Service Worker for offline capability
│
└── guardian-ui/                # React dashboard (guardian's browser)
    └── src/
        ├── App.jsx             # Live alert feed
        ├── socket.js           # WebSocket connection handler
        └── main.jsx            # Entry point
```

## 🎯 System Overview

### Backend Microservice (Port 4000)
Handles motion data analysis, incident detection, and real-time alert broadcasting.

**Key Features:**
- REST API for motion sample submission
- Drop risk scoring algorithm (0-100 scale)
- WebSocket server for live incident streaming
- In-memory incident store (max 100 incidents)
- Simulated drop endpoint for testing

**Drop Detection Logic:**
- Free-fall detection: Z-axis acceleration < -8.0 m/s²
- Impact detection: Peak acceleration > 20 m/s²
- Rotation analysis: Peak rotation rate > 250°/s
- Post-impact stillness: Low motion variance after impact

### Phone PWA (Port 5173)
Lightweight Progressive Web App running on elderly user's phone.

**Features:**
- Real-time device motion monitoring
- 3-second sliding window for feature extraction
- Automatic motion anomaly detection
- Sends flagged motion patterns to backend
- One-tap emergency drop simulation for testing
- Service Worker for offline PWA support

### Guardian UI Dashboard (Port 5174)
Real-time monitoring dashboard for guardians/caregivers.

**Features:**
- WebSocket connection to backend for live alerts
- Color-coded incident display
- Full incident details (timestamp, severity, motion features)
- Scrollable alert history
- Automatic connection management with reconnection fallback

---

## ⚡ Quick Start Guide (5 Minutes)

### Step 1: Clone & Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# In a new terminal, install phone PWA dependencies
cd ../phone-pwa
npm install

# In another terminal, install guardian UI dependencies
cd ../guardian-ui
npm install
```

### Step 2: Start the Backend Microservice (Terminal 1)
```bash
cd backend
npm run dev
# Output: Backend listening on http://localhost:4000
```

### Step 3: Start the Phone PWA (Terminal 2)
```bash
cd phone-pwa
npm run dev
# Output: VITE v6.0.0 ready in 123 ms
# Open: http://localhost:5173
```

### Step 4: Start the Guardian Dashboard (Terminal 3)
```bash
cd guardian-ui
npm run dev
# Output: VITE v6.0.0 ready in 123 ms
# Open: http://localhost:5174
```

### Step 5: Test the System
1. **Open Phone PWA** at `http://localhost:5173`
2. Click **"Start Monitoring"** to begin motion tracking
3. Click **"Simulate Drop"** to test drop detection
4. **Open Guardian Dashboard** at `http://localhost:5174` in another browser
5. Watch for **RED ALERT** to appear when drop is detected
6. Check response JSON on phone PWA showing incident details

### ✅ System is Now Running
- Backend API: `http://localhost:4000`
- Phone PWA: `http://localhost:5173`
- Guardian Dashboard: `http://localhost:5174`

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm 9+
- Modern browser with DeviceMotionEvent support (for phones)

### Installation

#### Backend
```bash
cd backend
npm install
```

#### Phone PWA
```bash
cd phone-pwa
npm install
```

#### Guardian UI
```bash
cd guardian-ui
npm install
```

---

## 🏃 Running the System

### Start Backend Microservice
```bash
cd backend
npm run dev
# Listens on http://localhost:4000
```

### Start Phone PWA
```bash
cd phone-pwa
npm run dev
# dev server on http://localhost:5173
# Open on phone or mobile device browser
```

### Start Guardian Dashboard
```bash
cd guardian-ui
npm run dev
# dev server on http://localhost:5174
```

---

## 📡 API Documentation

### REST Endpoints

#### Health Check
```
GET /health
```
Returns service status.

**Response:**
```json
{
  "ok": true,
  "service": "drop-detection-backend"
}
```

#### Submit Motion Sample
```
POST /motion/sample

Body:
{
  "elderlyId": "E001",
  "deviceId": "PHONE_01",
  "timestamp": "2026-03-22T10:30:00Z",
  "features": {
    "minAcceleration": 1.5,
    "peakAcceleration": 22.3,
    "peakRotationRate": 280,
    "postImpactStillnessMs": 2500
  }
}
```

**Response (Drop Detected):**
```json
{
  "detected": true,
  "incident": {
    "incidentId": "INC-1711095000000",
    "elderlyId": "E001",
    "deviceId": "PHONE_01",
    "type": "drop_alert",
    "severity": "HIGH",
    "score": 95,
    "timestamp": "2026-03-22T10:30:00.123Z",
    "message": "Possible fall detected from device motion pattern.",
    "features": { ... }
  },
  "timestampReceived": "2026-03-22T10:30:00.456Z"
}
```

#### Simulate Drop Alert
```
POST /motion/simulate-drop

Body (optional):
{
  "elderlyId": "E001",
  "deviceId": "PHONE_01"
}
```

#### Get All Incidents
```
GET /motion/incidents
```

Returns array of all stored incidents.

#### Get Latest Incident for User
```
GET /motion/incidents/latest/:elderlyId
```

---

### WebSocket Connection

**URL:** `ws://localhost:4000`

**Connect Message (Server → Client):**
```json
{
  "type": "system",
  "data": {
    "message": "Connected to drop alert stream"
  }
}
```

**Drop Alert Message (Server → Client):**
```json
{
  "type": "drop_alert",
  "data": {
    "incidentId": "INC-1711095000000",
    "elderlyId": "E001",
    "deviceId": "PHONE_01",
    "severity": "HIGH",
    "score": 95,
    "timestamp": "2026-03-22T10:30:00.123Z",
    ...
  }
}
```

---

## 📊 Drop Risk Scoring

The system scores motion data on a **0–100 scale** with severity levels:

| Score  | Severity | Action                    |
|--------|----------|--------------------------|
| 0-44   | LOW      | No alert, continue monitoring |
| 45-69  | MEDIUM   | Log incident, monitor elderly |
| 70+    | HIGH     | **Immediate alert to guardians** |

**Scoring Breakdown:**
- Free-fall detection (Z < -8.0): +25 points
- Rotation anomaly (rot > 250°/s): +20 points
- Impact detected (acc > 20 m/s²): +35 points
- Post-impact stillness (variance < 1.5): +20 points

---

## 🧪 Testing

### Test Drop Detection with Phone PWA
1. Open Phone PWA on Android/iOS device
2. Tap **"Simulate Drop"** button
3. Check Guardian UI Dashboard → should see alert within seconds

### Manual API Test
```bash
# Test backend health
curl http://localhost:4000/health

# Trigger simulated drop
curl -X POST http://localhost:4000/motion/simulate-drop \
  -H "Content-Type: application/json" \
  -d '{}'

# View all incidents
curl http://localhost:4000/motion/incidents
```

---

## 🔧 Configuration

### Backend (server.js)
- **PORT**: `4000` (configurable via environment variable)
- **Max incidents stored**: `100` (incidentStore.js)

### Phone PWA (motionSensor.js)
- **Sample window**: 3 seconds
- **Trigger thresholds**:
  - Min acceleration < 2 m/s²
  - Peak acceleration > 18 m/s²
  - Peak rotation > 200°/s

### Guardian UI (socket.js)
- **WebSocket URL**: `ws://localhost:4000`

---

## 📝 Features & Capabilities

✅ Real-time motion monitoring on elderly's phone  
✅ Automatic drop/fall detection using ML-inspired scoring  
✅ Instant WebSocket alerts to guardians  
✅ PWA support (works offline via Service Worker)  
✅ Persistent incident history (in-memory)  
✅ Severity classification (LOW/MEDIUM/HIGH)  
✅ Test simulation endpoints  
✅ CORS-enabled for cross-origin requests  

---

## 🛠 Development Notes

### Module Type
All source files use **ES6 modules** (`import`/`export`). Backend requires `"type": "module"` in `package.json`.

### Data Flow
1. **Phone** collects accelerometer + gyroscope data
2. **motionSensor.js** extracts motion features from 3-sec window
3. **Phone PWA** sends features to backend `/motion/sample`
4. **Backend** scores features using `scoreDropRisk()`
5. If score ≥ 70, incident is created & broadcasted via WS
6. **Guardian UI** receives alert & displays to user

### Storage
- All incidents stored **in-memory** (resets on server restart)
- Production deployment would use a database (MongoDB, PostgreSQL, etc.)

---

## 📦 Dependencies

### Backend
- `express` ^4.19.2 – Web framework
- `cors` ^2.8.5 – CORS middleware
- `ws` ^8.18.0 – WebSocket server

### Phone PWA & Guardian UI
- `react` ^19.0.0 – UI library
- `react-dom` ^19.0.0 – React DOM binding
- `vite` ^6.0.0 – Build tool (devDependency)

---

## 📄 License & Attribution

ESD Project (Elderall) – SMU Y2 SEM2

---

## 💡 Future Enhancements

- [ ] Database integration for persistent incident storage
- [ ] User authentication & role-based access
- [ ] Mobile app native integration (React Native)
- [ ] Machine learning-based drop scoring refinement
- [ ] SMS/email notifications for guardians
- [ ] Incident timeline visualization
- [ ] Multi-elderly user support
- [ ] Admin dashboard for system monitoring
- [ ] Geolocation tracking integration
- [ ] Two-way communication (elderly → guardian alert confirmation)
