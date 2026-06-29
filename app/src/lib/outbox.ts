import type { EventType } from "../types";

const KEY = "vidasve_outbox_v1";
const MAX_ITEMS = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type OutboxItem =
  | { id: string; kind: "create_report"; payload: Record<string, unknown>; createdAt: string; attempts: number; lastError?: string }
  | { id: string; kind: "event"; code: string; type: EventType; payload: Record<string, unknown>; ownerToken?: string; createdAt: string; attempts: number; lastError?: string }
  | { id: string; kind: "post"; code: string; payload: Record<string, unknown>; createdAt: string; attempts: number; lastError?: string };

export type NewOutboxItem =
  | { kind: "create_report"; payload: Record<string, unknown>; lastError?: string }
  | { kind: "event"; code: string; type: EventType; payload: Record<string, unknown>; ownerToken?: string; lastError?: string }
  | { kind: "post"; code: string; payload: Record<string, unknown>; lastError?: string };

export function listOutbox(): OutboxItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || "[]") as OutboxItem[];
    const before = JSON.stringify(items);
    const fresh = items
      .filter((item) => Date.now() - Date.parse(item.createdAt) < MAX_AGE_MS)
      .filter((item) => !(item.kind === "event" && item.ownerToken))
      .filter((item) => !item.payload.captchaToken)
      .map(safeItem)
      .slice(0, MAX_ITEMS);
    if (JSON.stringify(fresh) !== before) saveOutbox(fresh);
    return fresh;
  } catch {
    return [];
  }
}

export function enqueueOutbox(item: NewOutboxItem): OutboxItem {
  const next = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0
  } as OutboxItem;
  saveOutbox([...listOutbox(), next].slice(-MAX_ITEMS));
  return next;
}

export function removeOutboxItem(id: string): void {
  saveOutbox(listOutbox().filter((item) => item.id !== id));
}

export function updateOutboxItem(next: OutboxItem): void {
  saveOutbox(listOutbox().map((item) => item.id === next.id ? next : item));
}

export function clearOutbox(): void {
  saveOutbox([]);
}

function saveOutbox(items: OutboxItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function safeItem(item: OutboxItem): OutboxItem {
  if (item.kind !== "create_report") return item;
  return { ...item, payload: { ...item.payload, reporterContact: undefined, captchaToken: undefined } };
}
