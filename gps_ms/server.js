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

// ═══ Per-Elderly State ═══
// Each elderly gets their own position, config, and simulation state
const elderlyState = {};

function getState(elderlyId) {
  if (!elderlyState[elderlyId]) {
    elderlyState[elderlyId] = {
      position: { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng, ts: Date.now() },
      realPosition: { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng, ts: Date.now() },
      meta: {
        elderlyId,
        guardianId: null,
        name: `Elderly #${elderlyId}`,
        home: { lat: DEFAULT_HOME.lat, lng: DEFAULT_HOME.lng },
        radius: DEFAULT_RADIUS,
      },
      simCfg: { mode: "standard", speed: 10, running: true },
      simTimer: null,
      replay: { timer: null, active: false, step: 0, total: 0, scenario: "" },
    };
  }
  return elderlyState[elderlyId];
}

function intervalMs(simCfg) {
  if (simCfg.mode === "always-on") return Math.max(150, Math.round(2000 / simCfg.speed));
  return Math.max(1000, Math.round(300000 / simCfg.speed));
}

function push(elderlyId) {
  try {
    const s = getState(elderlyId);
    const address = geocode(s.position.lat, s.position.lng);
    checkRadius({ elderlyId: s.meta.elderlyId, guardianId: s.meta.guardianId, lat: s.position.lat, lng: s.position.lng, address, timestamp: Date.now(), home: s.meta.home, radius: s.meta.radius });
    console.log(`[GPS] Pushed ${elderlyId}: ${s.position.lat.toFixed(5)}, ${s.position.lng.toFixed(5)}`);
  } catch (e) { console.error(`[GPS] Push failed for ${elderlyId}: ${e.message}`); }
}

function restartTimer(elderlyId) {
  const s = getState(elderlyId);
  clearInterval(s.simTimer);
  if (!s.simCfg.running || s.simCfg.mode === "on-demand") return;
  const ms = intervalMs(s.simCfg);
  s.simTimer = setInterval(() => push(elderlyId), ms);
  console.log(`[GPS] Timer set for ${elderlyId}: ${ms}ms  mode=${s.simCfg.mode}  speed=${s.simCfg.speed}x`);
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

function stopReplay(elderlyId) {
  const s = getState(elderlyId);
  clearTimeout(s.replay.timer);
  s.replay.active = false;
}

function startReplay(elderlyId, scenarioName, stepMs) {
  stopReplay(elderlyId);
  const steps = SCENARIOS[scenarioName];
  if (!steps) return { error: `Unknown scenario: ${scenarioName}` };
  const s = getState(elderlyId);
  s.position = { lat: s.meta.home.lat, lng: s.meta.home.lng, ts: Date.now() };
  s.replay.active = true; s.replay.scenario = scenarioName; s.replay.step = 0; s.replay.total = steps.length;
  function tick() {
    if (!s.replay.active || s.replay.step >= steps.length) { s.replay.active = false; return; }
    const step = steps[s.replay.step];
    s.position = { lat: s.meta.home.lat + step.dLat, lng: s.meta.home.lng + step.dLng, ts: Date.now() };
    push(elderlyId); s.replay.step++;
    s.replay.timer = setTimeout(tick, stepMs);
  }
  s.replay.timer = setTimeout(tick, 500);
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

// Helper: extract elderlyId from request (body, query, or params)
function eid(req) {
  return req.body?.elderlyId || req.query?.elderlyId || req.params?.elderlyId || "1";
}

// ═══ Routes ═══
app.get("/health", (_req, res) => res.json({ status: "online", service: "gps-ms" }));

// GPS routes
app.get("/gps/health", (_req, res) => res.json({ status: "online", service: "gps-service" }));
app.get("/gps/devicegps", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  res.json({ elderlyId: s.meta.elderlyId, name: s.meta.name, ...s.position });
});
app.post("/gps/devicegps/position", (req, res) => {
  const { lat, lng, elderlyId } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") return res.status(400).json({ error: "lat and lng numbers required" });
  const id = elderlyId || "1";
  const s = getState(id);
  stopReplay(id); s.position = { lat, lng, ts: Date.now() }; push(id);
  res.json({ success: true, lat, lng });
});
app.get("/gps/realgps", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  res.json({ elderlyId: s.meta.elderlyId, name: s.meta.name, ...s.realPosition });
});
app.post("/gps/realgps", (req, res) => {
  const { lat, lng, elderlyId } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") return res.status(400).json({ error: "lat and lng numbers required" });
  const id = elderlyId || "1";
  const s = getState(id);
  s.realPosition = { lat, lng, ts: Date.now() };
  res.json({ success: true, lat, lng });
});
app.post("/gps/devicegps/move", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  stopReplay(id); s.position.lat += Number(req.body.dLat || 0); s.position.lng += Number(req.body.dLng || 0); s.position.ts = Date.now(); push(id);
  res.json({ success: true, ...s.position });
});
app.post("/gps/devicegps/home", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  stopReplay(id); s.position = { lat: s.meta.home.lat, lng: s.meta.home.lng, ts: Date.now() }; push(id);
  res.json({ success: true, ...s.position });
});
app.post("/gps/devicegps/random", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  stopReplay(id); const ang = Math.random() * 2 * Math.PI; const d = 0.0018 + Math.random() * 0.006;
  s.position.lat += Math.cos(ang) * d; s.position.lng += Math.sin(ang) * d; s.position.ts = Date.now(); push(id);
  res.json({ success: true, ...s.position });
});
app.post("/gps/devicegps/push", (req, res) => { const id = eid(req); push(id); res.json({ success: true }); });

