import assert from "node:assert/strict";
import test from "node:test";
import { validateMediaUpload } from "../src/lib/mediaUpload.js";

test("validateMediaUpload accepts only bounded image/pdf files", () => {
  assert.equal(validateMediaUpload({ size: 1024, type: "image/png" }), null);
  assert.equal(validateMediaUpload({ size: 0, type: "image/png" }), "empty_file");
  assert.equal(validateMediaUpload({ size: 6 * 1024 * 1024, type: "image/png" }), "file_too_large");
  assert.equal(validateMediaUpload({ size: 1024, type: "image/svg+xml" }), "unsupported_file_type");
});
