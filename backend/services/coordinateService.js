// Coordinate Processor — geocoding + forwarding to radius check
// Ported from ElderWatch coordinate-processor service

const ZONES = [
  { name: "Tampines Ave 1",  lat: 1.3530, lng: 103.9440 },
  { name: "Tampines Ave 3",  lat: 1.3565, lng: 103.9455 },
  { name: "Tampines Ave 5",  lat: 1.3495, lng: 103.9485 },
  { name: "Pasir Ris Dr 3",  lat: 1.3728, lng: 103.9457 },
  { name: "Simei St 1",      lat: 1.3440, lng: 103.9530 },
  { name: "Bedok North Rd",  lat: 1.3328, lng: 103.9284 },
  { name: "Changi Rd",       lat: 1.3409, lng: 103.9590 },
  { name: "Upper Changi Rd", lat: 1.3456, lng: 103.9648 },
  { name: "Loyang Ave",      lat: 1.3680, lng: 103.9760 },
];

export function geocode(lat, lng) {
  let best = ZONES[0];
  let minD = Infinity;
  for (const z of ZONES) {
    const d = (lat - z.lat) ** 2 + (lng - z.lng) ** 2;
    if (d < minD) { minD = d; best = z; }
  }
  const blk = (Math.abs(Math.round(lat * 10000)) % 800) + 100;
  return `Blk ${blk} ${best.name}`;
}
