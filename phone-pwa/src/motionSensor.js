function magnitude(x = 0, y = 0, z = 0) {
  return Math.sqrt(x * x + y * y + z * z);
}

function estimateStillness(windowSamples) {
  if (windowSamples.length < 5) return 0;

  const recent = windowSamples.slice(-5);
  const avg =
    recent.reduce((sum, s) => sum + s.accMagnitude, 0) / recent.length;

  const variance =
    recent.reduce((sum, s) => sum + Math.pow(s.accMagnitude - avg, 2), 0) /
    recent.length;

  return variance < 1.5 ? 3000 : 0;
}

export function createMotionMonitor({
  onFeatureReady,
  onStart,
  onStop,
  onError
}) {
  let active = false;
  let samples = [];
  let cooldownUntil = 0;

  function handleMotion(event) {
    const now = Date.now();
    if (now < cooldownUntil) return;

    const acc = event.accelerationIncludingGravity || event.acceleration || {};
    const rot = event.rotationRate || {};

    const accMagnitude = magnitude(acc.x, acc.y, acc.z);
    const rotMagnitude = magnitude(rot.alpha, rot.beta, rot.gamma);

    samples.push({
      accMagnitude,
      rotMagnitude,
      timestamp: now
    });

    samples = samples.filter((s) => now - s.timestamp < 3000);

    const accValues = samples.map((s) => s.accMagnitude);
    const rotValues = samples.map((s) => s.rotMagnitude);

    const features = {
      minAcceleration: Math.min(...accValues),
      peakAcceleration: Math.max(...accValues),
      peakRotationRate: Math.max(...rotValues),
      postImpactStillnessMs: estimateStillness(samples)
    };

    const suspicious =
      features.minAcceleration < 2 ||
      features.peakAcceleration > 18 ||
      features.peakRotationRate > 200;

    if (suspicious) {
      cooldownUntil = now + 5000;
      Promise.resolve(onFeatureReady?.(features)).catch((error) => {
        onError?.(error.message || "Failed to process motion event.");
      });
      samples = [];
    }
  }

  async function start() {
    if (active) return;

    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      throw new Error("Motion monitoring is not available in this environment.");
    }

    if (typeof DeviceMotionEvent === "undefined") {
      throw new Error("This device or browser does not support motion detection.");
    }

    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== "granted") {
        throw new Error("Motion permission denied.");
      }
    }

    window.addEventListener("devicemotion", handleMotion);
    active = true;
    onStart?.();
  }

  function stop() {
    if (!active) return;

    window.removeEventListener("devicemotion", handleMotion);
    active = false;
    samples = [];
    onStop?.();
  }

  function isActive() {
    return active;
  }

  return {
    start,
    stop,
    isActive
  };
}