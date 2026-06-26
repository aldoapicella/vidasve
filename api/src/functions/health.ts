import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { getStore } from "../lib/store.js";

app.http("health", {
  route: "health",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    return json(request, 200, { ok: true, time: new Date().toISOString() });
  }
});

app.http("healthDeep", {
  route: "health/deep",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const checks: Record<string, boolean> = {};

    checks.config = ["APP_HMAC_SECRET", "PII_ENCRYPTION_KEY", "PUBLIC_APP_URL", "AZURE_MAPS_CLIENT_ID", "COSMOS_ENDPOINT"].every((name) => Boolean(env(name)));

    try {
      await getStore().listReports({ limit: 1 });
      checks.cosmos = true;
    } catch {
      checks.cosmos = false;
    }

    try {
      checks.azureMapsToken = Boolean(await new DefaultAzureCredential().getToken("https://atlas.microsoft.com/.default"));
    } catch {
      checks.azureMapsToken = false;
    }

    const ok = Object.values(checks).every(Boolean);
    return json(request, ok ? 200 : 503, { ok, checks, time: new Date().toISOString(), version: env("WEBSITE_SITE_NAME") });
  }
});
