import { Buffer } from "node:buffer";
import { env } from "./config.js";
import type { PublicPost, Report, ReportEvent, ReportMapItem, Visibility } from "./types.js";

export function sanitizeText(value: unknown, max = 600): string {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizeContact(value?: string): string {
  return sanitizeText(value, 160).toLowerCase().replace(/[^\d+a-z@._-]/g, "");
}

export function normalizeMessage(value?: string): string {
  return sanitizeText(value, 800).toLowerCase();
}

export function publicReport(report: Report): Omit<
  Report,
  | "ownerTokenHash"
  | "reporterContactEncrypted"
  | "contactHash"
  | "moderationReason"
  | "moderatedAt"
  | "moderatedByHash"
  | "searchText"
  | "clientMutationId"
  | "priorityScore"
  | "confirmationScore"
  | "abuseScore"
  | "possibleDuplicateCodes"
> {
  const {
    ownerTokenHash,
    reporterContactEncrypted,
    contactHash,
    moderationReason,
    moderatedAt,
    moderatedByHash,
    searchText,
    clientMutationId,
    priorityScore,
    confirmationScore,
    abuseScore,
    possibleDuplicateCodes,
    _rid,
    _self,
    _etag,
    _attachments,
    _ts,
    ...safe
  } = report as Report & Record<string, unknown>;
  void ownerTokenHash;
  void reporterContactEncrypted;
  void contactHash;
  void moderationReason;
  void moderatedAt;
  void moderatedByHash;
  void searchText;
  void clientMutationId;
  void priorityScore;
  void confirmationScore;
  void abuseScore;
  void possibleDuplicateCodes;
  void _rid;
  void _self;
  void _etag;
  void _attachments;
  void _ts;
  return safe;
}

export function publicMapReport(report: Report): ReportMapItem {
  return {
    id: report.id,
    code: report.code,
    location: report.location,
    locationUnknown: report.locationUnknown,
    locationAccuracy: report.locationAccuracy,
    addressText: report.addressText,
    landmark: report.landmark,
    city: report.city,
    area: report.area,
    type: report.type,
    derivedStatus: report.derivedStatus,
    priority: report.priority,
    peopleCount: report.peopleCount,
    signsOfLife: report.signsOfLife,
    sourceType: report.sourceType,
    counters: report.counters,
    updatedAt: report.updatedAt
  };
}

export function publicEvent(event: ReportEvent): Omit<ReportEvent, "actor" | "reason" | "abuseScore" | "clientMutationId"> {
  const {
    actor,
    reason,
    abuseScore,
    clientMutationId,
    moderationReason,
    moderatedAt,
    moderatedByHash,
    searchText,
    _rid,
    _self,
    _etag,
    _attachments,
    _ts,
    ...safe
  } = event as ReportEvent & Record<string, unknown>;
  void actor;
  void reason;
  void abuseScore;
  void clientMutationId;
  void moderationReason;
  void moderatedAt;
  void moderatedByHash;
  void searchText;
  void _rid;
  void _self;
  void _etag;
  void _attachments;
  void _ts;
  return {
    ...safe,
    mediaUrl: event.mediaId ? mediaUrl(event.mediaId) : legacyMediaUrl(event, safe.mediaUrl),
    thumbnailUrl: event.thumbnailMediaId ? mediaUrl(event.thumbnailMediaId) : legacyMediaUrl(event, safe.thumbnailUrl)
  };
}

export function publicPost(event: ReportEvent, report: Report): PublicPost {
  return {
    id: event.id,
    reportCode: report.code,
    reportId: report.id,
    personId: event.personId,
    text: event.message ?? "",
    mediaUrl: event.mediaId ? mediaUrl(event.mediaId) : legacyMediaUrl(event, event.mediaUrl),
    thumbnailUrl: event.thumbnailMediaId ? mediaUrl(event.thumbnailMediaId) : legacyMediaUrl(event, event.thumbnailUrl),
    type: event.postType ?? "story",
    tags: event.tags ?? [],
    createdAt: event.createdAt,
    report: {
      code: report.code,
      addressText: report.addressText,
      priority: report.priority,
      derivedStatus: report.derivedStatus
    }
  };
}

export function isPublicVisibility(value?: Visibility): boolean {
  return !value || value === "public";
}

export function isPublicReport(report: Pick<Report, "visibility" | "derivedStatus">): boolean {
  return isPublicVisibility(report.visibility) && report.derivedStatus !== "hidden_abuse";
}

export function isPublicEvent(event: Pick<ReportEvent, "public" | "visibility">): boolean {
  return event.public && isPublicVisibility(event.visibility);
}

export function mediaUrl(id: string): string {
  return `/api/media/${encodeURIComponent(id)}`;
}

export function legacyMediaUrl(event: Pick<ReportEvent, "reportCode">, value?: string): string | undefined {
  const blobName = legacyBlobName(value);
  return blobName ? `/api/media/legacy/${encodeURIComponent(event.reportCode)}/${Buffer.from(blobName).toString("base64url")}` : value;
}

export function legacyBlobName(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const account = env("MEDIA_STORAGE_ACCOUNT");
    const container = env("MEDIA_CONTAINER", "report-media");
    if (!account || url.hostname.toLowerCase() !== `${account}.blob.core.windows.net`) return undefined;
    const prefix = `/${container}/`;
    return url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : undefined;
  } catch {
    return undefined;
  }
}
