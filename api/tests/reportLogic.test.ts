import assert from "node:assert/strict";
import test from "node:test";
import { addPersonToReport } from "../src/lib/reportLogic.js";
import type { Report } from "../src/lib/types.js";

test("addPersonToReport updates people count and life signs", () => {
  const report = {
    id: "r1",
    code: "VE-TEST",
    areaKey: "la-guaira",
    geoCell: "10.60:-66.90",
    locationAccuracy: "approximate",
    addressText: "Edificio",
    type: "collapsed_building_unknown",
    derivedStatus: "open",
    priority: "P3",
    priorityScore: 0,
    confirmationScore: 0,
    abuseScore: 0,
    peopleCount: "unknown",
    persons: [],
    knownInfoPublic: "Estructura colapsada",
    signsOfLife: false,
    riskFlags: [],
    publishContact: false,
    ownerTokenHash: "owner",
    possibleDuplicateCodes: [],
    counters: { updates: 0, nearbyHelp: 0, resolutionClaims: 0, reopenClaims: 0, abuseFlags: 0 },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  } as Report;

  const updated = addPersonToReport(report, {
    id: "p1",
    displayName: "Ana",
    status: "signals_of_life",
    floorOrUnit: "Piso 3",
    lastContactText: "Hoy 8:00 a. m."
  });

  assert.equal(updated.peopleCount, "1");
  assert.equal(updated.signsOfLife, true);
  assert.equal(updated.lastContactText, "Hoy 8:00 a. m.");
  assert.equal(updated.personDescriptionPublic, "Ana, Piso 3");
});
