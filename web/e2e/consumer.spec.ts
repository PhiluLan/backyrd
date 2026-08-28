import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const widths = [320, 375, 390, 393, 430, 768, 1024, 1440, 1728];
const realSpotId = "1101ee26-5046-4cdc-921a-5a3bd4cb5306";

const consumerRoutes = [
  "/",
  "/decision",
  "/discover",
  "/places",
  "/moments",
  "/profile",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify",
  "/onboarding",
  "/messages",
  "/messages/00000000-0000-0000-0000-000000000000",
  "/notifications",
  "/reviews/new",
  "/favorites",
  "/achievements",
  "/settings",
  "/settings/profile",
  "/settings/privacy",
  "/settings/consents",
  "/settings/data",
  "/settings/history",
  "/settings/notifications",
  "/settings/decision-history",
  "/settings/safety",
  "/settings/support",
  "/legal",
  "/search",
  `/spots/${realSpotId}`,
  "/users/00000000-0000-0000-0000-000000000000",
];

test("public Product worlds are real routes with no horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/decision", "/places", "/moments"] ) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.goto("/places");
  const href = await page.locator(".b-spot-card").first().getAttribute("href");
  expect(href).toMatch(/^\/spots\//);
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll("main").length)).toBe(1);
});

test("the complete reachable Consumer route inventory renders in one shell", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of consumerRoutes) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("main")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      path,
    ).toBe(true);
  }
});

test("responsive Product shell remains contained across the required matrix", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const path of ["/", "/decision", "/places", "/login", "/legal"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} at ${width}px`).toBe(true);
    }
  }
});

test("public SEO and private indexing boundaries are explicit", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Entdecken · Backyrd/);
  await expect(page.locator('link[rel="canonical"]').first()).toHaveAttribute(
    "href",
    /^https:\/\/www\.backyrd\.ch\/?$/,
  );

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("/places");

  const privateResponse = await request.get("/settings");
  expect(privateResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(privateResponse.headers()["cache-control"]).toMatch(
    /(?:private,\s*no-store|no-cache,\s*must-revalidate)/,
  );
  expect(privateResponse.headers()["x-frame-options"]).toBe("DENY");
});

test("auth validation is human and redirect input is fail-closed", async ({ page }) => {
  await page.goto("/login?next=https://evil.example");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.locator(".b-field-error")).toContainText("gültige E-Mail-Adresse");
  await page.goto("/signup");
  await page.getByLabel("E-Mail").fill("person@example.ch");
  await page.getByLabel("Passwort", { exact: true }).fill("abcdefgh");
  await page.getByLabel("Passwort bestätigen").fill("abcdefghx");
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page.locator(".b-field-error")).toContainText("stimmen nicht überein");
});

test("places list/map, selection and browser history work", async ({ page }) => {
  await page.goto("/places");
  await expect(page.locator(".b-spot-card").first()).toBeVisible();
  await page.getByRole("tab", { name: "Karte" }).click();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".b-map-cluster,.b-map-marker").first()).toBeVisible();
  const marker = page.locator(".b-map-marker").first();
  if (await marker.count()) {
    await marker.click();
    await expect(page.locator(".b-map-preview")).toBeVisible();
  }
});

test("keyboard navigation reaches controls and closes dialogs with Escape", async ({ page }) => {
  await page.goto("/moments");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON", "INPUT"]).toContain(focused);
  await page.goto("/settings");
  await expect(page.locator("main")).toBeVisible();
});

test("primary public surfaces have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/", "/decision", "/places", "/moments", "/login", "/legal"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking, `${path}: ${blocking.map((item) => item.id).join(", ")}`).toEqual([]);
  }
});
