// Helper function to calculate how "strong" a movement is
// (combines x, y, z movement into one number)
function magnitude(x = 0, y = 0, z = 0) {
  return Math.sqrt(x * x + y * y + z * z);
}

// This checks if the phone becomes still after movement
// (important for detecting if someone has fallen and is not moving)
function estimateStillness(windowSamples) {
  // If we don’t have enough data yet, we cannot judge
  if (windowSamples.length < 5) return 0;

  // Take the most recent 5 motion readings
  const recent = windowSamples.slice(-5);

  // Calculate the average movement level
  const avg =
    recent.reduce((sum, s) => sum + s.accMagnitude, 0) / recent.length;

  // Calculate how much the movement varies
  const variance =
    recent.reduce((sum, s) => sum + Math.pow(s.accMagnitude - avg, 2), 0) /
    recent.length;

  // If movement is very low → assume user is still for 3 seconds
  return variance < 1.5 ? 3000 : 0;
}

// Main function that creates the motion detection system
export function createMotionMonitor({
  onFeatureReady, // what to do when suspicious motion is detected
  onStart,        // callback when monitoring starts
  onStop,         // callback when monitoring stops
  onError         // callback when something fails
}) {
  let active = false;        // is monitoring currently running?
  let samples = [];          // stores recent motion data
  let cooldownUntil = 0;     // prevents repeated alerts too quickly

  // This runs every time the phone detects motion
  function handleMotion(event) {
    const now = Date.now();

    // If we are in cooldown, ignore motion
    if (now < cooldownUntil) return;

    // Get movement data from the phone
    const acc = event.accelerationIncludingGravity || event.acceleration || {};
    const rot = event.rotationRate || {};

    // Convert movement into a single number (strength of motion)
    const accMagnitude = magnitude(acc.x, acc.y, acc.z);
    const rotMagnitude = magnitude(rot.alpha, rot.beta, rot.gamma);

    // Save this motion reading
    samples.push({
      accMagnitude,
      rotMagnitude,
      timestamp: now
    });

    // Only keep last 3 seconds of data (sliding window)
    samples = samples.filter((s) => now - s.timestamp < 3000);

    // Extract all values for analysis
    const accValues = samples.map((s) => s.accMagnitude);
    const rotValues = samples.map((s) => s.rotMagnitude);

    // Key features we care about for fall detection
    const features = {
      minAcceleration: Math.min(...accValues),     // possible free fall
      peakAcceleration: Math.max(...accValues),    // impact spike
      peakRotationRate: Math.max(...rotValues),    // tumbling
      postImpactStillnessMs: estimateStillness(samples) // no movement after event
    };

    // Rules to decide if something suspicious happened
    const suspicious =
      features.minAcceleration < 2 ||        // sudden drop
      features.peakAcceleration > 18 ||      // strong impact
      features.peakRotationRate > 200;       // rapid rotation

    // If something looks like a fall
    if (suspicious) {
      // Wait 5 seconds before detecting again (avoid spam alerts)
      cooldownUntil = now + 5000;

      // Send detected features to your system (e.g. backend / UI)
      Promise.resolve(onFeatureReady?.(features)).catch((error) => {
        onError?.(error.message || "Failed to process motion event.");
      });

      // Reset samples for next detection
      samples = [];
    }
  }

  // Start monitoring motion
  async function start() {
    if (active) return;

    // Check if browser supports motion detection
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      throw new Error("Motion monitoring is not available in this environment.");
    }

    if (typeof DeviceMotionEvent === "undefined") {
      throw new Error("This device or browser does not support motion detection.");
    }

    // iPhone requires permission for motion sensors
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== "granted") {
        throw new Error("Motion permission denied.");
      }
    }

    // Start listening to motion events
    window.addEventListener("devicemotion", handleMotion);
    active = true;
    onStart?.();
  }

  // Stop monitoring motion
  function stop() {
    if (!active) return;

    window.removeEventListener("devicemotion", handleMotion);
    active = false;
    samples = [];
    onStop?.();
  }

  // Check if monitoring is currently active
  function isActive() {
    return active;
  }

  // Expose controls to the rest of your app
  return {
    start,
    stop,
    isActive
  };
}