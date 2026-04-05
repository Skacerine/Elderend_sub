import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4003;
const MEDICINE_BASE_URL = process.env.MEDICINE_BASE_URL || "https://personal-s93qqbah.outsystemscloud.com/ManageMedicine/rest/Medicine";
const NOTIFICATION_BASE_URL = process.env.NOTIFICATION_BASE_URL || "https://smuedu-dev.outsystemsenterprise.com/SMULab_Notification/rest/Notification";
const ELDERLY_BASE_URL = process.env.ELDERLY_SERVICE_URL || "https://qmo.outsystemscloud.com/ElderlyServices/rest/Elderly";
const ALERT_MS_URL = process.env.ALERT_MS_URL || "http://alert_ms:4002";

app.use(cors());
app.use(express.json());

// In-memory schedule overrides
const scheduleOverrides = {};

app.get("/health", (_req, res) => res.json({ status: "online", service: "medicine-ms" }));
app.get("/medicine/health", (_req, res) => res.json({ status: "online", service: "medicine-ms" }));

// Schedule overrides
app.get("/medicine/schedules", (_req, res) => res.json(scheduleOverrides));
app.put("/medicine/schedules/:medicineId", (req, res) => {
  const { medicineId } = req.params;
  const { days } = req.body;
  if (!Array.isArray(days)) return res.status(400).json({ error: "days must be an array" });
  scheduleOverrides[medicineId] = days;
  console.log(`[Medicine] Schedule override: med ${medicineId} → ${days.join(",")}`);
  res.json({ ok: true });
});

