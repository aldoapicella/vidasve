import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, options } from "../lib/cors.js";
import { publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";

app.http("reportsList", {
  route: "reports",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const bbox = parseBbox(request.query.get("bbox"));
    const priorities = splitParam(request.query.get("priority"));
    const statuses = splitParam(request.query.get("status"));
    const since = request.query.get("since") ?? undefined;
    const items = await getStore().listReports({ bbox, priorities, statuses, since, limit: 500 });
    return json(request, 200, { items: items.map(publicReport) });
  }
});

function parseBbox(value: string | null): [number, number, number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts as [number, number, number, number];
}

function splitParam(value: string | null): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}
