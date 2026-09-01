import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const widths = [320, 375, 390, 393, 430, 768, 1024, 1440, 1728];
const realSpotId = "1101ee26-5046-4cdc-921a-5a3bd4cb5306";

async function openAuthenticatedMomentsFixture(page: Page) {
  const userId = "93c53f55-5d0f-4af2-9d1f-a6650dd44b18";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    sub: userId,
    email: "moments-web@backyrd.test",
    role: "authenticated",
  })}.test-signature`;
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "moments-web@backyrd.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  let signedIn = false;
  await page.route("**/auth/v1/token?grant_type=password", (route) => {
    signedIn = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: "moments-test-refresh-token",
        expires_in: 3600,
        expires_at: now + 3600,
        token_type: "bearer",
        user,
      }),
    });
  });
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(signedIn ? user : { message: "not signed in" }),
    }),
  );
  await page.route("**/rest/v1/profiles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ display_name: "Philipp", first_name: "Philipp", avatar_url: null }]),
    }),
  );
  const media = (id: number) => `https://moments.backyrd.test/${id}.jpg`;
  const moments = [
    {
      post_id: "10000000-0000-0000-0000-000000000001",
      user_id: "20000000-0000-0000-0000-000000000001",
      display_name: "Lea Muster",
      username: "lea",
      avatar_url: null,
      spot_id: realSpotId,
      spot_name: "Volta Bräu",
      spot_city: "Basel",
      category_name: "Bar",
      caption: "Abend am Wasser. Genau die ruhige Seite von Basel, die heute gepasst hat.",
      mood_tags: ["Ruhig"],
      occasion_tags: [],
      media: [{ public_url: media(1), media_type: "image" }],
      like_count: 42,
      comment_count: 6,
      save_count: 3,
      viewer_has_liked: true,
      viewer_has_saved: false,
      viewer_follows_author: true,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      post_id: "10000000-0000-0000-0000-000000000002",
      user_id: "20000000-0000-0000-0000-000000000002",
      display_name: "Niklas Berger",
      username: "niklas",
      avatar_url: null,
      spot_id: "57cb213c-9472-40b6-80be-a810fd77b7c9",
      spot_name: "ELYS Boulderloft",
      spot_city: "Basel",
      category_name: "Aktivität",
      caption: "Ein neuer Griff, ein neuer Versuch – und plötzlich klappt es.",
      mood_tags: ["Lebhaft"],
      occasion_tags: [],
      media: [{ public_url: media(2), media_type: "image" }],
      like_count: 31,
      comment_count: 3,
      save_count: 2,
      viewer_has_liked: false,
      viewer_has_saved: true,
      viewer_follows_author: true,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      post_id: "10000000-0000-0000-0000-000000000003",
      user_id: "20000000-0000-0000-0000-000000000003",
      display_name: "Mara Lang",
      username: "mara",
      avatar_url: null,
      spot_id: null,
      spot_name: null,
      spot_city: "Basel",
      category_name: null,
      caption: "Die Stadt ist heute leise. Manchmal ist genau das der Moment, den man gebraucht hat.",
      mood_tags: ["Cozy", "Ruhig"],
      occasion_tags: [],
      media: [],
      like_count: 12,
      comment_count: 1,
      save_count: 0,
      viewer_has_liked: false,
      viewer_has_saved: false,
      viewer_follows_author: false,
      created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    {
      post_id: "10000000-0000-0000-0000-000000000004",
      user_id: "20000000-0000-0000-0000-000000000004",
      display_name: "Jonas Frei",
      username: "jonas",
      avatar_url: null,
      spot_id: null,
      spot_name: null,
      spot_city: "Basel",
      category_name: null,
      caption: "Ein freier Nachmittag zwischen alten Bäumen.",
      mood_tags: [],
      occasion_tags: [],
      media: [{ public_url: media(3), media_type: "image" }],
      like_count: 9,
      comment_count: 0,
      save_count: 1,
      viewer_has_liked: false,
      viewer_has_saved: false,
      viewer_follows_author: false,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
  await page.route("**/rest/v1/rpc/get_social_feed_v2", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(moments) }),
  );
  await page.route("**/rest/v1/rpc/get_social_comments_v1", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("https://moments.backyrd.test/*.jpg", (route) => {
    const id = Number(new URL(route.request().url()).pathname.match(/(\d+)\.jpg$/)?.[1] || 1);
    const dimensions = id === 1
      ? { width: 1200, height: 800 }
      : id === 2
        ? { width: 800, height: 1200 }
        : { width: 1000, height: 1000 };
    return route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}"><rect width="100%" height="100%" fill="#30232b"/><circle cx="72%" cy="24%" r="18%" fill="#ff4f91" opacity=".45"/><path d="M0 ${dimensions.height * 0.78} L${dimensions.width * 0.34} ${dimensions.height * 0.38} L${dimensions.width * 0.57} ${dimensions.height * 0.72} L${dimensions.width * 0.8} ${dimensions.height * 0.44} L${dimensions.width} ${dimensions.height * 0.74} V${dimensions.height} H0Z" fill="#d8ff3e" opacity=".42"/></svg>`,
    });
  });
  await page.goto("/login?next=%2Fmoments");
  await page.getByLabel("E-Mail").fill("moments-web@backyrd.test");
  await page.getByLabel("Passwort").fill("test-password-123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/moments$/);
  await expect(page.locator(".b-moment")).toHaveCount(4);
}

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
    await page.getByLabel("Orte durchsuchen").fill("gate5-no-such-place");
    await expect(page.locator(".b-map-preview")).toHaveCount(0);
    await expect(page.getByText("Kein Ort passt zu dieser Suche")).toBeVisible();
  }
});

