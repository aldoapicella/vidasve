import type { Report, ReportEvent } from "./types.js";

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
  const { ownerTokenHash, reporterContactEncrypted, contactHash, ...safe } = report;
  void ownerTokenHash;
  void reporterContactEncrypted;
  void contactHash;
  return safe;
}

export function publicEvent(event: ReportEvent): Omit<ReportEvent, "actor"> {
  const { actor, ...safe } = event;
  void actor;
  return safe;
}
