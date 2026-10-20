import { expect, test, type Page } from "@playwright/test";
import type { BookingSetup, BookingSnapshot } from "../lib/booking-api";

const spot = "51000000-0000-4000-8000-000000000001";
const owner = "51000000-0000-4000-8000-000000000099";
const reservationId = "51000000-0000-4000-8000-000000000020";

async function mockConsole(page: Page, options: { missingBackend?: boolean; noSpots?: boolean; conflict?: boolean } = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: owner, email: "operator@booking.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: owner, role: "authenticated", exp: expires })}.local-signature`, refresh_token: "booking-test", token_type: "bearer", expires_in: 3600, expires_at: expires, user };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: `base64-${encode(session)}`, domain: "127.0.0.1", path: "/" }]);
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/rest/v1/profiles?*", (route) => route.fulfill({ json: { display_name: "Test Operator", first_name: "Test", avatar_url: null } }));
  let snapshot: BookingSnapshot = { settings: null, areas: [], tables: [], services: [], reservations: [] };
  let savedSetup: BookingSetup | null = null;
  let bookingCalls = 0;
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const method = route.request().url().split("/").pop();
    const body = route.request().postDataJSON();
    if (method === "get_owner_spots_v1") return route.fulfill({ json: options.noSpots ? [] : [{ spot_id: spot, name: "Restaurant Testbetrieb", city: "Basel", address: null, category_name: "Restaurant", status: "approved", website: null }] });
    if (options.missingBackend) return route.fulfill({ status: 404, json: { code: "PGRST202", message: "function not found" } });
    if (method === "booking_console_read_v1") return route.fulfill({ json: snapshot });
    if (method === "booking_console_save_setup_v1") {
      if (options.conflict) return route.fulfill({ status: 409, json: { code: "40001", message: "booking_setup_changed_reload" } });
      savedSetup = body.p_setup;
      const setup = savedSetup!;
      snapshot = { ...snapshot, ...setup, settings: { revision: (snapshot.settings?.revision ?? 0) + 1, duration_minutes: setup.duration_minutes, max_party_size: setup.max_party_size } };
      return route.fulfill({ json: snapshot.settings!.revision });
    }
    if (method === "booking_console_slots_v1") return route.fulfill({ json: [{ service_id: snapshot.services[0].id, table_id: snapshot.tables[0].id, starts_at: `${body.p_date}T18:00:00+02:00`, ends_at: `${body.p_date}T20:00:00+02:00` }] });
    if (method === "booking_console_create_v1") {
      bookingCalls++;
      snapshot.reservations = [{ id: reservationId, table_id: body.p_table_id, guest_name: body.p_guest_name, guest_contact: body.p_guest_contact, note: body.p_note, party_size: body.p_party_size, starts_at: body.p_starts_at, ends_at: new Date(Date.parse(body.p_starts_at) + 120 * 60 * 1000).toISOString(), status: body.p_status, source: body.p_source }];
      return route.fulfill({ json: reservationId });
    }
    if (method === "booking_console_set_status_v1") {
      snapshot.reservations = snapshot.reservations.map((r) => ({ ...r, status: body.p_status }));
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 400, json: { message: "unexpected RPC" } });
  });
  return { setup: () => savedSetup, bookingCalls: () => bookingCalls };
}

async function configure(page: Page) {
  await page.getByRole("button", { name: "+ Bereich", exact: true }).click();
  await page.getByLabel("Bereich 1", { exact: true }).fill("Gastraum");
  await page.getByRole("button", { name: "+ Tisch", exact: true }).click();
  await page.getByLabel("Tisch 1", { exact: true }).fill("Fenster 1");
  await page.getByLabel("Plätze für Tisch 1", { exact: true }).fill("4");
  await page.getByRole("button", { name: "+ Service", exact: true }).click();
  await page.getByLabel("Service 1", { exact: true }).fill("Abendservice");
  await page.getByRole("button", { name: "Einrichtung speichern", exact: true }).click();
}

test("guest sees a sign-in action preserving the Console destination", async ({ page }) => {
  const response = await page.goto("/booking/console");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("link", { name: "Zur Booking Console anmelden" })).toHaveAttribute("href", "/login?next=%2Fbooking%2Fconsole");
  await expect(page.getByRole("button", { name: "Einrichtung speichern" })).toHaveCount(0);
});

test("operator configures a restaurant, records a reservation and cancels it after reload", async ({ page }) => {
  const fixture = await mockConsole(page);
  await page.goto("/booking/console");
  await expect(page.getByRole("heading", { name: "Restaurant Testbetrieb" })).toBeVisible();
  await configure(page);
  await expect(page.getByText("Die Einrichtung wurde gespeichert.", { exact: true })).toBeVisible();
  expect(fixture.setup()?.tables[0].seats).toBe(4);
  await page.reload();
  await page.getByRole("button", { name: "Reservierungen", exact: true }).click();
  await page.getByRole("button", { name: "Freie Zeiten prüfen", exact: true }).click();
  await page.getByRole("combobox", { name: "Uhrzeit und Tisch", exact: true }).selectOption("0");
  await page.getByLabel("Gastname", { exact: true }).fill("Synthetischer Gast");
  await page.getByLabel("Telefon oder E-Mail (optional)", { exact: true }).fill("gast@invalid");
  await page.getByRole("button", { name: "Reservierung speichern", exact: true }).click();
  await expect(page.getByText("Die Reservierung wurde gespeichert.", { exact: true })).toBeVisible();
  expect(fixture.bookingCalls()).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Synthetischer Gast" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("console-synthetic.png"), fullPage: true });
  await page.getByRole("button", { name: "Stornieren", exact: true }).click();
  await page.getByRole("button", { name: "Status speichern", exact: true }).click();
  await expect(page.getByText("Storniert", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  });
  await expect(page.getByRole("link", { name: "Zur Booking Console anmelden" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetischer Gast" })).toHaveCount(0);
});

test("setup stays usable on a narrow phone and rejects a stale save honestly", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockConsole(page, { conflict: true });
  await page.goto("/booking/console");
  await configure(page);
  await expect(page.getByRole("alert").filter({ hasText: "Die Einrichtung wurde inzwischen geändert" })).toBeVisible();
  await expect(page.getByText("Die Einrichtung wurde gespeichert.", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Bereich 1", { exact: true })).toHaveValue("Gastraum");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("missing backend produces an unavailable state without a fake empty diary", async ({ page }) => {
  await mockConsole(page, { missingBackend: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("alert").filter({ hasText: "noch nicht freigeschaltet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ein freier Anfang." })).toHaveCount(0);
});

test("an account without assigned spots gets an operator access request", async ({ page }) => {
  await mockConsole(page, { noSpots: true });
  await page.goto("/booking/console");
  await expect(page.getByRole("heading", { name: "Verbinde dein Restaurant." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Betreiberzugang anfragen" })).toHaveAttribute("href", /^mailto:/);
});
