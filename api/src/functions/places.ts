import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { actorFromRequest } from "../lib/actor.js";
import { env, envBool } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { parseAllowedBboxes } from "../lib/geo.js";
import { mapAzurePlaces } from "../lib/places.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { getStore } from "../lib/store.js";

app.http("places", {
  route: "places",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    if (!envBool("GEOCODING_ENABLED")) return json(request, 200, { items: [] });
    const query = (request.query.get("q") ?? "").trim();
    if (query.length < 3) return json(request, 200, { items: [] });

    const secret = env("APP_HMAC_SECRET", "dev-secret-change-me");
    const actor = actorFromRequest(request, secret, { deviceId: request.headers.get("x-device-id") ?? undefined });
    const rate = await checkRateLimits(getStore(), "places_search", actor);
    if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });

    try {
      const token = await new DefaultAzureCredential().getToken("https://atlas.microsoft.com/.default");
      const clientId = env("AZURE_MAPS_CLIENT_ID");
      if (!token || !clientId) throw new Error("Azure Maps unavailable");
      const center = parseCenter(env("DEFAULT_CENTER_JSON"));
      const url = new URL("https://atlas.microsoft.com/search/fuzzy/json");
      url.searchParams.set("api-version", "1.0");
      url.searchParams.set("query", query);
      url.searchParams.set("countrySet", "VE");
      url.searchParams.set("limit", "8");
      url.searchParams.set("lat", String(center[0]));
      url.searchParams.set("lon", String(center[1]));
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token.token}`,
          "x-ms-client-id": clientId
        }
      });
      if (!response.ok) throw new Error(`Azure Maps search failed: ${response.status}`);
      const body = await response.json() as { results?: unknown[] };
      return json(request, 200, {
        items: mapAzurePlaces((body.results ?? []) as Parameters<typeof mapAzurePlaces>[0], parseAllowedBboxes(env("ALLOWED_BBOXES_JSON")))
      });
    } catch {
      return json(request, 503, { ok: false, error: "places_unavailable" });
    }
  }
});

function parseCenter(value: string): [number, number] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.length === 2) return [Number(parsed[0]), Number(parsed[1])];
  } catch {
    // ponytail: invalid config falls back to Caracas; add stricter boot validation if configs drift.
  }
  return [10.6031, -66.9334];
}
