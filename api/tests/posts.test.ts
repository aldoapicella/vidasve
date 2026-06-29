import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicPost } from "../src/lib/validation.js";
import type { Report, ReportEvent } from "../src/lib/types.js";

test("parsePublicPost sanitizes text, type and tags", () => {
  const post = parsePublicPost({
    text: "<b>Ana</b> vista en piso 4",
    postType: "admin_only",
    tags: ["familia", "<script>", "senales"]
  });

  assert.equal(post.text, "bAna/b vista en piso 4");
  assert.equal(post.postType, "story");
  assert.deepEqual(post.tags, ["familia", "script", "senales"]);
});

test("store lists and searches public post events with report joins", async () => {
  process.env.USE_IN_MEMORY_STORE = "true";
  delete process.env.COSMOS_ENDPOINT;
  const { getStore } = await import("../src/lib/store.js");
  const store = getStore();
  const code = `VE-POST-${Date.now()}`;
  const report = {
    id: code,
    code,
    areaKey: "caracas",
    geoCell: "10.50:-66.90",
    locationAccuracy: "approximate",
    addressText: "Edificio prueba",
    type: "collapsed_building_unknown",
    derivedStatus: "open",
    priority: "P2",
    priorityScore: 10,
    confirmationScore: 0,
    abuseScore: 0,
    peopleCount: "unknown",
    knownInfoPublic: "Dato publico",
    signsOfLife: false,
    riskFlags: [],
    publishContact: false,
    ownerTokenHash: "owner",
    possibleDuplicateCodes: [],
    counters: { updates: 0, nearbyHelp: 0, resolutionClaims: 0, reopenClaims: 0, abuseFlags: 0 },
    visibility: "public",
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z"
  } as Report;
  const event = {
    id: `${code}-event`,
    reportId: report.id,
    reportCode: code,
    type: "public_post",
    message: "Flyer publico Ana",
    searchText: "flyer publico ana",
    postType: "flyer",
    public: true,
    visibility: "public",
    actor: { hasOwnerToken: false },
    abuseScore: 0,
    createdAt: "2026-06-28T00:01:00.000Z"
  } as ReportEvent;

  await store.createReport(report);
  await store.addEvent(event);

  assert.equal((await store.listPublicPostEvents(10)).some((item) => item.event.id === event.id && item.report.code === code), true);
  assert.equal((await store.searchPublicPostEvents("ana", 10)).some((item) => item.event.id === event.id && item.report.code === code), true);
});
