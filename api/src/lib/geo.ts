import type { AllowedBbox, GeoPoint } from "./types.js";

export const DEFAULT_BBOXES: AllowedBbox[] = [
  { name: "Caracas", minLng: -67.2, minLat: 10.35, maxLng: -66.7, maxLat: 10.65 },
  { name: "La Guaira", minLng: -67.35, minLat: 10.45, maxLng: -66.75, maxLat: 10.75 }
];

export function parseAllowedBboxes(value?: string): AllowedBbox[] {
  if (!value) return DEFAULT_BBOXES;
  try {
    const parsed = JSON.parse(value) as AllowedBbox[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_BBOXES;
  } catch {
    return DEFAULT_BBOXES;
  }
}

export function pointInAllowedBboxes(point: GeoPoint | undefined, bboxes: AllowedBbox[]): boolean {
  if (!point) return false;
  const [lng, lat] = point.coordinates;
  return bboxes.some((box) => lng >= box.minLng && lng <= box.maxLng && lat >= box.minLat && lat <= box.maxLat);
}

export function areaKeyForPoint(point: GeoPoint | undefined, bboxes: AllowedBbox[]): string {
  if (!point) return "unknown";
  const [lng, lat] = point.coordinates;
  const match = bboxes.find((box) => lng >= box.minLng && lng <= box.maxLng && lat >= box.minLat && lat <= box.maxLat);
  return (match?.name ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function geoCell(point: GeoPoint | undefined, precision = 2): string {
  if (!point) return "unknown";
  const [lng, lat] = point.coordinates;
  return `${lat.toFixed(precision)}:${lng.toFixed(precision)}:${precision}`;
}

export function bboxToPolygon(bbox: [number, number, number, number]) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat]
      ]
    ]
  };
}

export function smallBboxAround(point: GeoPoint, delta = 0.002): [number, number, number, number] {
  const [lng, lat] = point.coordinates;
  return [lng - delta, lat - delta, lng + delta, lat + delta];
}
