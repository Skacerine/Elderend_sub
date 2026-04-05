import express from "express";
import cors from "cors";
import amqplib from "amqplib";

const app = express();
const PORT = process.env.PORT || 4005;
const NOTIFICATION_BASE_URL = process.env.NOTIFICATION_BASE_URL || "https://smuedu-dev.outsystemsenterprise.com/SMULab_Notification/rest/Notification";
const AMQP_URL = process.env.AMQP_URL || "amqp://guest:guest@rabbitmq:5672";

app.use(cors());
app.use(express.json());

// ── In-memory state ──
let guardianPhone = process.env.DEFAULT_GUARDIAN_PHONE || "+6592369965";
let guardianEmail = process.env.DEFAULT_GUARDIAN_EMAIL || "alec.ong.2024@computing.smu.edu.sg";

const notifications = [];
const MAX = 200;

function addNotification(notif) {
  const entry = { ...notif, sentAt: Date.now(), _id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  notifications.unshift(entry);
  if (notifications.length > MAX) notifications.length = MAX;
  return entry;
}

// ── SMS + Email helpers ──
function buildGeofenceSmsMessage(data) {
  const time = new Date(data.timestamp).toLocaleTimeString("en-SG", { hour12: false });
  if (data.type === "left" || data.routingKey === "geofence.left") {
    return `ALERT: Elderly ${data.elderlyId} LEFT home zone at ${time}. Location: ${data.address} (${data.distance}m from home). Coords: ${data.lat?.toFixed(5)}, ${data.lng?.toFixed(5)}`;
  }
  return `SAFE: Elderly ${data.elderlyId} RETURNED HOME at ${time}. Location: ${data.address}`;
}

function buildFallSmsMessage({ elderlyId, address, latitude, longitude, score, timestamp }) {
  const time = new Date(timestamp).toLocaleTimeString("en-SG", { hour12: false });
  const loc = address || (latitude != null ? `${latitude}, ${longitude}` : "Unknown");
  return `[ElderWatch] Fall detected for Elderly ${elderlyId} at ${time}. Location: ${loc}. Score: ${score}. Check immediately.`;
}

function buildFallEmailBody({ elderlyId, address, latitude, longitude, score, severity, timestamp, features }) {
  const time = new Date(timestamp).toLocaleString("en-SG", { hour12: false });
  const coords = latitude != null && longitude != null ? `${latitude}, ${longitude}` : "Unavailable";
  const mapsLink = latitude != null && longitude != null ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;
  let body = `<h2>&#x1F6A8; Fall Detected</h2>`;
  body += `<p><i>Immediate attention may be required</i></p><hr>`;
  body += `<p><b>Elderly ID:</b> ${elderlyId}</p>`;
  body += `<p><b>Time:</b> ${time}</p>`;
  body += `<p><b>Risk Score:</b> ${score ?? "N/A"}</p>`;
  body += `<p><b>Severity:</b> ${severity ?? "FALLEN"}</p>`;
  body += `<p><b>Address:</b> ${address || "Unknown"}</p>`;
  body += `<p><b>Coordinates:</b> ${coords}</p>`;
  if (features) {
    body += `<hr><p><b>Peak Acceleration:</b> ${features.peakAcceleration ?? "N/A"}</p>`;
    body += `<p><b>Peak Rotation:</b> ${features.peakRotationRate ?? "N/A"}</p>`;
    body += `<p><b>Post-Impact Stillness:</b> ${features.postImpactStillnessMs ?? "N/A"} ms</p>`;
  }
  if (mapsLink) body += `<hr><p><b>Google Maps:</b> ${mapsLink}</p>`;
  body += `<hr><p><b>Please check on the elderly person immediately.</b></p>`;
  body += `<p><small>ElderWatch Guardian Alert System</small></p>`;
  return body;
}

async function sendSMS(message) {
  try {
    const response = await fetch(`${NOTIFICATION_BASE_URL}/SendSMS`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: guardianPhone, message })
    });
    const result = await response.json();
    console.log(`[Notification] SMS sent to ${guardianPhone}:`, result);
    return result;
  } catch (error) {
    console.error(`[Notification] SMS failed:`, error.message);
    return { status: "error", error: error.message };
  }
}

