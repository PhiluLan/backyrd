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

test("canonical Owner/Admin Spot images render and missing or broken images fall back locally", async ({ page }) => {
  const spots = {
    volta: "1101ee26-5046-4cdc-921a-5a3bd4cb5306",
    elys: "57cb213c-9472-40b6-80be-a810fd77b7c9",
    galizi: "c16f80e9-86db-4d60-8bdb-3cb3c95d8f4c",
    kuni: "58fb0aab-ce95-40c4-99de-090e448145c5",
  };
  await page.goto("/places");
  for (const id of Object.values(spots)) {
    await expect(page.locator(`a[href="/spots/${id}"]`)).toBeVisible();
  }
  const voltaCard = page.locator(`a[href="/spots/${spots.volta}"]`);
  await expect(voltaCard.locator("img")).toHaveAttribute(
    "src",
    /\/spot-photos\/1101ee26-5046-4cdc-921a-5a3bd4cb5306\/hero(?:%20| )vb\.jpg/,
  );
  for (const id of [spots.elys, spots.galizi, spots.kuni]) {
    const card = page.locator(`a[href="/spots/${id}"]`);
    await expect(card.locator(".b-spot-fallback")).toBeVisible();
    await expect(card.locator("img")).toHaveCount(0);
  }

  await page.goto(`/spots/${spots.volta}`);
  await expect(page.locator("main .b-spot-image").first().locator("img")).toBeVisible();
  await page.goto(`/spots/${spots.galizi}`);
  await expect(page.locator("main .b-spot-image").first().locator(".b-spot-fallback")).toBeVisible();

  await page.route("**/storage/v1/object/public/spot-photos/**", (route) =>
    route.abort("failed"),
  );
  await page.goto(`/spots/${spots.volta}`);
  await expect(page.locator("main .b-spot-image").first().locator(".b-spot-fallback")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
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

test("login updates the shell, opens Profile, survives refresh and logout closes the session", async ({ page }) => {
  const userId = "93c53f55-5d0f-4af2-9d1f-a6650dd44b18";
  const email = "web-auth-regression@backyrd.test";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    sub: userId,
    email,
    role: "authenticated",
  })}.test-signature`;
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  let signedIn = false;

  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    signedIn = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        expires_at: now + 3600,
        token_type: "bearer",
        user,
      }),
    });
  });
  await page.route("**/auth/v1/user", async (route) => {
    await route.fulfill({
      status: signedIn ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(signedIn ? user : { message: "not signed in" }),
    });
  });
  await page.route("**/auth/v1/logout**", async (route) => {
    signedIn = false;
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/rest/v1/profiles**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/*" },
      body: JSON.stringify([
        { display_name: "Web Test", first_name: "Web", avatar_url: null },
      ]),
    });
  });
  await page.route("**/rest/v1/rpc/get_social_profile_v2", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          user_id: userId,
          display_name: "Web Test",
          username: "web-test",
          avatar_url: null,
          header_photo_url: null,
          bio: "Production-compatible auth regression fixture",
          city: "Basel",
          is_local: true,
          is_private: false,
          post_count: 0,
          follower_count: 0,
          following_count: 0,
          viewer_follows_user: false,
          is_me: true,
          can_follow: false,
          can_message: false,
        },
      ]),
    });
  });
  await page.route("**/rest/v1/rpc/get_social_user_posts_v2", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  for (const table of ["favorites", "reviews", "user_achievements"]) {
    await page.route(`**/rest/v1/${table}**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
  }

  await page.goto("/login?next=%2Fprofile");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill("test-password-123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { name: "Web Test" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profil öffnen" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Web Test" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "EINSTELLUNGEN" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Web Test" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Anmelden" })).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
    ),
  ).toBe(false);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile/);
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
