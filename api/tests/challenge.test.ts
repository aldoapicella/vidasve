import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { claimChallenge, createChallenge, hasLeadingZeroBits, verifyChallenge } from "../src/lib/challenge.js";
import { InMemoryRateLimitStore } from "../src/lib/rateLimit.js";

test("hasLeadingZeroBits validates partial-byte difficulty", () => {
  assert.equal(hasLeadingZeroBits(Buffer.from([0b00011111]), 3), true);
  assert.equal(hasLeadingZeroBits(Buffer.from([0b00111111]), 3), false);
});

test("verifyChallenge accepts a valid solution and rejects wrong action", () => {
  const secret = "test-secret";
  const challenge = createChallenge("add_info", secret, new Date("2026-06-26T12:00:00Z"));
  let solution = 0;
  while (true) {
    const digest = createHash("sha256").update(`${challenge.nonce}:${solution}`).digest();
    if (hasLeadingZeroBits(digest, challenge.difficulty)) break;
    solution += 1;
  }
  assert.deepEqual(
    verifyChallenge({ challenge, solution: String(solution) }, "add_info", secret, new Date("2026-06-26T12:01:00Z")),
    { ok: true }
  );
  assert.equal(
    verifyChallenge({ challenge, solution: String(solution) }, "create_report", secret, new Date("2026-06-26T12:01:00Z")).ok,
    false
  );
});

test("claimChallenge rejects a reused nonce", async () => {
  const store = new InMemoryRateLimitStore();
  const challenge = createChallenge("add_info", "test-secret", new Date("2026-06-26T12:00:00Z"));
  const submission = { challenge, solution: "0" };
  assert.equal(await claimChallenge(store, submission, new Date("2026-06-26T12:00:00Z")), true);
  assert.equal(await claimChallenge(store, submission, new Date("2026-06-26T12:01:00Z")), false);
});
