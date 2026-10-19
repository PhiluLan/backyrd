import { expect, test } from "@playwright/test";

test("booking is a public product preview with an honest pilot action", async ({ page }) => {
  const response = await page.goto("/booking");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Deine Buchungen.");
  await expect(page.getByText(/Produktvorschau mit erfundenen Beispieldaten/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Pilot anfragen/ })).toHaveAttribute("href", /^mailto:hello@backyrd\.ch/);
  await expect(page.getByRole("navigation", { name: "Mobile Hauptnavigation" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Backyrd Startseite" })).toHaveCount(1);
});

test("booking fits narrow mobile screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/booking");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
