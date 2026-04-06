import express from "express";
import cors from "cors";
import amqplib from "amqplib";

const app = express();
const PORT = process.env.PORT || 4001;
const AMQP_URL = process.env.AMQP_URL || "amqp://guest:guest@rabbitmq:5672";
const ALERT_MS_URL = process.env.ALERT_MS_URL || "http://alert_ms:4002";

const DEFAULT_HOME = {
  lat: parseFloat(process.env.DEFAULT_HOME_LAT) || 1.35305,
  lng: parseFloat(process.env.DEFAULT_HOME_LNG) || 103.94402,
};
const DEFAULT_RADIUS = parseInt(process.env.DEFAULT_RADIUS, 10) || 500;

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
// Coordinate Store (in-memory, keyed by elderlyId)
// ═══════════════════════════════════════════════════════════════
const db = {};
const registry = {};
const MAX_LOG = 500;

function addCoordinateEntry(elderlyId, entry) {
  const id = String(elderlyId);
  const e = { ...entry, _id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  if (!db[id]) db[id] = [];
  db[id].unshift(e);
  if (db[id].length > MAX_LOG) db[id].length = MAX_LOG;
  if (!registry[id]) registry[id] = { elderlyId: id, guardianId: entry.guardianId || null };
  return e;
}
function getCoordinateHistory(elderlyId, n = 60) {
  return (db[String(elderlyId)] || []).slice(0, Math.min(n, MAX_LOG));
}
function getLatestCoordinate(elderlyId) {
  const entries = db[String(elderlyId)] || [];
  return entries.length ? entries[0] : null;
}
function getAllTracked() {
  return Object.keys(db).map(id => ({ ...registry[id], latest: db[id][0] || null }));
}
function clearHistory(elderlyId) {
  const id = String(elderlyId);
  db[id] = [];
  delete registry[id];
}
function getStats() {
  const total = Object.values(db).reduce((s, a) => s + a.length, 0);
  return { tracked: Object.keys(db).length, totalEntries: total };
}

// ═══════════════════════════════════════════════════════════════
// Geocoding — OneMap reverse geocode with zone fallback
// ═══════════════════════════════════════════════════════════════
const ZONE_FALLBACKS = [
  { name: "Tampines Ave 1",     lat: 1.3530, lng: 103.9440 },
  { name: "Bukit Timah Rd",     lat: 1.3296, lng: 103.8069 },
  { name: "Orchard Rd",         lat: 1.3046, lng: 103.8318 },
  { name: "Jurong West Ave 1",  lat: 1.3404, lng: 103.7090 },
  { name: "Woodlands Ave 3",    lat: 1.4352, lng: 103.7862 },
  { name: "Yishun Ave 2",       lat: 1.4230, lng: 103.8350 },
  { name: "Bedok North Rd",     lat: 1.3328, lng: 103.9284 },
  { name: "Pasir Ris Dr 3",     lat: 1.3728, lng: 103.9457 },
  { name: "Clementi Ave 2",     lat: 1.3146, lng: 103.7649 },
  { name: "Bishan St 11",       lat: 1.3526, lng: 103.8352 },
  { name: "Ang Mo Kio Ave 3",   lat: 1.3691, lng: 103.8454 },
  { name: "Hougang Ave 8",      lat: 1.3721, lng: 103.8933 },
  { name: "Sengkang East Way",  lat: 1.3930, lng: 103.8950 },
  { name: "Punggol Dr",         lat: 1.4043, lng: 103.9022 },
  { name: "Queenstown Rd",      lat: 1.2981, lng: 103.8065 },
];

function zoneFallback(lat, lng) {
  let best = ZONE_FALLBACKS[0], minD = Infinity;
  for (const z of ZONE_FALLBACKS) {
    const d = (lat - z.lat) ** 2 + (lng - z.lng) ** 2;
    if (d < minD) { minD = d; best = z; }
  }
  const blk = (Math.abs(Math.round(lat * 10000)) % 800) + 100;
  return `Blk ${blk} ${best.name}`;
}

// Cache to avoid hammering OneMap on every GPS push
const geocodeCache = new Map(); // "lat4dp,lng4dp" -> { address, ts }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function geocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.address;

  try {
    const url =
      `https://www.onemap.gov.sg/api/public/revgeocode` +
      `?location=${lat},${lng}&buffer=40&addressType=All&otherFeatures=N`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const info = data?.GeocodeInfo?.[0];
      if (info) {
        let address = "";
        if (info.BUILDINGNAME && info.BUILDINGNAME !== "NIL") {
          address = info.BUILDINGNAME;
        } else {
          const blk = info.BLOCK && info.BLOCK !== "NIL" ? `Blk ${info.BLOCK} ` : "";
          address = `${blk}${info.ROAD || ""}`.trim();
        }
        if (info.POSTALCODE && info.POSTALCODE !== "NIL") {
          address += ` S(${info.POSTALCODE})`;
        }
        if (address.trim()) {
          geocodeCache.set(key, { address: address.trim(), ts: Date.now() });
          return address.trim();
        }
      }
    }
  } catch (_) { /* network/timeout — fall through */ }

  const fallback = zoneFallback(lat, lng);
  geocodeCache.set(key, { address: fallback, ts: Date.now() });
  return fallback;
}

