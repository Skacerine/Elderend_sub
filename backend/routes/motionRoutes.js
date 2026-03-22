import express from "express";
import { scoreDropRisk } from "../services/dropDetectionService.js";
import { createIncident } from "../services/incidentService.js";
import { getIncidents, getLatestIncidentByElderlyId } from "../store/incidentStore.js";

const router = express.Router();

router.post("/sample", (req, res) => {
  const { elderlyId, deviceId, timestamp, features } = req.body || {};

  if (!elderlyId || !deviceId || !features) {
    return res.status(400).json({
      error: "elderlyId, deviceId, and features are required"
    });
  }

  const result = scoreDropRisk(features);

  if (result.detected) {
    const incident = createIncident({
      elderlyId,
      deviceId,
      features,
      severity: result.severity,
      score: result.score
    });

    return res.json({
      detected: true,
      incident,
      timestampReceived: timestamp || new Date().toISOString()
    });
  }

  return res.json({
    detected: false,
    score: result.score,
    severity: result.severity,
    timestampReceived: timestamp || new Date().toISOString()
  });
});

router.post("/simulate-drop", (req, res) => {
  const { elderlyId = "E001", deviceId = "PHONE_01" } = req.body || {};

  const features = {
    minAcceleration: 1.1,
    peakAcceleration: 25.4,
    peakRotationRate: 320,
    postImpactStillnessMs: 3500
  };

  const incident = createIncident({
    elderlyId,
    deviceId,
    features,
    severity: "HIGH",
    score: 100
  });

  res.json({ detected: true, incident });
});

router.get("/incidents", (req, res) => {
  res.json(getIncidents());
});

router.get("/incidents/latest/:elderlyId", (req, res) => {
  const incident = getLatestIncidentByElderlyId(req.params.elderlyId);
  res.json(incident);
});

export default router;
