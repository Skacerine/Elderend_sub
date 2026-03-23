import express from "express";
import { scoreDropRisk } from "../services/dropDetectionService.js";
import { createIncident } from "../services/incidentService.js";
import { getIncidents, getLatestIncidentByElderlyId } from "../store/incidentStore.js";
import { postElderlyLogToOutSystems } from "../services/outsystemsService.js";

const router = express.Router();

router.post("/sample", async (req, res) => {
  const {
    elderlyId,
    deviceId,
    timestamp,
    features,
    latitude,
    longitude,
    address,
    guardianId
  } = req.body || {};

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

    try {
      await postElderlyLogToOutSystems({
        elderlyId,
        guardianId,
        latitude,
        longitude,
        address,
        status: result.severity,
        timestamp: timestamp || new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to sync incident to OutSystems:", error.message);
    }

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

router.post("/simulate-drop", async (req, res) => {
  const {
    elderlyId = 1234567891234567,
    guardianId = 1234567891234567,
    deviceId = "PHONE_01",
    latitude = 1.2966,
    longitude = 103.8502,
    address = "Tanjong Pagar, Singapore"
  } = req.body || {};

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
    severity: "FALLEN",
    score: 100
  });

  try {
    const outsystemsResponse = await postElderlyLogToOutSystems({
      elderlyId,
      guardianId,
      latitude,
      longitude,
      address,
      status: "FALLEN",
      timestamp: new Date().toISOString()
    });

    return res.json({
      detected: true,
      incident,
      outsystemsResponse
    });
  } catch (error) {
    console.error("Failed to sync simulated incident to OutSystems:", error.message);

    return res.status(500).json({
      detected: true,
      incident,
      outsystemsError: error.message
    });
  }
});

router.get("/incidents", (_req, res) => {
  res.json(getIncidents());
});

router.get("/incidents/latest/:elderlyId", (req, res) => {
  const incident = getLatestIncidentByElderlyId(req.params.elderlyId);
  res.json(incident);
});

export default router;
