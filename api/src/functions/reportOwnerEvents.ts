import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { actorFromRequest } from "../lib/actor.js";
import { claimChallenge, verifyChallenge } from "../lib/challenge.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { verifyHmacToken } from "../lib/crypto.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { makeEvent, recalculateReport } from "../lib/reportLogic.js";
import { isPublicReport, publicEvent, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import { parseOwnerEvent } from "../lib/validation.js";

app.http("reportOwnerEvents", {
  route: "api/reports/{code}/owner-events",
  authLevel: "anonymous",
  methods: ["POST", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const code = String(request.params.code ?? "").toUpperCase();
    const store = getStore();
    const report = await store.getReportByCode(code);
    if (!report || !isPublicReport(report)) return json(request, 404, { ok: false, error: "not_found" });

    const body = await request.json().catch(() => ({}));
    const input = parseOwnerEvent(body);
    const secret = env("APP_HMAC_SECRET", "dev-secret-change-me");
    if (!verifyHmacToken(secret, input.ownerToken, report.ownerTokenHash)) {
      return json(request, 403, { ok: false, error: "bad_owner_token" });
    }
    const previousEvent = input.clientMutationId
      ? (await store.listEvents(report.id)).find((event) => event.clientMutationId === input.clientMutationId)
      : undefined;
    if (previousEvent) return json(request, 200, { ok: true, report: publicReport(report), event: publicEvent(previousEvent) });
    const challenge = verifyChallenge(input.challenge, "owner_event", secret);
    if (!challenge.ok) return json(request, 400, { ok: false, error: challenge.error });
    if (!(await claimChallenge(store, input.challenge))) return json(request, 400, { ok: false, error: "challenge_reused" });

    const actor = actorFromRequest(request, secret, { deviceId: input.deviceId, hasOwnerToken: true });
    const rate = await checkRateLimits(store, "owner_event", { ...actor, reportCode: report.code });
    if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });

    const event = makeEvent({
      reportId: report.id,
      reportCode: report.code,
      type: input.type,
      message: input.message,
      reason: input.reason,
      clientMutationId: input.clientMutationId,
      actor,
      now: new Date()
    });
    await store.addEvent(event);
    const events = await store.listEvents(report.id);
    const updated = recalculateReport(report, events);
    await store.updateReport(updated);
    return json(request, 201, { ok: true, report: publicReport(updated), event: publicEvent(event) });
  }
});
