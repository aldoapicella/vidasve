import type { EventType, PlaceSuggestion, PublicConfig, PublicEvent, PublicPost, PublicReport, PublicSearchResponse } from "../types";
import type { Challenge, PowAction } from "../lib/pow";
import { solvePow } from "../lib/pow";
import { getDeviceId } from "../lib/deviceId";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const SERVER_STATUSES = new Set(["new", "confirmed", "maybe_resolved", "resolved", "reopened"]);
const API_ERROR_MESSAGES: Record<string, string> = {
  address_required: "Indica una ubicación o referencia.",
  captcha_failed: "Escribe VIDA en la verificación humana.",
  description_required: "Describe qué ocurre con información pública y verificable.",
  duplicate_challenge: "La verificación expiró. Intenta enviar de nuevo.",
  invalid_challenge: "No se pudo validar la verificación automática. Intenta de nuevo.",
  invalid_location: "La ubicación no es válida.",
  location_required: "Marca un punto del mapa o indica que no tienes punto exacto.",
  outside_allowed_area: "El punto está fuera de las zonas activas.",
  rate_limited: "Hay demasiados intentos desde esta conexión o dispositivo. Espera unos minutos."
};

export async function getConfig(): Promise<PublicConfig> {
  return request<PublicConfig>("/config");
}

export async function getMapToken(): Promise<{ token: string; expiresOn: string }> {
  return request<{ token: string; expiresOn: string }>("/maps/token");
}

export async function listReports(
  bbox?: [number, number, number, number],
  filter?: string
): Promise<{ items: PublicReport[]; truncated: boolean; limit: number }> {
  const params = new URLSearchParams();
  if (bbox) params.set("bbox", bbox.map((value) => value.toFixed(5)).join(","));
  if (filter && filter !== "all") {
    if (filter.startsWith("P")) params.set("priority", filter);
    else if (SERVER_STATUSES.has(filter)) params.set("status", filter);
  }
  return request<{ items: PublicReport[]; truncated: boolean; limit: number }>(`/reports?${params}`);
}

export async function getReport(code: string): Promise<{ report: PublicReport; events: PublicEvent[] }> {
  return request(`/reports/${code}`);
}

export async function listPosts(): Promise<{ items: PublicPost[]; truncated: boolean; limit: number }> {
  return request("/posts?limit=50");
}

export async function searchPlaces(query: string): Promise<{ items: PlaceSuggestion[] }> {
  const params = new URLSearchParams({ q: query });
  return request(`/places?${params}`);
}

export async function searchPublic(query: string): Promise<PublicSearchResponse> {
  const params = new URLSearchParams({ q: query });
  return request(`/search?${params}`);
}

export async function createReport(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  code: string;
  publicUrl: string;
  ownerEditUrl: string;
  report: PublicReport;
  message: string;
}> {
  const challenge = await proof("create_report");
  return request("/reports", {
    method: "POST",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId(), challenge })
  });
}

export async function createEvent(code: string, type: EventType, payload: Record<string, unknown>, ownerToken?: string) {
  const owner = type === "owner_resolved" || type === "owner_reopened";
  const challenge = await proof(owner ? "owner_event" : type);
  return request<{ ok: boolean; report: PublicReport; event: PublicEvent }>(
    `/reports/${code}/${owner ? "owner-events" : "events"}`,
    {
      method: "POST",
      body: JSON.stringify({ ...payload, type, ownerToken, deviceId: getDeviceId(), challenge })
    }
  );
}

export async function createPost(code: string, payload: Record<string, unknown>) {
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
    return request<{ ok: boolean; post: PublicPost; report: PublicReport }>(`/reports/${code}/posts`, {
      method: "POST",
      body
    });
  }
  return request<{ ok: boolean; post: PublicPost; report: PublicReport }>(`/reports/${code}/posts`, {
    method: "POST",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId(), challenge })
  });
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
    throw new Error("No se pudo conectar con la API. Revisa la conexión, CORS o la URL VITE_API_BASE_URL.");
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error((body.error && API_ERROR_MESSAGES[body.error]) || body.error || `Request failed: ${response.status}`);
  return body;
}
