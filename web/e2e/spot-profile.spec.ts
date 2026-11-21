import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// Requires the isolated API fixture documented in fixtures/spot-api.mjs.
test.skip(
  process.env.PLAYWRIGHT_SPOT_FIXTURE !== "1",
  "Run against the isolated Spot API fixture, never production.",
);
const path = "/spots/10000000-0000-4000-8000-000000000001";
test("consumer profile keeps canonical facts, approachable copy and useful disclosures", async ({
  page,
}) => {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Test Brauerei", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("Bar · Brauerei · Pub");
  await expect(page.locator("main")).toContainText("Preisniveau: Mittel");
  await expect(page.locator("main")).toContainText("4056 Basel");
  await expect(page.locator("main")).not.toContainText(
    "Veraltete Beschreibung",
  );
  await expect(
    page.getByRole("link", { name: "Instagram", exact: true }),
  ).toHaveCount(0);
  const hours = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^Öffnungszeiten/ }) });
  await hours.locator("summary").click();
  await expect(hours).toContainText("Geschlossen");
  await expect(hours).toContainText("Nicht bekannt");
  await expect(hours).toContainText("17:00–00:30");
  await page.locator("summary", { hasText: "Sonderöffnungszeiten" }).click();
  await expect(page.locator("main")).toContainText("24. Dezember 2026");
  const offer = page
    .locator("details")
    .filter({
      has: page.locator(
        'summary[aria-label="Degustation: mehr Informationen"]',
      ),
    });
  await page
    .locator('summary[aria-label="Degustation: mehr Informationen"]')
    .click();
  await expect(offer).toContainText("Pizza");
  await expect(offer).toContainText("Reserviere am besten im Voraus.");
  await page.locator("summary", { hasText: "Mehr Infos" }).click();
  await expect(page.locator("main")).toContainText("Gemütlich · Abends");
  await expect(page.locator("main")).not.toContainText("internal.private");
  await expect(page.locator("main")).not.toContainText("Brewery");
  await expect(
    page.getByRole("link", { name: "Öffentliche Testquelle" }),
  ).toHaveAttribute("href", "https://example.test/source");
  await page
    .getByRole("heading", { name: "Rund um diesen Ort", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: /Nebenan/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Schreibe uns!" }),
  ).toHaveAttribute("href", /^mailto:hello@backyrd.ch\?subject=/);
  const sections = await page
    .locator("main h2, main details > summary")
    .allTextContents();
  expect(sections.findIndex((s) => s.includes("Über diesen Ort"))).toBeLessThan(
    sections.findIndex((s) => s.includes("Kontakt")),
  );
  expect(sections.findIndex((s) => s.includes("Öffnungszeiten"))).toBeLessThan(
    sections.findIndex((s) => s.includes("Das kannst du hier erleben")),
  );
  expect(sections.findIndex((s) => s.includes("Moods"))).toBeLessThan(
    sections.findIndex((s) => s.includes("Mehr Infos")),
  );
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
});
test("profile and actions stay usable across mobile, tablet and desktop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  for (const width of [320, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Test Brauerei", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const nav = page.getByRole("navigation", {
      name: "Mobile Hauptnavigation",
    });
    if (width <= 900) {
      const action = await page
        .getByRole("complementary", { name: "Dein Besuch" })
        .boundingBox();
      const bounds = await nav.boundingBox();
      expect(action!.y + action!.height).toBeLessThanOrEqual(bounds!.y);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(
    results.violations.filter((item) =>
      ["critical", "serious"].includes(item.impact || ""),
    ),
  ).toEqual([]);
});
test("missing photos, unknown hours and projection failures remain honest", async ({
  page,
}) => {
  await page.goto("/spots/10000000-0000-4000-8000-000000000006");
  await expect(page.locator("main .b-spot-fallback").first()).toBeVisible();
  await page.locator("summary", { hasText: /^Öffnungszeiten/ }).click();
  await expect(page.locator("main")).toContainText(
    "Aktuell nicht verlässlich hinterlegt",
  );
  await page.goto("/spots/10000000-0000-4000-8000-000000000007");
  await expect(page.getByRole("status")).toContainText("Einige Angaben");
  await expect(page.locator("main")).not.toContainText(
    "Veraltete Beschreibung",
  );
  await expect(
    page.getByRole("link", { name: "Webseite", exact: true }),
  ).toHaveCount(0);
  await page.goto("/spots/10000000-0000-4000-8000-000000000008");
  await expect(
    page.getByRole("heading", { name: "HIER IST GERADE NICHTS." }),
  ).toBeVisible();
  await page.goto("/spots/10000000-0000-4000-8000-000000000009");
  await expect(
    page.getByRole("heading", { name: "Dieser Ort lädt gerade nicht" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Erneut versuchen", exact: true }),
  ).toBeVisible();
});
