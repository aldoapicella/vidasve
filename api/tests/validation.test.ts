import assert from "node:assert/strict";
import test from "node:test";
import { parseCreateReportInput, parseOwnerEvent, parsePublicEvent, parsePublicPost, validateCreateReport } from "../src/lib/validation.js";

test("parseCreateReportInput sanitizes public people and clamps invalid age/status", () => {
  const input = parseCreateReportInput({
    addressText: "Edificio",
    knownInfoPublic: "Texto público",
    persons: [
      {
        displayName: "<Ana>",
        age: "34",
        status: "signals_of_life",
        publicContactPhone: "+58 412 000 0000",
        description: "Piso 3"
      },
      {
        displayName: "Luis",
        age: "180",
        status: "admin_closed",
        description: "<script>alert(1)</script>"
      }
    ]
  });

  assert.ok(input.persons);
  assert.equal(input.persons.length, 2);
  assert.equal(input.persons[0].displayName, "Ana");
  assert.equal(input.persons[0].age, 34);
  assert.equal(input.persons[0].status, "signals_of_life");
  assert.equal(input.persons[1].age, undefined);
  assert.equal(input.persons[1].status, "needs_verification");
  assert.equal(input.persons[1].description?.includes("<"), false);
});

test("parsePublicEvent parses a public person addition", () => {
  const event = parsePublicEvent({
    type: "add_person",
    captchaText: "VIDA",
    person: {
      displayName: "<Ana>",
      age: "34",
      floorOrUnit: "Piso 3",
      status: "signals_of_life"
    }
  });

  assert.equal(event.type, "add_person");
  assert.equal(event.captchaText, "VIDA");
  assert.equal(event.person?.displayName, "Ana");
  assert.equal(event.person?.age, 34);
  assert.equal(event.person?.floorOrUnit, "Piso 3");
  assert.equal(event.person?.status, "signals_of_life");
});

test("update parsers keep human captcha fields", () => {
  const owner = parseOwnerEvent({ type: "owner_resolved", ownerToken: "owner", captchaToken: "turnstile-token" });
  const post = parsePublicPost({ text: "Actualizacion", captchaText: "VIDA" });

  assert.equal(owner.captchaToken, "turnstile-token");
  assert.equal(post.captchaText, "VIDA");
});

test("validateCreateReport validates report fields separately from captcha provider", () => {
  const valid = parseCreateReportInput({
    addressText: "Edificio",
    knownInfoPublic: "Texto público",
    locationUnknown: true
  });
  const invalid = parseCreateReportInput({
    addressText: "Edificio",
    knownInfoPublic: "Texto público",
    locationUnknown: false
  });

  assert.equal(validateCreateReport(valid), null);
  assert.equal(validateCreateReport(invalid), "location_required");
});
