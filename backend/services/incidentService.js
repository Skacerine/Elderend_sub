import { addIncident } from "../store/incidentStore.js";
import { addAlert } from "../store/alertStore.js";

let wssRef = null;

export function setWebSocketServer(wss) {
  wssRef = wss;
}

export function createIncident({ elderlyId, deviceId, features, severity, score, message }) {
  const incident = {
    incidentId: `INC-${Date.now()}`,
    elderlyId,
    deviceId,
    type: "drop_alert",
    severity,
    score,
    timestamp: new Date().toISOString(),
    message: message || "Possible fall detected from device motion pattern.",
    features
  };

  addIncident(incident);
  addAlert({ ...incident, type: "drop_alert", receivedAt: incident.timestamp });
  broadcastIncident(incident);

  return incident;
}

export function broadcastIncident(incident) {
  if (!wssRef) return;

  const payload = JSON.stringify({
    type: "drop_alert",
    data: incident
  });

  wssRef.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}
