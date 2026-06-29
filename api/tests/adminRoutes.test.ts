import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("admin moderation routes keep the public launch contract", () => {
  const source = readFileSync("src/functions/adminModeration.ts", "utf8");

  assert.match(source, /ADMIN_ROUTE_ALIASES = \["api\/admin", "api\/_admin"\]/);
  for (const route of ["moderation", "reports/{code}/moderation", "reports/{code}/events/{eventId}/moderation", "reports/{code}/remove"]) {
    assert.ok(source.includes(`route: \`\${prefix}/${route}\``));
  }
  assert.doesNotMatch(source, /route: "ops\//);
});