// GET /medicine/:elderlyId
app.get("/medicine/:elderlyId", async (req, res) => {
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/${req.params.elderlyId}/`, { headers: { Accept: "application/json" } });
    if (response.status === 404 || response.status === 500) return res.json([]);
    if (!response.ok) { const text = await response.text(); return res.status(response.status).json({ error: text }); }
    res.json(await response.json());
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// GET /medicine (all)
app.get("/medicine", async (_req, res) => {
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicines/`, { headers: { Accept: "application/json" } });
    if (response.status === 404) return res.json([]);
    if (!response.ok) { const text = await response.text(); return res.status(response.status).json({ error: text }); }
    res.json(await response.json());
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// DELETE /medicine/delete
app.delete("/medicine/delete", async (req, res) => {
  const { MedicineId } = req.query;
  if (!MedicineId) return res.status(400).json({ error: "MedicineId query param required" });
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine?MedicineId=${MedicineId}`, { method: "DELETE", headers: { Accept: "application/json" } });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).json({ result: text || "deleted" }); }
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// POST /medicine/create
app.post("/medicine/create", async (req, res) => {
  try {
    const payload = {
      Id: 0, Name: String(req.body.Name || ""), ElderlyId: Number(req.body.ElderlyId),
      ReminderTime: String(req.body.ReminderTime || "08:00:00").split(":").length === 2 ? String(req.body.ReminderTime) + ":00" : String(req.body.ReminderTime || "08:00:00"),
      Quantity: Number(req.body.Quantity) || 0, Dose: Number(req.body.Dose) || 1,
      Instructions: String(req.body.Instructions || ""), IsActive: true, Day: String(req.body.Day || "")
    };
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).json({ result: text }); }
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// PUT /medicine/update
app.put("/medicine/update", async (req, res) => {
  try {
    const payload = { Id: Number(req.body.Id), Name: String(req.body.Name || ""), ElderlyId: Number(req.body.ElderlyId), Dose: Number(req.body.Dose) || 1, Instructions: String(req.body.Instructions || ""), IsActive: req.body.IsActive !== undefined ? req.body.IsActive : true };
    if (req.body.Day !== undefined) payload.Day = String(req.body.Day);
    if (req.body.ReminderTime !== undefined) payload.ReminderTime = String(req.body.ReminderTime);
    if (req.body.Quantity !== undefined) payload.Quantity = Number(req.body.Quantity);
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/`, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).json({ result: text }); }
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// PUT /medicine/stock
app.put("/medicine/stock", async (req, res) => {
  try {
    const payload = { MedicineId: Number(req.body.MedicineId), Quantity: Number(req.body.Quantity) || 0 };
    const response = await fetch(`${MEDICINE_BASE_URL}/stock/`, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).json({ result: text }); }
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// POST /medicine/schedule
app.post("/medicine/schedule", async (req, res) => {
  try {
    const payload = { MedicineId: Number(req.body.MedicineId), Day: String(req.body.Day), ReminderTime: String(req.body.ReminderTime || "08:00:00").split(":").length === 2 ? String(req.body.ReminderTime) + ":00" : String(req.body.ReminderTime || "08:00:00") };
    const response = await fetch(`${MEDICINE_BASE_URL}/schedule/`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); } catch { res.status(response.status).json({ result: text }); }
  } catch (e) { res.status(503).json({ error: e.message }); }
});

// POST /medicine/notify — sends reminder SMS directly via SMU Lab API
// Also checks stock levels and alerts guardian via Alert Dashboard if low
app.post("/medicine/notify", async (req, res) => {
  const { elderlyId, medicines } = req.body;
  if (!medicines || !medicines.length) return res.status(400).json({ error: "No medicines provided" });

  // Step 6: Format SMS message
  const smsMessage = `[ElderWatch] Medicine reminder for Elderly ${elderlyId}:\n${medicines.map(m => `- ${m.Name} (${Number(m.Dose) || 1} dose) at ${m.ReminderTime || "N/A"}`).join("\n")}\nPlease ensure medicines are taken on time.`;

  // Step 7-8: If inventory running low, get GuardianID from Elderly atomic service
  let guardianId = null;
  const lowStockMeds = medicines.filter(m => (Number(m.Stock || m.Quantity) || 0) <= 5);
  if (lowStockMeds.length > 0) {
    try {
      const elderlyRes = await fetch(`${ELDERLY_BASE_URL}/GetElderly?elderly_id=${elderlyId}`, { headers: { Accept: "application/json" } });
      if (elderlyRes.ok) {
        const elderlyData = await elderlyRes.json();
        guardianId = elderlyData.guardian_id || elderlyData.GuardianId;
        console.log(`[Medicine] Fetched GuardianID ${guardianId} from Elderly service for low stock alert`);
      }
    } catch (e) { console.error("[Medicine] Failed to fetch Elderly info:", e.message); }
  }

  // Step 9a: Notify Guardian via SMS (direct call to SMU Lab Utilities SMS API)
  let smsResult = null;
  try {
    const smsRes = await fetch(`${NOTIFICATION_BASE_URL}/SendSMS`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: req.body.guardianPhone || process.env.DEFAULT_GUARDIAN_PHONE || "+6592369965", message: smsMessage })
    });
    smsResult = await smsRes.json();
    console.log("[Medicine] SMS sent:", smsResult);
  } catch (e) {
    console.error("[Medicine] SMS failed:", e.message);
    smsResult = { status: "error", error: e.message };
  }

  // Step 9b: If low stock, notify Guardian via Alert Dashboard (alert_ms)
  let alertResult = null;
  if (lowStockMeds.length > 0) {
    const lowStockNames = lowStockMeds.map(m => `${m.Name} (${Number(m.Stock || m.Quantity) || 0} left)`).join(", ");
    try {
      const alertRes = await fetch(`${ALERT_MS_URL}/external/alert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elderly_id: elderlyId, text: `Low stock alert: ${lowStockNames}. Please restock soon.` })
      });
      alertResult = await alertRes.json();
      console.log("[Medicine] Alert Dashboard notified for low stock:", alertResult);
    } catch (e) {
      console.error("[Medicine] Alert Dashboard notification failed:", e.message);
      alertResult = { status: "error", error: e.message };
    }
  }

  res.json({ sms: smsResult, alert: alertResult, lowStockMeds: lowStockMeds.map(m => m.Name) });
});

app.listen(PORT, "0.0.0.0", () => console.log(`medicine_ms listening on port ${PORT}`));
