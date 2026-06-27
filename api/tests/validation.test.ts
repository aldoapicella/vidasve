import assert from "node:assert/strict";
import test from "node:test";
import { parseCreateReportInput, validateCreateReport } from "../src/lib/validation.js";

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

test("validateCreateReport requires human verification text", () => {
  const valid = parseCreateReportInput({
    addressText: "Edificio",
    knownInfoPublic: "Texto público",
    locationUnknown: true,
    captchaText: "VIDA"
  });
  const invalid = parseCreateReportInput({
    addressText: "Edificio",
    knownInfoPublic: "Texto público",
    locationUnknown: true,
    captchaText: "bot"
  });

  assert.equal(validateCreateReport(valid), null);
  assert.equal(validateCreateReport(invalid), "captcha_failed");
});
