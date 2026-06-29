import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { actorFromRequest } from "../lib/actor.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { getStore } from "../lib/store.js";

app.http("mapsToken", {
  route: "api/maps/token",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const secret = env("APP_HMAC_SECRET", "dev-secret-change-me");
    const actor = actorFromRequest(request, secret, {});
    const store = getStore();
    const rate = await checkRateLimits(store, "maps_token", actor);
    if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });
    const day = new Date().toISOString().slice(0, 10);
    const quota = await store.increment(`mapTokenQuota:${day}`, 86400, new Date());
    if (quota > Number(env("DAILY_MAP_TOKEN_SOFT_LIMIT", "5000"))) {
      return json(request, 429, { ok: false, error: "map_token_daily_limit" });
    }

    try {
      const token = await new DefaultAzureCredential().getToken("https://atlas.microsoft.com/.default");
      if (!token) throw new Error("No Azure Maps token returned");
      return json(request, 200, {
        token: token.token,
        expiresOn: new Date(token.expiresOnTimestamp).toISOString()
      });
    } catch {
      return json(request, 503, {
        ok: false,
        error: "maps_token_unavailable",
        message: "Azure Maps token requires managed identity or Azure login in local development."
      });
    }
  }
});
