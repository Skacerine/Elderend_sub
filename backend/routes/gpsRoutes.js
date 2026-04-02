import express from "express";
import { geocode } from "../services/coordinateService.js";
import { checkRadius } from "../services/radiusService.js";

const router = express.Router();

// ── Single elderly config ──
const HOME = { lat: 1.35305, lng: 103.94402 };

let position = { lat: HOME.lat, lng: HOME.lng, ts: Date.now() };

const meta = {
  elderlyId: 1,
  guardianId: 1,
  name: "Mdm Tan Ah Kow",
  home: HOME,
  radius: 500
};

// ── Simulation state ──
const simCfg = { mode: "standard", speed: 10, running: true };
let simTimer = null;

function intervalMs() {
  if (simCfg.mode === "always-on") return Math.max(150, Math.round(2000 / simCfg.speed));
  return Math.max(1000, Math.round(300000 / simCfg.speed));
}

// ── Push pipeline (direct function call instead of HTTP) ──
function push() {
  try {
    const address = geocode(position.lat, position.lng);
    checkRadius({
      elderlyId: meta.elderlyId,
      guardianId: meta.guardianId,
      lat: position.lat,
      lng: position.lng,
      address,
      timestamp: Date.now(),
      home: meta.home,
      radius: meta.radius
    });
    console.log(`[GPS] Pushed ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
  } catch (e) {
    console.error(`[GPS] Push failed: ${e.message}`);
  }
}

function restartTimer() {
  clearInterval(simTimer);
  if (!simCfg.running || simCfg.mode === "on-demand") return;
  const ms = intervalMs();
  simTimer = setInterval(push, ms);
  console.log(`[GPS] Timer set: ${ms}ms  mode=${simCfg.mode}  speed=${simCfg.speed}x`);
}

// ── Replay scenarios ──
const SCENARIOS = {
  "wander-alert": [
    { dLat: 0.001, dLng: 0.001 }, { dLat: 0.002, dLng: 0.002 },
    { dLat: 0.003, dLng: 0.003 }, { dLat: 0.004, dLng: 0.004 },
    { dLat: 0.004, dLng: 0.004 }, { dLat: 0.003, dLng: 0.003 },
    { dLat: 0.001, dLng: 0.001 }, { dLat: 0.000, dLng: 0.000 }
  ],
  "park-walk": [
    { dLat: 0.002, dLng: 0.001 }, { dLat: 0.003, dLng: 0.002 },
    { dLat: 0.002, dLng: 0.003 }, { dLat: 0.000, dLng: 0.004 },
    { dLat: -0.001, dLng: 0.003 }, { dLat: -0.002, dLng: 0.002 },
    { dLat: -0.003, dLng: 0.001 }, { dLat: -0.002, dLng: -0.001 },
    { dLat: 0.000, dLng: 0.000 }
  ],
  "hospital-visit": [
    { dLat: 0.005, dLng: 0.010 }, { dLat: 0.010, dLng: 0.014 },
    { dLat: 0.010, dLng: 0.014 }, { dLat: 0.010, dLng: 0.014 },
    { dLat: 0.007, dLng: 0.010 }, { dLat: 0.004, dLng: 0.006 },
    { dLat: 0.001, dLng: 0.002 }, { dLat: 0.000, dLng: 0.000 }
  ]
};

let replayTimer = null;
let replayActive = false;
let replayStep = 0;
let replayTotal = 0;
let replayScenario = "";

function stopReplay() {
  clearTimeout(replayTimer);
  replayActive = false;
}

function startReplay(scenarioName, stepMs) {
  stopReplay();
  const steps = SCENARIOS[scenarioName];
  if (!steps) return { error: `Unknown scenario: ${scenarioName}` };

  position = { lat: HOME.lat, lng: HOME.lng, ts: Date.now() };
  replayActive = true;
  replayScenario = scenarioName;
  replayStep = 0;
  replayTotal = steps.length;

  function tick() {
    if (!replayActive || replayStep >= steps.length) {
      replayActive = false;
      return;
    }
    const step = steps[replayStep];
    position = { lat: HOME.lat + step.dLat, lng: HOME.lng + step.dLng, ts: Date.now() };
    push();
    replayStep++;
    replayTimer = setTimeout(tick, stepMs);
  }

  replayTimer = setTimeout(tick, 500);
  console.log(`[GPS] Replay started: ${scenarioName}  steps=${steps.length}  stepMs=${stepMs}`);
  return { success: true, scenario: scenarioName, steps: steps.length, stepMs };
}

// ── Routes ──

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "gps-service", ...simCfg, intervalMs: intervalMs() })
);

router.get("/devicegps", (_req, res) =>
  res.json({ elderlyId: meta.elderlyId, name: meta.name, ...position })
);

router.post("/devicegps/position", (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number")
    return res.status(400).json({ error: "lat and lng numbers required" });
  stopReplay();
  position = { lat, lng, ts: Date.now() };
  push();
  res.json({ success: true, lat, lng });
});

router.post("/devicegps/move", (req, res) => {
  stopReplay();
  position.lat += Number(req.body.dLat || 0);
  position.lng += Number(req.body.dLng || 0);
  position.ts = Date.now();
  push();
  res.json({ success: true, ...position });
});

router.post("/devicegps/home", (_req, res) => {
  stopReplay();
  position = { lat: HOME.lat, lng: HOME.lng, ts: Date.now() };
  push();
  res.json({ success: true, ...position });
});

router.post("/devicegps/random", (_req, res) => {
  stopReplay();
  const ang = Math.random() * 2 * Math.PI;
  const d = 0.0018 + Math.random() * 0.006;
  position.lat += Math.cos(ang) * d;
  position.lng += Math.sin(ang) * d;
  position.ts = Date.now();
  push();
  res.json({ success: true, ...position });
});

router.post("/devicegps/push", (_req, res) => {
  push();
  res.json({ success: true });
});

router.post("/config", (req, res) => {
  const { mode, speed, elderlyId, guardianId } = req.body;
  if (mode) simCfg.mode = mode;
  if (speed != null) simCfg.speed = Math.max(1, Number(speed));
  if (elderlyId != null) meta.elderlyId = elderlyId;
  if (guardianId != null) meta.guardianId = guardianId;
  restartTimer();
  res.json({ success: true, ...simCfg, elderlyId: meta.elderlyId, intervalMs: intervalMs() });
});

router.get("/simconfig", (_req, res) =>
  res.json({ ...simCfg, intervalMs: intervalMs() })
);

router.post("/start", (_req, res) => {
  simCfg.running = true;
  push();
  restartTimer();
  res.json({ success: true, running: true, intervalMs: intervalMs() });
});

router.post("/stop", (_req, res) => {
  simCfg.running = false;
  clearInterval(simTimer);
  res.json({ success: true, running: false });
});

router.get("/replay/scenarios", (_req, res) =>
  res.json(Object.entries(SCENARIOS).map(([name, steps]) => ({ name, steps: steps.length })))
);

router.post("/replay/start", (req, res) => {
  const { scenario = "wander-alert", stepMs = 4000 } = req.body;
  const result = startReplay(scenario, Number(stepMs));
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

router.post("/replay/stop", (_req, res) => {
  stopReplay();
  res.json({ success: true });
});

router.get("/replay/status", (_req, res) =>
  res.json({
    active: replayActive,
    scenario: replayScenario,
    step: replayStep,
    total: replayTotal,
    progress: replayTotal ? Math.round((replayStep / replayTotal) * 100) : 0
  })
);

// Start the timer on import
push();
restartTimer();

export default router;