// ═══════════════════════════════════════════════════════════════
// Haversine
// ═══════════════════════════════════════════════════════════════
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const f1 = (lat1 * Math.PI) / 180, f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180, dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════
// AMQP
// ═══════════════════════════════════════════════════════════════
let amqpChannel = null;
const EXCHANGE = "elderwatch.geofence";
const lastStatus = {}; // elderlyId -> "Home" | "Outside"

async function connectRabbitMQ() {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const conn = await amqplib.connect(AMQP_URL);
      amqpChannel = await conn.createChannel();
      await amqpChannel.assertExchange(EXCHANGE, "topic", { durable: true });
      console.log("[AMQP] Connected");
      conn.on("error", e => console.error("[AMQP] Error:", e.message));
      conn.on("close", () => {
        amqpChannel = null;
        console.log("[AMQP] Closed, reconnecting...");
        setTimeout(connectRabbitMQ, 5000);
      });
      return;
    } catch (e) {
      console.log(`[AMQP] Attempt ${i + 1}/${maxRetries} failed: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error("[AMQP] Failed — geofence events will use HTTP only");
}

// ═══════════════════════════════════════════════════════════════
// Radius check (async — geocode is async)
// ═══════════════════════════════════════════════════════════════
async function checkRadius({ elderlyId, guardianId, lat, lng, home, radius }) {
  const id = String(elderlyId);
  const latN = parseFloat(lat), lngN = parseFloat(lng);
  const dist = Math.round(haversine(latN, lngN, home.lat, home.lng));
  const status = dist <= radius ? "Home" : "Outside";
  const address = await geocode(latN, lngN);
  const entry = {
    elderlyId: id, guardianId, lat: latN, lng: lngN,
    address, timestamp: Date.now(), status, distance: dist,
  };
  const saved = addCoordinateEntry(id, entry);

  const prev = lastStatus[id];
  if (prev !== undefined && prev !== status) {
    const type = status === "Outside" ? "left" : "entered";
    const routingKey = status === "Outside" ? "geofence.left" : "geofence.entered";
    if (amqpChannel) {
      try {
        amqpChannel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(entry)));
        console.log(`[AMQP] ${routingKey} for elderly ${id}`);
      } catch (e) { console.error("[AMQP] Publish failed:", e.message); }
    }
    fetch(`${ALERT_MS_URL}/internal/geofence-event`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, type, routingKey }),
    }).catch(e => console.error("[GPS] Alert MS failed:", e.message));
  }
  lastStatus[id] = status;
  console.log(`[GPS] elderly ${id} → ${status} (${dist}m) @ ${address}`);
  return saved;
}

// ═══════════════════════════════════════════════════════════════
// Per-elderly simulation state
// Each guardian-elderly pair gets completely isolated state so
// one account never affects another.
// ═══════════════════════════════════════════════════════════════
const elderlyStates = {};

function getElderlyState(elderlyId) {
  const id = String(elderlyId);
  if (!elderlyStates[id]) {
    elderlyStates[id] = {
      elderlyId: id,
      guardianId: null,
      name: `Elderly #${id}`,
      home: { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng },
      radius: DEFAULT_RADIUS,
      position:     { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng, ts: Date.now() },
      realPosition: { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng, ts: Date.now() },
      simCfg: { mode: "standard", speed: 10, running: true },
      simTimer: null,
      replayTimer: null,
      replayActive: false,
      replayStep: 0,
      replayTotal: 0,
      replayScenario: "",
    };
  }
  return elderlyStates[id];
}

function intervalMs(state) {
  if (state.simCfg.mode === "always-on") return Math.max(150, Math.round(2000 / state.simCfg.speed));
  return Math.max(1000, Math.round(300000 / state.simCfg.speed));
}

