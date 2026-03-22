import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import motionRoutes from "./routes/motionRoutes.js";
import { setWebSocketServer } from "./services/incidentService.js";

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
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
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

app.use("/motion", motionRoutes);

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
