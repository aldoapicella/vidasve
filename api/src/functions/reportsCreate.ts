import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { requireAdmin } from "../lib/adminAuth.js";
import { actorFromRequest } from "../lib/actor.js";
import { claimChallenge, verifyChallenge } from "../lib/challenge.js";
import { validateCaptcha } from "../lib/captcha.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { encryptText, hashSecret, randomBase64Url, verifyHmacToken } from "../lib/crypto.js";
import { areaKeyForPoint, geoCell, parseAllowedBboxes, pointInAllowedBboxes, smallBboxAround } from "../lib/geo.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { duplicateCodes, makeEvent, makeReport, recalculateReport } from "../lib/reportLogic.js";
import { isPublicReport, normalizeContact, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import { honeypotFilled, parseCreateReportInput, validateCreateReport } from "../lib/validation.js";
import type { Report } from "../lib/types.js";

app.http("reportsCreate", {
  route: "api/reports",
  authLevel: "anonymous",
  methods: ["GET", "POST", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    if (request.method === "GET") {
      const bbox = parseBbox(request.query.get("bbox"));
      const priorities = splitParam(request.query.get("priority"));
      const statuses = splitParam(request.query.get("status"));
      const since = request.query.get("since") ?? undefined;
      const limit = 500;
      if (request.query.get("view") === "map") {
        const items = await getStore().listMapReports({ bbox, priorities, statuses, since, limit });
        return json(request, 200, { items, truncated: items.length >= limit, limit });
      }
      const items = await getStore().listReports({ bbox, priorities, statuses, since, limit });
      const visible = items.filter(isPublicReport);
      return json(request, 200, { items: visible.map(publicReport), truncated: items.length >= limit, limit });
    }

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const store = getStore();
    const secret = env("APP_HMAC_SECRET", "dev-secret-change-me");
    const piiKey = env("PII_ENCRYPTION_KEY", secret);
    const input = parseCreateReportInput(rawBody);
    const admin = optionalAdmin(request);
    if (admin.requested && !admin.ok) return admin.response;

    if (input.clientMutationId) {
      const existing = await store.getReportByClientMutationId(input.clientMutationId);
      if (existing) {
        if (admin.ok) {
          const publicUrl = `${env("PUBLIC_APP_URL", "http://localhost:5173")}/caso/${existing.code}`;
          return json(request, 200, { ok: true, code: existing.code, publicUrl, report: publicReport(existing), message: "Reporte existente." });
        }
        if (!input.ownerToken || !verifyHmacToken(secret, input.ownerToken, existing.ownerTokenHash)) {
          return json(request, 409, { ok: false, error: "duplicate_mutation" });
        }
        return reportCreatedResponse(request, existing, input.ownerToken, 200);
      }
    }

    if (!admin.ok && honeypotFilled(rawBody)) {
      await store.logSecurityEvent({ type: "honeypot", action: "create_report" });
      return json(request, 202, { ok: true, message: "Reporte recibido." });
    }

    const validationError = validateCreateReport(input);
    if (validationError) return json(request, 400, { ok: false, error: validationError });
    if (!admin.ok) {
      const challenge = verifyChallenge(input.challenge, "create_report", secret);
      if (!challenge.ok) return json(request, 400, { ok: false, error: challenge.error });
      if (!(await claimChallenge(store, input.challenge))) return json(request, 400, { ok: false, error: "challenge_reused" });

      const captchaError = await validateCaptcha(input);
      if (captchaError) return json(request, 400, { ok: false, error: captchaError });
    }

    const allowedBboxes = parseAllowedBboxes(env("ALLOWED_BBOXES_JSON"));
    if (input.location && !pointInAllowedBboxes(input.location, allowedBboxes)) {
      return json(request, 400, { ok: false, error: "outside_allowed_area" });
    }

    const actor = admin.ok ? { hasOwnerToken: false, userAgentHash: admin.actorHash } : actorFromRequest(request, secret, { deviceId: input.deviceId, contact: input.reporterContact });
    const areaKey = areaKeyForPoint(input.location, allowedBboxes);
    const reportGeoCell = geoCell(input.location);
    if (!admin.ok) {
      const rate = await checkRateLimits(store, "create_report", { ...actor, geoCell: reportGeoCell });
      if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });
    }

    const ownerToken = validClientToken(input.ownerToken) ? input.ownerToken : randomBase64Url(32);
    const contact = normalizeContact(input.reporterContact);
    const contactHash = contact ? hashSecret(secret, contact) : undefined;
    const nearby = input.location ? (await store.listReports({ bbox: smallBboxAround(input.location), limit: 50 })).filter(isPublicReport) : [];
    const now = new Date();
    const report = makeReport(input, {
      id: randomUUID(),
      code: await uniqueCode(),
      ownerTokenHash: hashSecret(secret, ownerToken),
      areaKey,
      geoCell: reportGeoCell,
      reporterContactEncrypted: contact ? encryptText(piiKey, contact) : undefined,
      contactHash,
      possibleDuplicateCodes: duplicateCodes(input, nearby, contactHash),
      clientMutationId: input.clientMutationId,
      now
    });
    const event = makeEvent({
      reportId: report.id,
      reportCode: report.code,
      type: "create_report",
      message: report.knownInfoPublic,
      actor,
      now
    });
    await store.createReport(report);
    await store.addEvent(event);
    const updated = recalculateReport(report, [event], now);
    await store.updateReport(updated);

    return reportCreatedResponse(request, updated, ownerToken, 201);
  }
});

function optionalAdmin(request: HttpRequest): { ok: true; requested: true; actorHash: string } | { ok: false; requested: false } | { ok: false; requested: true; response: HttpResponseInit } {
  if (!request.headers.get("authorization") && !request.headers.get("x-admin-token")) return { ok: false, requested: false };
  const admin = requireAdmin(request);
  return admin.ok ? { ...admin, requested: true } : { ...admin, requested: true };
}

function reportCreatedResponse(request: HttpRequest, report: Report, ownerToken: string, status: number): HttpResponseInit {
  const publicUrl = `${env("PUBLIC_APP_URL", "http://localhost:5173")}/caso/${report.code}`;
  return json(request, status, {
    ok: true,
    code: report.code,
    publicUrl,
    ownerEditUrl: `${publicUrl}#ownerToken=${ownerToken}`,
    report: publicReport(report),
    message: "Reporte recibido. Guarda el enlace privado para actualizar o marcar como resuelto."
  });
}

function validClientToken(value?: string): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{32,160}$/.test(value));
}

async function uniqueCode(): Promise<string> {
  return `VE-${randomBase64Url(4).replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4).padEnd(4, "X")}`;
}

function parseBbox(value: string | null): [number, number, number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts as [number, number, number, number];
}

function splitParam(value: string | null): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}
