import type { EventType, PlaceSuggestion, PublicConfig, PublicEvent, PublicPerson, PublicPost, PublicReport, PublicSearchResponse } from "../types";
import type { Challenge, PowAction } from "../lib/pow";
import { solvePow } from "../lib/pow";
import { getDeviceId } from "../lib/deviceId";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const SERVER_STATUSES = new Set(["new", "confirmed", "maybe_resolved", "resolved", "reopened"]);
const API_ERROR_MESSAGES: Record<string, string> = {
  address_required: "Indica una ubicación o referencia.",
  captcha_failed: "Completa la verificación humana.",
  description_required: "Describe qué ocurre con información pública y verificable.",
  duplicate_challenge: "La verificación expiró. Intenta enviar de nuevo.",
  invalid_challenge: "No se pudo validar la verificación automática. Intenta de nuevo.",
  invalid_location: "La ubicación no es válida.",
  location_required: "Marca un punto del mapa o indica que no tienes punto exacto.",
  outside_allowed_area: "El punto está fuera de las zonas activas.",
  person_required: "Agrega al menos nombre, piso o detalle público de la persona.",
  too_many_people: "Este reporte ya llegó al máximo de personas vinculadas.",
  rate_limited: "Hay demasiados intentos desde esta conexión o dispositivo. Espera unos minutos."
};

export function isRetryableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { retryable?: boolean }).retryable);
}

export function isNetworkError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { networkError?: boolean }).networkError);
}

export async function getConfig(): Promise<PublicConfig> {
  return request<PublicConfig>("/config");
}

export async function getMapToken(): Promise<{ token: string; expiresOn: string }> {
  return request<{ token: string; expiresOn: string }>("/maps/token");
}

export async function listReports(
  bbox?: [number, number, number, number],
  filter?: string,
  view: "full" | "map" = "full"
): Promise<{ items: PublicReport[]; truncated: boolean; limit: number }> {
  const params = new URLSearchParams();
  if (view === "map") params.set("view", "map");
  if (bbox) params.set("bbox", bbox.map((value) => value.toFixed(5)).join(","));
  if (filter && filter !== "all") {
    if (filter.startsWith("P")) params.set("priority", filter);
    else if (SERVER_STATUSES.has(filter)) params.set("status", filter);
  }
  const query = params.toString();
  const response = await request<{ items: PublicReport[]; truncated: boolean; limit: number }>(`/reports${query ? `?${query}` : ""}`);
  return { ...response, items: array(response.items).map(normalizeReport) };
}

export async function getReport(code: string): Promise<{ report: PublicReport; events: PublicEvent[] }> {
  const response = await request<{ report: PublicReport; events: PublicEvent[] }>(`/reports/${code}`);
  return { report: normalizeReport(response.report), events: array(response.events).map(normalizeEvent) };
}

export async function listPosts(): Promise<{ items: PublicPost[]; truncated: boolean; limit: number }> {
  const response = await request<{ items: PublicPost[]; truncated: boolean; limit: number }>("/posts?limit=50");
  return { ...response, items: array(response.items).map(normalizePost) };
}

export async function searchPlaces(query: string): Promise<{ items: PlaceSuggestion[] }> {
  const params = new URLSearchParams({ q: query });
  return request(`/places?${params}`);
}

export async function searchPublic(query: string): Promise<PublicSearchResponse> {
  const params = new URLSearchParams({ q: query });
  const response = await request<PublicSearchResponse>(`/search?${params}`);
  return {
    reports: array(response.reports).map(normalizeReport),
    people: array(response.people),
    posts: array(response.posts).map(normalizePost),
    locations: array(response.locations)
  };
}

export async function createReport(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  code: string;
  publicUrl: string;
  ownerEditUrl: string;
  report: PublicReport;
  message: string;
}> {
  ensureClientMutationId(payload);
  ensureOwnerToken(payload);
  const challenge = await proof("create_report");
  const response = await request<{
    ok: boolean;
    code: string;
    publicUrl: string;
    ownerEditUrl: string;
    report: PublicReport;
    message: string;
  }>("/reports", {
    method: "POST",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId(), challenge })
  });
  return { ...response, report: normalizeReport(response.report) };
}

export async function createEvent(code: string, type: EventType, payload: Record<string, unknown>, ownerToken?: string) {
  ensureClientMutationId(payload);
  const owner = type === "owner_resolved" || type === "owner_reopened";
  const challenge = await proof(owner ? "owner_event" : type);
  const response = await request<{ ok: boolean; report: PublicReport; event: PublicEvent }>(
    `/reports/${code}/${owner ? "owner-events" : "events"}`,
    {
      method: "POST",
      body: JSON.stringify({ ...payload, type, ownerToken, deviceId: getDeviceId(), challenge })
    }
  );
  return { ...response, report: normalizeReport(response.report), event: normalizeEvent(response.event) };
}

export async function createPost(code: string, payload: Record<string, unknown>) {
  ensureClientMutationId(payload);
  const challenge = await proof("public_post");
  const file = payload.file instanceof File && payload.file.size > 0 ? payload.file : undefined;
  if (file) {
    const body = new FormData();
    for (const [key, value] of Object.entries({ ...payload, deviceId: getDeviceId() })) {
      if (key === "file" || value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) value.forEach((item) => body.append(key, String(item)));
      else body.append(key, String(value));
    }
    body.append("challenge", JSON.stringify(challenge));
    body.append("file", file);
    const response = await request<{ ok: boolean; post: PublicPost; report: PublicReport }>(`/reports/${code}/posts`, {
      method: "POST",
      body
    });
    return { ...response, post: normalizePost(response.post), report: normalizeReport(response.report) };
  }
  const response = await request<{ ok: boolean; post: PublicPost; report: PublicReport }>(`/reports/${code}/posts`, {
    method: "POST",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId(), challenge })
  });
  return { ...response, post: normalizePost(response.post), report: normalizeReport(response.report) };
}

