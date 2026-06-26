import { randomUUID } from "node:crypto";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { actorFromRequest } from "../lib/actor.js";
import { claimChallenge, verifyChallenge } from "../lib/challenge.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { validateMediaUpload } from "../lib/mediaUpload.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { makeEvent, recalculateReport } from "../lib/reportLogic.js";
import { publicPost, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import { parsePublicPost } from "../lib/validation.js";
import type { ChallengeSubmission } from "../lib/types.js";

app.http("postsList", {
  route: "posts",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const limit = Math.min(Number(request.query.get("limit") ?? 50) || 50, 100);
    const reports = await getStore().listReports({ limit: 100 });
    // ponytail: N+1 is fine for MVP feed size; add an indexed posts container when feed volume hurts.
    const posts = (await Promise.all(reports.map(async (report) => {
      const events = await getStore().listEvents(report.id);
      return events
        .filter((event) => event.public && event.type === "public_post")
        .map((event) => publicPost(event, report));
    }))).flat();
    posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(request, 200, { items: posts.slice(0, limit), truncated: posts.length > limit, limit });
  }
});

app.http("postsCreate", {
  route: "reports/{code}/posts",
  authLevel: "anonymous",
  methods: ["POST", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const code = String(request.params.code ?? "").toUpperCase();
    const store = getStore();
    const report = await store.getReportByCode(code);
    if (!report) return json(request, 404, { ok: false, error: "not_found" });

    const body = await postBody(request);
    const input = parsePublicPost(body.fields);
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

    const mediaUrl = body.file ? await uploadFile(body.file, report.code) : undefined;
    const event = makeEvent({
      reportId: report.id,
      reportCode: report.code,
      type: "public_post",
      message: input.text,
      postType: input.postType,
      personId: input.personId,
      mediaUrl,
      thumbnailUrl: mediaUrl && body.file?.type.startsWith("image/") ? mediaUrl : undefined,
      tags: input.tags,
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
  return env("MEDIA_UPLOADS_ENABLED", "false") === "true";
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
      challenge: parseChallenge(challengeRaw)
    }
  };
}

async function uploadFile(file: UploadFile, reportCode: string): Promise<string> {
  const account = env("MEDIA_STORAGE_ACCOUNT");
  const container = env("MEDIA_CONTAINER", "report-media");
  if (!account) throw new Error("MEDIA_STORAGE_ACCOUNT missing");
  const blobName = `${reportCode}/${randomUUID()}-${safeFileName(file.name)}`;
  const client = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
  const blob = client.getContainerClient(container).getBlockBlobClient(blobName);
  await blob.uploadData(Buffer.from(await file.arrayBuffer()), {
    blobHTTPHeaders: { blobContentType: file.type }
  });
  return createReadUrl(client, account, container, blobName, blob.url);
}

async function createReadUrl(
  client: BlobServiceClient,
  account: string,
  containerName: string,
  blobName: string,
  blobUrl: string
): Promise<string> {
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const delegationKey = await client.getUserDelegationKey(startsOn, expiresOn);
  const sas = generateBlobSASQueryParameters({
    containerName,
    blobName,
    startsOn,
    expiresOn,
    permissions: BlobSASPermissions.parse("r")
  }, delegationKey, account).toString();
  return `${blobUrl}?${sas}`;
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
