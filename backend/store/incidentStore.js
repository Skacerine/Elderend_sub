const incidents = [];

export function addIncident(incident) {
  incidents.unshift(incident);
  if (incidents.length > 100) incidents.pop();
}

export function getIncidents() {
  return incidents;
}

export function getLatestIncidentByElderlyId(elderlyId) {
  return incidents.find((i) => i.elderlyId === elderlyId) || null;
}