app.post("/gps/config", (req, res) => {
  const { mode, speed, elderlyId, guardianId, home, radius } = req.body;
  const id = elderlyId || "1";
  const s = getState(id);
  if (mode) s.simCfg.mode = mode;
  if (speed != null) s.simCfg.speed = Math.max(1, Number(speed));
  if (elderlyId != null) s.meta.elderlyId = elderlyId;
  if (guardianId != null) s.meta.guardianId = guardianId;
  if (home && typeof home.lat === "number" && typeof home.lng === "number") {
    s.meta.home = { lat: home.lat, lng: home.lng };
    console.log(`[GPS] Home updated for ${id} → ${home.lat.toFixed(5)}, ${home.lng.toFixed(5)}`);
  }
  if (radius != null) {
    const r = Number(radius);
    if (!isNaN(r) && r >= 10) {
      s.meta.radius = r;
      console.log(`[GPS] Radius updated for ${id} → ${r}m`);
    }
  }
  restartTimer(id);
  res.json({ success: true, ...s.simCfg, elderlyId: s.meta.elderlyId, home: s.meta.home, radius: s.meta.radius, intervalMs: intervalMs(s.simCfg) });
});
app.get("/gps/simconfig", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  res.json({ ...s.simCfg, home: s.meta.home, radius: s.meta.radius, intervalMs: intervalMs(s.simCfg) });
});
app.post("/gps/start", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  s.simCfg.running = true; push(id); restartTimer(id);
  res.json({ success: true, running: true, intervalMs: intervalMs(s.simCfg) });
});
app.post("/gps/stop", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  s.simCfg.running = false; clearInterval(s.simTimer);
  res.json({ success: true, running: false });
});
app.get("/gps/replay/scenarios", (_req, res) => res.json(Object.entries(SCENARIOS).map(([name, steps]) => ({ name, steps: steps.length }))));
app.post("/gps/replay/start", (req, res) => {
  const id = eid(req);
  const { scenario = "wander-alert", stepMs = 4000 } = req.body;
  const result = startReplay(id, scenario, Number(stepMs));
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
app.post("/gps/replay/stop", (req, res) => { const id = eid(req); stopReplay(id); res.json({ success: true }); });
app.get("/gps/replay/status", (req, res) => {
  const id = eid(req);
  const s = getState(id);
  res.json({ active: s.replay.active, scenario: s.replay.scenario, step: s.replay.step, total: s.replay.total, progress: s.replay.total ? Math.round((s.replay.step / s.replay.total) * 100) : 0 });
});

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
app.listen(PORT, "0.0.0.0", () => console.log(`gps_ms listening on port ${PORT}`));
