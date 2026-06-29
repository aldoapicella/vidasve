import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { actorFromRequest } from "../lib/actor.js";
import { env } from "../lib/config.js";
import { json, options } from "../lib/cors.js";
import { checkRateLimits } from "../lib/rateLimit.js";
import { publicPost, publicReport, sanitizeText } from "../lib/sanitize.js";
import { getStore } from "../lib/store.js";
import type { PublicPerson, Report } from "../lib/types.js";

app.http("search", {
  route: "api/search",
  authLevel: "anonymous",
  methods: ["GET", "OPTIONS"],
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    if (request.method === "OPTIONS") return options(request);
    const query = normalizeSearch(sanitizeText(request.query.get("q"), 120));
    if (query.length < 2) return json(request, 200, { reports: [], people: [], posts: [], locations: [] });

    const store = getStore();
    const actor = actorFromRequest(request, env("APP_HMAC_SECRET", "dev-secret-change-me"), {});
    const rate = await checkRateLimits(store, "search", actor);
    if (!rate.ok) return json(request, 429, { ok: false, error: "rate_limited" });
    const matches = (await store.searchReports(query, 50)).filter((report) => matchesReport(report, query));
    const posts = (await store.searchPublicPostEvents(query, 25)).map(({ event, report }) => publicPost(event, report));
    return json(request, 200, {
      reports: matches.map(publicReport).slice(0, 25),
      people: matches.flatMap((report) => matchingPeople(report, query)).slice(0, 25),
      posts: posts.slice(0, 25),
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
  return searchableReportValues(report).some((value) => normalizeSearch(value).includes(query));
}

function matchingPeople(report: Report, query: string) {
  return (report.persons ?? [])
    .filter((person) => searchablePersonValues(person).some((value) => normalizeSearch(value).includes(query)))
    .map((person) => ({
      reportCode: report.code,
      reportPriority: report.priority,
      reportAddress: report.addressText,
      person
    }));
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
