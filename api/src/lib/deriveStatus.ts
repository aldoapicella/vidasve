import type { Actor, DerivedStatus, Report, ReportEvent } from "./types.js";
import { normalizeMessage } from "./sanitize.js";

const REOPEN_TYPES = new Set<ReportEvent["type"]>([
  "reopen_claim",
  "new_signs_of_life",
  "voices_or_hits" as ReportEvent["type"],
  "owner_reopened"
]);

export function deriveStatus(report: Pick<Report, "sourceType" | "signsOfLife" | "priority">, events: ReportEvent[], now = new Date()): DerivedStatus {
  const sorted = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const latestOwnerResolved = latestOf(sorted, "owner_resolved");
  const latestReopen = latestWhere(sorted, (event) => REOPEN_TYPES.has(event.type));

  if (latestOwnerResolved && (!latestReopen || Date.parse(latestOwnerResolved.createdAt) > Date.parse(latestReopen.createdAt))) {
    return "resolved_owner";
  }

  if (latestReopen && latestOwnerResolved && Date.parse(latestReopen.createdAt) > Date.parse(latestOwnerResolved.createdAt)) {
    return "reopened";
  }

  const abuseFlags = countIndependentSignals(sorted.filter((event) => event.type === "abuse_flag"));
  if (abuseFlags >= 5 && report.priority !== "P1" && !report.signsOfLife) {
    return "hidden_abuse";
  }

  const resolutionClaims = sorted.filter((event) => event.type === "resolution_claim");
  const independentResolutionClaims = countIndependentSignals(resolutionClaims);
  const latestResolutionClaim = resolutionClaims.at(-1);
  if (independentResolutionClaims >= 3 && latestResolutionClaim) {
    const ageMs = now.getTime() - Date.parse(latestResolutionClaim.createdAt);
    const hasNewerReopen = Boolean(
      latestReopen && Date.parse(latestReopen.createdAt) > Date.parse(latestResolutionClaim.createdAt)
    );
    if (!hasNewerReopen && ageMs >= 30 * 60 * 1000) {
      return "resolved_community";
    }
  }
  if (independentResolutionClaims >= 2) return "maybe_resolved";
  if (sorted.some((event) => event.type === "nearby_help")) return "help_nearby";
  if (
    report.signsOfLife ||
    report.sourceType === "family" ||
    report.sourceType === "witness" ||
    countIndependentSignals(sorted.filter((event) => event.type === "add_info")) >= 2
  ) {
    return "confirmed";
  }
  return "open";
}

export function countIndependentSignals(events: ReportEvent[]): number {
  const selected: ReportEvent[] = [];
  for (const event of events) {
    if (selected.every((existing) => areIndependent(existing, event))) {
      selected.push(event);
    }
  }
  return selected.length;
}

function latestOf(events: ReportEvent[], type: ReportEvent["type"]): ReportEvent | undefined {
  return latestWhere(events, (event) => event.type === type);
}

function latestWhere(events: ReportEvent[], predicate: (event: ReportEvent) => boolean): ReportEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) return events[index];
  }
  return undefined;
}

function areIndependent(a: ReportEvent, b: ReportEvent): boolean {
  return actorDifferences(a.actor, b.actor, a, b) >= 2;
}

function actorDifferences(a: Actor, b: Actor, eventA: ReportEvent, eventB: ReportEvent): number {
  let differences = 0;
  if (a.ipHash && b.ipHash && a.ipHash !== b.ipHash) differences += 1;
  if (a.deviceHash && b.deviceHash && a.deviceHash !== b.deviceHash) differences += 1;
  if (a.contactHash && b.contactHash && a.contactHash !== b.contactHash) differences += 1;
  if (normalizeMessage(eventA.message) !== normalizeMessage(eventB.message)) differences += 1;
  if (Math.abs(Date.parse(eventA.createdAt) - Date.parse(eventB.createdAt)) > 2 * 60 * 1000) differences += 1;
  if (a.userAgentHash && b.userAgentHash && a.userAgentHash !== b.userAgentHash) differences += 1;
  return differences;
}