test("places exposes an honest request failure and a working retry", async ({ page }) => {
  let catalogCalls = 0;
  await page.route("**/rest/v1/rpc/distribution_trust_spot_catalog_v1", async (route) => {
    catalogCalls += 1;
    if (catalogCalls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "controlled Gate 5 failure" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/places");
  await expect(page.getByText("Orte konnten nicht geladen werden")).toBeVisible();
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.locator(".b-spot-card").first()).toBeVisible();
  expect(catalogCalls).toBeGreaterThanOrEqual(2);
});

test("keyboard navigation reaches controls and closes dialogs with Escape", async ({ page }) => {
  await page.goto("/moments");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON", "INPUT"]).toContain(focused);
  await page.goto("/settings");
  await expect(page.locator("main")).toBeVisible();
});

test("Moments matches the editorial 3/2/1 grid and keeps real social modules truthful", async ({ page }) => {
  await openAuthenticatedMomentsFixture(page);
  await expect(page.getByRole("heading", { name: "MOMENTE" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Momente in Backyrd" })).toBeVisible();
  await expect(page.getByText("Trending in Basel")).toHaveCount(0);
  await expect(page.getByText("Beliebte Hashtags")).toHaveCount(0);
  await expect(page.locator('.b-moment[data-has-media="true"]')).toHaveCount(3);
  const textMoment = page.locator('.b-moment[data-has-media="false"]');
  await expect(textMoment).toHaveCount(1);
  await expect(textMoment.locator("img")).toHaveCount(0);

  const mediaGeometry = await page.locator('.b-moment[data-has-media="true"]').evaluateAll((cards) =>
    cards.map((card) => {
      const media = card.querySelector<HTMLElement>(".b-moment-media");
      const image = card.querySelector<HTMLImageElement>("img");
      const content = card.querySelector<HTMLElement>(".b-moment-content");
      const cardStyle = getComputedStyle(card);
      const contentStyle = content ? getComputedStyle(content) : null;
      const mediaRect = media?.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        cardWidth: cardRect.width,
        mediaWidth: mediaRect?.width || 0,
        mediaRatio: mediaRect ? mediaRect.width / mediaRect.height : 0,
        minHeight: cardStyle.minHeight,
        contentFlexGrow: contentStyle?.flexGrow,
        naturalRatio: image ? image.naturalWidth / image.naturalHeight : 0,
      };
    }),
  );
  expect(mediaGeometry.map(({ naturalRatio }) => Math.round(naturalRatio * 100) / 100)).toEqual([1.5, 0.67, 1]);
  for (const geometry of mediaGeometry) {
    expect(Math.abs(geometry.cardWidth - geometry.mediaWidth)).toBeLessThanOrEqual(2.1);
    expect(Math.abs(geometry.mediaRatio - 4 / 3)).toBeLessThanOrEqual(0.01);
    expect(["auto", "0px"]).toContain(geometry.minHeight);
    expect(geometry.contentFlexGrow).toBe("0");
  }

  const naturalCardHeights = await page.locator(".b-moment").evaluateAll((cards) =>
    cards.map((card) => Math.round(card.getBoundingClientRect().height)),
  );
  expect(new Set(naturalCardHeights).size).toBeGreaterThan(1);
  expect(naturalCardHeights[2]).toBeLessThan(Math.min(naturalCardHeights[0], naturalCardHeights[1]));

  for (const [width, expectedColumns] of [[1728, 3], [1440, 3], [1024, 2], [768, 2], [430, 1], [390, 1], [320, 1]] as const) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    const columns = await page.locator(".b-moments-grid").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    expect(columns, `${width}px`).toBe(expectedColumns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}px overflow`).toBe(true);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.b-moment[data-has-media="true"] img').first().evaluate((image) => {
    image.setAttribute("src", "data:image/png;base64,not-an-image");
  });
  await expect(page.locator('.b-moment[data-has-media="false"]')).toHaveCount(2);
  await expect(page.locator(".b-moment")).toHaveCount(4);
  await page.getByRole("button", { name: /Kommentare öffnen/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Kommentare" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Kommentare" })).toHaveCount(0);
  await page.getByRole("button", { name: "Moment teilen" }).first().click();
  await expect(page.getByRole("dialog", { name: "Moment teilen" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
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
