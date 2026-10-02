import { expect, test, type Page } from "@playwright/test";

const spotId = "41000000-0000-4000-8000-000000000001";
const ownerId = "41000000-0000-4000-8000-000000000099";
const basicKeys = [
  "identity.name", "location.address_line1", "location.locality", "contact.public_email",
  "classification.primary_category", "classification.place_types", "offering.cuisines",
  "purpose.primary_visit", "operation.price_level", "hours.regular",
];
const proKeys = [...basicKeys, "capacity.seats_total", "amenity.features"];

async function mockOwner(page: Page, tier: "OWNER_BASIC" | "OWNER_PRO") {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: ownerId, aud: "authenticated", role: "authenticated", email: "owner@backyrd.test",
    app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-09-17T00:00:00.000Z",
  };
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: ownerId, role: "authenticated", exp: expiresAt })}.local-signature`,
    refresh_token: "owner-test-refresh", token_type: "bearer", expires_in: 3600,
    expires_at: expiresAt, user,
  };
  await page.context().addCookies([{
    name: "sb-127-auth-token",
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    domain: "127.0.0.1", path: "/",
  }]);
  await page.route("**/auth/v1/user", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(user),
  }));
  await page.route("**/rest/v1/rpc/get_owner_spots_v1", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ spot_id: spotId, name: "Volta Bräu", city: "Basel", address: "Voltastrasse 30", status: "approved" }]),
  }));
  const answers: Record<string, unknown> = {
    "identity.name": { claimId: "41000000-0000-4000-8000-000000000010", knowledgeState: "KNOWN_VALUE", value: "Volta Bräu" },
  };
  let manifest: null | { manifestHash: string; worldSnapshot: { spotId: string; conflicts: never[] } } = null;
  const detail = () => ({
    contractVersion: "backyrd.world-knowledge.product-authoring-detail@1.0",
    spotId, name: "Volta Bräu", status: "approved",
    actor: { role: "VERIFIED_OWNER", entitlement: tier, allowedAttributeKeys: tier === "OWNER_PRO" ? proKeys : basicKeys },
    answers, openConflicts: [], manifest,
  });
  await page.route("**/rest/v1/rpc/world_product_authoring_detail_v1", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(detail()),
  }));
  const submissions: Array<Record<string, unknown>> = [];
  await page.route("**/rest/v1/rpc/world_product_owner_submit_claim_v1", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    submissions.push(body);
    answers[String(body.p_attribute_key)] = {
      claimId: "41000000-0000-4000-8000-000000000011",
      knowledgeState: body.p_knowledge_state, value: body.p_value,
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/world-knowledge/shadow", async (route) => {
    manifest = { manifestHash: "a".repeat(64), worldSnapshot: { spotId, conflicts: [] } };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      manifestHash: manifest.manifestHash, readerSnapshot: manifest.worldSnapshot,
    }) });
  });
  return { submissions };
}

test("Owner wählt seinen Spot nach Namen statt per ID", async ({ page }, testInfo) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.goto("/owner/world-knowledge");
  await expect(page.getByRole("navigation", { name: "Owner Navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Volta Bräu Basel/ })).toBeVisible();
  await expect(page.getByText("Spot-ID")).toHaveCount(0);
  await page.getByRole("button", { name: /Volta Bräu Basel/ }).click();
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /1 Grundinformationen/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-spot-editor-desktop.png"), fullPage: true });
});

test("Basis-Owner kann 1–6 pflegen, während 7–8 sichtbar gesperrt bleiben", async ({ page }) => {
  const owner = await mockOwner(page, "OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole("button", { name: /5 Preise und Bezahlung/ }).click();
  await page.getByText("Weitere Angaben").click();
  await page.getByLabel("Preislevel").selectOption("MEDIUM");
  await expect.poll(() => owner.submissions.length).toBe(1);
  expect(owner.submissions[0].p_attribute_key).toBe("operation.price_level");
  await page.getByRole("button", { name: /7 Objektive Eigenschaften/ }).click();
  await expect(page.getByText("Dieser Bereich gehört zu Owner Pro.")).toBeVisible();
  await page.getByRole("button", { name: /8 Ausstattung und Einschränkungen/ }).click();
  await expect(page.getByText("Dieser Bereich gehört zu Owner Pro.")).toBeVisible();
  await expect(page.getByText("Spot-ID")).toHaveCount(0);
});

test("Pro-Owner erhält die vom Server erlaubten Zusatzfelder", async ({ page }) => {
  await mockOwner(page, "OWNER_PRO");
  await page.goto(`/owner/spots/${spotId}`);
  await page.getByRole("button", { name: /7 Objektive Eigenschaften/ }).click();
  await expect(page.getByText("Dieser Bereich gehört zu Owner Pro.")).toHaveCount(0);
  await page.getByText("Weitere Angaben").click();
  await expect(page.getByText("Sitzplätze gesamt")).toBeVisible();
});

test("Der alte Bearbeitungslink führt zum aktuellen World-Wissen-Editor", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}/edit`);
  await expect(page).toHaveURL(new RegExp(`/owner/spots/${spotId}$`));
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  await expect(page.getByText("Keywords, kommagetrennt")).toHaveCount(0);
});

test("Ein fremder Spot bleibt trotz direkter URL gesperrt", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.route("**/rest/v1/rpc/world_product_authoring_detail_v1", (route) =>
    route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "world_authoring_scope_denied" }),
    }),
  );
  await page.goto("/owner/spots/41000000-0000-4000-8000-000000000002");
  await expect(page.locator(".wk-toast[role=alert]")).toContainText("nicht berechtigt");
  await expect(page.getByRole("button", { name: /1 Grundinformationen/ })).toHaveCount(0);
});

test("Die Spot-Pflege bleibt auf dem Smartphone lesbar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOwner(page, "OWNER_BASIC");
  await page.goto(`/owner/spots/${spotId}`);
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")]
      .map((element) => ({ name: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className : "", right: Math.round(element.getBoundingClientRect().right) }))
      .filter((element) => element.right > 391)
      .slice(0, 15),
  }));
  expect(overflow.width, JSON.stringify(overflow.elements)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("owner-spot-editor-mobile.png"), fullPage: true });
});

test("Owner-Einblicke versprechen keine vNext-Platzierung", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.route("**/rest/v1/rpc/owner_intelligence_overview_v1", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      summary: { views: 12, visitors: 4, route_clicks: 2, website_clicks: 1, phone_clicks: 0, reviews: 1, spots: 1 },
      spots: [{ spot_id: spotId, name: "Volta Bräu", city: "Basel", views: 12, visitors: 4, reviews: 1, route_clicks: 2, website_clicks: 1, phone_clicks: 0 }],
    }),
  }));
  await page.goto("/owner/analytics");
  await expect(page.getByRole("heading", { name: "Was bei deinen Spots passiert" })).toBeVisible();
  await expect(page.getByText("Diese Zahlen zeigen keine Platzierung oder Bewertung durch Decision vNext.")).toBeVisible();
  await expect(page.getByText("Decision CTR")).toHaveCount(0);
  await expect(page.getByText("Volta Bräu")).toBeVisible();
});
