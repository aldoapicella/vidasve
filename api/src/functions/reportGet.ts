import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, options } from "../lib/cors.js";
import { isPublicEvent, isPublicReport, publicEvent, publicReport } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";

app.http("reportGet", {
  route: "api/reports/{code}",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const code = String(request.params.code ?? "").toUpperCase();
    const report = await getStore().getReportByCode(code);
    if (!report || !isPublicReport(report)) return json(request, 404, { ok: false, error: "not_found" });
    const events = await getStore().listEvents(report.id);
    return json(request, 200, {
      report: publicReport(report),
      events: events.filter(isPublicEvent).map(publicEvent)
    });
  }
});