async function sendEmail(subject, body) {
  try {
    const response = await fetch(`${NOTIFICATION_BASE_URL}/SendEmail`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailAddress: guardianEmail, emailSubject: subject, emailBody: body })
    });
    const result = await response.json();
    console.log(`[Notification] Email sent to ${guardianEmail}:`, result);
    return result;
  } catch (error) {
    console.error(`[Notification] Email failed:`, error.message);
    return { status: "error", error: error.message };
  }
}

// ── RabbitMQ consumer ──
async function connectRabbitMQ() {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const conn = await amqplib.connect(AMQP_URL);
      const ch = await conn.createChannel();
      const exchange = "elderwatch.geofence";
      await ch.assertExchange(exchange, "topic", { durable: true });

      // Queue for Notify Guardian (SMS)
      const q1 = await ch.assertQueue("notify_guardian", { durable: true });
      await ch.bindQueue(q1.queue, exchange, "geofence.*");
      ch.consume(q1.queue, async (msg) => {
        if (!msg) return;
        try {
          const data = JSON.parse(msg.content.toString());
          console.log(`[AMQP] Received geofence event: ${msg.fields.routingKey}`, data);
          const smsMessage = buildGeofenceSmsMessage({ ...data, routingKey: msg.fields.routingKey });
          await sendSMS(smsMessage);
          addNotification({ routingKey: msg.fields.routingKey, type: data.type, to: data.guardianId, channel: "SMS", message: smsMessage, payload: data });
        } catch (e) { console.error("[AMQP] Handler error:", e.message); }
        ch.ack(msg);
      });

      // Queue for Alert (Vibrate + Ringtone on elderly device)
      const q2 = await ch.assertQueue("alert_elderly_device", { durable: true });
      await ch.bindQueue(q2.queue, exchange, "geofence.*");
      ch.consume(q2.queue, async (msg) => {
        if (!msg) return;
        try {
          const data = JSON.parse(msg.content.toString());
          console.log(`[AMQP] Alert device: ${msg.fields.routingKey}`, data);
          addNotification({ routingKey: msg.fields.routingKey, type: data.type, to: data.elderlyId, channel: "DEVICE_ALERT", message: data.type === "left" ? "VIBRATE+RINGTONE" : "CHIME", payload: data });
        } catch (e) { console.error("[AMQP] Alert handler error:", e.message); }
        ch.ack(msg);
      });

      console.log("[AMQP] Connected to RabbitMQ, consuming geofence events");
      conn.on("error", (err) => console.error("[AMQP] Connection error:", err.message));
      conn.on("close", () => { console.log("[AMQP] Connection closed, reconnecting..."); setTimeout(connectRabbitMQ, 5000); });
      return;
    } catch (e) {
      console.log(`[AMQP] Connection attempt ${i + 1}/${maxRetries} failed: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error("[AMQP] Failed to connect after retries");
}

// ── HTTP Routes ──
app.get("/health", (_req, res) => res.json({ status: "online", service: "notification-ms", count: notifications.length }));

app.get("/notifications", (req, res) => {
  const n = parseInt(req.query.n, 10) || 100;
  res.json(notifications.slice(0, n));
});

app.get("/notifications/health", (_req, res) => res.json({ status: "online", service: "notification-ms", count: notifications.length }));

// Settings
app.get("/settings/notifications", (_req, res) => res.json({ phone: guardianPhone, email: guardianEmail }));
app.put("/settings/notifications", (req, res) => {
  if (req.body.phone) guardianPhone = req.body.phone;
  if (req.body.email) guardianEmail = req.body.email;
  res.json({ phone: guardianPhone, email: guardianEmail });
});

// Internal endpoint for fall alert notifications (called by alert_ms)
app.post("/internal/send-fall-alert", async (req, res) => {
  const alertData = req.body;
  const smsMessage = alertData._overrideMessage || buildFallSmsMessage(alertData);
  const emailSubject = alertData._overrideEmail?.subject || `[ALERT] Fall Detected — Elderly ${alertData.elderlyId}`;
  const emailBody = alertData._overrideEmail?.body || buildFallEmailBody(alertData);
  const [smsResult, emailResult] = await Promise.allSettled([sendSMS(smsMessage), sendEmail(emailSubject, emailBody)]);
  res.json({
    sms: smsResult.status === "fulfilled" ? smsResult.value : { error: smsResult.reason?.message },
    email: emailResult.status === "fulfilled" ? emailResult.value : { error: emailResult.reason?.message }
  });
});

// Start
connectRabbitMQ();
app.listen(PORT, "0.0.0.0", () => console.log(`notification_ms listening on port ${PORT}`));
