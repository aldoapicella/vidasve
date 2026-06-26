import type { HttpRequest } from "@azure/functions";
import type { Actor } from "./types.js";
import { hmacHex } from "./crypto.js";
import { normalizeContact, sanitizeText } from "./sanitize.js";

export function actorFromRequest(
  request: HttpRequest,
  secret: string,
  input: { deviceId?: string; contact?: string; hasOwnerToken?: boolean }
): Actor {
  const ipPrefix = normalizedIpPrefix(request.headers.get("x-forwarded-for") ?? "");
  const userAgent = sanitizeText(request.headers.get("user-agent") ?? "", 240);
  const deviceId = input.deviceId || sanitizeText(request.headers.get("x-device-id") ?? "", 120);
  const contact = normalizeContact(input.contact);
  return {
    hasOwnerToken: Boolean(input.hasOwnerToken),
    ipHash: ipPrefix ? hmacHex(secret, ipPrefix) : undefined,
    deviceHash: deviceId ? hmacHex(secret, deviceId) : undefined,
    contactHash: contact ? hmacHex(secret, contact) : null,
    userAgentHash: userAgent ? hmacHex(secret, userAgent) : undefined
  };
}

function normalizedIpPrefix(forwardedFor: string): string {
  const first = forwardedFor.split(",")[0]?.trim() ?? "";
  if (!first) return "unknown";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(first)) {
    return first.split(".").slice(0, 3).join(".") + ".0/24";
  }
  if (first.includes(":")) {
    return first.split(":").slice(0, 4).join(":") + "::/56";
  }
  return first;
}
