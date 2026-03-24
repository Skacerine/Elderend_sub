// In-memory alert store (replaces alert-service DB)
const alerts = [];
const MAX = 200;

export function addAlert(alert) {
  const entry = {
    ...alert,
    alertTs: Date.now(),
    _id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  };
  alerts.unshift(entry);
  if (alerts.length > MAX) alerts.length = MAX;
  return entry;
}

export function getAlerts({ n = 100, type, since } = {}) {
  let result = alerts;
  if (type) result = result.filter(a => a.type === type);
  if (since) result = result.filter(a => a.alertTs > since);
  return result.slice(0, n);
}

export function getLatestAlert() {
  return alerts[0] || null;
}

export function getAlertCount() {
  return {
    total: alerts.length,
    entered: alerts.filter(a => a.type === "entered").length,
    left: alerts.filter(a => a.type === "left").length
  };
}

export function getAllAlerts() {
  return alerts;
}
