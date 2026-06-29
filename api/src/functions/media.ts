import { Buffer } from "node:buffer";
import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { mediaReadUrl } from "../lib/blobMedia.js";
import { json, options } from "../lib/cors.js";
import { isPublicEvent, isPublicReport, isPublicVisibility, legacyBlobName } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import type { MediaAsset, Report, ReportEvent } from "../lib/types.js";

app.http("mediaGet", {
  route: "api/media/{id}",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const store = getStore();
    const asset = await store.getMediaAsset(String(request.params.id ?? ""));
    if (!asset || !isPublicVisibility(asset.visibility)) return json(request, 404, { ok: false, error: "not_found" });
    const report = await store.getReportByCode(asset.reportCode);
    const events = report ? await store.listEvents(report.id) : [];
    if (!canServeMedia(asset, report, events)) return json(request, 404, { ok: false, error: "not_found" });
    try {
      return {
        status: 302,
        headers: {
          Location: await mediaReadUrl(asset.blobName),
          "Cache-Control": "private, max-age=60"
        }
      };
    } catch {
      return json(request, 503, { ok: false, error: "media_unavailable" });
    }
  }
});

app.http("mediaLegacyGet", {
  route: "api/media/legacy/{reportCode}/{token}",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const reportCode = String(request.params.reportCode ?? "").toUpperCase();
    const blobName = decodeLegacyToken(String(request.params.token ?? ""));
    if (!blobName) return json(request, 404, { ok: false, error: "not_found" });
    const store = getStore();
    const report = await store.getReportByCode(reportCode);
    const events = report ? await store.listEvents(report.id) : [];
    if (!canServeLegacyMedia(blobName, report, events)) return json(request, 404, { ok: false, error: "not_found" });
    try {
      return {
        status: 302,
        headers: {
          Location: await mediaReadUrl(blobName),
          "Cache-Control": "private, max-age=60"
        }
      };
    } catch {
      return json(request, 503, { ok: false, error: "media_unavailable" });
    }
  }
});

export function canServeMedia(asset: MediaAsset, report: Report | undefined, events: ReportEvent[]): boolean {
  if (!isPublicVisibility(asset.visibility) || !report || !isPublicReport(report)) return false;
  return events.some((event) => (event.mediaId === asset.id || event.thumbnailMediaId === asset.id) && isPublicEvent(event));
}

export function canServeLegacyMedia(blobName: string, report: Report | undefined, events: ReportEvent[]): boolean {
  if (!report || !isPublicReport(report)) return false;
  return events.some((event) => {
    if (!isPublicEvent(event)) return false;
    return legacyBlobName(event.mediaUrl) === blobName || legacyBlobName(event.thumbnailUrl) === blobName;
  });
}

function decodeLegacyToken(token: string): string | undefined {
  try {
    const value = Buffer.from(token, "base64url").toString("utf8");
    return value && !value.includes("..") ? value : undefined;
  } catch {
    return undefined;
  }
}
