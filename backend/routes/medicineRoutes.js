import express from "express";
import { sendFallAlertSMS, sendFallAlertEmail } from "../services/notificationService.js";

const MEDICINE_BASE_URL = "https://personal-s93qqbah.outsystemscloud.com/Medicine/rest/Medicine";

const router = express.Router();

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "medicine-proxy" })
);

// GET /medicine/:elderlyId — medicines for one elderly
router.get("/:elderlyId", async (req, res) => {
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/${req.params.elderlyId}/`, {
      headers: { Accept: "application/json" }
    });
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
      sendFallAlertSMS({ elderlyId, severity: "MEDICINE", score: "N/A", address: "N/A", latitude: null, longitude: null, timestamp: new Date().toISOString(),
        _overrideMessage: smsMessage }),
      sendFallAlertEmail({ elderlyId, severity: "MEDICINE", score: "N/A", address: "N/A", latitude: null, longitude: null, timestamp: new Date().toISOString(),
        _overrideEmail: { subject: `[Reminder] Daily Medicines — Elderly ${elderlyId}`, body: emailBody } })
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