async function push(state) {
  try {
    await checkRadius({
      elderlyId: state.elderlyId,
      guardianId: state.guardianId,
      lat: state.position.lat,
      lng: state.position.lng,
      home: state.home,
      radius: state.radius,
    });
  } catch (e) { console.error(`[GPS] Push failed for ${state.elderlyId}:`, e.message); }
}

function restartTimer(state) {
  clearInterval(state.simTimer);
  if (!state.simCfg.running || state.simCfg.mode === "on-demand") return;
  const ms = intervalMs(state);
  state.simTimer = setInterval(() => push(state), ms);
  console.log(`[GPS] Timer for ${state.elderlyId}: ${ms}ms mode=${state.simCfg.mode}`);
}

// ═══════════════════════════════════════════════════════════════
// Replay scenarios (per-elderly)
// ═══════════════════════════════════════════════════════════════
const SCENARIOS = {
  "wander-alert": [
    { dLat: 0.001, dLng: 0.001 }, { dLat: 0.002, dLng: 0.002 },
    { dLat: 0.003, dLng: 0.003 }, { dLat: 0.004, dLng: 0.004 },
    { dLat: 0.004, dLng: 0.004 }, { dLat: 0.003, dLng: 0.003 },
    { dLat: 0.001, dLng: 0.001 }, { dLat: 0.000, dLng: 0.000 },
  ],
  "park-walk": [
    { dLat: 0.002, dLng: 0.001 }, { dLat: 0.003, dLng: 0.002 },
    { dLat: 0.002, dLng: 0.003 }, { dLat: 0.000, dLng: 0.004 },
    { dLat: -0.001, dLng: 0.003 }, { dLat: -0.002, dLng: 0.002 },
    { dLat: -0.003, dLng: 0.001 }, { dLat: -0.002, dLng: -0.001 },
    { dLat: 0.000, dLng: 0.000 },
  ],
  "hospital-visit": [
    { dLat: 0.005, dLng: 0.010 }, { dLat: 0.010, dLng: 0.014 },
    { dLat: 0.010, dLng: 0.014 }, { dLat: 0.010, dLng: 0.014 },
    { dLat: 0.007, dLng: 0.010 }, { dLat: 0.004, dLng: 0.006 },
    { dLat: 0.001, dLng: 0.002 }, { dLat: 0.000, dLng: 0.000 },
  ],
};

function stopReplay(state) {
  clearTimeout(state.replayTimer);
  state.replayActive = false;
}

function startReplay(state, scenarioName, stepMs) {
  stopReplay(state);
  const steps = SCENARIOS[scenarioName];
  if (!steps) return { error: `Unknown scenario: ${scenarioName}` };
  state.position = { lat: state.home.lat, lng: state.home.lng, ts: Date.now() };
  state.replayActive = true;
  state.replayScenario = scenarioName;
  state.replayStep = 0;
  state.replayTotal = steps.length;

  function tick() {
    if (!state.replayActive || state.replayStep >= steps.length) {
      state.replayActive = false;
      return;
    }
    const step = steps[state.replayStep];
    state.position = {
      lat: state.home.lat + step.dLat,
      lng: state.home.lng + step.dLng,
      ts: Date.now(),
    };
    push(state);
    state.replayStep++;
    state.replayTimer = setTimeout(tick, stepMs);
  }
  state.replayTimer = setTimeout(tick, 500);
  return { success: true, scenario: scenarioName, steps: steps.length, stepMs };
}

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════
app.get("/health", (_req, res) => res.json({ status: "online", service: "gps-ms" }));

// ── GPS ──────────────────────────────────────────────────────
app.get("/gps/health", (_req, res) =>
  res.json({ status: "online", service: "gps-service", trackedElderly: Object.keys(elderlyStates).length })
);

// Simulated position — pass ?elderlyId=X
app.get("/gps/devicegps", (req, res) => {
  const state = getElderlyState(req.query.elderlyId || 1);
  res.json({ elderlyId: state.elderlyId, name: state.name, ...state.position });
});

// Set position by dragging in dev mode — elderlyId in body
app.post("/gps/devicegps/position", (req, res) => {
  const { lat, lng, elderlyId } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number")
    return res.status(400).json({ error: "lat and lng numbers required" });
  const state = getElderlyState(elderlyId || 1);
  stopReplay(state);
  state.position = { lat, lng, ts: Date.now() };
  push(state);
  res.json({ success: true, lat, lng, elderlyId: state.elderlyId });
});

