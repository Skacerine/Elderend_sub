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

  return variance < 3 ? 3000 : 0;
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
  let pendingAnalysis = null;

  function buildFeatures(now) {
    const recentSamples = samples.filter((s) => now - s.timestamp < 3000);

    if (recentSamples.length === 0) {
      return null;
    }

    const accValues = recentSamples.map((s) => s.accMagnitude);
    const rotValues = recentSamples.map((s) => s.rotMagnitude);

    return {
      minAcceleration: Math.min(...accValues),
      peakAcceleration: Math.max(...accValues),
      peakRotationRate: Math.max(...rotValues),
      postImpactStillnessMs: estimateStillness(recentSamples)
    };
  }

  function isSuspicious(features) {
    if (!features) return false;

    return (
      features.minAcceleration < 6 ||
      features.peakAcceleration > 11 ||
      features.peakRotationRate > 90 ||
      features.postImpactStillnessMs > 1000
    );
  }

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

    const quickFeatures = buildFeatures(now);

    if (!isSuspicious(quickFeatures)) {
      return;
    }

    // If we already scheduled analysis, do not schedule again.
    // This lets us collect a fuller drop sequence before sending.
    if (pendingAnalysis) {
      return;
    }

    pendingAnalysis = window.setTimeout(() => {
      const analysisTime = Date.now();
      const finalFeatures = buildFeatures(analysisTime);

      pendingAnalysis = null;

      if (!finalFeatures) {
        return;
      }

      cooldownUntil = analysisTime + 3000;

      Promise.resolve(onFeatureReady?.(finalFeatures)).catch((error) => {
        onError?.(error.message || "Failed to process motion event.");
      });

      samples = [];
    }, 450);
  }

  // iOS requires requestPermission to be called directly from a user gesture.
  // Call requestPermission separately so it can be invoked from a click handler,
  // then call startListening to attach the sensor once permission is granted.
  async function requestPermission() {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      throw new Error("Motion monitoring is not available in this environment.");
    }
    if (!window.isSecureContext) {
      throw new Error("Motion detection requires HTTPS or localhost.");
    }
    if (typeof DeviceMotionEvent === "undefined") {
      throw new Error("This device or browser does not support motion detection.");
    }
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== "granted") {
        throw new Error("Motion permission denied. Please allow motion access in your browser settings and try again.");
      }
    }
  }

  function startListening() {
    if (active) return;
    window.addEventListener("devicemotion", handleMotion);
    active = true;
    onStart?.();
  }

  async function start({ skipPermission = false } = {}) {
    if (active) return;
    if (!skipPermission) {
      await requestPermission();
    }
    startListening();
  }

  function stop() {
    if (!active) return;

    window.removeEventListener("devicemotion", handleMotion);

    if (pendingAnalysis) {
      window.clearTimeout(pendingAnalysis);
      pendingAnalysis = null;
    }

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