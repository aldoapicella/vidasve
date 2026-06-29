import { randomUUID } from "node:crypto";
import { calculatePriority } from "./priority.js";
import { deriveStatus } from "./deriveStatus.js";
import { normalizeMessage, sanitizeText } from "./sanitize.js";
import type { CreateReportInput, PublicPerson, Report, ReportEvent } from "./types.js";

export function makeReport(input: CreateReportInput, values: {
  id: string;
  code: string;
  ownerTokenHash: string;
  areaKey: string;
  geoCell: string;
  reporterContactEncrypted?: string;
  contactHash?: string;
  possibleDuplicateCodes?: string[];
  clientMutationId?: string;
  now: Date;
}): Report {
  const priority = calculatePriority(input, values.now);
  const report: Report = {
    id: values.id,
    clientMutationId: values.clientMutationId,
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
    visibility: "public",
    counters: { updates: 0, nearbyHelp: 0, resolutionClaims: 0, reopenClaims: 0, abuseFlags: 0 },
    createdAt: values.now.toISOString(),
    updatedAt: values.now.toISOString()
  };
  return { ...report, searchText: reportSearchText(report) };
}

export function recalculateReport(report: Report, events: ReportEvent[], now = new Date()): Report {
  const statusEvents = events.filter((event) => event.visibility !== "hidden" && event.visibility !== "removed");
  const priority = calculatePriority(report, now);
  const updated = {
    ...report,
    priority: priority.priority,
    priorityScore: priority.score,
    derivedStatus: deriveStatus(report, statusEvents, now),
    counters: {
      updates: statusEvents.filter((event) => event.type === "add_info" || event.type === "owner_add_info").length,
      nearbyHelp: statusEvents.filter((event) => event.type === "nearby_help").length,
      resolutionClaims: statusEvents.filter((event) => event.type === "resolution_claim").length,
      reopenClaims: statusEvents.filter((event) => event.type === "reopen_claim" || event.type === "owner_reopened").length,
      abuseFlags: statusEvents.filter((event) => event.type === "abuse_flag").length
    },
    updatedAt: now.toISOString()
  };
  return { ...updated, searchText: reportSearchText(updated) };
}

export function addPersonToReport(report: Report, person: PublicPerson): Report {
  const persons = [...(report.persons ?? []), person];
  const updated = {
    ...report,
    peopleCount: countFromPersons(persons.length, report.peopleCount),
    persons,
    personDescriptionPublic: summarizePeople(persons),
    lastContactText: report.lastContactText || person.lastContactText,
    signsOfLife: report.signsOfLife || person.status === "signals_of_life"
  };
  return { ...updated, searchText: reportSearchText(updated) };
}

export function makeEvent(values: Omit<ReportEvent, "id" | "createdAt" | "abuseScore" | "public"> & {
  abuseScore?: number;
  public?: boolean;
  clientMutationId?: string;
  now: Date;
}): ReportEvent {
  return {
    id: randomUUID(),
    clientMutationId: values.clientMutationId,
    reportId: values.reportId,
    reportCode: values.reportCode,
    type: values.type,
    message: sanitizeText(values.message, 900),
    reason: values.reason ?? null,
    postType: values.postType,
    personId: values.personId,
    mediaUrl: values.mediaUrl,
    thumbnailUrl: values.thumbnailUrl,
    mediaId: values.mediaId,
    thumbnailMediaId: values.thumbnailMediaId,
    tags: values.tags,
    public: values.public ?? isPublicEventType(values.type),
    visibility: "public",
    searchText: searchText([values.reportCode, values.message, values.reason, values.postType, ...(values.tags ?? [])]),
    actor: values.actor,
    abuseScore: values.abuseScore ?? 0,
    createdAt: values.now.toISOString()
  };
}

export function isPublicEventType(type: ReportEvent["type"]): boolean {
  return type !== "abuse_flag" && type !== "risk_update" && type !== "owner_contact_update";
}

export function reportSearchText(report: Pick<Report, "code" | "addressText" | "landmark" | "city" | "area" | "personDescriptionPublic" | "knownInfoPublic" | "lastContactText" | "persons">): string {
  return searchText([
    report.code,
    report.addressText,
    report.landmark,
    report.city,
    report.area,
    report.personDescriptionPublic,
    report.knownInfoPublic,
    report.lastContactText,
    ...(report.persons ?? []).flatMap((person) => [
      person.displayName,
      person.description,
      person.lastContactText,
      person.lastKnownPlace,
      person.floorOrUnit,
      person.publicContactName,
      person.publicContactRelationship
    ])
  ]);
}

export function searchText(values: Array<string | null | undefined>): string {
  return values
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

export function duplicateCodes(candidate: CreateReportInput, existing: Report[], candidateContactHash?: string): string[] {
  return existing
    .filter((report) => report.type === candidate.type)
    .filter((report) => {
      const sameContact = candidateContactHash && report.contactHash === candidateContactHash;
      const similarText = normalizeMessage(report.addressText).includes(normalizeMessage(candidate.addressText).slice(0, 24));
      return sameContact || similarText;
    })
    .map((report) => report.code)
    .slice(0, 5);
}

function summarizePeople(persons: PublicPerson[]): string {
  return persons
    .map((person) => [person.displayName, person.age ? `${person.age} años` : undefined, person.lastKnownPlace || person.floorOrUnit].filter(Boolean).join(", "))
    .join("; ")
    .slice(0, 240);
}

function countFromPersons(personCount: number, fallback: Report["peopleCount"]): Report["peopleCount"] {
  if (personCount === 1) return "1";
  if (personCount >= 2 && personCount <= 5) return "2-5";
  if (personCount > 5) return "more_than_5";
  return fallback;
}
