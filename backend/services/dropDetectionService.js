export function scoreDropRisk(features) {
  let score = 0;

  const {
    minAcceleration = 999,
    peakAcceleration = 0,
    peakRotationRate = 0,
    postImpactStillnessMs = 0
  } = features || {};

  if (minAcceleration < 6) score += 25;
  if (minAcceleration < 3) score += 15;

  if (peakRotationRate > 100) score += 20;
  if (peakRotationRate > 180) score += 10;

  if (peakAcceleration > 12) score += 25;
  if (peakAcceleration > 18) score += 15;

  if (postImpactStillnessMs > 1000) score += 10;
  if (postImpactStillnessMs > 2000) score += 10;

  let severity = "LOW";
  if (score >= 70) severity = "HIGH";
  else if (score >= 40) severity = "MEDIUM";
  else severity = "LOW";

  return {
    detected: score >= 20,
    score,
    severity
  };
}