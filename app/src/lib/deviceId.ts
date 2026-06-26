const KEY = "maparescate_device_id";

export function getDeviceId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(KEY, next);
  return next;
}
