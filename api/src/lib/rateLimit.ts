import type { PublicAction } from "./types.js";

export interface RateLimitIdentity {
  ipHash?: string;
  deviceHash?: string;
  contactHash?: string | null;
  reportCode?: string;
  geoCell?: string;
}

export interface RateLimitStore {
  increment(bucket: string, windowSeconds: number, now: Date): Promise<number>;
  claimOnce(bucket: string, windowSeconds: number, now: Date): Promise<boolean>;
}

type Limit = { key: keyof RateLimitIdentity; windowSeconds: number; max: number; label: string };

const LIMITS: Partial<Record<PublicAction, Limit[]>> = {
  create_report: [
    { key: "ipHash", windowSeconds: 3600, max: 5, label: "ip" },
    { key: "deviceHash", windowSeconds: 3600, max: 8, label: "device" },
    { key: "contactHash", windowSeconds: 3600, max: 5, label: "contact" },
    { key: "geoCell", windowSeconds: 600, max: 20, label: "geo" }
  ],
  add_info: commonMutationLimits(20, 30, 20, 10, 60),
  nearby_help: commonMutationLimits(20, 30, 20, 10, 60),
  resolution_claim: commonMutationLimits(3, 5, 3, 3, 20),
  duplicate_claim: commonMutationLimits(10, 15, 10, 5, 30),
  abuse_flag: commonMutationLimits(10, 10, 10, 5, 20),
  reopen_claim: commonMutationLimits(10, 15, 10, 5, 30),
  risk_update: commonMutationLimits(20, 30, 20, 10, 60),
  new_signs_of_life: commonMutationLimits(20, 30, 20, 10, 60),
  public_post: commonMutationLimits(10, 15, 10, 8, 30),
  owner_event: [
    { key: "ipHash", windowSeconds: 3600, max: 20, label: "ip" },
    { key: "reportCode", windowSeconds: 600, max: 15, label: "report" }
  ],
  maps_token: [
    { key: "ipHash", windowSeconds: 60, max: 60, label: "ip-minute" },
    { key: "deviceHash", windowSeconds: 3600, max: 300, label: "device-hour" }
  ],
  places_search: [
    { key: "ipHash", windowSeconds: 60, max: 30, label: "ip-minute" },
    { key: "deviceHash", windowSeconds: 3600, max: 250, label: "device-hour" }
  ]
};

export async function checkRateLimits(
  store: RateLimitStore,
  action: PublicAction,
  identity: RateLimitIdentity,
  now = new Date()
): Promise<{ ok: true } | { ok: false; bucket: string }> {
  for (const limit of LIMITS[action] ?? []) {
    const value = identity[limit.key];
    if (!value) continue;
    const windowId = Math.floor(now.getTime() / (limit.windowSeconds * 1000));
    const bucket = `${String(limit.key)}:${value}:${action}:${limit.label}:${windowId}`;
    const count = await store.increment(bucket, limit.windowSeconds, now);
    if (count > limit.max) return { ok: false, bucket };
  }
  return { ok: true };
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(bucket: string, windowSeconds: number, now = new Date()): Promise<number> {
    const current = this.buckets.get(bucket);
    if (!current || current.resetAt <= now.getTime()) {
      this.buckets.set(bucket, { count: 1, resetAt: now.getTime() + windowSeconds * 1000 });
      return 1;
    }
    current.count += 1;
    return current.count;
  }

  async claimOnce(bucket: string, windowSeconds: number, now = new Date()): Promise<boolean> {
    const current = this.buckets.get(bucket);
    if (current && current.resetAt > now.getTime()) return false;
    this.buckets.set(bucket, { count: 1, resetAt: now.getTime() + windowSeconds * 1000 });
    return true;
  }
}

function commonMutationLimits(ip: number, device: number, contact: number, report: number, geo: number): Limit[] {
  return [
    { key: "ipHash", windowSeconds: 3600, max: ip, label: "ip" },
    { key: "deviceHash", windowSeconds: 3600, max: device, label: "device" },
    { key: "contactHash", windowSeconds: 3600, max: contact, label: "contact" },
    { key: "reportCode", windowSeconds: 600, max: report, label: "report" },
    { key: "geoCell", windowSeconds: 600, max: geo, label: "geo" }
  ];
}
