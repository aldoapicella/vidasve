import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { actorFromRequest } from "../lib/actor.js";
import { claimChallenge, verifyChallenge } from "../lib/challenge.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { makeEvent, recalculateReport } from "../lib/reportLogic.js";
import { publicPost, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import { parsePublicPost } from "../lib/validation.js";

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

    const input = parsePublicPost(await request.json().catch(() => ({})));
    if (!input.text) return json(request, 400, { ok: false, error: "text_required" });
    if (!mediaAllowed() && (input.mediaUrl || input.thumbnailUrl)) return json(request, 400, { ok: false, error: "media_uploads_disabled" });
    if ((input.mediaUrl && !isHttpsUrl(input.mediaUrl)) || (input.thumbnailUrl && !isHttpsUrl(input.thumbnailUrl))) {
      return json(request, 400, { ok: false, error: "invalid_media_url" });
    }

    const secret = env("APP_HMAC_SECRET", "dev-secret-change-me");
    const challenge = verifyChallenge(input.challenge, "public_post", secret);
    if (!challenge.ok) return json(request, 400, { ok: false, error: challenge.error });
    if (!(await claimChallenge(store, input.challenge))) return json(request, 400, { ok: false, error: "challenge_reused" });

    const actor = actorFromRequest(request, secret, { deviceId: input.deviceId, contact: input.contact });
    const rate = await checkRateLimits(store, "public_post", { ...actor, reportCode: report.code, geoCell: report.geoCell });
    if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });

    const event = makeEvent({
      reportId: report.id,
      reportCode: report.code,
      type: "public_post",
      message: input.text,
      postType: input.postType,
      personId: input.personId,
      mediaUrl: input.mediaUrl,
      thumbnailUrl: input.thumbnailUrl,
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

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
