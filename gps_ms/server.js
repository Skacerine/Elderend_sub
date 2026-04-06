import express from "express";
import cors from "cors";
import amqplib from "amqplib";

const app = express();
const PORT = process.env.PORT || 4001;
const AMQP_URL = process.env.AMQP_URL || "amqp://guest:guest@rabbitmq:5672";
const ALERT_MS_URL = process.env.ALERT_MS_URL || "http://alert_ms:4002";

// Default home can be overridden via env vars for deployment flexibility
const DEFAULT_HOME = {
  lat: parseFloat(process.env.DEFAULT_HOME_LAT) || 1.35305,
  lng: parseFloat(process.env.DEFAULT_HOME_LNG) || 103.94402,
};
const DEFAULT_RADIUS = parseInt(process.env.DEFAULT_RADIUS, 10) || 500;

app.use(cors());
app.use(express.json());

// ═══ Coordinate Store (in-memory) ═══
const db = {};
const registry = {};
const MAX_LOG = 500;

function addCoordinateEntry(elderlyId, entry) {
  const e = { ...entry, _id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  if (!db[elderlyId]) db[elderlyId] = [];
  db[elderlyId].unshift(e);
  if (db[elderlyId].length > MAX_LOG) db[elderlyId].length = MAX_LOG;
  if (!registry[elderlyId]) registry[elderlyId] = { elderlyId, guardianId: entry.guardianId || null };
  return e;
}

function getCoordinateHistory(elderlyId, n = 60) { return (db[elderlyId] || []).slice(0, Math.min(n, MAX_LOG)); }
function getLatestCoordinate(elderlyId) { const entries = db[elderlyId] || []; return entries.length ? entries[0] : null; }
function getAllTracked() { return Object.keys(db).map(id => ({ ...registry[id], latest: db[id][0] || null })); }
function clearHistory(elderlyId) { db[elderlyId] = []; delete registry[elderlyId]; }
function getStats() { const total = Object.values(db).reduce((s, a) => s + a.length, 0); return { tracked: Object.keys(db).length, totalEntries: total }; }

// ═══ Geocoding (simulated) ═══
const ZONES = [
  { name: "Tampines Ave 1", lat: 1.3530, lng: 103.9440 }, { name: "Tampines Ave 3", lat: 1.3565, lng: 103.9455 },
  { name: "Tampines Ave 5", lat: 1.3495, lng: 103.9485 }, { name: "Pasir Ris Dr 3", lat: 1.3728, lng: 103.9457 },
  { name: "Simei St 1", lat: 1.3440, lng: 103.9530 }, { name: "Bedok North Rd", lat: 1.3328, lng: 103.9284 },
  { name: "Changi Rd", lat: 1.3409, lng: 103.9590 }, { name: "Upper Changi Rd", lat: 1.3456, lng: 103.9648 },
  { name: "Loyang Ave", lat: 1.3680, lng: 103.9760 },
];

function geocode(lat, lng) {
  let best = ZONES[0], minD = Infinity;
  for (const z of ZONES) { const d = (lat - z.lat) ** 2 + (lng - z.lng) ** 2; if (d < minD) { minD = d; best = z; } }
  const blk = (Math.abs(Math.round(lat * 10000)) % 800) + 100;
  return `Blk ${blk} ${best.name}`;
}

// ═══ Haversine + Radius Check ═══
const lastStatus = {};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const f1 = (lat1 * Math.PI) / 180, f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180, dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let amqpChannel = null;
const EXCHANGE = "elderwatch.geofence";

function checkRadius({ elderlyId, guardianId, lat, lng, address, timestamp, home, radius = DEFAULT_RADIUS }) {
  const latN = parseFloat(lat), lngN = parseFloat(lng);
  const dist = Math.round(haversine(latN, lngN, home.lat, home.lng));
  const status = dist <= radius ? "Home" : "Outside";
  const entry = { elderlyId, guardianId, lat: latN, lng: lngN, address, timestamp: typeof timestamp === "number" ? timestamp : parseInt(timestamp, 10), status, distance: dist };
  const saved = addCoordinateEntry(elderlyId, entry);

  const prev = lastStatus[elderlyId];
  if (prev !== undefined && prev !== status) {
    const type = status === "Outside" ? "left" : "entered";
    const routingKey = status === "Outside" ? "geofence.left" : "geofence.entered";

    // Publish to RabbitMQ (for notification_ms consumers)
    if (amqpChannel) {
      try {
        amqpChannel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(entry)));
        console.log(`[AMQP] Published: ${routingKey}`);
      } catch (e) { console.error("[AMQP] Publish failed:", e.message); }
    }

    // HTTP POST to alert_ms (fire-and-forget, for alert storage + SSE)
    fetch(`${ALERT_MS_URL}/internal/geofence-event`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, type, routingKey })
    }).catch(e => console.error("[GPS] Alert MS notification failed:", e.message));
  }
  lastStatus[elderlyId] = status;
  console.log(`[RadiusChecker] ${elderlyId} → ${status} (${dist}m)`);
  return saved;
}

