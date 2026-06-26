import type { EventType, PublicConfig, PublicEvent, PublicPost, PublicReport } from "../types";
import type { Challenge, PowAction } from "../lib/pow";
import { solvePow } from "../lib/pow";
import { getDeviceId } from "../lib/deviceId";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const SERVER_STATUSES = new Set(["new", "confirmed", "maybe_resolved", "resolved", "reopened"]);

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
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.method && init.method !== "GET") headers["x-device-id"] = getDeviceId();

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}
