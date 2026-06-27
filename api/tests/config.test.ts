import assert from "node:assert/strict";
import test from "node:test";
import { envBool } from "../src/lib/config.js";

test("envBool accepts Azure App Settings True casing", () => {
  process.env.TEST_BOOL = "True";
  assert.equal(envBool("TEST_BOOL"), true);
  process.env.TEST_BOOL = "false";
  assert.equal(envBool("TEST_BOOL"), false);
  delete process.env.TEST_BOOL;
});
