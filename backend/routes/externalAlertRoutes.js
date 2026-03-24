import express from "express";
import { createIncident } from "../services/incidentService.js";
import { getElderlyLocation } from "../services/locationService.js";
import { sendFallAlertNotifications } from "../services/notificationService.js";

const router = express.Router();

// POST /external/alert
// Receives alerts from external systems (e.g. OutSystems)
// Body: { elderly_id, text }
// Triggers: incident creation, WebSocket broadcast, SMS + email
router.post("/alert", async (req, res) => {
  const { elderly_id, text } = req.body;

  if (!elderly_id) {
    return res.status(400).json({ error: "elderly_id is required" });
  }

  const alertText = text || "External alert received";

  // Create incident (triggers WebSocket broadcast to all guardian pages)
  const incident = createIncident({
    elderlyId: elderly_id,
    deviceId: "OUTSYSTEMS",
    features: {},
    severity: "FALLEN",
    score: 100
  });

  // Override the default message with the external text
  incident.message = alertText;

  // Get real location if available from ElderWatch
  const location = getElderlyLocation(elderly_id);

  // Send SMS + email (fire and forget)
  sendFallAlertNotifications({
    elderlyId: elderly_id,
    address: location.address || "",
    latitude: location.latitude,
    longitude: location.longitude,
    score: 100,
    severity: "FALLEN",
    timestamp: new Date().toISOString()
  }).catch(err => console.error("[ExternalAlert] Notification error:", err.message));

  console.log(`[ExternalAlert] Alert from OutSystems — elderly_id: ${elderly_id}, text: ${alertText}`);

  res.json({
    success: true,
    incident,
    message: "Alert triggered — guardian notified via WebSocket, SMS, and email"
  });
});

export default router;
