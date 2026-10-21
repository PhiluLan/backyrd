import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const spot = "00000000-0000-4000-8000-000000000001";
const reservation = "00000000-0000-4000-8000-000000000003";
type Input = { operation: string; requestId?: string; key?: string; date?: string; partySize?: number; startsAt?: string; policyRevision?: number; challenge?: string };
async function fixture(page: Page, options: { unknown?: boolean; pending?: boolean; terminal?: boolean; changed?: boolean; unavailable?: boolean; currentCancelled?: boolean } = {}) {
  const calls: Input[] = [];
  let committed = false;
  await page.route("https://challenges.cloudflare.com/**", route => route.fulfill({ contentType: "application/javascript", body: `window.turnstile={render:function(node,o){node.style.width=o.size==='compact'?'150px':'300px';node.style.height='140px';window.syntheticProof=o;queueMicrotask(function(){o.callback('synthetic-'+crypto.randomUUID())});return 'synthetic-widget'},remove:function(){}};` }));
  await page.route("**/api/booking/guest", async route => {
    const input = route.request().postDataJSON() as Input; calls.push(input);
    const receipt = { id: reservation, spot_id: spot, name: "Testrestaurant", guest_name: "Testgast", party_size: 2, starts_at: "2026-10-20T17:00:00Z", ends_at: "2026-10-20T19:00:00Z", status: options.currentCancelled ? "cancelled" : options.pending ? "pending" : "confirmed", revision: options.currentCancelled ? 2 : 0, cancellation_deadline: "2026-10-20T15:00:00Z" };
    if (options.unavailable) return route.fulfill({ status: 503, json: { error: "unavailable", outcome: "rejected" } });
    if (input.operation === "availability") return route.fulfill({ json: { data: { spot_id: spot, name: "Testrestaurant", date: input.date, party_size: input.partySize, policy_revision: 1, notice_minutes: 60, horizon_days: 90, cancellation_minutes: 120, max_party_size: 8, confirmation_status: options.pending ? "pending" : "confirmed", privacy_contact: "privacy@example.test", guest_notice: "Bitte pünktlich erscheinen.", slots: [{ starts_at: `${input.date}T17:00:00Z`, ends_at: `${input.date}T19:00:00Z` }] } } });
    if (input.operation === "checkout_recover") {
      if (committed) return route.fulfill({ json: { data: receipt } });
      if (options.terminal) return route.fulfill({ json: { data: { not_committed: true, spot_id: spot, request_id: input.requestId, policy_revision: input.policyRevision, starts_at: input.startsAt } } });
      return route.fulfill({ status: 404, json: { error: "link_unavailable", outcome: "rejected" } });
    }
    if (input.operation === "create") {
      const first = calls.filter(c => c.operation === "create").length === 1;
      if (options.unknown && first) return route.abort("failed");
      if (options.changed && first) return route.fulfill({ status: 409, json: { error: "changed", outcome: "rejected" } });
      committed = true;
      // Historical create acknowledgement must never hide the current cancellation.
      return route.fulfill({ json: { data: { ...receipt, status: options.pending ? "pending" : "confirmed", revision: 0 } } });
    }
    return route.fulfill({ json: { data: receipt } });
  });
  return calls;
}
async function details(page: Page) {
  await page.goto(`/booking/${spot}`);
  await page.getByRole("button", { name: "19:00", exact: true }).click();
  await page.getByRole("button", { name: "Weiter zu deinen Angaben" }).click();
  await page.getByLabel("Dein Name", { exact: true }).fill("Testgast");
  await page.getByLabel("Deine E-Mail", { exact: true }).fill("guest@example.test");
}
test.beforeEach(async ({ page }) => { await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") }); });

test("anonymous phone checkout reviews terms, stores only a capability after success and exposes no credentials in requests", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const urls: string[] = []; page.on("request", r => urls.push(r.url()));
  const calls = await fixture(page); await details(page);
  const submit = page.getByRole("button", { name: "Tisch reservieren", exact: true });
  await expect(submit).toBeDisabled();
  await expect(page.getByText("Bitte pünktlich erscheinen.")).toBeVisible();
  await page.getByRole("checkbox").check(); await expect(submit).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("public-checkout-phone.png") });
  await submit.click(); await expect(page.getByText("Reservierung bestätigt", { exact: true })).toBeVisible();
  const creates = calls.filter(c => c.operation === "create"); expect(creates).toHaveLength(1);
  expect(urls.some(url => url.includes(creates[0].key!) || url.includes("/auth/v1/") || url.includes("/rest/v1/profiles"))).toBe(false);
  const stored = await page.evaluate(id => sessionStorage.getItem(`backyrd.booking.checkout.v1:${id}`), spot);
  expect(stored).not.toContain("guest@example.test"); expect(stored).not.toContain("Testgast"); expect(stored).toContain('"complete"');
  await expect(page.getByRole("link", { name: "Buchung verwalten" })).toHaveAttribute("href", new RegExp(`#id=${reservation}&key=`));
});
test("requests awaiting restaurant approval never appear confirmed", async ({ page }) => {
  await fixture(page, { pending: true }); await details(page); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Anfrage senden", exact: true }).click();
  await expect(page.getByText("Anfrage eingegangen", { exact: true })).toBeVisible();
  await expect(page.getByText("Reservierung bestätigt", { exact: true })).toHaveCount(0);
});
test("lost create acknowledgement survives reload and retries the original intent with a fresh proof", async ({ page }) => {
  const calls = await fixture(page, { unknown: true }); await details(page); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tisch reservieren", exact: true }).click();
  await expect(page.getByText(/Der Ausgang deiner Buchung ist noch unklar/)).toBeVisible();
  page.on("dialog", dialog => dialog.accept()); await page.reload();
  await expect(page.getByText(/Für deinen früheren Auftrag liegt noch kein sicheres Ergebnis/)).toBeVisible();
  expect(calls.filter(c => c.operation === "create")).toHaveLength(1);
  await expect(page.getByLabel("Dein Name", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Denselben Auftrag wiederholen" }).click();
  await expect(page.getByText("Reservierung bestätigt", { exact: true })).toBeVisible();
  const creates = calls.filter(c => c.operation === "create"); expect(creates).toHaveLength(2);
  const { challenge: first, ...one } = creates[0], { challenge: second, ...two } = creates[1];
  expect(two).toEqual(one); expect(first).not.toBe(second);
});
test("current receipt wins over a historical successful creation acknowledgement", async ({ page }) => {
  await fixture(page, { currentCancelled: true }); await details(page); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tisch reservieren", exact: true }).click();
  await expect(page.getByText("Reservierung storniert", { exact: true })).toBeVisible();
  await expect(page.getByText("Reservierung bestätigt", { exact: true })).toHaveCount(0);
});
test("a fresh policy conflict preserves contact drafts and requires another explicit review", async ({ page }) => {
  const calls = await fixture(page, { changed: true }); await details(page); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tisch reservieren", exact: true }).click();
  await page.getByRole("button", { name: "19:00", exact: true }).click(); await page.getByRole("button", { name: "Weiter zu deinen Angaben" }).click();
  await expect(page.getByLabel("Dein Name", { exact: true })).toHaveValue("Testgast");
  await expect(page.getByRole("checkbox")).not.toBeChecked(); expect(calls.filter(c => c.operation === "create")).toHaveLength(1);
});
test("unavailable intake does not pretend the restaurant is full", async ({ page }) => {
  const calls = await fixture(page, { unavailable: true }); await page.goto(`/booking/${spot}`);
  await expect(page.getByText(/Online-Buchung gerade nicht verfügbar/)).toBeVisible();
  await expect(page.getByText("Keine passende Zeit frei.", { exact: true })).toHaveCount(0);
  expect(calls.every(c => c.operation === "availability")).toBe(true);
});
test("unavailable tab storage prevents any creation request", async ({ page }) => {
  const calls = await fixture(page); await details(page); await page.getByRole("checkbox").check();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("synthetic blocked storage"); }; });
  await page.getByRole("button", { name: "Tisch reservieren", exact: true }).click();
  await expect(page.getByText(/Es wurde keine Buchung angefordert/)).toBeVisible();
  expect(calls.filter(c => c.operation === "create")).toHaveLength(0);
});
test("a canonical negative settlement releases the frozen intent without silently resubmitting it", async ({ page }) => {
  const calls = await fixture(page, { unknown: true, terminal: true }); await details(page); await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tisch reservieren", exact: true }).click();
  await expect(page.getByText(/Der Ausgang deiner Buchung ist noch unklar/)).toBeVisible();
  await page.getByRole("button", { name: "Buchungsstand prüfen", exact: true }).click();
  await expect(page.getByRole("button", { name: "19:00", exact: true })).toBeVisible();
  expect(calls.filter(c => c.operation === "create")).toHaveLength(1);
  expect(await page.evaluate(id => sessionStorage.getItem(`backyrd.booking.checkout.v1:${id}`), spot)).toBeNull();
});
test("expired human proof disables submission until a fresh proof arrives", async ({ page }) => {
  const calls = await fixture(page); await details(page); await page.getByRole("checkbox").check();
  const submit = page.getByRole("button", { name: "Tisch reservieren", exact: true }); await expect(submit).toBeEnabled();
  await page.evaluate(() => { (window as unknown as { syntheticProof: { "expired-callback": () => void } }).syntheticProof["expired-callback"](); });
  await expect(submit).toBeDisabled(); expect(calls.filter(c => c.operation === "create")).toHaveLength(0);
  await page.evaluate(() => { (window as unknown as { syntheticProof: { callback: (token: string) => void } }).syntheticProof.callback("synthetic-renewed-proof"); });
  await expect(submit).toBeEnabled(); await submit.click();
  await expect(page.getByText("Reservierung bestätigt", { exact: true })).toBeVisible();
  expect(calls.find(c => c.operation === "create")?.challenge).toBe("synthetic-renewed-proof");
});
test("party-size zero can be deleted without launching an invalid availability request", async ({ page }) => {
  const calls = await fixture(page); await page.goto(`/booking/${spot}`);
  await page.getByRole("button", { name: "19:00", exact: true }).waitFor();
  await page.getByLabel("Personen", { exact: true }).fill("0");
  await page.getByLabel("Personen", { exact: true }).fill("");
  await expect(page.getByLabel("Personen", { exact: true })).toHaveValue("");
  await expect(page.getByText("Wähle eine ganze Personenzahl zwischen 1 und 30.")).toBeVisible();
  await page.getByLabel("Personen", { exact: true }).fill("4");
  await expect.poll(() => calls.filter(c => c.operation === "availability").at(-1)?.partySize).toBe(4);
  expect(calls.some(c => c.operation === "availability" && (!c.partySize || c.partySize === 0))).toBe(false);
});
