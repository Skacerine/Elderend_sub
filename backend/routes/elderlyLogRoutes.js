import express from "express";
import {
  addCoordinateEntry,
  getCoordinateHistory,
  getLatestCoordinate,
  getAllTracked,
  clearHistory,
  getStats
} from "../store/coordinateStore.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  const stats = getStats();
  res.json({ status: "online", service: "logging-service", ...stats });
});

// POST /elderlylog/:id — add new coordinate entry
router.post("/:id", (req, res) => {
  const entry = addCoordinateEntry(req.params.id, req.body);
  res.status(201).json(entry);
});

// GET /elderlylog/all — latest entry per elderly (must be before /:id)
router.get("/all", (_req, res) => {
  res.json(getAllTracked());
});

// GET /elderlylog/:id — paginated history
router.get("/:id", (req, res) => {
  const n = parseInt(req.query.n, 10) || 60;
  res.json(getCoordinateHistory(req.params.id, n));
});

// GET /elderlylog/:id/latest — single latest entry
router.get("/:id/latest", (req, res) => {
  const entry = getLatestCoordinate(req.params.id);
  if (!entry) return res.status(404).json({ error: `No data for ${req.params.id} — awaiting first GPS push` });
  res.json(entry);
});

// DELETE /elderlylog/:id — clear history
router.delete("/:id", (req, res) => {
  clearHistory(req.params.id);
  res.json({ success: true, cleared: req.params.id });
});

export default router;
