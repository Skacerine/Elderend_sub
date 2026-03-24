// Subscribes to geofence events via EventBus (replaces RabbitMQ consumers)
import eventBus from "../store/eventBus.js";
import { addAlert } from "../store/alertStore.js";
import { addNotification } from "../store/notificationStore.js";

// SSE clients for real-time push
const sseClients = new Set();

export function getSseClients() {
  return sseClients;
}

function pushToSSE(alert) {
  const payload = `data: ${JSON.stringify(alert)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) { sseClients.delete(res); }
  }
}

function buildMessage(routingKey, data) {
  const time = new Date(data.timestamp).toLocaleTimeString("en-SG", { hour12: false });
  if (routingKey === "geofence.left") {
    return `ALERT: ${data.elderlyId} LEFT home zone at ${time}. ` +
      `Location: ${data.address} (${data.distance}m from home). ` +
      `Coords: ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`;
  }
  return `SAFE: ${data.elderlyId} RETURNED HOME at ${time}. ` +
    `Location: ${data.address}`;
}

export function initAlertListeners() {
  // Alert Service listener
  eventBus.on("geofence.left", (data) => {
    const alert = addAlert({
      ...data,
      type: "left",
      alertType: "VIBRATE+RINGTONE"
    });
    pushToSSE(alert);
    console.log(`[AlertSvc] Device alert: LEFT — ${data.elderlyId} @ ${data.address}`);
  });

  eventBus.on("geofence.entered", (data) => {
    const alert = addAlert({
      ...data,
      type: "entered",
      alertType: "CHIME"
    });
    pushToSSE(alert);
    console.log(`[AlertSvc] Device alert: ENTERED — ${data.elderlyId} @ ${data.address}`);
  });

  // Notify Guardian listener
  eventBus.on("geofence.left", (data) => {
    const notif = addNotification({
      routingKey: "geofence.left",
      type: "left",
      to: data.guardianId,
      channel: "SMS",
      message: buildMessage("geofence.left", data),
      payload: data
    });
    console.log(`[NotifyGuardian] SMS -> ${notif.to}: ${notif.message}`);
  });

  eventBus.on("geofence.entered", (data) => {
    const notif = addNotification({
      routingKey: "geofence.entered",
      type: "entered",
      to: data.guardianId,
      channel: "SMS",
      message: buildMessage("geofence.entered", data),
      payload: data
    });
    console.log(`[NotifyGuardian] SMS -> ${notif.to}: ${notif.message}`);
  });

  console.log("[AlertListener] Geofence event listeners initialized");
}
