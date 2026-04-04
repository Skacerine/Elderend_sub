// SMS and Email notifications via OutSystems SMULab Notification API

const NOTIFICATION_BASE_URL = "https://smuedu-dev.outsystemsenterprise.com/SMULab_Notification/rest/Notification";

// Defaults — overridden at runtime via /settings API
let guardianPhone = "+6592369965";
let guardianEmail = "alec.ong.2024@computing.smu.edu.sg";

export function getNotificationSettings() {
  return { phone: guardianPhone, email: guardianEmail };
}

export function setNotificationSettings({ phone, email }) {
  if (phone) guardianPhone = phone;
  if (email) guardianEmail = email;
}

function buildSmsMessage({ elderlyId, address, latitude, longitude, score, timestamp }) {
  const time = new Date(timestamp).toLocaleTimeString("en-SG", { hour12: false });
  const loc = address || (latitude != null ? `${latitude}, ${longitude}` : "Unknown");
  return `[ElderWatch] Fall detected for Elderly ${elderlyId} at ${time}. Location: ${loc}. Score: ${score}. Check immediately.`;
}

function buildEmailBody({ elderlyId, address, latitude, longitude, score, severity, timestamp, features }) {
  const time = new Date(timestamp).toLocaleString("en-SG", { hour12: false });
  const coords = latitude != null && longitude != null
    ? `${latitude}, ${longitude}`
    : "Unavailable";
  const mapsLink = latitude != null && longitude != null
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : null;

  let body = `<h2>&#x1F6A8; Fall Detected</h2>`;
  body += `<p><i>Immediate attention may be required</i></p><hr>`;
  body += `<p><b>Elderly ID:</b> ${elderlyId}</p>`;
  body += `<p><b>Time:</b> ${time}</p>`;
  body += `<p><b>Risk Score:</b> ${score ?? "N/A"}</p>`;
  body += `<p><b>Severity:</b> ${severity ?? "FALLEN"}</p>`;
  body += `<p><b>Address:</b> ${address || "Unknown"}</p>`;
  body += `<p><b>Coordinates:</b> ${coords}</p>`;
  if (features) {
    body += `<hr><p><b>Peak Acceleration:</b> ${features.peakAcceleration ?? "N/A"}</p>`;
    body += `<p><b>Peak Rotation:</b> ${features.peakRotationRate ?? "N/A"}</p>`;
    body += `<p><b>Post-Impact Stillness:</b> ${features.postImpactStillnessMs ?? "N/A"} ms</p>`;
  }
  if (mapsLink) {
    body += `<hr><p><b>Google Maps:</b> ${mapsLink}</p>`;
  }
  body += `<hr><p><b>Please check on the elderly person immediately.</b></p>`;
  body += `<p><small>ElderWatch Guardian Alert System</small></p>`;
  return body;
}

export async function sendFallAlertSMS(alertData) {
  const message = alertData._overrideMessage || buildSmsMessage(alertData);
  try {
    const response = await fetch(`${NOTIFICATION_BASE_URL}/SendSMS`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: guardianPhone, message })
    });
    const result = await response.json();
    console.log(`[Notification] SMS sent to ${guardianPhone}:`, result);
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
        emailAddress: guardianEmail,
        emailSubject,
        emailBody
      })
    });
    const result = await response.json();
    console.log(`[Notification] Email sent to ${guardianEmail}:`, result);
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
