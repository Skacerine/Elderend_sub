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

  const emailBody = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b1728;color:#e8f1ff;border-radius:16px;overflow:hidden;border:1px solid rgba(79,217,255,0.3);">
      <div style="background:linear-gradient(135deg,#1A5C40,#227A54);padding:24px 28px;text-align:center;">
        <div style="font-size:36px;margin-bottom:8px;">&#x1F48A;</div>
        <div style="font-size:22px;font-weight:900;color:#fff;">Medicine Reminder</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:4px;">Daily medication schedule for Elderly ${elderlyId}</div>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.15);">
            <th style="padding:10px 0;color:#8da6c7;text-align:left;">Medicine</th>
            <th style="padding:10px 0;color:#8da6c7;text-align:left;">Time</th>
            <th style="padding:10px 0;color:#8da6c7;text-align:left;">Dose</th>
          </tr>
          ${medicines.map(m => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;font-weight:700;">${m.Name}</td>
            <td style="padding:12px 0;">${m.ReminderTime || "N/A"}</td>
            <td style="padding:12px 0;">${Number(m.Dose) || 1} dose${(Number(m.Dose) || 1) > 1 ? "s" : ""}</td>
          </tr>`).join("")}
        </table>
        ${medicines.some(m => m.Instructions) ? `
        <div style="margin-top:20px;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8da6c7;margin-bottom:10px;">Instructions</div>
          ${medicines.filter(m => m.Instructions).map(m => `
          <div style="margin-bottom:10px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="font-weight:700;color:#4fd9ff;margin-bottom:4px;">${m.Name}</div>
            <div style="font-size:13px;color:#8da6c7;line-height:1.5;">${m.Instructions}</div>
          </div>`).join("")}
        </div>` : ""}
        <div style="margin-top:20px;padding:14px;background:rgba(34,122,84,0.15);border:1px solid rgba(34,122,84,0.3);border-radius:10px;font-size:13px;color:#42e79c;text-align:center;">
          Please ensure all medicines are taken on time today.
        </div>
      </div>
      <div style="padding:16px 28px;text-align:center;font-size:11px;color:#6780a4;border-top:1px solid rgba(255,255,255,0.06);">
        ElderWatch Medicine Reminder System
      </div>
    </div>
  `.trim();

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
