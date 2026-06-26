import type { Priority, Report } from "./types.js";

export interface PriorityInput {
  type: Report["type"];
  signsOfLife?: boolean;
  locationAccuracy?: Report["locationAccuracy"];
  sourceType?: string;
  lastContactAt?: string;
  peopleCount?: Report["peopleCount"];
  riskFlags?: string[];
  abuseScore?: number;
}

export function calculatePriority(input: PriorityInput, now = new Date()): {
  priority: Priority;
  score: number;
} {
  let score = 0;

  if (input.signsOfLife) score += 50;
  if (input.type === "trapped_person") score += 35;
  if (input.type === "voices_or_hits") score += 45;
  if (input.locationAccuracy === "exact") score += 20;
  if (input.locationAccuracy === "approximate") score += 10;
  if (input.sourceType === "family" || input.sourceType === "witness") score += 15;
  if (isSameUtcDay(input.lastContactAt, now)) score += 20;
  if (input.peopleCount === "2-5") score += 10;
  if (input.peopleCount === "more_than_5") score += 20;
  if ((input.riskFlags ?? []).some((flag) => ["gas", "fire", "water", "cables"].includes(flag))) {
    score += 15;
  }
  if (input.sourceType === "social_media") score -= 10;
  if (input.locationAccuracy === "zone_only") score -= 15;
  if ((input.abuseScore ?? 0) > 0) score -= 30;

  return {
    score,
    priority: score >= 80 ? "P1" : score >= 45 ? "P2" : "P3"
  };
}

function isSameUtcDay(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}
