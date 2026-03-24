// In-memory coordinate log store (replaces logging-service DB)
const db = {};       // elderlyId → entry[]
const registry = {}; // elderlyId → { elderlyId, guardianId }
const MAX_LOG = 500;

export function addCoordinateEntry(elderlyId, entry) {
  const e = { ...entry, _id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  if (!db[elderlyId]) db[elderlyId] = [];
  db[elderlyId].unshift(e);
  if (db[elderlyId].length > MAX_LOG) db[elderlyId].length = MAX_LOG;
  if (!registry[elderlyId]) registry[elderlyId] = { elderlyId, guardianId: entry.guardianId || null };
  return e;
}

export function getCoordinateHistory(elderlyId, n = 60) {
  return (db[elderlyId] || []).slice(0, Math.min(n, MAX_LOG));
}

export function getLatestCoordinate(elderlyId) {
  const entries = db[elderlyId] || [];
  return entries.length ? entries[0] : null;
}

export function getAllTracked() {
  return Object.keys(db).map(id => ({
    ...registry[id],
    latest: db[id][0] || null
  }));
}

export function clearHistory(elderlyId) {
  db[elderlyId] = [];
  delete registry[elderlyId];
}

export function getStats() {
  const total = Object.values(db).reduce((s, a) => s + a.length, 0);
  return { tracked: Object.keys(db).length, totalEntries: total };
}
