import { randomUUID } from "node:crypto";
import { calculatePriority } from "./priority.js";
import { deriveStatus } from "./deriveStatus.js";
import { normalizeMessage, sanitizeText } from "./sanitize.js";
import type { CreateReportInput, Report, ReportEvent } from "./types.js";

export function makeReport(input: CreateReportInput, values: {
  id: string;
  code: string;
  ownerTokenHash: string;
  areaKey: string;
  geoCell: string;
  reporterContactEncrypted?: string;
  contactHash?: string;
  possibleDuplicateCodes?: string[];
  now: Date;
}): Report {
  const priority = calculatePriority(input, values.now);
  return {
    id: values.id,
    code: values.code,
    areaKey: values.areaKey,
    geoCell: values.geoCell,
    location: input.location,
    locationUnknown: input.locationUnknown,
    locationAccuracy: input.locationAccuracy,
    addressText: input.addressText,
    landmark: input.landmark,
    city: input.city,
    area: input.area,
    type: input.type,
    derivedStatus: "open",
    priority: priority.priority,
    priorityScore: priority.score,
    confirmationScore: input.sourceType === "family" || input.sourceType === "witness" ? 1 : 0,
    abuseScore: 0,
    peopleCount: input.peopleCount,
    persons: input.persons ?? [],
    personDescriptionPublic: input.personDescriptionPublic,
    lastContactText: input.lastContactText,
    lastContactAt: input.lastContactAt,
    knownInfoPublic: input.knownInfoPublic,
    signsOfLife: input.signsOfLife,
    riskFlags: input.riskFlags,
    sourceType: input.sourceType,
    reporterNamePublic: input.reporterNamePublic,
    publishContact: Boolean(input.publishContact),
    reporterContactEncrypted: values.reporterContactEncrypted,
    contactHash: values.contactHash,
    ownerTokenHash: values.ownerTokenHash,
    possibleDuplicateCodes: values.possibleDuplicateCodes ?? [],
    counters: { updates: 0, nearbyHelp: 0, resolutionClaims: 0, reopenClaims: 0, abuseFlags: 0 },
    createdAt: values.now.toISOString(),
    updatedAt: values.now.toISOString()
  };
}

export function recalculateReport(report: Report, events: ReportEvent[], now = new Date()): Report {
  const priority = calculatePriority(report, now);
  return {
    ...report,
    priority: priority.priority,
    priorityScore: priority.score,
    derivedStatus: deriveStatus(report, events, now),
    counters: {
      updates: events.filter((event) => event.type === "add_info" || event.type === "owner_add_info").length,
      nearbyHelp: events.filter((event) => event.type === "nearby_help").length,
      resolutionClaims: events.filter((event) => event.type === "resolution_claim").length,
      reopenClaims: events.filter((event) => event.type === "reopen_claim" || event.type === "owner_reopened").length,
      abuseFlags: events.filter((event) => event.type === "abuse_flag").length
    },
    updatedAt: now.toISOString()
  };
}

export function makeEvent(values: Omit<ReportEvent, "id" | "createdAt" | "abuseScore" | "public"> & {
  abuseScore?: number;
  public?: boolean;
  now: Date;
}): ReportEvent {
  return {
    id: randomUUID(),
    reportId: values.reportId,
    reportCode: values.reportCode,
    type: values.type,
    message: sanitizeText(values.message, 900),
    reason: values.reason ?? null,
    public: values.public ?? true,
    actor: values.actor,
    abuseScore: values.abuseScore ?? 0,
    createdAt: values.now.toISOString()
  };
}

export function duplicateCodes(candidate: CreateReportInput, existing: Report[]): string[] {
  return existing
    .filter((report) => report.type === candidate.type)
    .filter((report) => {
      const sameContact = candidate.reporterContact && report.contactHash;
      const similarText = normalizeMessage(report.addressText).includes(normalizeMessage(candidate.addressText).slice(0, 24));
      return sameContact || similarText;
    })
    .map((report) => report.code)
    .slice(0, 5);
}
