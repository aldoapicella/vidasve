import { expect, test, type Page } from "@playwright/test";

test("shows shutdown message without calling the API", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(request.url());
  });

  await page.goto("/");

  await expect(page).toHaveTitle("VidasVE - Gracias a todos");
  await expect(page.getByRole("heading", { name: "Gracias a todos." })).toBeVisible();
  await expect(page.getByText("1.077 reportes")).toBeVisible();
  await expect(page.getByText("676 personas")).toBeVisible();
  await expect(page.getByText(/protección a las victimas/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Build4Venezuela/ })).toHaveAttribute("href", "https://build4venezuela.com/");
  await expectNoHorizontalOverflow(page);
  expect(apiRequests).toEqual([]);
});

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth + 2);
}
