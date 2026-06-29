import { expect, test, type Page } from "@playwright/test";

const report = {
  id: "r1",
  code: "VE-MOCK1",
  addressText: "Edificio Mock",
  type: "collapsed_building_unknown",
  derivedStatus: "open",
  priority: "P1",
  peopleCount: "unknown",
  persons: [],
  signsOfLife: false,
  riskFlags: [],
  possibleDuplicateCodes: [],
  updatedAt: "2026-06-28T00:00:00.000Z",
  counters: {}
};

let networkDown = false;

test.beforeEach(async ({ page }) => {
  networkDown = false;
  await page.route("**/api/config", (route) => route.fulfill({ json: {
    defaultCenter: [10.5, -66.9],
    defaultZoom: 11,
    allowedBboxes: [{ name: "Caracas", minLng: -67.24, minLat: 10.34, maxLng: -66.72, maxLat: 10.62 }],
    azureMapsClientId: "",
    features: { mediaUploads: true, geocoding: false },
    captcha: { provider: "text" }
  } }));
  await page.route("**/api/reports**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { items: [report], truncated: false, limit: 500 } });
  });
  await page.route("**/api/posts?**", (route) => route.fulfill({ json: { items: [], truncated: false, limit: 50 } }));
  await page.route("**/api/challenge", (route) => {
    if (networkDown) return route.abort("failed");
    return route.fulfill({ json: {
      nonce: "mock",
      issuedAt: new Date().toISOString(),
      action: "create_report",
      difficulty: 0,
      signature: "mock"
    } });
  });
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (networkDown) return route.abort("failed");
    await route.fulfill({ json: {
      ok: true,
      code: "VE-RETRY",
      publicUrl: "/caso/VE-RETRY",
      ownerEditUrl: "/caso/VE-RETRY#ownerToken=owner",
      report: { ...report, code: "VE-RETRY" },
      message: "ok"
    } });
  });
  await page.route("**/api/reports/*/posts", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (networkDown) return route.abort("failed");
    await route.fulfill({ json: { ok: true, post: { id: "p1", reportCode: report.code, text: "ok", tags: [], report }, report } });
  });
});

test("outbox works offline, retries online, and keeps mobile layout inside viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".fallbackMap")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: /Reportar/ }).first().click();
  await page.getByLabel("Ubicación o referencia").fill("Edificio sin conexion");
  await page.getByLabel("Qué ocurre").fill("Reporte de prueba offline");
  await page.getByLabel("Verificación humana").fill("VIDA");
  await expectNoHorizontalOverflow(page);

  networkDown = true;
  await page.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(page.getByText("1 envío pendiente.")).toBeVisible();
  await expect(outboxCount(page)).resolves.toBe(1);

  networkDown = false;
  await page.getByRole("button", { name: "Enviar ahora" }).click();
  await expect(page.getByText("1 envío pendiente.")).toHaveCount(0);
  await expect(outboxCount(page)).resolves.toBe(0);
});

test("file post offline asks for connection instead of queueing media", async ({ page }) => {
  await page.goto("/feed");
  await page.getByRole("button", { name: "Subir foto" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "flyer.png",
    mimeType: "image/png",
    buffer: Buffer.from("mock")
  });
  await page.getByLabel("Texto público").fill("Flyer con archivo");
  networkDown = true;
  await page.getByRole("button", { name: "Publicar", exact: true }).click();

  await expect(page.getByText("El archivo requiere conexión. Publica el texto ahora o reintenta cuando tengas internet.")).toBeVisible();
  await expect(outboxCount(page)).resolves.toBe(0);
});

async function outboxCount(page: Page): Promise<number> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("vidasve_outbox_v1") || "[]").length);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth + 2);
}
