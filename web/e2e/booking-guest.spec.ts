import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const reservationId = "00000000-0000-4000-8000-000000000003";
const spot = "00000000-0000-4000-8000-000000000001";
const key = "A".repeat(43);
const link = `/booking/manage#id=${reservationId}&key=${key}`;
const receipt = { id: reservationId, spot_id: spot, name: "Testrestaurant", guest_name: "Testgast", party_size: 2, starts_at: "2030-10-27T18:00:00+00:00", ends_at: "2030-10-27T20:00:00+00:00", status: "confirmed", revision: 0, cancellation_deadline: "2030-10-27T16:00:00+00:00" };
type Operation = { operation: string; key: string; requestId?: string; revision?: number };
async function mock(page: Page, options: { pending?: boolean; unknown?: boolean; invalid?: boolean; stale?: boolean } = {}) {
  let current = { ...receipt, status: options.pending ? "pending" : "confirmed" };
  const calls: Operation[] = [];
  await page.route("**/api/booking/guest", async route => {
    const input = route.request().postDataJSON() as Operation; calls.push(input);
    if (options.invalid) return route.fulfill({ status: 404, json: { error: "link_unavailable", outcome: "rejected" } });
    if (input.operation === "cancel") {
      const count = calls.filter(call => call.operation === "cancel").length;
      if (options.unknown && count === 1) return route.abort("failed");
      if (options.stale && count === 1) {
        current = { ...current, revision: 2, party_size: 3 };
        return route.fulfill({ status: 409, json: { error: "changed", outcome: "rejected" } });
      }
      current = { ...current, status: "cancelled", revision: current.revision + 1 };
    }
    return route.fulfill({ json: { data: current } });
  });
  return calls;
}
test("guest opens a capability privately, sees Swiss times and explicitly cancels on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const requests: string[] = []; page.on("request", request => requests.push(request.url()));
  const calls = await mock(page);
  const response = await page.goto(link);
  await expect(page.getByRole("heading", { name: "Testrestaurant", exact: true })).toBeVisible();
  await expect(page.getByText("Reservierung bestätigt", { exact: true })).toBeVisible();
  await expect(page.getByText(/19:00/)).toBeVisible();
  await expect(page).toHaveURL(/\/booking\/manage$/);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  if (process.env.BOOKING_TEST_PRODUCTION === "true") expect(response?.headers()["cache-control"]).toContain("no-store");
  else expect(response?.headers()["cache-control"]).toMatch(/no-store|no-cache/); // Next's dev server overrides page cache headers.
  expect(requests.some(url => url.includes(key))).toBe(false);
  expect(requests.some(url => url.includes("/auth/v1/") || url.includes("/rest/v1/profiles"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Reservierung stornieren", exact: true }).click();
  expect(calls.filter(call => call.operation === "cancel")).toHaveLength(0);
  await page.getByRole("button", { name: "Reservierung behalten", exact: true }).click();
  await page.getByRole("button", { name: "Reservierung stornieren", exact: true }).click();
  await page.getByRole("button", { name: "Ja, stornieren", exact: true }).click();
  await expect(page.getByText("Reservierung storniert", { exact: true })).toBeVisible();
  expect(calls.filter(call => call.operation === "cancel")).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath("guest-cancelled-phone.png") });
});
test("pending requests are clearly distinguished from confirmed reservations", async ({ page }) => {
  await mock(page, { pending: true }); await page.goto(link);
  await expect(page.getByText("Anfrage eingegangen", { exact: true })).toBeVisible();
  await expect(page.getByText("Das Restaurant prüft deine Anfrage. Der Platz ist noch nicht bestätigt.")).toBeVisible();
  await expect(page.getByText("Reservierung bestätigt", { exact: true })).toHaveCount(0);
});
test("an uncertain cancellation survives reload and retries exactly the same mutation", async ({ page }) => {
  const calls = await mock(page, { unknown: true }); await page.goto(link);
  await page.getByRole("button", { name: "Reservierung stornieren", exact: true }).click();
  await page.getByRole("button", { name: "Ja, stornieren", exact: true }).click();
  await expect(page.getByText(/Der Ausgang der Stornierung ist noch unklar/)).toBeVisible();
  await page.goto(link);
  await expect(page.getByText(/Ein früherer Stornierungsauftrag/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Ein früherer Stornierungsauftrag/)).toBeVisible();
  await page.getByRole("button", { name: "Denselben Auftrag wiederholen", exact: true }).click();
  await expect(page.getByText("Reservierung storniert", { exact: true })).toBeVisible();
  const cancelled = calls.filter(call => call.operation === "cancel");
  expect(cancelled).toHaveLength(2); expect(cancelled[1]).toEqual(cancelled[0]);
});
test("a concurrent staff amendment requires a fresh guest decision with the new revision", async ({ page }) => {
  const calls = await mock(page, { stale: true }); await page.goto(link);
  await page.getByRole("button", { name: "Reservierung stornieren", exact: true }).click();
  await page.getByRole("button", { name: "Ja, stornieren", exact: true }).click();
  await expect(page.getByText(/Die Reservierung wurde inzwischen geändert/)).toBeVisible();
  expect(calls.filter(call => call.operation === "cancel")).toHaveLength(1);
  await page.getByRole("button", { name: "Aktuellen Stand laden", exact: true }).click();
  await expect(page.getByText("Testgast · 3 Personen", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reservierung stornieren", exact: true }).click();
  await page.getByRole("button", { name: "Ja, stornieren", exact: true }).click();
  await expect(page.getByText("Reservierung storniert", { exact: true })).toBeVisible();
  const cancelled = calls.filter(call => call.operation === "cancel");
  expect(cancelled[1].revision).toBe(2); expect(cancelled[1].requestId).not.toBe(cancelled[0].requestId);
});
test("invalid links clear credentials, and forgetting a valid link never cancels a reservation", async ({ page }) => {
  const invalid = await mock(page, { invalid: true }); await page.goto(link);
  await expect(page.getByText(/Dieser Buchungslink ist ungültig/)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("backyrd.booking.guest-link.v1"))).toBeNull();
  await page.unroute("**/api/booking/guest");
  const calls = await mock(page); await page.goto(link);
  await expect(page.getByRole("heading", { name: "Testrestaurant", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Buchungslink aus diesem Tab entfernen", exact: true }).click();
  await expect(page.getByText(/Deine Reservierung bleibt bestehen/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Öffne den persönlichen Buchungslink/)).toBeVisible();
  expect(calls.filter(call => call.operation === "cancel")).toHaveLength(0);
  expect(invalid.every(call => call.operation === "read")).toBe(true);
});
test("duplicate or malformed fragment credentials never trigger a guest lookup", async ({ page }) => {
  const calls = await mock(page); await page.goto(`${link}&key=${key}`);
  await expect(page.getByText(/Öffne den persönlichen Buchungslink/)).toBeVisible();
  await expect(page).toHaveURL(/\/booking\/manage$/);
  expect(calls).toHaveLength(0);
});
