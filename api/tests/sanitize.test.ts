import assert from "node:assert/strict";
import test from "node:test";
import { publicReport } from "../src/lib/sanitize.js";
import type { Report } from "../src/lib/types.js";

test("publicReport removes private and Cosmos metadata fields", () => {
  const report = {
    id: "r1",
    code: "VE-TEST",
    areaKey: "litoral-central",
    geoCell: "10.60:-66.90",
    locationAccuracy: "exact",
    addressText: "La Guaira",
    type: "missing_last_seen",
    derivedStatus: "open",
    priority: "P2",
    priorityScore: 20,
    confirmationScore: 0,
    abuseScore: 0,
    peopleCount: "1",
    knownInfoPublic: "Dato público",
    signsOfLife: false,
    riskFlags: [],
    publishContact: false,
    ownerTokenHash: "private-owner-token",
    reporterContactEncrypted: "private-contact",
    contactHash: "private-contact-hash",
    possibleDuplicateCodes: [],
    counters: {
      updates: 0,
      nearbyHelp: 0,
      resolutionClaims: 0,
      reopenClaims: 0,
      abuseFlags: 0
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    _rid: "cosmos-rid",
    _self: "cosmos-self",
    _etag: "cosmos-etag",
    _attachments: "attachments/",
    _ts: 1782520000
  } as Report & Record<string, unknown>;

  const result = publicReport(report) as Record<string, unknown>;

  assert.equal(result.code, "VE-TEST");
  for (const field of [
    "ownerTokenHash",
    "reporterContactEncrypted",
    "contactHash",
    "_rid",
    "_self",
    "_etag",
    "_attachments",
    "_ts"
  ]) {
    assert.equal(field in result, false);
  }
});
