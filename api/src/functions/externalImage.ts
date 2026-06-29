import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { corsHeaders, json, options } from "../lib/cors.js";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

app.http("externalImageGet", {
  route: "api/external-image",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const url = safeExternalImageUrl(String(request.query.get("url") ?? ""));
    if (!url) return json(request, 400, { ok: false, error: "invalid_image_url" });

    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "VidasVE image proxy"
        }
      });
      if (!response.ok) return json(request, 404, { ok: false, error: "image_not_found" });

      const contentType = normalizeContentType(response.headers.get("content-type"));
      if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
        return json(request, 415, { ok: false, error: "unsupported_image_type" });
      }

      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_IMAGE_BYTES) return json(request, 413, { ok: false, error: "image_too_large" });

      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > MAX_IMAGE_BYTES) return json(request, 413, { ok: false, error: "image_too_large" });

      return {
        status: 200,
        headers: {
          ...corsHeaders(request),
          "Content-Type": contentType,
          "Content-Length": String(body.length),
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff"
        },
        body
      };
    } catch {
      return json(request, 502, { ok: false, error: "image_fetch_failed" });
    }
  }
});

export function safeExternalImageUrl(value: string): string | undefined {
  if (!value || value.length > 1000) return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return undefined;
    if (hostname === "venezuelatebusca.com") return url.toString();
    if (hostname.endsWith(".supabase.co")) return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeContentType(value: string | null): string | undefined {
  return value?.split(";")[0]?.trim().toLowerCase() || undefined;
}
