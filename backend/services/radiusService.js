// Radius Checker — Haversine geofence check + event publishing
// Ported from ElderWatch radius-checker service

import { addCoordinateEntry } from "../store/coordinateStore.js";
import eventBus from "../store/eventBus.js";

const lastStatus = {}; // elderlyId → 'Home' | 'Outside'

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function checkRadius({ elderlyId, guardianId, lat, lng, address, timestamp, home, radius = 500 }) {
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  const dist = Math.round(haversine(latN, lngN, home.lat, home.lng));
  const status = dist <= radius ? "Home" : "Outside";

  const entry = {
    elderlyId,
    guardianId,
    lat: latN,
    lng: lngN,
    address,
    timestamp: typeof timestamp === "number" ? timestamp : parseInt(timestamp, 10),
    status,
    distance: dist
  };

  // Write to coordinate store
  const saved = addCoordinateEntry(elderlyId, entry);

  // Publish event if status boundary was crossed (replaces RabbitMQ)
  const prev = lastStatus[elderlyId];
  if (prev !== undefined && prev !== status) {
    const type = status === "Outside" ? "geofence.left" : "geofence.entered";
    eventBus.emit(type, entry);
    console.log(`[RadiusChecker] Event: ${type} — ${elderlyId}`);
  }
  lastStatus[elderlyId] = status;

  console.log(`[RadiusChecker] ${elderlyId} → ${status} (${dist}m)`);
  return saved;
}
