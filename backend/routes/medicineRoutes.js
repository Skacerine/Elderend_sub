import express from "express";
import { sendFallAlertSMS, sendFallAlertEmail } from "../services/notificationService.js";

const MEDICINE_BASE_URL = "https://personal-s93qqbah.outsystemscloud.com/Medicine/rest/Medicine";

const router = express.Router();

// In-memory schedule overrides — persists guardian's day selections since OutSystems
// doesn't support deleting Schedule entries or storing comma-separated Day fields.
// Key: "{MedicineId}" → value: ["Monday","Wednesday","Friday"]
const scheduleOverrides = {};

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "medicine-proxy" })
);

// GET /medicine/schedules — get all schedule overrides
router.get("/schedules", (_req, res) => {
  res.json(scheduleOverrides);
});

// PUT /medicine/schedules/:medicineId — set schedule override for a medicine
router.put("/schedules/:medicineId", (req, res) => {
  const { medicineId } = req.params;
  const { days } = req.body; // array of full day names: ["Monday","Wednesday"]
  if (!Array.isArray(days)) return res.status(400).json({ error: "days must be an array" });
  scheduleOverrides[medicineId] = days;
  console.log(`[Medicine] Schedule override set: med ${medicineId} → ${days.join(",")}`);
  res.json({ ok: true });
});

