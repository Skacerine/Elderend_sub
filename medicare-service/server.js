import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4001;

const MEDICINE_BASE_URL =
  "https://personal-s93qqbah.outsystemscloud.com/ManageMedicine/rest/Medicine";
const ELDERLY_BASE =
  process.env.ELDERLY_SERVICE_URL ||
  "https://qmo.outsystemscloud.com/ElderlyServices/rest/Elderly";
const GUARDIAN_BASE =
  process.env.GUARDIAN_SERVICE_URL ||
  "https://qmo.outsystemscloud.com/GuardianServices/rest/Guardian";

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      return cb(null, true); // allow all for local demo
    },
    credentials: true,
  })
);
app.use(express.json());

// ── Health ──
app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "medicare-service" })
);

// ═══════════════════════════════════════
//  Medicine Routes (proxy to OutSystems)
// ══════════════════════════════════════��

app.get("/medicine/health", (_req, res) =>
  res.json({ status: "online", service: "medicare-medicine-proxy" })
);

// GET /medicine/:elderlyId
app.get("/medicine/:elderlyId", async (req, res) => {
  try {
    const response = await fetch(
      `${MEDICINE_BASE_URL}/medicine/${req.params.elderlyId}/`,
      { headers: { Accept: "application/json" } }
    );
    if (response.status === 404) return res.json([]);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }
    res.json(await response.json());
  } catch (e) {
    console.error("[Medicine] Fetch failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// POST /medicine/create
app.post("/medicine/create", async (req, res) => {
  try {
    const payload = {
      Name: String(req.body.Name || ""),
      ElderlyId: Number(req.body.ElderlyId) || 1,
      ReminderTime: String(req.body.ReminderTime || "08:00:00"),
      Quantity: Number(req.body.Quantity) || 0,
      Dose: Number(req.body.Dose) || 1,
      Instructions: String(req.body.Instructions || ""),
      IsActive: true,
      Day: String(req.body.Day || ""),
    };
    console.log("[Medicine] Creating:", JSON.stringify(payload));
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    console.log("[Medicine] Create response:", response.status, text);
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).json({ result: text }); }
  } catch (e) {
    console.error("[Medicine] Create failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// PUT /medicine/update
app.put("/medicine/update", async (req, res) => {
  try {
    const payload = {
      Id: Number(req.body.Id),
      Name: String(req.body.Name || ""),
      ElderlyId: Number(req.body.ElderlyId) || 1,
      Dose: Number(req.body.Dose) || 1,
      Instructions: String(req.body.Instructions || ""),
      IsActive: req.body.IsActive !== undefined ? req.body.IsActive : true,
    };
    if (req.body.Day !== undefined) payload.Day = String(req.body.Day);
    if (req.body.ReminderTime !== undefined) payload.ReminderTime = String(req.body.ReminderTime);
    if (req.body.Quantity !== undefined) payload.Quantity = Number(req.body.Quantity);
    console.log("[Medicine] Updating:", JSON.stringify(payload));
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    console.log("[Medicine] Update response:", response.status, text);
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).json({ result: text }); }
  } catch (e) {
    console.error("[Medicine] Update failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// PUT /medicine/stock
app.put("/medicine/stock", async (req, res) => {
  try {
    const payload = {
      MedicineId: Number(req.body.MedicineId),
      Quantity: Number(req.body.Quantity) || 0,
    };
    const response = await fetch(`${MEDICINE_BASE_URL}/stock/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).json({ result: text }); }
  } catch (e) {
    console.error("[Medicine] Stock update failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
//  Auth Routes (login only — needed to access Medicare)
// ═══════════════════════════════════════

app.post("/auth/login/guardian", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password)
    return res.status(400).json({ success: false, message: "Phone and password required" });
  try {
    const response = await fetch(`${GUARDIAN_BASE}/LoginGuardian`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guardian_contact: phone, password }),
    });
    const data = await response.json();
    console.log("[Auth] Guardian login:", JSON.stringify(data));
    if (data.success) {
      return res.json({
        success: true,
        guardianId: data.guardian_id,
        elderlyId: data.elderly_id,
        name: data.guardian_name,
      });
    }
    return res.status(401).json({ success: false, message: data.message || "Invalid credentials" });
  } catch (e) {
    console.error("[Auth] Login failed:", e.message);
    res.status(500).json({ success: false, message: "Login service unavailable" });
  }
});

app.post("/auth/login/elderly", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password)
    return res.status(400).json({ success: false, message: "Phone and password required" });
  try {
    const response = await fetch(`${ELDERLY_BASE}/LoginElderly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elderly_contact: phone, password }),
    });
    const data = await response.json();
    if (data.success) {
      return res.json({
        success: true,
        elderlyId: data.elderly_id,
        name: data.elderly_name,
      });
    }
    return res.status(401).json({ success: false, message: data.message || "Invalid credentials" });
  } catch (e) {
    console.error("[Auth] Elderly login failed:", e.message);
    res.status(500).json({ success: false, message: "Login service unavailable" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Medicare service listening on port ${PORT}`);
});
