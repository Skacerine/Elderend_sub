const BASE_URL = "http://localhost:4000";

export async function sendMotionSample(payload) {
  const response = await fetch(`${BASE_URL}/motion/sample`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}

export async function simulateDrop(payload) {
  const response = await fetch(`${BASE_URL}/motion/simulate-drop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}
