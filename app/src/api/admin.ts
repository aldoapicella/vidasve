import type { PublicEvent, PublicReport } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const ADMIN_BASE = "/admin";

export type AdminQueueStatus = "flagged" | "public" | "queued" | "hidden" | "removed";
export type AdminQueueItem =
  | { kind: "report"; report: PublicReport & { visibility?: string }; createdAt: string }
  | { kind: "event"; event: PublicEvent & { visibility?: string }; report?: PublicReport; createdAt: string };

export async function listAdminQueue(token: string, status: AdminQueueStatus): Promise<AdminQueueItem[]> {
  const body = await adminRequest<{ items: AdminQueueItem[] }>(token, `${ADMIN_BASE}/moderation?status=${encodeURIComponent(status)}`);
  return Array.isArray(body.items) ? body.items : [];
}

export async function moderateAdminReport(token: string, code: string, visibility: "public" | "hidden", reason: string): Promise<void> {
  await adminRequest(token, `${ADMIN_BASE}/reports/${encodeURIComponent(code)}/moderation`, "POST", { visibility, reason });
}

export async function removeAdminReport(token: string, code: string, reason: string): Promise<void> {
  await adminRequest(token, `${ADMIN_BASE}/reports/${encodeURIComponent(code)}/remove`, "POST", { reason });
}

export async function moderateAdminEvent(token: string, code: string, eventId: string, visibility: "public" | "hidden", reason: string): Promise<void> {
  await adminRequest(token, `${ADMIN_BASE}/reports/${encodeURIComponent(code)}/events/${encodeURIComponent(eventId)}/moderation`, "POST", { visibility, reason });
}

async function adminRequest<T>(token: string, path: string, method = "GET", body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}