async function proof(action: PowAction): Promise<{ challenge: Challenge; solution: string }> {
  const challenge = await request<Challenge>("/challenge", {
    method: "POST",
    body: JSON.stringify({ action })
  });
  return { challenge, solution: await solvePow(challenge) };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "text/plain";

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers ?? {})
      }
    });
  } catch {
    const error = new Error("No se pudo conectar con la API. El envío quedó listo para reintentar cuando vuelva la conexión.");
    (error as Error & { retryable: boolean; networkError: boolean }).retryable = true;
    (error as Error & { networkError: boolean }).networkError = true;
    throw error;
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const error = new Error((body.error && API_ERROR_MESSAGES[body.error]) || body.error || `Request failed: ${response.status}`);
    if (response.status === 429 || response.status >= 500) (error as Error & { retryable: boolean }).retryable = true;
    throw error;
  }
  return body;
}

function normalizeReport(report: PublicReport): PublicReport {
  const source = (report ?? {}) as Partial<PublicReport>;
  const counters = (source.counters ?? {}) as Partial<PublicReport["counters"]>;
  return {
    ...source,
    id: text(source.id),
    code: text(source.code).toUpperCase(),
    location: normalizeLocation(source.location),
    locationAccuracy: oneOf(source.locationAccuracy, ["exact", "approximate", "zone_only"], "approximate"),
    addressText: text(source.addressText) || text(source.code) || "Ubicación sin nombre",
    type: oneOf(source.type, ["trapped_person", "missing_last_seen", "voices_or_hits", "collapsed_building_unknown"], "collapsed_building_unknown"),
    derivedStatus: text(source.derivedStatus) || "open",
    priority: oneOf(source.priority, ["P1", "P2", "P3"], "P3"),
    priorityScore: number(source.priorityScore),
    peopleCount: text(source.peopleCount) || "unknown",
    persons: array(source.persons).map(normalizePerson),
    knownInfoPublic: text(source.knownInfoPublic),
    signsOfLife: source.signsOfLife === true,
    riskFlags: array(source.riskFlags).map(text).filter(Boolean),
    publishContact: source.publishContact === true,
    possibleDuplicateCodes: array(source.possibleDuplicateCodes).map(text).filter(Boolean),
    updatedAt: text(source.updatedAt) || new Date(0).toISOString(),
    counters: {
      updates: number(counters.updates),
      nearbyHelp: number(counters.nearbyHelp),
      resolutionClaims: number(counters.resolutionClaims),
      reopenClaims: number(counters.reopenClaims),
      abuseFlags: number(counters.abuseFlags)
    }
  } as PublicReport;
}

function normalizeEvent(event: PublicEvent): PublicEvent {
  const source = (event ?? {}) as Partial<PublicEvent>;
  return {
    ...source,
    id: text(source.id),
    reportId: text(source.reportId),
    reportCode: text(source.reportCode).toUpperCase(),
    type: text(source.type) as PublicEvent["type"],
    message: text(source.message),
    mediaUrl: apiMediaUrl(text(source.mediaUrl)),
    thumbnailUrl: apiMediaUrl(text(source.thumbnailUrl)),
    tags: array(source.tags).map(text).filter(Boolean),
    public: source.public !== false,
    abuseScore: number(source.abuseScore),
    createdAt: text(source.createdAt) || new Date(0).toISOString()
  } as PublicEvent;
}

function normalizePost(post: PublicPost): PublicPost {
  const source = (post ?? {}) as Partial<PublicPost>;
  const report = (source.report ?? {}) as Partial<PublicPost["report"]>;
  return {
    ...source,
    id: text(source.id),
    reportCode: text(source.reportCode).toUpperCase(),
    reportId: text(source.reportId),
    text: text(source.text),
    mediaUrl: apiMediaUrl(text(source.mediaUrl)),
    thumbnailUrl: apiMediaUrl(text(source.thumbnailUrl)),
    type: oneOf(source.type, ["story", "photo", "flyer", "screenshot", "pdf", "update"], "story"),
    tags: array(source.tags).map(text).filter(Boolean),
    createdAt: text(source.createdAt) || new Date(0).toISOString(),
    report: {
      code: text(report.code || source.reportCode).toUpperCase(),
      addressText: text(report.addressText) || "Ubicación sin nombre",
      priority: oneOf(report.priority, ["P1", "P2", "P3"], "P3"),
      derivedStatus: text(report.derivedStatus) || "open"
    }
  } as PublicPost;
}

function apiMediaUrl(value: string): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/api/")) return value;
  return `${API_BASE}${value.slice(4)}`;
}

function normalizePerson(person: PublicPerson, index: number): PublicPerson {
  const source = (person ?? {}) as Partial<PublicPerson>;
  return {
    ...source,
    id: text(source.id) || `person-${index + 1}`,
    displayName: text(source.displayName) || "Persona sin identificar",
    status: oneOf(source.status, ["trapped", "missing", "signals_of_life", "found", "needs_verification"], "needs_verification")
  };
}

function normalizeLocation(location: PublicReport["location"]): PublicReport["location"] {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates)) return undefined;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { type: "Point", coordinates: [lng, lat] } : undefined;
}

function oneOf<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function number(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function array<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function ensureClientMutationId(payload: Record<string, unknown>): void {
  if (!text(payload.clientMutationId)) payload.clientMutationId = crypto.randomUUID();
}

function ensureOwnerToken(payload: Record<string, unknown>): void {
  if (!text(payload.ownerToken)) payload.ownerToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
}
