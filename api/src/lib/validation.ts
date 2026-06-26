import type { CreateReportInput, EventType, GeoPoint, LocationAccuracy, PeopleCount, ReportType } from "./types.js";
import { sanitizeText } from "./sanitize.js";

const REPORT_TYPES = new Set<ReportType>([
  "trapped_person",
  "missing_last_seen",
  "voices_or_hits",
  "collapsed_building_unknown"
]);
const ACCURACY = new Set<LocationAccuracy>(["exact", "approximate", "zone_only"]);
const PEOPLE = new Set<PeopleCount>(["1", "2-5", "more_than_5", "unknown"]);
const PUBLIC_EVENT_TYPES = new Set<EventType>([
  "add_info",
  "nearby_help",
  "duplicate_claim",
  "resolution_claim",
  "reopen_claim",
  "abuse_flag",
  "risk_update",
  "new_signs_of_life"
]);
const OWNER_EVENT_TYPES = new Set<EventType>([
  "owner_add_info",
  "owner_resolved",
  "owner_reopened",
  "owner_contact_update"
]);

export function honeypotFilled(body: Record<string, unknown>): boolean {
  return Boolean(sanitizeText(body.website) || sanitizeText(body.company) || sanitizeText(body.middleName));
}

export function parseCreateReportInput(body: unknown): CreateReportInput {
  const value = asRecord(body);
  const type = REPORT_TYPES.has(value.type as ReportType) ? (value.type as ReportType) : "trapped_person";
  const locationAccuracy = ACCURACY.has(value.locationAccuracy as LocationAccuracy)
    ? (value.locationAccuracy as LocationAccuracy)
    : "approximate";
  const peopleCount = PEOPLE.has(value.peopleCount as PeopleCount) ? (value.peopleCount as PeopleCount) : "unknown";
  const location = parsePoint(value.location);
  return {
    location,
    locationUnknown: Boolean(value.locationUnknown),
    locationAccuracy,
    addressText: sanitizeText(value.addressText, 240),
    landmark: sanitizeText(value.landmark, 120),
    city: sanitizeText(value.city, 80),
    area: sanitizeText(value.area, 80),
    type,
    peopleCount,
    personDescriptionPublic: sanitizeText(value.personDescriptionPublic, 240),
    lastContactText: sanitizeText(value.lastContactText, 160),
    lastContactAt: sanitizeText(value.lastContactAt, 80),
    knownInfoPublic: sanitizeText(value.knownInfoPublic, 900),
    signsOfLife: Boolean(value.signsOfLife),
    riskFlags: Array.isArray(value.riskFlags) ? value.riskFlags.map((flag) => sanitizeText(flag, 40)).filter(Boolean) : [],
    sourceType: sanitizeText(value.sourceType, 40),
    reporterNamePublic: sanitizeText(value.reporterNamePublic, 80),
    reporterContact: sanitizeText(value.reporterContact, 160),
    publishContact: Boolean(value.publishContact),
    deviceId: sanitizeText(value.deviceId, 120),
    website: sanitizeText(value.website, 80),
    company: sanitizeText(value.company, 80),
    middleName: sanitizeText(value.middleName, 80),
    challenge: value.challenge as CreateReportInput["challenge"]
  };
}

export function validateCreateReport(input: CreateReportInput): string | null {
  if (!input.addressText) return "address_required";
  if (!input.knownInfoPublic) return "description_required";
  if (!input.location && !input.locationUnknown) return "location_required";
  if (input.location) {
    const [lng, lat] = input.location.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return "invalid_location";
    }
  }
  return null;
}

export function parsePublicEvent(body: unknown): { type: EventType; message: string; reason: string; contact?: string; deviceId?: string; challenge: CreateReportInput["challenge"] } {
  const value = asRecord(body);
  const type = PUBLIC_EVENT_TYPES.has(value.type as EventType) ? (value.type as EventType) : "add_info";
  return {
    type,
    message: sanitizeText(value.message, 900),
    reason: sanitizeText(value.reason, 80),
    contact: sanitizeText(value.contact, 160),
    deviceId: sanitizeText(value.deviceId, 120),
    challenge: value.challenge as CreateReportInput["challenge"]
  };
}

export function parseOwnerEvent(body: unknown): { type: EventType; message: string; reason: string; ownerToken: string; deviceId?: string; challenge: CreateReportInput["challenge"] } {
  const value = asRecord(body);
  const type = OWNER_EVENT_TYPES.has(value.type as EventType) ? (value.type as EventType) : "owner_add_info";
  return {
    type,
    message: sanitizeText(value.message, 900),
    reason: sanitizeText(value.reason, 80),
    ownerToken: sanitizeText(value.ownerToken, 240),
    deviceId: sanitizeText(value.deviceId, 120),
    challenge: value.challenge as CreateReportInput["challenge"]
  };
}

function parsePoint(value: unknown): GeoPoint | undefined {
  const record = asRecord(value);
  if (record.type !== "Point" || !Array.isArray(record.coordinates) || record.coordinates.length !== 2) return undefined;
  const lng = Number(record.coordinates[0]);
  const lat = Number(record.coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return { type: "Point", coordinates: [lng, lat] };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
