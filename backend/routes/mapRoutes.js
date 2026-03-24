import express from "express";
import { getLatestCoordinate, getCoordinateHistory } from "../store/coordinateStore.js";

const router = express.Router();

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "map-display-service" })
);

// GET /drawmap/:elderlyId — latest position for map rendering
router.get("/:elderlyId", (req, res) => {
  const entry = getLatestCoordinate(req.params.elderlyId);
  if (!entry) return res.status(404).json({ error: "Map display unavailable", details: "No data yet" });
  res.json(entry);
});

// GET /drawmap/:elderlyId/history — trail polyline data
router.get("/:elderlyId/history", (req, res) => {
  const n = parseInt(req.query.n, 10) || 50;
  const entries = getCoordinateHistory(req.params.elderlyId, n);
  const trail = entries.map(e => ({
    lat: e.lat,
    lng: e.lng,
    timestamp: e.timestamp,
    status: e.status
  }));
  res.json(trail);
});

export default router;
