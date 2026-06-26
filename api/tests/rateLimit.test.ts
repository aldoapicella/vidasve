import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimits, InMemoryRateLimitStore } from "../src/lib/rateLimit.js";

test("rate limit blocks excess create_report by IP", async () => {
  const store = new InMemoryRateLimitStore();
  const identity = { ipHash: "ip-a", deviceHash: "device-a", contactHash: "contact-a", geoCell: "cell-a" };
  const now = new Date("2026-06-26T12:00:00Z");
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await checkRateLimits(store, "create_report", identity, now)).ok, true);
  }
  assert.equal((await checkRateLimits(store, "create_report", identity, now)).ok, false);
});

test("rate limit resets on a new window", async () => {
  const store = new InMemoryRateLimitStore();
  const identity = { ipHash: "ip-b", deviceHash: "device-b", contactHash: "contact-b", geoCell: "cell-b" };
  for (let i = 0; i < 5; i += 1) {
    await checkRateLimits(store, "create_report", identity, new Date("2026-06-26T12:00:00Z"));
  }
  assert.equal((await checkRateLimits(store, "create_report", identity, new Date("2026-06-26T13:01:00Z"))).ok, true);
});
