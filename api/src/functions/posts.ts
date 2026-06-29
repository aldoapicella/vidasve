import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { actorFromRequest } from "../lib/actor.js";
import { mediaBlobClient } from "../lib/blobMedia.js";
import { claimChallenge, verifyChallenge } from "../lib/challenge.js";
import { env, envBool } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { validateMediaUpload } from "../lib/mediaUpload.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { makeEvent, recalculateReport } from "../lib/reportLogic.js";
import { isPublicReport, publicPost, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import { parsePublicPost } from "../lib/validation.js";
import type { ChallengeSubmission, MediaAsset } from "../lib/types.js";

app.http("postsList", {
  route: "api/posts",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const limit = Math.min(Number(request.query.get("limit") ?? 50) || 50, 100);
    const posts = (await getStore().listPublicPostEvents(limit + 1)).map(({ event, report }) => publicPost(event, report));
    return json(request, 200, { items: posts.slice(0, limit), truncated: posts.length > limit, limit });
  }
});

app.http("postsCreate", {
  route: "api/reports/{code}/posts",
  authLevel: "anonymous",
  methods: ["POST", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const code = String(request.params.code ?? "").toUpperCase();
    const store = getStore();
    const report = await store.getReportByCode(code);
    if (!report || !isPublicReport(report)) return json(request, 404, { ok: false, error: "not_found" });

    const body = await postBody(request);
    const input = parsePublicPost(body.fields);
    const previousEvent = input.clientMutationId
      ? (await store.listEvents(report.id)).find((event) => event.clientMutationId === input.clientMutationId)
      : undefined;
    if (previousEvent) return json(request, 200, { ok: true, post: publicPost(previousEvent, report), report: publicReport(report) });
    if (!input.text) return json(request, 400, { ok: false, error: "text_required" });
    if (body.file && !mediaAllowed()) return json(request, 400, { ok: false, error: "media_uploads_disabled" });
    if (!body.file && (input.mediaUrl || input.thumbnailUrl)) return json(request, 400, { ok: false, error: "invalid_media_url" });
    if (body.file) {
      const mediaError = validateMediaUpload({ size: body.file.size, type: body.file.type });
      if (mediaError) return json(request, 400, { ok: false, error: mediaError });
      if (!env("MEDIA_STORAGE_ACCOUNT")) return json(request, 503, { ok: false, error: "media_storage_not_configured" });
    }

    const secret = env("APP_HMAC_SECRET", "dev-secret-change-me");
    const challenge = verifyChallenge(input.challenge, "public_post", secret);
    if (!challenge.ok) return json(request, 400, { ok: false, error: challenge.error });
    if (!(await claimChallenge(store, input.challenge))) return json(request, 400, { ok: false, error: "challenge_reused" });

    const actor = actorFromRequest(request, secret, { deviceId: input.deviceId, contact: input.contact });
    const rate = await checkRateLimits(store, "public_post", { ...actor, reportCode: report.code, geoCell: report.geoCell });
    if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });

    let mediaAsset: MediaAsset | undefined;
    if (body.file) {
      try {
        mediaAsset = await uploadFile(body.file, report);
        await store.createMediaAsset(mediaAsset);
      } catch {
        return json(request, 503, { ok: false, error: "media_upload_failed" });
      }
    }
    const event = makeEvent({
      reportId: report.id,
      reportCode: report.code,
      type: "public_post",
      message: input.text,
      postType: input.postType,
      personId: input.personId,
      mediaId: mediaAsset?.id,
      thumbnailMediaId: mediaAsset && body.file?.type.startsWith("image/") ? mediaAsset.id : undefined,
      tags: input.tags,
      clientMutationId: input.clientMutationId,
      actor,
      now: new Date()
    });
    await store.addEvent(event);
    const events = await store.listEvents(report.id);
    const updated = recalculateReport(report, events);
    await store.updateReport(updated);
    return json(request, 201, { ok: true, post: publicPost(event, updated), report: publicReport(updated) });
  }
});

function mediaAllowed(): boolean {
  return envBool("MEDIA_UPLOADS_ENABLED");
}

async function postBody(request: HttpRequest): Promise<{ fields: Record<string, unknown>; file?: UploadFile }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { fields: await request.json().catch(() => ({})) as Record<string, unknown> };
  }
  const form = await request.formData();
  const challengeRaw = form.get("challenge");
  const file = uploadFileFromForm(form.get("file"));
  return {
    file,
    fields: {
      text: form.get("text"),
      postType: form.get("postType"),
      personId: form.get("personId"),
      tags: form.getAll("tags"),
      contact: form.get("contact"),
      deviceId: form.get("deviceId"),
      clientMutationId: form.get("clientMutationId"),
      challenge: parseChallenge(challengeRaw)
    }
  };
}

async function uploadFile(file: UploadFile, report: { id: string; code: string }): Promise<MediaAsset> {
  const blobName = `${report.code}/${randomUUID()}-${safeFileName(file.name)}`;
  const { blob } = mediaBlobClient(blobName);
  await blob.uploadData(Buffer.from(await file.arrayBuffer()), {
    blobHTTPHeaders: { blobContentType: file.type }
  });
  return {
    id: randomUUID(),
    reportId: report.id,
    reportCode: report.code,
    blobName,
    contentType: file.type,
    size: file.size,
    visibility: "public",
    createdAt: new Date().toISOString()
  };
}

function parseChallenge(value: unknown): ChallengeSubmission | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(String(value)) as ChallengeSubmission;
  } catch {
    return undefined;
  }
}

function uploadFileFromForm(value: unknown): UploadFile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<UploadFile>;
  return typeof candidate.arrayBuffer === "function" && typeof candidate.size === "number" && candidate.size > 0
    ? candidate as UploadFile
    : undefined;
}

function safeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "upload";
}

interface UploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
