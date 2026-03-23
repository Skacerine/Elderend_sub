export async function postElderlyLogToOutSystems({
  elderlyId,
  guardianId,
  latitude,
  longitude,
  address,
  status,
  timestamp
}) {
  const baseUrl = process.env.OUTSYSTEMS_BASE_URL;
  const path =
    process.env.OUTSYSTEMS_ELDERLYLOG_PATH || "/ElderlyLog/CreateElderlyLog";

  if (!baseUrl) {
    console.warn("OUTSYSTEMS_BASE_URL is not set. Skipping OutSystems sync.");
    return { skipped: true };
  }

  const url = `${baseUrl}${path}`;

  const payload = {
    elderly_id: Number(elderlyId),
    elderly_log: {
      elderly_id: Number(elderlyId),
      guardian_id: Number(guardianId),
      latitude: Number(latitude ?? 0),
      longitude: Number(longitude ?? 0),
      address: String(address ?? ""),
      status: String(status ?? "FALL_DETECTED"),
      timestamp: timestamp ?? new Date().toISOString()
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OutSystems ElderlyLog POST failed: ${response.status} ${response.statusText} - ${text}`
    );
  }

  try {
    return await response.json();
  } catch {
    return { ok: true };
  }
}