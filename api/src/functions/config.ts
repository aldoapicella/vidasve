import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, options } from "../lib/cors.js";
import { publicConfig } from "../lib/config.js";

app.http("config", {
  route: "config",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    return json(request, 200, publicConfig());
  }
});
