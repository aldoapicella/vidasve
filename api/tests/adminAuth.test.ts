import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin } from "../src/lib/adminAuth.js";

test("requireAdmin rejects missing config and bad tokens, accepts bearer token", () => {
  const previousAdmin = process.env.ADMIN_API_TOKEN;
  const previousSecret = process.env.APP_HMAC_SECRET;
  try {
    delete process.env.ADMIN_API_TOKEN;
    assert.equal(requireAdmin(request()).ok, false);

    process.env.ADMIN_API_TOKEN = "secret-admin-token";
    process.env.APP_HMAC_SECRET = "test-hmac";
    assert.equal(requireAdmin(request("Bearer wrong")).ok, false);

    const result = requireAdmin(request("Bearer secret-admin-token"));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(typeof result.actorHash, "string");
  } finally {
    if (previousAdmin === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = previousAdmin;
    if (previousSecret === undefined) delete process.env.APP_HMAC_SECRET;
    else process.env.APP_HMAC_SECRET = previousSecret;
  }
});

function request(authorization = "") {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "authorization") return authorization;
        if (name.toLowerCase() === "origin") return "http://localhost:5173";
        return "";
      }
    }
  } as never;
}
