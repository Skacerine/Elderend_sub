import express from "express";

const router = express.Router();

const spec = {
  openapi: "3.0.3",
  info: {
    title: "ElderWatch Backend API",
    description: "Unified backend for fall detection, GPS tracking, geofence alerts, medicine management, and guardian notifications.",
    version: "1.0.0"
  },
  servers: [
    { url: "https://elderend-backend.onrender.com", description: "Production (Render)" },
    { url: "http://localhost:4000", description: "Local development" }
  ],
  tags: [
    { name: "Motion", description: "Fall detection and incident management" },
    { name: "GPS", description: "GPS simulator and position tracking" },
    { name: "Elderly Log", description: "Coordinate history storage" },
    { name: "Map", description: "Map display data reader" },
    { name: "Status", description: "Elderly status reader" },
    { name: "Alerts", description: "Geofence alerts and SSE streaming" },
    { name: "Notifications", description: "Guardian notification log" },
    { name: "Medicine", description: "Medicine management (OutSystems proxy)" },
    { name: "System", description: "Health checks and system info" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"], summary: "Backend health check",
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, service: { type: "string" }, allowedOrigins: { type: "array", items: { type: "string" } } } } } } } }
      }
    },

    // ── Motion ──
    "/motion/sample": {
      post: {
        tags: ["Motion"], summary: "Process motion sensor sample",
        description: "Scores drop risk from device motion features. If score >= 100, creates incident, posts to OutSystems, sends SMS + email alerts.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["elderlyId", "deviceId", "features"],
          properties: {
            elderlyId: { type: "integer", example: 1234567891234567 },
            deviceId: { type: "string", example: "PHONE_01" },
            guardianId: { type: "integer", example: 1234567891234567 },
            timestamp: { type: "string", format: "date-time" },
            latitude: { type: "number", example: 1.2966 },
            longitude: { type: "number", example: 103.8502 },
            address: { type: "string", example: "Tanjong Pagar, Singapore" },
            features: { type: "object", properties: {
              minAcceleration: { type: "number", example: 1.1 },
              peakAcceleration: { type: "number", example: 25.4 },
              peakRotationRate: { type: "number", example: 320 },
              postImpactStillnessMs: { type: "number", example: 3500 }
            } }
          }
        } } } },
        responses: { 200: { description: "Detection result with incident if detected" } }
      }
    },
    "/motion/simulate-drop": {
      post: {
        tags: ["Motion"], summary: "Simulate a fall event",
        description: "Creates a fall incident with score 100, posts to OutSystems, sends SMS + email alerts. Used for testing.",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: {
          elderlyId: { type: "integer", example: 1234567891234567 },
          guardianId: { type: "integer", example: 1234567891234567 },
          deviceId: { type: "string", example: "PHONE_01" }
        } } } } },
        responses: { 200: { description: "Incident + OutSystems response" } }
      }
    },
    "/motion/incidents": {
      get: { tags: ["Motion"], summary: "Get all incidents", responses: { 200: { description: "Array of incidents (max 100)" } } }
    },
    "/motion/incidents/latest/{elderlyId}": {
      get: { tags: ["Motion"], summary: "Get latest incident for elderly",
        parameters: [{ name: "elderlyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Latest incident" } } }
    },

    // ── GPS ──
    "/gps/health": { get: { tags: ["GPS"], summary: "GPS service health", responses: { 200: { description: "Health + sim config" } } } },
    "/gps/devicegps": { get: { tags: ["GPS"], summary: "Current GPS position", responses: { 200: { description: "{ elderlyId, name, lat, lng, ts }" } } } },
    "/gps/devicegps/position": {
      post: { tags: ["GPS"], summary: "Set position (map drag)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["lat", "lng"], properties: { lat: { type: "number", example: 1.35305 }, lng: { type: "number", example: 103.94402 } } } } } },
        responses: { 200: { description: "Success + new position" } } }
    },
    "/gps/devicegps/move": {
      post: { tags: ["GPS"], summary: "Move by delta (D-pad)",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { dLat: { type: "number", example: 0.002 }, dLng: { type: "number", example: 0.002 } } } } } },
        responses: { 200: { description: "Success + new position" } } }
    },
    "/gps/devicegps/home": { post: { tags: ["GPS"], summary: "Snap to home position", responses: { 200: { description: "Success" } } } },
    "/gps/devicegps/random": { post: { tags: ["GPS"], summary: "Random walk step", responses: { 200: { description: "Success + new position" } } } },
    "/gps/devicegps/push": { post: { tags: ["GPS"], summary: "Manual GPS push to pipeline", responses: { 200: { description: "Success" } } } },
    "/gps/config": {
      post: { tags: ["GPS"], summary: "Set tracking mode and speed",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { mode: { type: "string", enum: ["standard", "always-on", "on-demand"] }, speed: { type: "number", example: 10 } } } } } },
        responses: { 200: { description: "Updated config" } } }
    },
    "/gps/simconfig": { get: { tags: ["GPS"], summary: "Get current sim config", responses: { 200: { description: "Config" } } } },
    "/gps/start": { post: { tags: ["GPS"], summary: "Start tracking", responses: { 200: { description: "Running" } } } },
    "/gps/stop": { post: { tags: ["GPS"], summary: "Stop tracking", responses: { 200: { description: "Stopped" } } } },
    "/gps/replay/scenarios": { get: { tags: ["GPS"], summary: "List replay scenarios", responses: { 200: { description: "Array of scenarios" } } } },
    "/gps/replay/start": {
      post: { tags: ["GPS"], summary: "Start replay scenario",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { scenario: { type: "string", enum: ["wander-alert", "park-walk", "hospital-visit"], example: "wander-alert" }, stepMs: { type: "number", example: 4000 } } } } } },
        responses: { 200: { description: "Replay started" } } }
    },
    "/gps/replay/stop": { post: { tags: ["GPS"], summary: "Stop replay", responses: { 200: { description: "Stopped" } } } },
    "/gps/replay/status": { get: { tags: ["GPS"], summary: "Replay progress", responses: { 200: { description: "{ active, scenario, step, total, progress }" } } } },

    // ── Elderly Log ──
    "/elderlylog/health": { get: { tags: ["Elderly Log"], summary: "Logging service health", responses: { 200: { description: "Health + stats" } } } },
    "/elderlylog/all": { get: { tags: ["Elderly Log"], summary: "Latest entry per tracked elderly", responses: { 200: { description: "Array of tracked elderly with latest coordinate" } } } },
    "/elderlylog/{id}": {
      get: { tags: ["Elderly Log"], summary: "Coordinate history",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "n", in: "query", schema: { type: "integer", default: 60 } }],
        responses: { 200: { description: "Array of coordinate entries" } } },
      post: { tags: ["Elderly Log"], summary: "Add coordinate entry",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { elderlyId: { type: "string" }, guardianId: { type: "string" }, lat: { type: "number" }, lng: { type: "number" }, address: { type: "string" }, timestamp: { type: "integer" }, status: { type: "string" }, distance: { type: "integer" } } } } } },
        responses: { 201: { description: "Created entry" } } },
      delete: { tags: ["Elderly Log"], summary: "Clear history",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Cleared" } } }
    },
    "/elderlylog/{id}/latest": {
      get: { tags: ["Elderly Log"], summary: "Latest coordinate entry",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Latest entry" }, 404: { description: "No data" } } }
    },

    // ── Map ──
    "/drawmap/health": { get: { tags: ["Map"], summary: "Map service health", responses: { 200: { description: "OK" } } } },
    "/drawmap/{elderlyId}": {
      get: { tags: ["Map"], summary: "Latest position for map",
        parameters: [{ name: "elderlyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Position data" }, 404: { description: "No data" } } }
    },
    "/drawmap/{elderlyId}/history": {
      get: { tags: ["Map"], summary: "Movement trail (polyline data)",
        parameters: [{ name: "elderlyId", in: "path", required: true, schema: { type: "string" } }, { name: "n", in: "query", schema: { type: "integer", default: 50 } }],
        responses: { 200: { description: "Array of { lat, lng, timestamp, status }" } } }
    },

    // ── Status ──
    "/status/health": { get: { tags: ["Status"], summary: "Status service health", responses: { 200: { description: "OK" } } } },
    "/status/all": { get: { tags: ["Status"], summary: "All tracked elderly", responses: { 200: { description: "Array" } } } },
    "/status/{elderlyId}": {
      get: { tags: ["Status"], summary: "Full status with computed fields",
        parameters: [{ name: "elderlyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "{ ...entry, isHome, isSafe, distanceLabel, lastSeenAge }" } } }
    },
    "/status/{elderlyId}/summary": {
      get: { tags: ["Status"], summary: "Lightweight status badge",
        parameters: [{ name: "elderlyId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "{ elderlyId, status, distance, timestamp }" } } }
    },

    // ── Alerts ──
    "/alerts/health": { get: { tags: ["Alerts"], summary: "Alert service health", responses: { 200: { description: "OK + count" } } } },
    "/alerts": {
      get: { tags: ["Alerts"], summary: "Get geofence alerts",
        parameters: [
          { name: "n", in: "query", schema: { type: "integer", default: 100 } },
          { name: "type", in: "query", schema: { type: "string", enum: ["entered", "left"] } },
          { name: "since", in: "query", schema: { type: "integer", description: "Epoch ms" } }
        ],
        responses: { 200: { description: "Filtered alerts" } } }
    },
    "/alerts/latest": { get: { tags: ["Alerts"], summary: "Latest alert", responses: { 200: { description: "Alert" }, 404: { description: "None" } } } },
    "/alerts/count": { get: { tags: ["Alerts"], summary: "Alert counts", responses: { 200: { description: "{ total, entered, left }" } } } },
    "/alerts/stream": { get: { tags: ["Alerts"], summary: "SSE alert stream", description: "Server-Sent Events. Connect once, receive all new geofence alerts in real-time. 15s heartbeat.", responses: { 200: { description: "text/event-stream" } } } },

    // ── Notifications ──
    "/notifications/health": { get: { tags: ["Notifications"], summary: "Notification service health", responses: { 200: { description: "OK + count" } } } },
    "/notifications": {
      get: { tags: ["Notifications"], summary: "Notification log",
        parameters: [{ name: "n", in: "query", schema: { type: "integer", default: 100 } }],
        responses: { 200: { description: "Array of notifications" } } }
    },

    // ── Medicine ──
    "/medicine/health": { get: { tags: ["Medicine"], summary: "Medicine proxy health", responses: { 200: { description: "OK" } } } },
    "/medicine/{elderlyId}": {
      get: { tags: ["Medicine"], summary: "Get medicines for elderly",
        parameters: [{ name: "elderlyId", in: "path", required: true, schema: { type: "integer", example: 111 } }],
        responses: { 200: { description: "Array of medicines from OutSystems" } } }
    },
    "/medicine": {
      get: { tags: ["Medicine"], summary: "Get all medicines", responses: { 200: { description: "Array of all medicines" } } }
    },
    "/medicine/create": {
      post: { tags: ["Medicine"], summary: "Create medicine",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["Name", "ElderlyId"],
          properties: {
            Name: { type: "string", example: "Paracetamol" },
            ElderlyId: { type: "integer", example: 111 },
            ReminderTime: { type: "string", example: "08:00:00" },
            Stock: { type: "integer", example: 30 },
            Dose: { type: "integer", example: 1 },
            Instructions: { type: "string", example: "Take after meals" },
            IsActive: { type: "boolean", example: true },
            Day: { type: "string", example: "Mon,Wed,Fri" }
          }
        } } } },
        responses: { 200: { description: "Created" } } }
    },
    "/medicine/update": {
      put: { tags: ["Medicine"], summary: "Update medicine (restock, edit, deactivate)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["Name", "ElderlyId"],
          properties: {
            Name: { type: "string" }, ElderlyId: { type: "integer" },
            ReminderTime: { type: "string" }, Stock: { type: "integer" },
            Dose: { type: "integer" }, Instructions: { type: "string" },
            IsActive: { type: "boolean" }, Day: { type: "string" }
          }
        } } } },
        responses: { 200: { description: "Updated" } } }
    },
    "/medicine/delete": {
      delete: { tags: ["Medicine"], summary: "Delete medicine by ID",
        parameters: [{ name: "MedicineId", in: "query", required: true, schema: { type: "integer", example: 1 } }],
        responses: { 200: { description: "Deleted" } } }
    },
    "/medicine/notify": {
      post: { tags: ["Medicine"], summary: "Send medicine reminder (SMS + Email)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["elderlyId", "medicines"],
          properties: {
            elderlyId: { type: "integer", example: 111 },
            medicines: { type: "array", items: { type: "object", properties: {
              Name: { type: "string" }, Dose: { type: "integer" },
              ReminderTime: { type: "string" }, Instructions: { type: "string" }
            } } }
          }
        } } } },
        responses: { 200: { description: "{ sms: {...}, email: {...} }" } } }
    }
  }
};

// GET /api-docs — JSON spec
router.get("/", (_req, res) => res.json(spec));

// GET /api-docs/ui — Swagger UI
router.get("/ui", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html><head>
<title>ElderWatch API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/api-docs", dom_id: "#swagger-ui", deepLinking: true, defaultModelsExpandDepth: -1 });</script>
</body></html>`);
});

export default router;
