import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { env } from "./config.js";
import { hmacHex, safeEqual } from "./crypto.js";
import { json } from "./cors.js";

export function requireAdmin(request: HttpRequest): { ok: true; actorHash: string } | { ok: false; response: HttpResponseInit } {
  const expected = env("ADMIN_API_TOKEN");
  if (!expected) return { ok: false, response: json(request, 503, { ok: false, error: "admin_not_configured" }) };
  const supplied = bearer(request.headers.get("authorization")) || request.headers.get("x-admin-token") || "";
  if (!supplied || !safeEqual(hmacHex(expected, supplied), hmacHex(expected, expected))) {
    return { ok: false, response: json(request, 401, { ok: false, error: "unauthorized" }) };
  }
  return { ok: true, actorHash: hmacHex(env("APP_HMAC_SECRET", expected), supplied) };
}

function bearer(value: string | null): string {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}
