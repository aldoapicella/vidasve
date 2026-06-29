import assert from "node:assert/strict";
import test from "node:test";
import { canServeLegacyMedia, canServeMedia } from "../src/functions/media.js";
import { legacyBlobName, publicEvent } from "../src/lib/sanitize.js";
import type { MediaAsset, Report, ReportEvent } from "../src/lib/types.js";

const report = {
  id: "r1",
  code: "VE-TEST",
  areaKey: "la-guaira",
  geoCell: "10.60:-66.90",
  locationAccuracy: "approximate",
  addressText: "Edificio",
  type: "collapsed_building_unknown",
  derivedStatus: "open",
  priority: "P2",
  priorityScore: 1,
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
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z"
} as Report;

const asset = {
  id: "m1",
  reportId: "r1",
  reportCode: "VE-TEST",
  blobName: "VE-TEST/file.jpg",
  contentType: "image/jpeg",
  size: 100,
  visibility: "public",
  createdAt: "2026-06-26T00:00:00.000Z"
} as MediaAsset;

const event = {
  id: "e1",
  reportId: "r1",
  reportCode: "VE-TEST",
  type: "public_post",
  mediaId: "m1",
  public: true,
  actor: { hasOwnerToken: false },
  abuseScore: 0,
  createdAt: "2026-06-26T00:00:00.000Z"
} as ReportEvent;

test("canServeMedia follows report and event visibility", () => {
  assert.equal(canServeMedia(asset, report, [event]), true);
  assert.equal(canServeMedia(asset, { ...report, visibility: "hidden" }, [event]), false);
  assert.equal(canServeMedia(asset, report, [{ ...event, visibility: "hidden" }]), false);
  assert.equal(canServeMedia({ ...asset, visibility: "removed" }, report, [event]), false);
  assert.equal(canServeMedia(asset, report, []), false);
});

test("legacy blob urls are routed through fresh media endpoint", () => {
  process.env.MEDIA_STORAGE_ACCOUNT = "maparemediaj5oyin3m4kbek";
  process.env.MEDIA_CONTAINER = "report-media";
  const legacyUrl = "https://maparemediaj5oyin3m4kbek.blob.core.windows.net/report-media/VE-TEST/old.webp?se=expired";
  const legacyEvent = { ...event, mediaId: undefined, thumbnailMediaId: undefined, mediaUrl: legacyUrl, thumbnailUrl: legacyUrl };
  const serialized = publicEvent(legacyEvent);

  assert.equal(legacyBlobName(legacyUrl), "VE-TEST/old.webp");
  assert.match(serialized.mediaUrl ?? "", /^\/api\/media\/legacy\/VE-TEST\//);
  assert.equal(canServeLegacyMedia("VE-TEST/old.webp", report, [legacyEvent]), true);
  assert.equal(canServeLegacyMedia("VE-TEST/old.webp", report, [{ ...legacyEvent, visibility: "hidden" }]), false);
  assert.equal(canServeLegacyMedia("VE-TEST/old.webp", { ...report, visibility: "removed" }, [legacyEvent]), false);
});
