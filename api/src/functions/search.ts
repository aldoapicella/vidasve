import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { json, options } from "../lib/cors.js";
import { publicReport, sanitizeText } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import type { PublicPerson, Report } from "../lib/types.js";

app.http("search", {
  route: "search",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const query = sanitizeText(request.query.get("q"), 120).toLowerCase();
    if (query.length < 2) return json(request, 200, { reports: [], people: [], locations: [] });

    const reports = await getStore().listReports({ limit: 500 });
    const matches = reports.filter((report) => matchesReport(report, query));
    return json(request, 200, {
      reports: matches.map(publicReport).slice(0, 25),
      people: matches.flatMap((report) => matchingPeople(report, query)).slice(0, 25),
      locations: matches.map((report) => ({
        code: report.code,
        addressText: report.addressText,
        landmark: report.landmark,
        area: report.area,
        city: report.city,
        priority: report.priority
      })).slice(0, 25)
    });
  }
});

function matchesReport(report: Report, query: string): boolean {
  return searchableReportValues(report).some((value) => value.toLowerCase().includes(query));
}

function matchingPeople(report: Report, query: string) {
  return (report.persons ?? [])
    .filter((person) => searchablePersonValues(person).some((value) => value.toLowerCase().includes(query)))
    .map((person) => ({
      reportCode: report.code,
      reportPriority: report.priority,
      reportAddress: report.addressText,
      person
    }));
}

function searchableReportValues(report: Report): string[] {
  return [
    report.code,
    report.addressText,
    report.landmark,
    report.city,
    report.area,
    report.personDescriptionPublic,
    report.knownInfoPublic,
    report.lastContactText,
    ...(report.persons ?? []).flatMap(searchablePersonValues)
  ].filter(Boolean) as string[];
}

function searchablePersonValues(person: PublicPerson): string[] {
  return [
    person.displayName,
    person.description,
    person.lastContactText,
    person.lastKnownPlace,
    person.floorOrUnit,
    person.publicContactName,
    person.publicContactRelationship
  ].filter(Boolean) as string[];
}