// ═══ GPS Simulation State ═══
// meta.home and meta.radius are the live values — updated via /gps/config
let position = { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng, ts: Date.now() };
let realPosition = { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng, ts: Date.now() };
const meta = {
  elderlyId: 1,
  guardianId: 1,
  name: "Mdm Tan Ah Kow",
  home: { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng },
  radius: DEFAULT_RADIUS,
};
const simCfg = { mode: "standard", speed: 10, running: true };
let simTimer = null;

function intervalMs() {
  if (simCfg.mode === "always-on") return Math.max(150, Math.round(2000 / simCfg.speed));
  return Math.max(1000, Math.round(300000 / simCfg.speed));
}

function push() {
  try {
    const address = geocode(position.lat, position.lng);
    checkRadius({ elderlyId: meta.elderlyId, guardianId: meta.guardianId, lat: position.lat, lng: position.lng, address, timestamp: Date.now(), home: meta.home, radius: meta.radius });
    console.log(`[GPS] Pushed ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
  } catch (e) { console.error(`[GPS] Push failed: ${e.message}`); }
}

function restartTimer() {
  clearInterval(simTimer);
  if (!simCfg.running || simCfg.mode === "on-demand") return;
  const ms = intervalMs();
  simTimer = setInterval(push, ms);
  console.log(`[GPS] Timer set: ${ms}ms  mode=${simCfg.mode}  speed=${simCfg.speed}x`);
}

// Replay scenarios
const SCENARIOS = {
  "wander-alert": [
    { dLat: 0.001, dLng: 0.001 }, { dLat: 0.002, dLng: 0.002 },
    { dLat: 0.003, dLng: 0.003 }, { dLat: 0.004, dLng: 0.004 },
    { dLat: 0.004, dLng: 0.004 }, { dLat: 0.003, dLng: 0.003 },
    { dLat: 0.001, dLng: 0.001 }, { dLat: 0.000, dLng: 0.000 }
  ],
  "park-walk": [
    { dLat: 0.002, dLng: 0.001 }, { dLat: 0.003, dLng: 0.002 },
    { dLat: 0.002, dLng: 0.003 }, { dLat: 0.000, dLng: 0.004 },
    { dLat: -0.001, dLng: 0.003 }, { dLat: -0.002, dLng: 0.002 },
    { dLat: -0.003, dLng: 0.001 }, { dLat: -0.002, dLng: -0.001 },
    { dLat: 0.000, dLng: 0.000 }
  ],
  "hospital-visit": [
    { dLat: 0.005, dLng: 0.010 }, { dLat: 0.010, dLng: 0.014 },
    { dLat: 0.010, dLng: 0.014 }, { dLat: 0.010, dLng: 0.014 },
    { dLat: 0.007, dLng: 0.010 }, { dLat: 0.004, dLng: 0.006 },
    { dLat: 0.001, dLng: 0.002 }, { dLat: 0.000, dLng: 0.000 }
  ]
};
let replayTimer = null, replayActive = false, replayStep = 0, replayTotal = 0, replayScenario = "";

function stopReplay() { clearTimeout(replayTimer); replayActive = false; }

function startReplay(scenarioName, stepMs) {
  stopReplay();
  const steps = SCENARIOS[scenarioName];
  if (!steps) return { error: `Unknown scenario: ${scenarioName}` };
  // Reset position to current meta.home (not a hardcoded constant)
  position = { lat: meta.home.lat, lng: meta.home.lng, ts: Date.now() };
  replayActive = true; replayScenario = scenarioName; replayStep = 0; replayTotal = steps.length;
  function tick() {
    if (!replayActive || replayStep >= steps.length) { replayActive = false; return; }
    const step = steps[replayStep];
    position = { lat: meta.home.lat + step.dLat, lng: meta.home.lng + step.dLng, ts: Date.now() };
    push(); replayStep++;
    replayTimer = setTimeout(tick, stepMs);
  }
  replayTimer = setTimeout(tick, 500);
  return { success: true, scenario: scenarioName, steps: steps.length, stepMs };
}

// ═══ RabbitMQ publisher connection ═══
async function connectRabbitMQ() {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const conn = await amqplib.connect(AMQP_URL);
      amqpChannel = await conn.createChannel();
      await amqpChannel.assertExchange(EXCHANGE, "topic", { durable: true });
      console.log("[AMQP] Connected to RabbitMQ, publisher ready");
      conn.on("error", (err) => console.error("[AMQP] Error:", err.message));
      conn.on("close", () => { amqpChannel = null; console.log("[AMQP] Closed, reconnecting..."); setTimeout(connectRabbitMQ, 5000); });
      return;
    } catch (e) {
      console.log(`[AMQP] Attempt ${i + 1}/${maxRetries} failed: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error("[AMQP] Failed to connect after retries — geofence events will only use HTTP");
}

// ═══ Routes ═══
app.get("/health", (_req, res) => res.json({ status: "online", service: "gps-ms" }));

// GPS routes
app.get("/gps/health", (_req, res) => res.json({ status: "online", service: "gps-service", ...simCfg, intervalMs: intervalMs() }));
app.get("/gps/devicegps", (_req, res) => res.json({ elderlyId: meta.elderlyId, name: meta.name, ...position }));
app.post("/gps/devicegps/position", (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") return res.status(400).json({ error: "lat and lng numbers required" });
  stopReplay(); position = { lat, lng, ts: Date.now() }; push();
  res.json({ success: true, lat, lng });
});
app.get("/gps/realgps", (_req, res) => res.json({ elderlyId: meta.elderlyId, name: meta.name, ...realPosition }));
app.post("/gps/realgps", (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") return res.status(400).json({ error: "lat and lng numbers required" });
  realPosition = { lat, lng, ts: Date.now() };
  res.json({ success: true, lat, lng });
});
app.post("/gps/devicegps/move", (req, res) => {
  stopReplay(); position.lat += Number(req.body.dLat || 0); position.lng += Number(req.body.dLng || 0); position.ts = Date.now(); push();
  res.json({ success: true, ...position });
});
// Return to current meta.home (not hardcoded) so "Go Home" respects the configured home location
app.post("/gps/devicegps/home", (_req, res) => {
  stopReplay(); position = { lat: meta.home.lat, lng: meta.home.lng, ts: Date.now() }; push();
  res.json({ success: true, ...position });
});
app.post("/gps/devicegps/random", (_req, res) => {
  stopReplay(); const ang = Math.random() * 2 * Math.PI; const d = 0.0018 + Math.random() * 0.006;
  position.lat += Math.cos(ang) * d; position.lng += Math.sin(ang) * d; position.ts = Date.now(); push();
  res.json({ success: true, ...position });
});
app.post("/gps/devicegps/push", (_req, res) => { push(); res.json({ success: true }); });

// /gps/config now also accepts home (object with lat/lng) and radius so the
// frontend can keep the backend in sync whenever the guardian changes the home
// location or safe-zone radius.
app.post("/gps/config", (req, res) => {
  const { mode, speed, elderlyId, guardianId, home, radius } = req.body;
  if (mode) simCfg.mode = mode;
  if (speed != null) simCfg.speed = Math.max(1, Number(speed));
  if (elderlyId != null) meta.elderlyId = elderlyId;
  if (guardianId != null) meta.guardianId = guardianId;
  // Accept home as { lat, lng } — validate before applying
  if (home && typeof home.lat === "number" && typeof home.lng === "number") {
    meta.home = { lat: home.lat, lng: home.lng };
    console.log(`[GPS] Home updated → ${home.lat.toFixed(5)}, ${home.lng.toFixed(5)}`);
  }
  if (radius != null) {
    const r = Number(radius);
    if (!isNaN(r) && r >= 10) {
      meta.radius = r;
      console.log(`[GPS] Radius updated → ${r}m`);
    }
  }
  restartTimer();
  res.json({ success: true, ...simCfg, elderlyId: meta.elderlyId, home: meta.home, radius: meta.radius, intervalMs: intervalMs() });
});
app.get("/gps/simconfig", (_req, res) => res.json({ ...simCfg, home: meta.home, radius: meta.radius, intervalMs: intervalMs() }));
app.post("/gps/start", (_req, res) => { simCfg.running = true; push(); restartTimer(); res.json({ success: true, running: true, intervalMs: intervalMs() }); });
app.post("/gps/stop", (_req, res) => { simCfg.running = false; clearInterval(simTimer); res.json({ success: true, running: false }); });
app.get("/gps/replay/scenarios", (_req, res) => res.json(Object.entries(SCENARIOS).map(([name, steps]) => ({ name, steps: steps.length }))));
app.post("/gps/replay/start", (req, res) => {
  const { scenario = "wander-alert", stepMs = 4000 } = req.body;
  const result = startReplay(scenario, Number(stepMs));
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
app.post("/gps/replay/stop", (_req, res) => { stopReplay(); res.json({ success: true }); });
app.get("/gps/replay/status", (_req, res) => res.json({ active: replayActive, scenario: replayScenario, step: replayStep, total: replayTotal, progress: replayTotal ? Math.round((replayStep / replayTotal) * 100) : 0 }));

// Elderly Log routes
app.get("/elderlylog/health", (_req, res) => { const stats = getStats(); res.json({ status: "online", service: "logging-service", ...stats }); });
app.post("/elderlylog/:id", (req, res) => { const entry = addCoordinateEntry(req.params.id, req.body); res.status(201).json(entry); });
app.get("/elderlylog/all", (_req, res) => res.json(getAllTracked()));
app.get("/elderlylog/:id", (req, res) => { const n = parseInt(req.query.n, 10) || 60; res.json(getCoordinateHistory(req.params.id, n)); });
app.get("/elderlylog/:id/latest", (req, res) => {
  const entry = getLatestCoordinate(req.params.id);
  if (!entry) return res.status(404).json({ error: `No data for ${req.params.id}` });
  res.json(entry);
});
app.delete("/elderlylog/:id", (req, res) => { clearHistory(req.params.id); res.json({ success: true, cleared: req.params.id }); });

// Map display routes
app.get("/drawmap/health", (_req, res) => res.json({ status: "online", service: "map-display-service" }));
app.get("/drawmap/:elderlyId", (req, res) => {
  const entry = getLatestCoordinate(req.params.elderlyId);
  if (!entry) return res.status(404).json({ error: "Map display unavailable" });
  res.json(entry);
});
app.get("/drawmap/:elderlyId/history", (req, res) => {
  const n = parseInt(req.query.n, 10) || 50;
  const entries = getCoordinateHistory(req.params.elderlyId, n);
  res.json(entries.map(e => ({ lat: e.lat, lng: e.lng, timestamp: e.timestamp, status: e.status })));
});

// Status routes
app.get("/status/health", (_req, res) => res.json({ status: "online", service: "status-service" }));
app.get("/status/all", (_req, res) => res.json(getAllTracked()));
app.get("/status/:elderlyId", (req, res) => {
  const d = getLatestCoordinate(req.params.elderlyId);
  if (!d) return res.status(404).json({ error: "Status unavailable" });
  res.json({ ...d, isHome: d.status === "Home", isSafe: d.status === "Home", distanceLabel: d.distance != null ? `${d.distance}m` : "Unknown", lastSeenAge: d.timestamp ? Math.round((Date.now() - d.timestamp) / 1000) + "s ago" : "Never", service: "status-service" });
});
app.get("/status/:elderlyId/summary", (req, res) => {
  const d = getLatestCoordinate(req.params.elderlyId);
  if (!d) return res.status(503).json({ error: "Unavailable" });
  res.json({ elderlyId: d.elderlyId, status: d.status, distance: d.distance, timestamp: d.timestamp });
});

// Internal: location lookup (used by alert_ms for fall detection)
app.get("/location/:elderlyId", (req, res) => {
  const entry = getLatestCoordinate(req.params.elderlyId);
  if (entry) return res.json({ latitude: entry.lat, longitude: entry.lng, address: entry.address || "" });
  res.json({ latitude: null, longitude: null, address: "" });
});

// Start
connectRabbitMQ();
push();
restartTimer();
app.listen(PORT, "0.0.0.0", () => console.log(`gps_ms listening on port ${PORT}`));