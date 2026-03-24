// Fetches real-time location from the coordinate store
import { getLatestCoordinate } from "../store/coordinateStore.js";

export function getElderlyLocation(elderlyId) {
  try {
    const entry = getLatestCoordinate(elderlyId);
    if (entry) {
      return {
        latitude: entry.lat,
        longitude: entry.lng,
        address: entry.address || ""
      };
    }
  } catch (e) {
    console.error(`[LocationService] Failed to get location for ${elderlyId}:`, e.message);
  }
  // ElderWatch data unavailable — return nulls per requirement
  return { latitude: null, longitude: null, address: "" };
}
