import express from "express";
import { getAlerts, getLatestAlert, getAlertCount } from "../store/alertStore.js";
import { getSseClients } from "../services/alertListener.js";

const router = express.Router();

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "alert-service", alertCount: getAlertCount().total })
);

// GET /alerts?n=&type=&since=
router.get("/", (req, res) => {
  const n = parseInt(req.query.n, 10) || 100;
  const type = req.query.type;
  const since = parseInt(req.query.since, 10) || 0;
  res.json(getAlerts({ n, type, since }));
});

// GET /alerts/latest
router.get("/latest", (_req, res) => {
  const alert = getLatestAlert();
  if (!alert) return res.status(404).json({ error: "No alerts yet" });
  res.json(alert);
});

// GET /alerts/count
router.get("/count", (_req, res) => {
  res.json(getAlertCount());
});

// GET /alerts/stream — Server-Sent Events
router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch (_) { clearInterval(heartbeat); }
  }, 15000);

  const clients = getSseClients();
  clients.add(res);
  console.log(`[AlertSvc] SSE client connected (active: ${clients.size})`);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`[AlertSvc] SSE client disconnected (active: ${clients.size})`);
  });
});

export default router;
