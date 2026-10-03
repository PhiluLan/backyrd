import { expect, test, type Page } from "@playwright/test";

const spotId = "41000000-0000-4000-8000-000000000001";
const ownerId = "41000000-0000-4000-8000-000000000099";

async function signedInOwner(page: Page) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: ownerId, aud: "authenticated", role: "authenticated", email: "owner@backyrd.test",
    app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-10-02T00:00:00.000Z",
  };
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: ownerId, role: "authenticated", exp: expiresAt })}.local-signature`,
    refresh_token: "owner-test-refresh", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user,
  };
  await page.context().addCookies([{
    name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    domain: "127.0.0.1", path: "/",
  }]);
  await page.route("**/auth/v1/user", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(user),
  }));
}

test("Owner Pro zeigt Preis, MWST und ehrlichen Zustand ohne Stripe", async ({ page }) => {
  await signedInOwner(page);
  await page.route("**/api/owner/billing", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      checkoutAvailable: false,
      spots: [{ spotId, name: "Restaurant Krafft Basel", city: "Basel", checkoutEligible: true,
        billing: { status: "NONE", active: false, paidUntil: null, cancelAtPeriodEnd: false } }],
    }),
  }));
  await page.goto(`/owner/billing?spot=${spotId}`);
  await expect(page.getByRole("heading", { name: "Owner Pro" })).toBeVisible();
  await expect(page.getByText("CHF 39.–")).toBeVisible();
  await expect(page.getByText("inklusive MWST")).toBeVisible();
  await expect(page.getByText("Checkout wird vorbereitet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Owner Pro für diesen Spot starten" })).toHaveCount(0);
});

test("Bezahlter Spot hat Verwaltung und eigene Rechnungen, nicht erneut Checkout", async ({ page }) => {
  await signedInOwner(page);
  await page.route("**/api/owner/billing", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      checkoutAvailable: true,
      spots: [{ spotId, name: "Restaurant Krafft Basel", city: "Basel", checkoutEligible: true,
        billing: { status: "ACTIVE", active: true, paidUntil: "2026-11-02T12:00:00Z", cancelAtPeriodEnd: false } }],
    }),
  }));
  await page.route("**/api/owner/billing/invoices?spotId=*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ invoices: [
      { id: "in_test", createdAt: "2026-10-02T12:00:00Z", amountRappen: 3900, status: "paid", url: "https://invoice.stripe.com/test" },
    ] }),
  }));
  await page.goto(`/owner/billing?spot=${spotId}`);
  await expect(page.getByText("Owner Pro aktiv").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Abo & Zahlungsmittel verwalten" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rechnung öffnen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Owner Pro für diesen Spot starten" })).toHaveCount(0);
});

test("Mobiler Checkout-Rückweg behauptet ohne Zahlungsnachweis keinen Erfolg", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signedInOwner(page);
  await page.route("**/api/owner/billing", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      checkoutAvailable: true,
      spots: [{ spotId, name: "Restaurant Krafft Basel", city: "Basel", checkoutEligible: true,
        billing: { status: "INCOMPLETE", active: false, paidUntil: null, cancelAtPeriodEnd: false } }],
    }),
  }));
  await page.goto(`/owner/billing?spot=${spotId}`);
  await expect(page.getByText("Zahlung nicht abgeschlossen").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Abo & Zahlungsmittel verwalten" })).toBeVisible();
  await expect(page.getByText("Willkommen bei Owner Pro")).toHaveCount(0);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});
