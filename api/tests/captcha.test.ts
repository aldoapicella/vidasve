import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCaptcha } from "../src/lib/captcha.js";

test("validateCaptcha accepts fallback text when Turnstile is not configured", async () => {
  const previous = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;

  try {
    assert.equal(await validateCaptcha({ captchaText: "VIDA" }), null);
    assert.equal(await validateCaptcha({ captchaText: "bot" }), "captcha_failed");
  } finally {
    if (previous === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = previous;
  }
});

test("validateCaptcha verifies Turnstile tokens server-side when configured", async () => {
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousFetch = globalThis.fetch;
  process.env.TURNSTILE_SECRET_KEY = "test-secret";

  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { secret?: string; response?: string };
    assert.equal(body.secret, "test-secret");
    assert.equal(body.response, "test-token");
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(await validateCaptcha({ captchaToken: "test-token" }), null);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = previousSecret;
  }
});

test("validateCaptcha rejects text fallback when Turnstile is configured", async () => {
  const previous = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = "test-secret";

  try {
    assert.equal(await validateCaptcha({ captchaText: "VIDA" }), "captcha_failed");
  } finally {
    if (previous === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = previous;
  }
});

test("public update endpoints require human captcha", () => {
  for (const file of ["reportEvents.ts", "reportOwnerEvents.ts", "posts.ts"]) {
    const source = readFileSync(`src/functions/${file}`, "utf8");
    assert.match(source, /validateCaptcha\(input\)/, file);
  }
});
