import assert from "node:assert/strict";
import test from "node:test";
import { calculatePriority } from "../src/lib/priority.js";

test("calculatePriority returns P1 for life signs and trapped person", () => {
  const result = calculatePriority(
    {
      type: "trapped_person",
      signsOfLife: true,
      locationAccuracy: "exact",
      sourceType: "family",
      peopleCount: "2-5",
      riskFlags: ["gas"],
      lastContactAt: "2026-06-26T12:00:00Z"
    },
    new Date("2026-06-26T13:00:00Z")
  );
  assert.equal(result.priority, "P1");
  assert.equal(result.score, 165);
});

test("calculatePriority penalizes vague social reports", () => {
  const result = calculatePriority({
    type: "missing_last_seen",
    locationAccuracy: "zone_only",
    sourceType: "social_media",
    peopleCount: "unknown",
    riskFlags: []
  });
  assert.equal(result.priority, "P3");
  assert.equal(result.score, -25);
});
