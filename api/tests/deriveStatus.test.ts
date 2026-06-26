import assert from "node:assert/strict";
import test from "node:test";
import { deriveStatus } from "../src/lib/deriveStatus.js";
import type { Actor, ReportEvent } from "../src/lib/types.js";

const baseReport = { sourceType: "social_media", signsOfLife: false, priority: "P2" as const };

test("one public resolution claim does not close or hide a report", () => {
  assert.equal(
    deriveStatus(baseReport, [event("resolution_claim", 0, actor("ip1", "d1"), "found")], new Date("2026-06-26T12:40:00Z")),
    "open"
  );
});

test("two independent resolution claims only mark maybe_resolved", () => {
  const events = [
    event("resolution_claim", 0, actor("ip1", "d1"), "found alive"),
    event("resolution_claim", 5, actor("ip2", "d2"), "neighbors confirmed")
  ];
  assert.equal(deriveStatus(baseReport, events, new Date("2026-06-26T12:40:00Z")), "maybe_resolved");
});

test("three independent resolution claims can close after 30 minutes", () => {
  const events = [
    event("resolution_claim", 0, actor("ip1", "d1"), "found alive"),
    event("resolution_claim", 5, actor("ip2", "d2"), "neighbors confirmed"),
    event("resolution_claim", 10, actor("ip3", "d3"), "rescue team left")
  ];
  assert.equal(deriveStatus(baseReport, events, new Date("2026-06-26T12:50:00Z")), "resolved_community");
});

test("owner token resolution wins immediately, and later reopen reopens", () => {
  const resolved = event("owner_resolved", 0, { hasOwnerToken: true }, "closed");
  assert.equal(deriveStatus(baseReport, [resolved], new Date("2026-06-26T12:05:00Z")), "resolved_owner");
  assert.equal(
    deriveStatus(baseReport, [resolved, event("reopen_claim", 10, actor("ip4", "d4"), "new info")], new Date("2026-06-26T12:20:00Z")),
    "reopened"
  );
});

function actor(ipHash: string, deviceHash: string): Actor {
  return { hasOwnerToken: false, ipHash, deviceHash, userAgentHash: `${deviceHash}-ua` };
}

function event(type: ReportEvent["type"], minute: number, eventActor: Actor, message: string): ReportEvent {
  return {
    id: `${type}-${minute}`,
    reportId: "r1",
    reportCode: "VE-TEST",
    type,
    message,
    public: true,
    actor: eventActor,
    abuseScore: 0,
    createdAt: new Date(Date.UTC(2026, 5, 26, 12, minute, 0)).toISOString()
  };
}
