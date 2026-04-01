import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import motionRoutes from "./routes/motionRoutes.js";
import gpsRoutes from "./routes/gpsRoutes.js";
import elderlyLogRoutes from "./routes/elderlyLogRoutes.js";
import mapRoutes from "./routes/mapRoutes.js";
import statusRoutes from "./routes/statusRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import notifyRoutes from "./routes/notifyRoutes.js";
import medicineRoutes from "./routes/medicineRoutes.js";
import apiDocsRoutes from "./routes/apiDocsRoutes.js";
import externalAlertRoutes from "./routes/externalAlertRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { setWebSocketServer } from "./services/incidentService.js";
import { initAlertListeners } from "./services/alertListener.js";

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://guardianphonedropper.vercel.app",
  "https://phonedropper9000-xi.vercel.app",
  process.env.GUARDIAN_UI_URL,
  process.env.PHONE_PWA_URL
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, Postman, curl)
      if (!origin) return callback(null, true);
      // Allow listed frontends
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow OutSystems domains
      if (origin.includes("outsystemscloud.com") || origin.includes("outsystemsenterprise.com")) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "drop-detection-backend",
    allowedOrigins
  });
});

// Existing routes
app.use("/motion", motionRoutes);

// ElderWatch routes (ported microservices)
app.use("/gps", gpsRoutes);
app.use("/elderlylog", elderlyLogRoutes);
app.use("/drawmap", mapRoutes);
app.use("/status", statusRoutes);
app.use("/alerts", alertRoutes);
app.use("/notifications", notifyRoutes);
app.use("/medicine", medicineRoutes);
app.use("/api-docs", apiDocsRoutes);
app.use("/external", externalAlertRoutes);
app.use("/auth", authRoutes);

// Initialize geofence event listeners (replaces RabbitMQ consumers)
initAlertListeners();

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

setWebSocketServer(wss);

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "system",
      data: { message: "Connected to drop alert stream" }
    })
  );
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on port ${PORT}`);
});
