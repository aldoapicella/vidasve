import type { EventType } from "../types";

export type PowAction =
  | "create_report"
  | "add_info"
  | "add_person"
  | "nearby_help"
  | "duplicate_claim"
  | "resolution_claim"
  | "reopen_claim"
  | "abuse_flag"
  | "risk_update"
  | "new_signs_of_life"
  | "owner_event"
  | "public_post";

export interface Challenge {
  nonce: string;
  issuedAt: string;
  action: PowAction;
  difficulty: number;
  signature: string;
}

export async function solvePow(challenge: Challenge): Promise<string> {
  let solution = 0;
  while (true) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${challenge.nonce}:${solution}`));
    if (hasLeadingZeroBits(new Uint8Array(bytes), challenge.difficulty)) return String(solution);
    solution += 1;
    if (solution % 500 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export function actionForEvent(type: EventType): PowAction {
  return type === "owner_resolved" || type === "owner_reopened" ? "owner_event" : type;
}

function hasLeadingZeroBits(bytes: Uint8Array, bits: number): boolean {
  let remaining = bits;
  for (const byte of bytes) {
    if (remaining <= 0) return true;
    if (remaining >= 8) {
      if (byte !== 0) return false;
      remaining -= 8;
      continue;
    }
    return byte >> (8 - remaining) === 0;
  }
  return remaining <= 0;
}
