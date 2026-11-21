import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

type Request = {
  requestId: string;
  idempotencyKey: string;
  naturalLanguage: string;
  alternativeRequested: boolean;
  rejectedCandidateIds: string[];
  eventType?: string;
  decisionId?: string;
  candidateId?: string;
};
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b, "en"))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : typeof value === "string"
        ? value.normalize("NFC")
        : value;
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const sealed = <T extends object>(body: T, field: string) => ({
  ...body,
  [field]: hash(body),
});
function result(request: Request) {
  const interpretation = sealed(
    {
      contractVersion: "backyrd.decision-vnext.product-context@1.0",
      resolverVersion: "test-context-v1",
      inputHash: hash(request),
      primaryIntent: "DRINKS",
      secondaryIntent: null,
      intentCompatibility: "COMPATIBLE",
      occasion: null,
      moods: [],
      targetCity: "Basel",
      dateTime: {
        state: "KNOWN",
        localDate: "2026-11-21",
        dayPhase: "EVENING",
        timeZone: "Europe/Zurich",
      },
      group: {
        size: null,
        minimumAge: null,
        adultPresent: false,
        companionType: null,
      },
      budget: {
        state: "UNKNOWN",
        amount: null,
        currency: null,
        perPerson: false,
        calibrationLabel: null,
      },
      stayDuration: null,
      hardConstraints: [],
      softPreferences: [],
      unresolvedTerms: [],
      locationAuthority: {
        explicitTargetWins: true,
        authorizedCity: "Basel",
        deviceCityUsed: false,
        state: "KNOWN",
      },
      limitations: [],
      rawTextPersisted: false,
    },
    "interpretationHash",
  );
  const candidates = Array.from({ length: 6 }, (_, index) => {
    const spotId = `spot-${index + 1}`;
    return sealed(
      {
        spotId,
        presentation: sealed(
          {
            contractVersion: "backyrd.decision-vnext.product-presentation@1.0",
            spotId,
            name: `Testort ${index + 1}`,
            locality: "Basel",
            categoryLabel: "Bar",
            imageUrl: "https://images.backyrd.test/cover.svg",
            sourceHash: hash(spotId),
          },
          "presentationHash",
        ),
        tier: "ELIGIBLE_CONFIRMED",
        rank: index + 1,
        coreIntentCoverage: "CONFIRMED",
        actualAvailability: "open",
        confirmedHardConstraints: [],
        unknownHardConstraints: [],
        failedHardConstraints: [],
        rankVector: sealed(
          {
            hardConstraintState: "PASS",
            eligibilityTier: "ELIGIBLE_CONFIRMED",
            coreIntentState: "CONFIRMED",
            primaryVisitPurposeState: "CONFIRMED",
            actualAvailability: "open",
            userRelevance: {
              state: "NEUTRAL",
              confidence: 0,
              sourceHash: hash("neutral"),
            },
            contextFit: {
              secondaryIntentConfirmed: false,
              visitSituationConfirmed: true,
              matchedSoftPreferenceCount: 0,
              atmosphereConfirmed: false,
              typicalDaypartConfirmed: false,
            },
            worldEvidence: { conflictFree: true, confirmedReasonCount: 1 },
            neutralIdentity: spotId,
          },
          "vectorHash",
        ),
        reasons: [
          {
            code: "librarian-selected-offers",
            domain: "WORLD",
            sourceHash: hash("evidence"),
            statement: "Passende Angebote: Craft-Bier.",
            confirmed: true,
          },
        ],
        limitations: [],
        contextualReject: false,
      },
      "candidateHash",
    );
  });
  const decisionId = `decision-${hash({ requestId: request.requestId, idempotencyKey: request.idempotencyKey }).slice(0, 32)}`;
  return sealed(
    {
      contractVersion: "backyrd.decision-vnext.product-response@1.0",
      status: "AVAILABLE",
      decisionId,
      requestHash: hash(request),
      envelopeHash: hash("envelope"),
      rankingPolicyVersion: "backyrd.decision-vnext.product-ranking-policy@1.0",
      rankingPolicyHash: hash("policy"),
      interpretation,
      primaryCandidateId: "spot-1",
      candidates,
      limitations: [],
      alternative: {
        requested: request.alternativeRequested,
        selectedCandidateId: request.alternativeRequested ? "spot-1" : null,
        negativeSignalProduced: false,
      },
      reject: {
        candidateIds: request.rejectedCandidateIds,
        contextualOnly: true,
        worldFactProduced: false,
      },
      personalization: {
        state: "NEUTRAL",
        neutralReason: "NO_CONSENT",
        projectionHash: hash("neutral"),
      },
      learning: {
        mode: "DISABLED_NEUTRAL",
        acknowledgement: "NOT_APPLICABLE_NEUTRAL",
        eventCount: 0,
        rawTextIncluded: false,
      },
      productOutputAuthorized: true,
      legacyEngineUsed: false,
      fallbackUsed: false,
    },
    "resultHash",
  );
}
async function fixture(page: Page) {
  const actor = "93c53f55-5d0f-4af2-9d1f-a6650dd44b18";
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const user = {
    id: actor,
    aud: "authenticated",
    role: "authenticated",
    email: "wohin@backyrd.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud: "authenticated", exp: now + 3600, iat: now, sub: actor, email: user.email, role: "authenticated" })}.test-signature`;
  let signedIn = false;
  await page.route("https://example.invalid/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/token") {
      signedIn = true;
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: "test-refresh",
          expires_in: 3600,
          expires_at: now + 3600,
          token_type: "bearer",
          user,
        },
      });
    }
    if (path === "/auth/v1/user")
      return route.fulfill({
        status: signedIn ? 200 : 401,
        json: signedIn ? user : { message: "not signed in" },
      });
    if (path === "/auth/v1/logout") {
      signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "/rest/v1/profiles")
      return route.fulfill({
        json: { first_name: "Lea", display_name: "Lea", city: "Basel" },
      });
    if (path === "/rest/v1/rpc/get_my_legal_gate_status_v1")
      return route.fulfill({ json: { gate_required: false } });
    return route.fulfill({ json: [] });
  });
  await page.route("https://images.backyrd.test/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#40342e"/><circle cx="650" cy="220" r="200" fill="#bf9262"/></svg>',
    }),
  );
  const requests: Request[] = [];
  let release: (() => void) | null = null;
  let waiting: Promise<void> | null = null;
  let mode: "success" | "clarification" | "failure" | "malformed" = "success";
  await page.route("**/api/decision", async (route) => {
    const body = route.request().postDataJSON() as Request;
    if (body.eventType)
      return route.fulfill({
        json: {
          contractVersion:
            "backyrd.decision-vnext.product-interaction-response@1.0",
          status: "ACKNOWLEDGED",
          decisionId: body.decisionId,
          candidateId: body.candidateId,
          eventType: body.eventType,
          legacyWriteUsed: false,
          fallbackUsed: false,
        },
      });
    requests.push(body);
    if (waiting) await waiting;
    if (mode === "failure")
      return route.fulfill({
        status: 503,
        json: { error: "decision_unavailable" },
      });
    if (mode === "clarification")
      return route.fulfill({
        status: 422,
        json: { clarification: "Wie alt ist deine Tochter?" },
      });
    const response = result(body);
    if (mode === "malformed") response.resultHash = "0".repeat(64);
    return route.fulfill({ json: response });
  });
  await page.goto("/login?next=%2Fdecision");
  await page.getByLabel("E-Mail", { exact: true }).fill(user.email);
  await page.getByLabel("Passwort", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByLabel("Suchregion", { exact: true })).toHaveValue(
    "Basel",
  );
  if (process.env.BACKYRD_WEB_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.BACKYRD_WEB_SCREENSHOTS}/wohin-entry-${page.viewportSize()?.width}.png`,
    });
  return {
    actor,
    requests,
    setMode: (next: typeof mode) => {
      mode = next;
    },
    hold: () => {
      waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => {
      release?.();
      waiting = null;
    },
  };
}

test("Wohin keeps a single composer, preserves requests and reveals ranked results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  const input = page.getByLabel("Was hast du im Kopf?", { exact: true });
  await input.fill("Gemütlich heute Abend ein Bier trinken gehen");
  await page
    .locator("#wohin-message")
    .evaluate((node) => node.setAttribute("data-original-composer", "true"));
  state.hold();
  await page
    .getByRole("button", { name: "Wunsch senden", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Schauen wir, was zu dir passt." }),
  ).toBeVisible();
  if (process.env.BACKYRD_WEB_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.BACKYRD_WEB_SCREENSHOTS}/wohin-wait.png`,
    });
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0]).toMatchObject({
    naturalLanguage: "Gemütlich heute Abend ein Bier trinken gehen",
    explicit: { targetCity: "Basel", targetCityRole: "SEARCH_CONTEXT" },
    alternativeRequested: false,
    previouslyPresentedCandidateIds: [],
    rejectedCandidateIds: [],
  });
  expect(state.requests[0]).not.toHaveProperty("directions");
  await input.fill("Eine Ergänzung für danach");
  state.release();
  await expect(
    page.getByRole("heading", { name: "Testort 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Testort / })).toHaveCount(5);
  const coverText = await page
    .getByRole("heading", { name: "Testort 1", exact: true })
    .evaluate((node) => {
      const title = node.getBoundingClientRect();
      const cover = node.closest("a")!.getBoundingClientRect();
      return {
        top: title.top,
        bottom: title.bottom,
        lowerHalf: cover.top + cover.height / 2,
        coverBottom: cover.bottom,
      };
    });
  expect(coverText.top).toBeGreaterThan(coverText.lowerHalf);
  expect(coverText.bottom).toBeLessThan(coverText.coverBottom);

  expect(
    await page
      .getByRole("heading", { name: "Testort 1", exact: true })
      .evaluate((node) => node.getBoundingClientRect().top),
  ).toBeLessThan(844);
  if (process.env.BACKYRD_WEB_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.BACKYRD_WEB_SCREENSHOTS}/wohin-results-390.png`,
    });
  await expect(page.locator('[data-original-composer="true"]')).toHaveCount(1);
  const reply = page.getByLabel("Nachricht an NukNuk", { exact: true });
  await expect(reply).toHaveValue("Eine Ergänzung für danach");
  await reply.fill("Lieber etwas ruhiger");
  await page
    .getByRole("button", { name: "Nachricht senden", exact: true })
    .click();
  await expect(reply).toHaveValue("");
  expect(state.requests[1].naturalLanguage).toBe(
    "Gemütlich heute Abend ein Bier trinken gehen Ergänzung: Lieber etwas ruhiger",
  );
  await page
    .getByRole("button", { name: "Deine Anfragen öffnen", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", {
      name: "Anfrage übernehmen: Gemütlich heute Abend ein Bier trinken gehen",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Verlauf löschen", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Behalten", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: /^Anfrage übernehmen:/ }),
  ).toHaveCount(2);
  await dialog
    .getByRole("button", { name: "Verlauf löschen", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Ja, löschen", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Deine Anfragen öffnen", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /^Anfrage übernehmen:/ }),
  ).toHaveCount(0);
});

test("clarification, retry and invalid responses never fabricate a successful plan", async ({
  page,
}) => {
  const state = await fixture(page);
  state.setMode("clarification");
  await page
    .getByLabel("Was hast du im Kopf?", { exact: true })
    .fill("Morgen mit meiner Tochter etwas drinnen machen");
  await page
    .getByRole("button", { name: "Wunsch senden", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Wie alt ist deine Tochter?",
      exact: true,
    }),
  ).toBeVisible();
  const reply = page.getByLabel("Nachricht an NukNuk", { exact: true });
  await reply.fill("Vier Jahre");
  state.setMode("failure");
  await page
    .getByRole("button", { name: "Nachricht senden", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Dein Plan mit NukNuk" })
      .getByRole("alert"),
  ).toContainText("Das hat gerade nicht geklappt");
  await expect(reply).toHaveValue("Vier Jahre");
  state.setMode("malformed");
  await page
    .getByRole("button", { name: "Erneut versuchen", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Dein Plan mit NukNuk" })
      .getByRole("alert"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Testort / })).toHaveCount(0);
  state.setMode("success");
  await page
    .getByRole("button", { name: "Erneut versuchen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Testort 1", exact: true }),
  ).toBeVisible();
  expect(state.requests.at(-1)?.naturalLanguage).toContain(
    "Rückfrage: Wie alt ist deine Tochter? Antwort: Vier Jahre",
  );
});

test("reusing a stored query only fills a draft and deletion during search stays deleted", async ({
  page,
}) => {
  const state = await fixture(page);
  state.hold();
  await page
    .getByLabel("Was hast du im Kopf?", { exact: true })
    .fill("Heute Abend gemütlich etwas trinken");
  await page
    .getByRole("button", { name: "Wunsch senden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Deine Anfragen öffnen", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Verlauf löschen", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Ja, löschen", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Schliessen", exact: true }).click();
  state.release();
  await expect(
    page.getByRole("heading", { name: "Testort 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Deine Anfragen öffnen", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /^Anfrage übernehmen:/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Schliessen", exact: true }).click();
  await page.getByRole("button", { name: "Neuer Plan", exact: false }).click();
  await page
    .getByLabel("Was hast du im Kopf?", { exact: true })
    .fill("Morgen etwas Neues erleben");
  await page
    .getByRole("button", { name: "Wunsch senden", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Testort 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Deine Anfragen öffnen", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Anfrage übernehmen: Morgen etwas Neues erleben",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Was hast du im Kopf?", { exact: true }),
  ).toHaveValue("Morgen etwas Neues erleben");
  expect(state.requests).toHaveLength(2);
});

test("entry fits small and desktop screens and respects reduced motion", async ({
  page,
}) => {
  await fixture(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("heading", { name: /Zeit für/ })).toBeVisible();
    if (width <= 900) {
      const inputBottom = await page
        .locator("#wohin-message")
        .evaluate(
          (node) => node.closest("form")!.getBoundingClientRect().bottom,
        );
      const navTop = await page
        .locator(".b-mobile-nav")
        .evaluate((node) => node.getBoundingClientRect().top);
      expect(inputBottom).toBeLessThan(navTop - 8);
    }

    if (process.env.BACKYRD_WEB_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.BACKYRD_WEB_SCREENSHOTS}/wohin-entry-${width}.png`,
      });
  }
  const a11y = await new AxeBuilder({ page }).include("main").analyze();
  expect(
    a11y.violations.filter(
      (item) => item.impact === "critical" || item.impact === "serious",
    ),
  ).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("off-topic replies preserve the plan and a new plan requires an explicit choice", async ({
  page,
}) => {
  const state = await fixture(page);
  await page
    .getByLabel("Was hast du im Kopf?", { exact: true })
    .fill("Heute ein Bier trinken");
  await page
    .getByRole("button", { name: "Wunsch senden", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Testort 1", exact: true }),
  ).toBeVisible();
  const reply = page.getByLabel("Nachricht an NukNuk", { exact: true });
  await reply.fill("Erkläre mir Quantenphysik");
  await page
    .getByRole("button", { name: "Nachricht senden", exact: true })
    .click();
  await expect(
    page.getByText(
      "Ich helfe dir, einen Ort für deinen nächsten Moment zu finden.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(state.requests).toHaveLength(1);
  await reply.fill("Neuer Plan: morgen ins Museum");
  await page
    .getByRole("button", { name: "Nachricht senden", exact: true })
    .click();
  await expect(
    page.getByText("Das klingt nach einem zweiten Plan.", { exact: false }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(1);
  await page
    .getByRole("button", { name: "Für den neuen Plan suchen", exact: true })
    .click();
  await expect(reply).toHaveValue("");
  expect(state.requests[1].naturalLanguage).toBe(
    "Neuer Plan: morgen ins Museum",
  );
});

test("logout clears local requests even after leaving the decision page", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByLabel("Was hast du im Kopf?", { exact: true })
    .fill("Heute gemütlich etwas trinken");
  await page
    .getByRole("button", { name: "Wunsch senden", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Testort 1", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("backyrd.wohin.requests.v1:"),
        ).length,
    ),
  ).toBe(1);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abmelden", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith("backyrd.wohin.requests.v1:"),
          ).length,
      ),
    )
    .toBe(0);
});
