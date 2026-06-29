import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { enqueueOutbox, listOutbox } from "../.tmp-tests/lib/outbox.js";

test("outbox caps at 20 items and drops expired entries", () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  };
  storage.set("vidasve_outbox_v1", JSON.stringify([
    { id: "old", kind: "post", code: "VE-OLD", payload: {}, createdAt: "2026-01-01T00:00:00.000Z", attempts: 0 }
  ]));
  for (let index = 0; index < 25; index += 1) {
    enqueueOutbox({ kind: "post", code: `VE-${index}`, payload: { text: `post ${index}` } });
  }

  const items = listOutbox();
  assert.equal(items.length, 20);
  assert.equal(items[0].code, "VE-5");
  assert.equal(items.at(-1).code, "VE-24");
});

test("outbox drops stale token captcha items", () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  };
  storage.set("vidasve_outbox_v1", JSON.stringify([
    {
      id: "report",
      kind: "create_report",
      payload: { addressText: "x", reporterContact: "secret", captchaToken: "expired" },
      createdAt: new Date().toISOString(),
      attempts: 0
    },
    {
      id: "post",
      kind: "post",
      code: "VE-1",
      payload: { text: "x", captchaToken: "expired" },
      createdAt: new Date().toISOString(),
      attempts: 0
    }
  ]));

  assert.equal(listOutbox().length, 0);
});

test("new offline queueing is network-only", () => {
  const client = readFileSync(new URL("../src/api/client.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const createReport = readFileSync(new URL("../src/components/CreateReportModal.tsx", import.meta.url), "utf8");

  assert.match(client, /networkError: boolean/);
  assert.match(client, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(app, /isNetworkError\(err\)/);
  assert.match(createReport, /isNetworkError\(err\)/);
});

test("direct case links focus the map on the selected report", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../src/components/MapView.tsx", import.meta.url), "utf8");

  assert.match(app, /selectedReport=\{selected\}/);
  assert.match(map, /selectedReport\?: PublicReport \| null/);
  assert.match(map, /map\.setCamera\(\{ center: coords, zoom: zoomForAccuracy/);
});
