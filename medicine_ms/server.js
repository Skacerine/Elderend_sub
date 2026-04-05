import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4003;
const MEDICINE_BASE_URL = process.env.MEDICINE_BASE_URL || "https://personal-s93qqbah.outsystemscloud.com/ManageMedicine/rest/Medicine";
const NOTIFICATION_MS_URL = process.env.NOTIFICATION_MS_URL || "http://notification_ms:4005";

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

// POST /medicine/notify — sends reminder via notification_ms
app.post("/medicine/notify", async (req, res) => {
  const { elderlyId, medicines } = req.body;
  if (!medicines || !medicines.length) return res.status(400).json({ error: "No medicines provided" });
  const smsMessage = `[ElderWatch] Medicine reminder for Elderly ${elderlyId}:\n${medicines.map(m => `- ${m.Name} (${Number(m.Dose) || 1} dose) at ${m.ReminderTime || "N/A"}`).join("\n")}\nPlease ensure medicines are taken on time.`;
  let emailBody = `<h2>&#x1F48A; Medicine Reminder</h2><p>Daily medication schedule for Elderly ${elderlyId}</p><hr>`;
  medicines.forEach(m => { const dose = Number(m.Dose) || 1; emailBody += `<p><b>${m.Name}</b> — ${m.ReminderTime || "N/A"} — ${dose} dose${dose > 1 ? "s" : ""}</p>`; });
  const medsWithInstr = medicines.filter(m => m.Instructions);
  if (medsWithInstr.length) { emailBody += `<hr><h3>Instructions</h3>`; medsWithInstr.forEach(m => { emailBody += `<p><b>${m.Name}:</b> ${m.Instructions}</p>`; }); }
  emailBody += `<hr><p><b>Please ensure all medicines are taken on time today.</b></p><p><small>ElderWatch Medicine Reminder System</small></p>`;
  try {
    const r = await fetch(`${NOTIFICATION_MS_URL}/internal/send-fall-alert`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elderlyId, severity: "MEDICINE", score: "N/A", address: "N/A", latitude: null, longitude: null, timestamp: new Date().toISOString(), _overrideMessage: smsMessage, _overrideEmail: { subject: `[Reminder] Daily Medicines — Elderly ${elderlyId}`, body: emailBody } })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, "0.0.0.0", () => console.log(`medicine_ms listening on port ${PORT}`));
