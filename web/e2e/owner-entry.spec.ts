import { expect, test } from "@playwright/test";

test("owner entry is public, discoverable, and keeps private navigation behind sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Zum Owner-Bereich/ })).toHaveAttribute("href", "/owner");

  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: /Dein Ort hat mehr zu erzählen/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zum Owner-Bereich/ })).toHaveAttribute("href", "/login?next=%2Fowner");
  await expect(page.getByRole("link", { name: "Zugang anfragen" })).toHaveAttribute("href", /^mailto:hello@backyrd\.ch/);
  await expect(page.getByRole("navigation", { name: "Owner Navigation" })).toHaveCount(0);
});

test("owner entry fits a narrow phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: /Dein Ort hat mehr zu erzählen/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
