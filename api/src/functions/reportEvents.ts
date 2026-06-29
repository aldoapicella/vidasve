import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { actorFromRequest } from "../lib/actor.js";
import { claimChallenge, verifyChallenge } from "../lib/challenge.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { addPersonToReport, makeEvent, recalculateReport } from "../lib/reportLogic.js";
import { isPublicReport, publicEvent, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import { parsePublicEvent } from "../lib/validation.js";
import type { PublicAction } from "../lib/types.js";

app.http("reportEvents", {
  route: "api/reports/{code}/events",
  authLevel: "anonymous",
  methods: ["POST", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const code = String(request.params.code ?? "").toUpperCase();
    const store = getStore();
    const report = await store.getReportByCode(code);
    if (!report || !isPublicReport(report)) return json(request, 404, { ok: false, error: "not_found" });

    const body = await request.json().catch(() => ({}));
    const input = parsePublicEvent(body);
    const previousEvent = input.clientMutationId
      ? (await store.listEvents(report.id)).find((event) => event.clientMutationId === input.clientMutationId)
      : undefined;
    if (previousEvent) return json(request, 200, { ok: true, report: publicReport(report), event: publicEvent(previousEvent) });
    const secret = env("APP_HMAC_SECRET", "dev-secret-change-me");
    const action = input.type as PublicAction;
    const challenge = verifyChallenge(input.challenge, action, secret);
    if (!challenge.ok) return json(request, 400, { ok: false, error: challenge.error });
    if (!(await claimChallenge(store, input.challenge))) return json(request, 400, { ok: false, error: "challenge_reused" });

    const actor = actorFromRequest(request, secret, { deviceId: input.deviceId, contact: input.contact });
    const rate = await checkRateLimits(store, action, {
      ...actor,
      reportCode: report.code,
      geoCell: report.geoCell
    });
    if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });
    if (input.type === "add_person" && !input.person) return json(request, 400, { ok: false, error: "person_required" });
    if (input.type === "add_person" && (report.persons?.length ?? 0) >= 12) {
      return json(request, 400, { ok: false, error: "too_many_people" });
    }

    const nextReport = input.type === "add_person" && input.person ? addPersonToReport(report, input.person) : report;

    const event = makeEvent({
      reportId: report.id,
      reportCode: report.code,
      type: input.type,
      message: input.message || (input.person ? `Persona agregada: ${input.person.displayName}` : ""),
      reason: input.reason,
      personId: input.person?.id,
      clientMutationId: input.clientMutationId,
      actor,
      now: new Date()
    });
    await store.addEvent(event);
    const events = await store.listEvents(report.id);
    const updated = recalculateReport(nextReport, events);
    await store.updateReport(updated);
    return json(request, 201, { ok: true, report: publicReport(updated), event: publicEvent(event) });
  }
});
