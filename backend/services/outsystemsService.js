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

  const elderlyIdNum = Number(elderlyId);
  const guardianIdNum = Number(guardianId);
  const latitudeNum = Number(latitude ?? 0);
  const longitudeNum = Number(longitude ?? 0);
  const finalStatus = String(status ?? "FALLEN").trim().toUpperCase();

  if (!Number.isFinite(elderlyIdNum) || elderlyIdNum <= 0) {
    throw new Error(`Invalid elderlyId for OutSystems: ${elderlyId}`);
  }

  if (!Number.isFinite(guardianIdNum) || guardianIdNum <= 0) {
    throw new Error(`Invalid guardianId for OutSystems: ${guardianId}`);
  }

  const url = `${baseUrl}${path}`;

  const payload = {
    elderly_id: elderlyIdNum,
    guardian_id: guardianIdNum,
    latitude: latitudeNum,
    longitude: longitudeNum,
    address: String(address ?? ""),
    status: finalStatus,
    timestamp: timestamp ?? new Date().toISOString()
  };

  console.log("Posting ElderlyLog to OutSystems:", JSON.stringify(payload, null, 2));

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