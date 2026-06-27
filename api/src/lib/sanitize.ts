import type { PublicPost, Report, ReportEvent } from "./types.js";

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
  "ownerTokenHash" | "reporterContactEncrypted" | "contactHash"
> {
  const {
    ownerTokenHash,
    reporterContactEncrypted,
    contactHash,
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
  void _rid;
  void _self;
  void _etag;
  void _attachments;
  void _ts;
  return safe;
}

export function publicEvent(event: ReportEvent): Omit<ReportEvent, "actor"> {
  const { actor, ...safe } = event;
  void actor;
  return safe;
}

export function publicPost(event: ReportEvent, report: Report): PublicPost {
  return {
    id: event.id,
    reportCode: report.code,
    reportId: report.id,
    personId: event.personId,
    text: event.message ?? "",
    mediaUrl: event.mediaUrl,
    thumbnailUrl: event.thumbnailUrl,
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
