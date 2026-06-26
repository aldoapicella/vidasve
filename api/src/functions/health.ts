import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, options } from "../lib/cors.js";

app.http("health", {
  route: "health",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    return json(request, 200, { ok: true, time: new Date().toISOString() });
  }
});
