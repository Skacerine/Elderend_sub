export function scoreDropRisk(features) {
  let score = 0;

  const {
    minAcceleration = 999,
    peakAcceleration = 0,
    peakRotationRate = 0,
    postImpactStillnessMs = 0
  } = features || {};

  if (minAcceleration < 2) score += 25;
  if (peakRotationRate > 250) score += 20;
  if (peakAcceleration > 20) score += 35;
  if (postImpactStillnessMs > 2000) score += 20;

  let severity = "LOW";
  if (score >= 70) severity = "HIGH";
  else if (score >= 45) severity = "MEDIUM";

  return {
    detected: score >= 70,
    score,
    severity
  };
}
