import express from "express";
import { getLatestCoordinate, getAllTracked } from "../store/coordinateStore.js";

const router = express.Router();

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "status-service" })
);

// GET /status/all — all tracked elderly (must be before /:elderlyId)
router.get("/all", (_req, res) => {
  res.json(getAllTracked());
});

// GET /status/:elderlyId — full status with computed fields
router.get("/:elderlyId", (req, res) => {
  const d = getLatestCoordinate(req.params.elderlyId);
  if (!d) return res.status(404).json({ error: "Status unavailable", service: "status-service" });
  res.json({
    ...d,
    isHome: d.status === "Home",
    isSafe: d.status === "Home",
    distanceLabel: d.distance != null ? `${d.distance}m` : "Unknown",
    lastSeenAge: d.timestamp ? Math.round((Date.now() - d.timestamp) / 1000) + "s ago" : "Never",
    service: "status-service"
  });
});

// GET /status/:elderlyId/summary — lightweight badge status
router.get("/:elderlyId/summary", (req, res) => {
  const d = getLatestCoordinate(req.params.elderlyId);
  if (!d) return res.status(503).json({ error: "Unavailable" });
  const { elderlyId, status, distance, timestamp } = d;
  res.json({ elderlyId, status, distance, timestamp });
});

export default router;