// GET /medicine/:elderlyId — medicines for one elderly
router.get("/:elderlyId", async (req, res) => {
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/${req.params.elderlyId}/`, {
      headers: { Accept: "application/json" }
    });
    // 404 or 500 means this elderly has no medicines yet — return empty array, not an error
    if (response.status === 404 || response.status === 500) return res.json([]);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error("[Medicine] Fetch failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// GET /medicines — all medicines
router.get("/", async (_req, res) => {
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicines/`, {
      headers: { Accept: "application/json" }
    });
    if (response.status === 404) return res.json([]);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error("[Medicine] Fetch all failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// DELETE /medicine/delete?MedicineId= — delete medicine in OutSystems
router.delete("/delete", async (req, res) => {
  const { MedicineId } = req.query;
  if (!MedicineId) return res.status(400).json({ error: "MedicineId query param required" });
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine?MedicineId=${MedicineId}`, {
      method: "DELETE",
      headers: { Accept: "application/json" }
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).json({ result: text || "deleted" }); }
  } catch (e) {
    console.error("[Medicine] Delete failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// POST /medicine/create — create new medicine in OutSystems
router.post("/create", async (req, res) => {
  try {
    // Ensure correct types for OutSystems
    const payload = {
      Id: 0, // OutSystems will assign real ID
      Name: String(req.body.Name || ""),
      ElderlyId: Number(req.body.ElderlyId),
      ReminderTime: String(req.body.ReminderTime || "08:00:00").split(":").length === 2 ? String(req.body.ReminderTime) + ":00" : String(req.body.ReminderTime || "08:00:00"),
      Quantity: Number(req.body.Quantity) || 0,
      Dose: Number(req.body.Dose) || 1,
      Instructions: String(req.body.Instructions || ""),
      IsActive: true,
      Day: String(req.body.Day || "")
    };
    console.log("[Medicine] Creating:", JSON.stringify(payload));
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
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

// PUT /medicine/update — update medicine in OutSystems (e.g. restock)
router.put("/update", async (req, res) => {
  try {
    const payload = {
      Id: Number(req.body.Id),
      Name: String(req.body.Name || ""),
      ElderlyId: Number(req.body.ElderlyId),
      Dose: Number(req.body.Dose) || 1,
      Instructions: String(req.body.Instructions || ""),
      IsActive: req.body.IsActive !== undefined ? req.body.IsActive : true
    };
    if (req.body.Day !== undefined) payload.Day = String(req.body.Day);
    if (req.body.ReminderTime !== undefined) payload.ReminderTime = String(req.body.ReminderTime);
    if (req.body.Quantity !== undefined) payload.Quantity = Number(req.body.Quantity);
    console.log("[Medicine] Updating:", JSON.stringify(payload));
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
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

// PUT /medicine/stock — update stock via OutSystems /stock/ endpoint
router.put("/stock", async (req, res) => {
  try {
    const payload = {
      MedicineId: Number(req.body.MedicineId),
      Quantity: Number(req.body.Quantity) || 0
    };
    console.log("[Medicine] Updating stock:", JSON.stringify(payload));
    const response = await fetch(`${MEDICINE_BASE_URL}/stock/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).json({ result: text }); }
  } catch (e) {
    console.error("[Medicine] Stock update failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// POST /medicine/schedule — add schedule to medicine
router.post("/schedule", async (req, res) => {
  try {
    const payload = {
      MedicineId: Number(req.body.MedicineId),
      Day: String(req.body.Day),
      ReminderTime: String(req.body.ReminderTime || "08:00:00").split(":").length === 2 ? String(req.body.ReminderTime) + ":00" : String(req.body.ReminderTime || "08:00:00")
    };
    console.log("[Medicine] Adding schedule:", JSON.stringify(payload));
    const response = await fetch(`${MEDICINE_BASE_URL}/schedule/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    console.log("[Medicine] Schedule response:", response.status, text);
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).json({ result: text }); }
  } catch (e) {
    console.error("[Medicine] Schedule failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// POST /medicine/notify — send medicine reminder SMS + email
router.post("/notify", async (req, res) => {
  const { elderlyId, medicines } = req.body;
  if (!medicines || !medicines.length) {
    return res.status(400).json({ error: "No medicines provided" });
  }

  const medList = medicines.map(m => {
    const dose = Number(m.Dose) || 1;
    return `- ${m.Name} (${dose} dose${dose > 1 ? "s" : ""}) at ${m.ReminderTime || "N/A"}${m.Instructions ? ` — ${m.Instructions}` : ""}`;
  }).join("\n");

  const smsMessage = `[ElderWatch] Medicine reminder for Elderly ${elderlyId}:\n${medicines.map(m => `- ${m.Name} (${Number(m.Dose) || 1} dose) at ${m.ReminderTime || "N/A"}`).join("\n")}\nPlease ensure medicines are taken on time.`;

  let emailBody = `<h2>&#x1F48A; Medicine Reminder</h2>`;
  emailBody += `<p>Daily medication schedule for Elderly ${elderlyId}</p><hr>`;
  medicines.forEach(m => {
    const dose = Number(m.Dose) || 1;
    emailBody += `<p><b>${m.Name}</b> — ${m.ReminderTime || "N/A"} — ${dose} dose${dose > 1 ? "s" : ""}</p>`;
  });
  const medsWithInstr = medicines.filter(m => m.Instructions);
  if (medsWithInstr.length) {
    emailBody += `<hr><h3>Instructions</h3>`;
    medsWithInstr.forEach(m => {
      emailBody += `<p><b>${m.Name}:</b> ${m.Instructions}</p>`;
    });
  }
  emailBody += `<hr><p><b>Please ensure all medicines are taken on time today.</b></p>`;
  emailBody += `<p><small>ElderWatch Medicine Reminder System</small></p>`;

  try {
    const [smsResult, emailResult] = await Promise.allSettled([
      sendFallAlertSMS({
        elderlyId, severity: "MEDICINE", score: "N/A", address: "N/A", latitude: null, longitude: null, timestamp: new Date().toISOString(),
        _overrideMessage: smsMessage
      }),
      sendFallAlertEmail({
        elderlyId, severity: "MEDICINE", score: "N/A", address: "N/A", latitude: null, longitude: null, timestamp: new Date().toISOString(),
        _overrideEmail: { subject: `[Reminder] Daily Medicines — Elderly ${elderlyId}`, body: emailBody }
      })
    ]);

    res.json({
      sms: smsResult.status === "fulfilled" ? smsResult.value : { error: smsResult.reason?.message },
      email: emailResult.status === "fulfilled" ? emailResult.value : { error: emailResult.reason?.message }
    });
  } catch (e) {
    console.error("[Medicine] Notify failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;