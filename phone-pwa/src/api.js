const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function postJson(path, payload) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text || "Unknown error"}`);
  }

  return response.json();
}

export async function sendMotionSample(payload) {
  return postJson("/motion/sample", payload);
}

export async function simulateDrop(payload) {
  return postJson("/motion/simulate-drop", payload);
}