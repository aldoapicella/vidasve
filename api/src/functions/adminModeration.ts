import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { requireAdmin } from "../lib/adminAuth.js";
import { deleteMediaBlob } from "../lib/blobMedia.js";
import { json, options } from "../lib/cors.js";
import { isPublicEventType, recalculateReport } from "../lib/reportLogic.js";
import { publicEvent, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import { sanitizeText } from "../lib/sanitize.js";
import type { MediaAsset, Report, ReportEvent, Visibility } from "../lib/types.js";

const VISIBILITIES = new Set<Visibility>(["public", "queued", "hidden", "removed"]);
// ponytail: routePrefix is empty, so api/admin avoids Azure's reserved root /admin route.
const ADMIN_ROUTE_ALIASES = ["api/admin", "api/_admin"] as const;

for (const prefix of ADMIN_ROUTE_ALIASES) {
  const namePrefix = prefix === "api/admin" ? "admin" : "safeAdmin";
  app.http(`${namePrefix}ModerationQueue`, {
    route: `${prefix}/moderation`,
    authLevel: "anonymous",
    methods: ["GET", "OPTIONS"],
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const admin = requireAdmin(request);
    if (!admin.ok) return admin.response;
    const status = parseStatus(request.query.get("status"));
    const limit = Math.min(Number(request.query.get("limit") ?? 50) || 50, 100);
    const items = await getStore().listModerationQueue({ status, limit });
    return json(request, 200, {
      items: items.map((item) => item.kind === "report"
        ? { kind: "report", report: publicReport(item.report), createdAt: item.createdAt }
        : { kind: "event", event: publicEvent(item.event), report: item.report ? publicReport(item.report) : undefined, createdAt: item.createdAt })
    });
    }
  });
}

for (const prefix of ADMIN_ROUTE_ALIASES) {
  const namePrefix = prefix === "api/admin" ? "admin" : "safeAdmin";
  app.http(`${namePrefix}ReportModeration`, {
    route: `${prefix}/reports/{code}/moderation`,
    authLevel: "anonymous",
    methods: ["POST", "OPTIONS"],
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const admin = requireAdmin(request);
    if (!admin.ok) return admin.response;
    const body = await bodyRecord(request);
    const visibility = parseVisibility(body.visibility);
    if (!visibility) return json(request, 400, { ok: false, error: "invalid_visibility" });
    const store = getStore();
    const report = await store.getReportByCode(String(request.params.code ?? ""));
    if (!report) return json(request, 404, { ok: false, error: "not_found" });
    const updated = moderateReport(report, visibility, body.reason, admin.actorHash);
    await store.updateReport(updated);
    await store.logSecurityEvent({ type: "admin_moderate_report", reportCode: report.code, visibility, reason: updated.moderationReason });
    return json(request, 200, { ok: true, report: publicReport(updated) });
    }
  });
}

for (const prefix of ADMIN_ROUTE_ALIASES) {
  const namePrefix = prefix === "api/admin" ? "admin" : "safeAdmin";
  app.http(`${namePrefix}EventModeration`, {
    route: `${prefix}/reports/{code}/events/{eventId}/moderation`,
    authLevel: "anonymous",
    methods: ["POST", "OPTIONS"],
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const admin = requireAdmin(request);
    if (!admin.ok) return admin.response;
    const body = await bodyRecord(request);
    const visibility = parseVisibility(body.visibility);
    if (!visibility) return json(request, 400, { ok: false, error: "invalid_visibility" });
    const store = getStore();
    const report = await store.getReportByCode(String(request.params.code ?? ""));
    if (!report) return json(request, 404, { ok: false, error: "not_found" });
    const event = (await store.listEvents(report.id)).find((item) => item.id === request.params.eventId);
    if (!event) return json(request, 404, { ok: false, error: "event_not_found" });
    const updated = moderateEvent(event, visibility, body.reason, admin.actorHash);
    await store.updateEvent(updated);
    const nextReport = recalculateReport(report, await store.listEvents(report.id));
    await store.updateReport(nextReport);
    await store.logSecurityEvent({ type: "admin_moderate_event", reportCode: report.code, eventId: event.id, visibility, reason: updated.moderationReason });
    return json(request, 200, { ok: true, report: publicReport(nextReport), event: publicEvent(updated) });
    }
  });
}

for (const prefix of ADMIN_ROUTE_ALIASES) {
  const namePrefix = prefix === "api/admin" ? "admin" : "safeAdmin";
  app.http(`${namePrefix}ReportRemove`, {
    route: `${prefix}/reports/{code}/remove`,
    authLevel: "anonymous",
    methods: ["POST", "OPTIONS"],
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const admin = requireAdmin(request);
    if (!admin.ok) return admin.response;
    const body = await bodyRecord(request);
    const reason = sanitizeText(body.reason, 160) || "admin_remove";
    const store = getStore();
    const report = await store.getReportByCode(String(request.params.code ?? ""));
    if (!report) return json(request, 404, { ok: false, error: "not_found" });
    const mediaAssets = await store.listMediaAssetsForReport(report.id);
    const removed = await store.removeReportData(report.code, {
      reason,
      moderatedAt: new Date().toISOString(),
      moderatedByHash: admin.actorHash
    });
    if (!removed) return json(request, 404, { ok: false, error: "not_found" });
    const failedMediaDeletes = await deleteReportMedia(mediaAssets);
    if (failedMediaDeletes.length) {
      await store.logSecurityEvent({
        type: "admin_remove_media_delete_failed",
        reportCode: report.code,
        failedMediaIds: failedMediaDeletes.map((asset) => asset.id),
        failedCount: failedMediaDeletes.length
      });
      return json(request, 500, {
        ok: false,
        error: "media_delete_partial",
        report: publicReport(removed),
        mediaDeleted: mediaAssets.length - failedMediaDeletes.length,
        mediaDeleteFailed: failedMediaDeletes.length
      });
    }
    return json(request, 200, { ok: true, report: publicReport(removed), mediaDeleted: mediaAssets.length });
    }
  });
}

async function bodyRecord(request: HttpRequest): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

function parseStatus(value: string | null): Visibility | "flagged" {
  if (!value) return "flagged";
  return VISIBILITIES.has(value as Visibility) ? value as Visibility : "flagged";
}

function parseVisibility(value: unknown): Visibility | undefined {
  const visibility = sanitizeText(value, 20) as Visibility;
  return VISIBILITIES.has(visibility) ? visibility : undefined;
}

function moderateReport(report: Report, visibility: Visibility, reason: unknown, actorHash: string): Report {
  const now = new Date().toISOString();
  return {
    ...report,
    visibility,
    derivedStatus: visibility === "public" && report.derivedStatus === "hidden_abuse" ? "open" : report.derivedStatus,
    moderationReason: sanitizeText(reason, 160) || null,
    moderatedAt: now,
    moderatedByHash: actorHash,
    updatedAt: now
  };
}

function moderateEvent(event: ReportEvent, visibility: Visibility, reason: unknown, actorHash: string): ReportEvent {
  return {
    ...event,
    visibility,
    public: visibility === "public" ? isPublicEventType(event.type) : false,
    moderationReason: sanitizeText(reason, 160) || null,
    moderatedAt: new Date().toISOString(),
    moderatedByHash: actorHash
  };
}

async function deleteReportMedia(mediaAssets: MediaAsset[]): Promise<MediaAsset[]> {
  const results = await Promise.allSettled(mediaAssets.map((asset) => deleteMediaBlob(asset.blobName)));
  return mediaAssets.filter((_, index) => results[index].status === "rejected");
}
