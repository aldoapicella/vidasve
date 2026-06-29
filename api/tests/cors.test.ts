import assert from "node:assert/strict";
import test from "node:test";
import type { HttpRequest } from "@azure/functions";
import { json } from "../src/lib/cors.js";

test("json compresses large GET responses when the browser accepts Brotli", () => {
  const request = {
    method: "GET",
    headers: new Headers([
      ["accept-encoding", "br, gzip"],
      ["origin", "http://localhost:5173"]
    ])
  } as unknown as HttpRequest;

  const response = json(request, 200, { items: Array.from({ length: 200 }, (_, index) => ({ index, text: "reporte publico" })) });
  const headers = response.headers as Record<string, string>;

  assert.equal(headers["Content-Encoding"], "br");
  assert.ok(response.body);
  assert.equal("jsonBody" in response, false);
});
