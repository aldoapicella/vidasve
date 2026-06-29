import assert from "node:assert/strict";
import test from "node:test";
import { isPublicEvent, isPublicReport, publicEvent, publicMapReport, publicPost, publicReport } from "../src/lib/sanitize.js";
import type { Report, ReportEvent } from "../src/lib/types.js";

test("publicReport removes private and Cosmos metadata fields", () => {
  const report = {
    id: "r1",
    clientMutationId: "client-report-1",
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

test("publicEvent removes actor and Cosmos metadata fields", () => {
  const event = {
    id: "e1",
    clientMutationId: "client-event-1",
    reportId: "r1",
    reportCode: "VE-TEST",
    type: "add_info",
    message: "Dato público",
    public: true,
    actor: {
      hasOwnerToken: false,
      ipHash: "ip-private",
      deviceHash: "device-private",
      contactHash: "contact-private"
    },
    abuseScore: 0,
    createdAt: "2026-06-26T00:00:00.000Z",
    _rid: "cosmos-rid",
    _self: "cosmos-self",
    _etag: "cosmos-etag",
    _attachments: "attachments/",
    _ts: 1782520000
  } as ReportEvent & Record<string, unknown>;

  const result = publicEvent(event) as Record<string, unknown>;

  assert.equal(result.reportCode, "VE-TEST");
  for (const field of ["actor", "_rid", "_self", "_etag", "_attachments", "_ts"]) {
    assert.equal(field in result, false);
  }
});

test("publicMapReport keeps the map payload small", () => {
  const report = {
    id: "r1",
    clientMutationId: "client-report-1",
    code: "VE-MAP",
    areaKey: "caracas",
    geoCell: "10.50:-66.90",
    location: { type: "Point", coordinates: [-66.9, 10.5] },
    locationAccuracy: "approximate",
    addressText: "Edificio mapa",
    landmark: "Referencia",
    city: "Caracas",
    area: "Centro",
    type: "collapsed_building_unknown",
    derivedStatus: "open",
    priority: "P1",
    priorityScore: 20,
    confirmationScore: 0,
    abuseScore: 0,
    peopleCount: "unknown",
    persons: [{ id: "p1", displayName: "Persona", status: "trapped" }],
    knownInfoPublic: "Texto largo que no debe viajar en el mapa",
    signsOfLife: true,
    riskFlags: ["estructura"],
    publishContact: false,
    ownerTokenHash: "private-owner-token",
    possibleDuplicateCodes: ["VE-OLD"],
    counters: {
      updates: 2,
      nearbyHelp: 0,
      resolutionClaims: 0,
      reopenClaims: 0,
      abuseFlags: 0
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  } as Report;

  const result = publicMapReport(report) as Record<string, unknown>;

  assert.equal(result.code, "VE-MAP");
  assert.equal(result.addressText, "Edificio mapa");
  assert.equal("knownInfoPublic" in result, false);
  assert.equal("persons" in result, false);
  assert.equal("ownerTokenHash" in result, false);
  assert.equal("possibleDuplicateCodes" in result, false);
});

test("public serializers hide moderation internals and expose durable media URLs", () => {
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
    possibleDuplicateCodes: [],
    visibility: "public",
    moderationReason: "private moderation note",
    moderatedAt: "2026-06-26T00:00:00.000Z",
    moderatedByHash: "admin-hash",
    searchText: "private index",
    counters: {
      updates: 0,
      nearbyHelp: 0,
      resolutionClaims: 0,
      reopenClaims: 0,
      abuseFlags: 0
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  } as Report;
  const event = {
    id: "e1",
    reportId: "r1",
    reportCode: "VE-TEST",
    type: "public_post",
    message: "Flyer público",
    reason: "private reason",
    mediaId: "m1",
    thumbnailMediaId: "m1",
    postType: "flyer",
    public: true,
    visibility: "public",
    actor: { hasOwnerToken: false },
    abuseScore: 4,
    createdAt: "2026-06-26T00:00:00.000Z"
  } as ReportEvent;

  const safeReport = publicReport(report) as Record<string, unknown>;
  const safeEvent = publicEvent(event) as Record<string, unknown>;
  const post = publicPost(event, report);

  assert.equal("moderationReason" in safeReport, false);
  assert.equal("searchText" in safeReport, false);
  assert.equal("clientMutationId" in safeReport, false);
  assert.equal("priorityScore" in safeReport, false);
  assert.equal("confirmationScore" in safeReport, false);
  assert.equal("abuseScore" in safeReport, false);
  assert.equal("possibleDuplicateCodes" in safeReport, false);
  assert.equal("reason" in safeEvent, false);
  assert.equal("abuseScore" in safeEvent, false);
  assert.equal("clientMutationId" in safeEvent, false);
  assert.equal(safeEvent.mediaUrl, "/api/media/m1");
  assert.equal(post.thumbnailUrl, "/api/media/m1");
  assert.equal(isPublicReport({ ...report, visibility: "hidden" }), false);
  assert.equal(isPublicEvent({ ...event, visibility: "removed" }), false);
});
