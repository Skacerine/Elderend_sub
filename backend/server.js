import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import motionRoutes from "./routes/motionRoutes.js";
import { setWebSocketServer } from "./services/incidentService.js";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "drop-detection-backend" });
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

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
