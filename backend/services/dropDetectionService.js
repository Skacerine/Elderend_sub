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

  const hadImpactLikeMotion =
    minAcceleration < 6 ||
    peakAcceleration > 12 ||
    peakRotationRate > 100;

  if (hadImpactLikeMotion && postImpactStillnessMs > 1000) score += 10;
  if (hadImpactLikeMotion && postImpactStillnessMs > 2000) score += 10;

  let severity = "LOW";
  if (score >= 100) severity = "FALLEN";
  else if (score >= 65) severity = "NORMAL";
  else severity = "ATREST";

  return {
    detected: score >= 100,
    score,
    severity
  };
}