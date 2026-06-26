import { createHash } from "node:crypto";
import type { ChallengeEnvelope, ChallengeSubmission, PublicAction } from "./types.js";
import { hmacBase64Url, safeEqual, randomBase64Url } from "./crypto.js";

export const ACTION_DIFFICULTY: Record<PublicAction, number> = {
  create_report: 18,
  add_info: 16,
  nearby_help: 16,
  duplicate_claim: 17,
  resolution_claim: 19,
  abuse_flag: 20,
  risk_update: 16,
  new_signs_of_life: 16,
  reopen_claim: 17,
  owner_event: 16,
  maps_token: 10
};

const MAX_AGE_MS = 5 * 60 * 1000;

interface ChallengeReplayStore {
  claimOnce(bucket: string, windowSeconds: number, now: Date): Promise<boolean>;
}

function payload(challenge: Omit<ChallengeEnvelope, "signature">): string {
  return `${challenge.nonce}.${challenge.issuedAt}.${challenge.action}.${challenge.difficulty}`;
}

export function createChallenge(
  action: PublicAction,
  secret: string,
  now = new Date(),
  difficulty = ACTION_DIFFICULTY[action]
): ChallengeEnvelope {
  const unsigned = {
    nonce: randomBase64Url(18),
    issuedAt: now.toISOString(),
    action,
    difficulty
  };
  return {
    ...unsigned,
    signature: hmacBase64Url(secret, payload(unsigned))
  };
}

export function hasLeadingZeroBits(hash: Buffer, bits: number): boolean {
  let remaining = bits;
  for (const byte of hash) {
    if (remaining <= 0) return true;
    if (remaining >= 8) {
      if (byte !== 0) return false;
      remaining -= 8;
      continue;
    }
    return (byte >> (8 - remaining)) === 0;
  }
  return remaining <= 0;
}

export function verifyChallenge(
  submission: ChallengeSubmission | undefined,
  action: PublicAction,
  secret: string,
  now = new Date()
): { ok: true } | { ok: false; error: string } {
  if (!submission?.challenge || typeof submission.solution !== "string") {
    return { ok: false, error: "missing_challenge" };
  }

  const { challenge, solution } = submission;
  const minDifficulty = ACTION_DIFFICULTY[action];
  if (challenge.action !== action || challenge.difficulty < minDifficulty) {
    return { ok: false, error: "wrong_action" };
  }

  const expectedSignature = hmacBase64Url(secret, payload(challenge));
  if (!safeEqual(expectedSignature, challenge.signature)) {
    return { ok: false, error: "bad_signature" };
  }

  const issuedAt = Date.parse(challenge.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(now.getTime() - issuedAt) > MAX_AGE_MS) {
    return { ok: false, error: "expired_challenge" };
  }

  const digest = createHash("sha256").update(`${challenge.nonce}:${solution}`).digest();
  if (!hasLeadingZeroBits(digest, challenge.difficulty)) {
    return { ok: false, error: "bad_solution" };
  }

  return { ok: true };
}

export function claimChallenge(store: ChallengeReplayStore, submission: ChallengeSubmission, now = new Date()): Promise<boolean> {
  return store.claimOnce(`challenge:${submission.challenge.nonce}`, Math.ceil(MAX_AGE_MS / 1000), now);
}
