// SMS and Email notifications via OutSystems SMULab Notification API

const NOTIFICATION_BASE_URL = "https://smuedu-dev.outsystemsenterprise.com/SMULab_Notification/rest/Notification";

const GUARDIAN_PHONE = "+6592369965";
const GUARDIAN_EMAIL = "alec.ong.2024@computing.smu.edu.sg";

function buildSmsMessage({ elderlyId, address, latitude, longitude, score, severity, timestamp }) {
  const time = new Date(timestamp).toLocaleTimeString("en-SG", { hour12: false });
  const loc = address || (latitude != null ? `${latitude}, ${longitude}` : "Unknown location");
  return `[ElderWatch ALERT] Fall detected for Elderly ${elderlyId} at ${time}. ` +
    `Location: ${loc}. Score: ${score}, Severity: ${severity}. ` +
    `Please check on them immediately.`;
}

function buildEmailBody({ elderlyId, address, latitude, longitude, score, severity, timestamp, features }) {
  const time = new Date(timestamp).toLocaleString("en-SG", { hour12: false });
  const coords = latitude != null && longitude != null
    ? `${latitude}, ${longitude}`
    : "Unavailable";
  const mapsLink = latitude != null && longitude != null
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : null;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b1728;color:#e8f1ff;border-radius:16px;overflow:hidden;border:1px solid rgba(255,107,125,0.3);">
      <div style="background:linear-gradient(135deg,#661626,#b01c38);padding:24px 28px;text-align:center;">
        <div style="font-size:36px;margin-bottom:8px;">&#x1F6A8;</div>
        <div style="font-size:22px;font-weight:900;color:#fff;">Fall Detected</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:4px;">Immediate attention may be required</div>
      </div>
      <div style="padding:24px 28px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;width:140px;">Elderly ID</td>
            <td style="padding:12px 0;font-weight:700;">${elderlyId}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Time</td>
            <td style="padding:12px 0;font-weight:700;">${time}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Risk Score</td>
            <td style="padding:12px 0;font-weight:700;color:#ff6b7d;">${score ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Severity</td>
            <td style="padding:12px 0;font-weight:700;color:#ff6b7d;">${severity ?? "FALLEN"}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Address</td>
            <td style="padding:12px 0;font-weight:700;">${address || "Unknown"}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Coordinates</td>
            <td style="padding:12px 0;font-weight:700;">${coords}</td>
          </tr>
          ${features ? `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Peak Acceleration</td>
            <td style="padding:12px 0;">${features.peakAcceleration ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Peak Rotation</td>
            <td style="padding:12px 0;">${features.peakRotationRate ?? "N/A"}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:12px 0;color:#8da6c7;">Post-Impact Stillness</td>
            <td style="padding:12px 0;">${features.postImpactStillnessMs ?? "N/A"} ms</td>
          </tr>
          ` : ""}
        </table>
        ${mapsLink ? `
        <div style="margin-top:20px;text-align:center;">
          <a href="${mapsLink}" style="display:inline-block;padding:12px 28px;background:#5a8cff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
            View on Google Maps
          </a>
        </div>` : ""}
        <div style="margin-top:20px;padding:14px;background:rgba(255,107,125,0.1);border:1px solid rgba(255,107,125,0.2);border-radius:10px;font-size:13px;color:#ff6b7d;text-align:center;">
          Please check on the elderly person immediately. Call them or visit their location.
        </div>
      </div>
      <div style="padding:16px 28px;text-align:center;font-size:11px;color:#6780a4;border-top:1px solid rgba(255,255,255,0.06);">
        ElderWatch Guardian Alert System
      </div>
    </div>
  `.trim();
}

export async function sendFallAlertSMS(alertData) {
  const message = alertData._overrideMessage || buildSmsMessage(alertData);
  try {
    const response = await fetch(`${NOTIFICATION_BASE_URL}/SendSMS`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: GUARDIAN_PHONE, message })
    });
    const result = await response.json();
    console.log(`[Notification] SMS sent to ${GUARDIAN_PHONE}:`, result);
    return result;
  } catch (error) {
    console.error(`[Notification] SMS failed:`, error.message);
    return { status: "error", error: error.message };
  }
}

export async function sendFallAlertEmail(alertData) {
  const emailBody = alertData._overrideEmail?.body || buildEmailBody(alertData);
  const emailSubject = alertData._overrideEmail?.subject || `[ALERT] Fall Detected — Elderly ${alertData.elderlyId}`;
  try {
    const response = await fetch(`${NOTIFICATION_BASE_URL}/SendEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailAddress: GUARDIAN_EMAIL,
        emailSubject,
        emailBody
      })
    });
    const result = await response.json();
    console.log(`[Notification] Email sent to ${GUARDIAN_EMAIL}:`, result);
    return result;
  } catch (error) {
    console.error(`[Notification] Email failed:`, error.message);
    return { status: "error", error: error.message };
  }
}

export async function sendFallAlertNotifications(alertData) {
  const [smsResult, emailResult] = await Promise.allSettled([
    sendFallAlertSMS(alertData),
    sendFallAlertEmail(alertData)
  ]);
  return {
    sms: smsResult.status === "fulfilled" ? smsResult.value : { error: smsResult.reason?.message },
    email: emailResult.status === "fulfilled" ? emailResult.value : { error: emailResult.reason?.message }
  };
}
