import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { createChallenge, ACTION_DIFFICULTY } from "../lib/challenge.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import type { PublicAction } from "../lib/types.js";

app.http("challenge", {
  route: "challenge",
  authLevel: "anonymous",
  methods: ["POST", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const body = (await request.json().catch(() => ({}))) as { action?: PublicAction };
    const action = body.action && ACTION_DIFFICULTY[body.action] ? body.action : "create_report";
    return json(request, 200, createChallenge(action, env("APP_HMAC_SECRET", "dev-secret-change-me")));
  }
});
