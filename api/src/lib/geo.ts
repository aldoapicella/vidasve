import type { AllowedBbox, GeoPoint } from "./types.js";

export const DEFAULT_BBOXES: AllowedBbox[] = [
  { name: "Caracas", minLng: -67.24, minLat: 10.34, maxLng: -66.72, maxLat: 10.62 },
  { name: "La Guaira", minLng: -67.36, minLat: 10.43, maxLng: -66.72, maxLat: 10.76 },
  { name: "Altos Mirandinos", minLng: -67.18, minLat: 10.24, maxLng: -66.82, maxLat: 10.48 },
  { name: "Guarenas-Guatire", minLng: -66.78, minLat: 10.34, maxLng: -66.46, maxLat: 10.57 }
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
