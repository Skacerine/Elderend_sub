import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 4002;
const GPS_MS_URL = process.env.GPS_MS_URL || "http://gps_ms:4001";
const NOTIFICATION_MS_URL = process.env.NOTIFICATION_MS_URL || "http://notification_ms:4005";
const OUTSYSTEMS_BASE_URL = process.env.OUTSYSTEMS_BASE_URL || "";
const OUTSYSTEMS_ELDERLYLOG_PATH = process.env.OUTSYSTEMS_ELDERLYLOG_PATH || "/ElderlyLog/CreateElderlyLog";

app.use(cors());
app.use(express.json());

// ═══ Alert Store (in-memory) ═══
const alerts = [];
const MAX_ALERTS = 200;

function addAlert(alert) {
  const entry = { ...alert, alertTs: Date.now(), _id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  alerts.unshift(entry);
  if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;
  return entry;
}
function getAlerts({ n = 100, type, since } = {}) {
  let result = alerts;
  if (type) result = result.filter(a => a.type === type);
  if (since) result = result.filter(a => a.alertTs > since);
  return result.slice(0, n);
}
function getLatestAlert() { return alerts[0] || null; }
function getAlertCount() { return { total: alerts.length, entered: alerts.filter(a => a.type === "entered").length, left: alerts.filter(a => a.type === "left").length }; }

// ═══ Incident Store (in-memory) ═══
const incidents = [];
function addIncident(incident) { incidents.unshift(incident); if (incidents.length > 100) incidents.pop(); }
function getIncidents() { return incidents; }
function getLatestIncidentByElderlyId(elderlyId) { return incidents.find(i => i.elderlyId === elderlyId) || null; }

// ═══ SSE clients ═══
const sseClients = new Set();
function pushToSSE(alert) {
  const payload = `data: ${JSON.stringify(alert)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch (_) { sseClients.delete(res); } }
}

// ═══ WebSocket ═══
let wssRef = null;
function broadcastIncident(incident) {
  if (!wssRef) return;
  const payload = JSON.stringify({ type: "drop_alert", data: incident });
  wssRef.clients.forEach(client => { if (client.readyState === 1) client.send(payload); });
}

// ═══ Drop Detection ═══
function scoreDropRisk(features) {
  let score = 0;
  const { minAcceleration = 999, peakAcceleration = 0, peakRotationRate = 0, postImpactStillnessMs = 0 } = features || {};
  if (minAcceleration < 8) score += 25; if (minAcceleration < 4) score += 15;
  if (peakRotationRate > 80) score += 20; if (peakRotationRate > 150) score += 10;
  if (peakAcceleration > 11) score += 25; if (peakAcceleration > 16) score += 15;
  const hadImpact = minAcceleration < 8 || peakAcceleration > 11 || peakRotationRate > 80;
  if (hadImpact && postImpactStillnessMs > 800) score += 10;
  if (hadImpact && postImpactStillnessMs > 1500) score += 10;
  let severity = "LOW";
  if (score >= 80) severity = "FALLEN"; else if (score >= 50) severity = "NORMAL"; else severity = "ATREST";
  return { detected: score >= 80, score, severity };
}

function createIncident({ elderlyId, deviceId, features, severity, score, message }) {
  const incident = { incidentId: `INC-${Date.now()}`, elderlyId, deviceId, type: "drop_alert", severity, score, timestamp: new Date().toISOString(), message: message || "Possible fall detected from device motion pattern.", features };
  addIncident(incident);
  addAlert({ ...incident, type: "drop_alert", receivedAt: incident.timestamp });
  broadcastIncident(incident);
  return incident;
}

// ═══ OutSystems ElderlyLog ═══
async function postElderlyLogToOutSystems({ elderlyId, guardianId, latitude, longitude, address, status, timestamp }) {
  if (!OUTSYSTEMS_BASE_URL) { console.warn("OUTSYSTEMS_BASE_URL not set, skipping"); return { skipped: true }; }
  const url = `${OUTSYSTEMS_BASE_URL}${OUTSYSTEMS_ELDERLYLOG_PATH}`;
  const payload = { elderly_id: Number(elderlyId), guardian_id: Number(guardianId), latitude: latitude != null ? Number(latitude) : null, longitude: longitude != null ? Number(longitude) : null, address: String(address ?? ""), status: String(status ?? "FALLEN").trim().toUpperCase(), timestamp: timestamp ?? new Date().toISOString() };
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) { const text = await response.text(); throw new Error(`OutSystems POST failed: ${response.status} - ${text}`); }
  try { return await response.json(); } catch { return { ok: true }; }
}

// Get elderly location from gps_ms
async function getElderlyLocation(elderlyId) {
  try {
    const r = await fetch(`${GPS_MS_URL}/location/${elderlyId}`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) return await r.json();
  } catch (e) { console.error("[Alert] GPS location fetch failed:", e.message); }
  return { latitude: null, longitude: null, address: "" };
}

// Send fall notifications via notification_ms
async function sendFallAlertNotifications(alertData) {
  try {
    const r = await fetch(`${NOTIFICATION_MS_URL}/internal/send-fall-alert`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alertData)
    });
    return await r.json();
  } catch (e) { console.error("[Alert] Notification send failed:", e.message); return { error: e.message }; }
}

// ═══ Routes ═══
app.get("/health", (_req, res) => res.json({ status: "online", service: "alert-ms" }));

// Alert routes
app.get("/alerts/health", (_req, res) => res.json({ status: "online", service: "alert-service", alertCount: getAlertCount().total }));
app.get("/alerts", (req, res) => {
  const n = parseInt(req.query.n, 10) || 100;
  const type = req.query.type;
  const since = parseInt(req.query.since, 10) || 0;
  res.json(getAlerts({ n, type, since }));
});
app.get("/alerts/latest", (_req, res) => { const alert = getLatestAlert(); if (!alert) return res.status(404).json({ error: "No alerts yet" }); res.json(alert); });
app.get("/alerts/count", (_req, res) => res.json(getAlertCount()));
app.get("/alerts/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const heartbeat = setInterval(() => { try { res.write(": heartbeat\n\n"); } catch (_) { clearInterval(heartbeat); } }, 15000);
  sseClients.add(res);
  req.on("close", () => { clearInterval(heartbeat); sseClients.delete(res); });
});

// Internal: receive geofence events from gps_ms
app.post("/internal/geofence-event", (req, res) => {
  const data = req.body;
  const alert = addAlert({ ...data, type: data.type, alertType: data.type === "left" ? "VIBRATE+RINGTONE" : "CHIME" });
  pushToSSE(alert);
  console.log(`[AlertSvc] Geofence event: ${data.type} — ${data.elderlyId}`);
  res.json({ success: true, alert });
});

// Motion/fall detection routes
app.post("/motion/sample", async (req, res) => {
  const { elderlyId, deviceId, timestamp, features, latitude, longitude, address, guardianId } = req.body || {};
  if (!elderlyId || !deviceId || !features) return res.status(400).json({ error: "elderlyId, deviceId, and features are required" });
  const result = scoreDropRisk(features);
  if (result.detected) {
    const incident = createIncident({ elderlyId, deviceId, features, severity: result.severity, score: result.score });
    const realLocation = await getElderlyLocation(elderlyId);
    const finalLat = latitude ?? realLocation.latitude;
    const finalLng = longitude ?? realLocation.longitude;
    const finalAddr = address || realLocation.address;
    try { await postElderlyLogToOutSystems({ elderlyId, guardianId, latitude: finalLat, longitude: finalLng, address: finalAddr, status: result.severity, timestamp: timestamp || new Date().toISOString() }); }
    catch (error) { console.error("Failed to sync to OutSystems:", error.message); }
    sendFallAlertNotifications({ elderlyId, address: finalAddr, latitude: finalLat, longitude: finalLng, score: result.score, severity: result.severity, timestamp: timestamp || new Date().toISOString(), features }).catch(err => console.error("Notification error:", err.message));
    return res.json({ detected: true, incident, timestampReceived: timestamp || new Date().toISOString() });
  }
  return res.json({ detected: false, score: result.score, severity: result.severity, timestampReceived: timestamp || new Date().toISOString() });
});

app.post("/motion/simulate-drop", async (req, res) => {
  const { elderlyId = 1, guardianId = 1, deviceId = "PHONE_01" } = req.body || {};
  const features = { minAcceleration: 1.1, peakAcceleration: 25.4, peakRotationRate: 320, postImpactStillnessMs: 3500 };
  const incident = createIncident({ elderlyId, deviceId, features, severity: "FALLEN", score: 100 });
  const realLocation = await getElderlyLocation(elderlyId);
  const latitude = req.body?.latitude ?? realLocation.latitude;
  const longitude = req.body?.longitude ?? realLocation.longitude;
  const address = req.body?.address || realLocation.address;
  try {
    const outsystemsResponse = await postElderlyLogToOutSystems({ elderlyId, guardianId, latitude, longitude, address, status: "FALLEN", timestamp: new Date().toISOString() });
    sendFallAlertNotifications({ elderlyId, address, latitude, longitude, score: 100, severity: "FALLEN", timestamp: new Date().toISOString(), features }).catch(err => console.error("Notification error:", err.message));
    return res.json({ detected: true, incident, outsystemsResponse });
  } catch (error) { return res.status(500).json({ detected: true, incident, outsystemsError: error.message }); }
});

app.get("/motion/incidents", (_req, res) => res.json(getIncidents()));
app.get("/motion/incidents/latest/:elderlyId", (req, res) => res.json(getLatestIncidentByElderlyId(req.params.elderlyId)));

// External alert intake
app.post("/external/alert", async (req, res) => {
  const { elderly_id, text } = req.body;
  if (!elderly_id) return res.status(400).json({ error: "elderly_id is required" });
  const incident = createIncident({ elderlyId: elderly_id, deviceId: "OUTSYSTEMS", features: {}, severity: "FALLEN", score: 100, message: text || "External alert received" });
  const location = await getElderlyLocation(elderly_id);
  sendFallAlertNotifications({ elderlyId: elderly_id, address: location.address || "", latitude: location.latitude, longitude: location.longitude, score: 100, severity: "FALLEN", timestamp: new Date().toISOString() }).catch(err => console.error("[ExternalAlert] Notification error:", err.message));
  res.json({ success: true, incident, message: "Alert triggered" });
});

// ═══ Start with WebSocket ═══
const server = http.createServer(app);
wssRef = new WebSocketServer({ server });
wssRef.on("connection", (ws) => { ws.send(JSON.stringify({ type: "system", data: { message: "Connected to drop alert stream" } })); });

server.listen(PORT, "0.0.0.0", () => console.log(`alert_ms listening on port ${PORT}`));