// Real GPS (production phone) — pass ?elderlyId=X
app.get("/gps/realgps", (req, res) => {
  const state = getElderlyState(req.query.elderlyId || 1);
  res.json({ elderlyId: state.elderlyId, name: state.name, ...state.realPosition });
});

app.post("/gps/realgps", (req, res) => {
  const { lat, lng, elderlyId } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number")
    return res.status(400).json({ error: "lat and lng numbers required" });
  const state = getElderlyState(elderlyId || 1);
  state.realPosition = { lat, lng, ts: Date.now() };
  res.json({ success: true, lat, lng, elderlyId: state.elderlyId });
});

// D-pad — elderlyId in body
app.post("/gps/devicegps/move", (req, res) => {
  const { dLat = 0, dLng = 0, elderlyId } = req.body;
  const state = getElderlyState(elderlyId || 1);
  stopReplay(state);
  state.position.lat += Number(dLat);
  state.position.lng += Number(dLng);
  state.position.ts = Date.now();
  push(state);
  res.json({ success: true, ...state.position, elderlyId: state.elderlyId });
});

// Go Home — snaps to this elderly's configured home
app.post("/gps/devicegps/home", (req, res) => {
  const state = getElderlyState(req.body.elderlyId || 1);
  stopReplay(state);
  state.position = { lat: state.home.lat, lng: state.home.lng, ts: Date.now() };
  push(state);
  res.json({ success: true, ...state.position, elderlyId: state.elderlyId });
});

// Random walk
app.post("/gps/devicegps/random", (req, res) => {
  const state = getElderlyState(req.body.elderlyId || 1);
  stopReplay(state);
  const ang = Math.random() * 2 * Math.PI;
  const d = 0.0018 + Math.random() * 0.006;
  state.position.lat += Math.cos(ang) * d;
  state.position.lng += Math.sin(ang) * d;
  state.position.ts = Date.now();
  push(state);
  res.json({ success: true, ...state.position, elderlyId: state.elderlyId });
});

// On-demand push
app.post("/gps/devicegps/push", (req, res) => {
  const state = getElderlyState(req.body.elderlyId || 1);
  push(state);
  res.json({ success: true, elderlyId: state.elderlyId });
});

// Config — sets everything for a specific elderly, isolated from others
app.post("/gps/config", (req, res) => {
  const { mode, speed, elderlyId, guardianId, home, radius } = req.body;
  const state = getElderlyState(elderlyId || 1);

  if (mode) state.simCfg.mode = mode;
  if (speed != null) state.simCfg.speed = Math.max(1, Number(speed));
  if (guardianId != null) state.guardianId = guardianId;
  if (home && typeof home.lat === "number" && typeof home.lng === "number") {
    state.home = { lat: home.lat, lng: home.lng };
    console.log(`[GPS] Home for elderly ${state.elderlyId} → ${home.lat.toFixed(5)}, ${home.lng.toFixed(5)}`);
  }
  if (radius != null) {
    const r = Number(radius);
    if (!isNaN(r) && r >= 10) {
      state.radius = r;
      console.log(`[GPS] Radius for elderly ${state.elderlyId} → ${r}m`);
    }
  }
  restartTimer(state);
  res.json({
    success: true,
    elderlyId: state.elderlyId,
    ...state.simCfg,
    home: state.home,
    radius: state.radius,
    intervalMs: intervalMs(state),
  });
});

app.get("/gps/simconfig", (req, res) => {
  const state = getElderlyState(req.query.elderlyId || 1);
  res.json({ ...state.simCfg, home: state.home, radius: state.radius, intervalMs: intervalMs(state) });
});

app.post("/gps/start", (req, res) => {
  const state = getElderlyState(req.body.elderlyId || 1);
  state.simCfg.running = true;
  push(state);
  restartTimer(state);
  res.json({ success: true, running: true, elderlyId: state.elderlyId, intervalMs: intervalMs(state) });
});

app.post("/gps/stop", (req, res) => {
  const state = getElderlyState(req.body.elderlyId || 1);
  state.simCfg.running = false;
  clearInterval(state.simTimer);
  res.json({ success: true, running: false, elderlyId: state.elderlyId });
});

// Replay — all scoped to a specific elderly
app.get("/gps/replay/scenarios", (_req, res) =>
  res.json(Object.entries(SCENARIOS).map(([name, steps]) => ({ name, steps: steps.length })))
);

app.post("/gps/replay/start", (req, res) => {
  const { scenario = "wander-alert", stepMs = 4000, elderlyId } = req.body;
  const state = getElderlyState(elderlyId || 1);
  const result = startReplay(state, scenario, Number(stepMs));
  if (result.error) return res.status(400).json(result);
  res.json({ ...result, elderlyId: state.elderlyId });
});

app.post("/gps/replay/stop", (req, res) => {
  const state = getElderlyState(req.body.elderlyId || 1);
  stopReplay(state);
  res.json({ success: true, elderlyId: state.elderlyId });
});

// Pass ?elderlyId=X
app.get("/gps/replay/status", (req, res) => {
  const state = getElderlyState(req.query.elderlyId || 1);
  res.json({
    active: state.replayActive,
    scenario: state.replayScenario,
    step: state.replayStep,
    total: state.replayTotal,
    progress: state.replayTotal ? Math.round((state.replayStep / state.replayTotal) * 100) : 0,
    elderlyId: state.elderlyId,
  });
});

// ── Elderly Log ──────────────────────────────────────────────
app.get("/elderlylog/health", (_req, res) =>
  res.json({ status: "online", service: "logging-service", ...getStats() })
);
app.post("/elderlylog/:id", (req, res) => {
  res.status(201).json(addCoordinateEntry(req.params.id, req.body));
});
app.get("/elderlylog/all", (_req, res) => res.json(getAllTracked()));
app.get("/elderlylog/:id", (req, res) => {
  res.json(getCoordinateHistory(req.params.id, parseInt(req.query.n, 10) || 60));
});
app.get("/elderlylog/:id/latest", (req, res) => {
  const entry = getLatestCoordinate(req.params.id);
  if (!entry) return res.status(404).json({ error: `No data for ${req.params.id}` });
  res.json(entry);
});
app.delete("/elderlylog/:id", (req, res) => {
  clearHistory(req.params.id);
  res.json({ success: true, cleared: req.params.id });
});

// ── Map Display ──────────────────────────────────────────────
app.get("/drawmap/health", (_req, res) =>
  res.json({ status: "online", service: "map-display-service" })
);
app.get("/drawmap/:elderlyId", (req, res) => {
  const entry = getLatestCoordinate(req.params.elderlyId);
  if (!entry) return res.status(404).json({ error: "Map display unavailable" });
  res.json(entry);
});
app.get("/drawmap/:elderlyId/history", (req, res) => {
  const n = parseInt(req.query.n, 10) || 50;
  res.json(
    getCoordinateHistory(req.params.elderlyId, n)
      .map(e => ({ lat: e.lat, lng: e.lng, timestamp: e.timestamp, status: e.status }))
  );
});

// ── Status Service ───────────────────────────────────────────
app.get("/status/health", (_req, res) =>
  res.json({ status: "online", service: "status-service" })
);
app.get("/status/all", (_req, res) => res.json(getAllTracked()));
app.get("/status/:elderlyId", (req, res) => {
  const d = getLatestCoordinate(req.params.elderlyId);
  if (!d) return res.status(404).json({ error: "Status unavailable" });
  res.json({
    ...d,
    isHome: d.status === "Home",
    isSafe: d.status === "Home",
    distanceLabel: d.distance != null ? `${d.distance}m` : "Unknown",
    lastSeenAge: d.timestamp ? Math.round((Date.now() - d.timestamp) / 1000) + "s ago" : "Never",
    service: "status-service",
  });
});
app.get("/status/:elderlyId/summary", (req, res) => {
  const d = getLatestCoordinate(req.params.elderlyId);
  if (!d) return res.status(503).json({ error: "Unavailable" });
  res.json({ elderlyId: d.elderlyId, status: d.status, distance: d.distance, timestamp: d.timestamp });
});

// ── Internal: location lookup ────────────────────────────────
app.get("/location/:elderlyId", (req, res) => {
  const entry = getLatestCoordinate(req.params.elderlyId);
  if (entry) return res.json({ latitude: entry.lat, longitude: entry.lng, address: entry.address || "" });
  res.json({ latitude: null, longitude: null, address: "" });
});

// ── Start ────────────────────────────────────────────────────
connectRabbitMQ();
// No global push/timer on startup — each elderly's timer is started
// the first time /gps/config is called from the guardian UI.
app.listen(PORT, "0.0.0.0", () => console.log(`gps_ms listening on port ${PORT}`));