import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const mobileOrigin = process.env.MOBILE_BOOKING_TEST_BASE_URL;
test.use({ baseURL: mobileOrigin ?? "http://127.0.0.1:4175" });
test.skip(!mobileOrigin, "Requires the explicitly built, isolated Expo test export.");
const id = "00000000-0000-4000-8000-000000000001", spot = "00000000-0000-4000-8000-000000000002", key = "A".repeat(43);
const link = `https://www.backyrd.ch/booking/manage#id=${id}&key=${key}`;
type Operation = { operation: string; reservationId: string; requestId?: string; revision?: number; key: string };
async function mock(page: Page, options: { unknown?: boolean; pending?: boolean; invalid?: boolean; malformed?: boolean } = {}) {
  let current = { id, spot_id: spot, name: "Restaurant Testbetrieb", guest_name: "Testgast", party_size: 2, starts_at: "2030-10-27T18:00:00Z", ends_at: "2030-10-27T20:00:00Z", cancellation_deadline: "2030-10-27T16:00:00Z", revision: 0, status: options.pending ? "pending" : "confirmed", policy_snapshot: { policy_revision: 1, cancellation_minutes: 120, confirmation_status: "confirmed", guest_notice: "Deine ursprünglichen Hinweise.", privacy_contact: "privacy@example.test" } };
  const calls: Operation[] = [];
  await page.route("**/booking-mobile-test.supabase.co/**", route => route.fulfill({ json: [] }));
  await page.route("**/api/booking/guest", async route => {
    const input = route.request().postDataJSON() as Operation; calls.push(input);
    if (options.invalid) return route.fulfill({ status: 404, json: {error:"link_unavailable",outcome:"rejected"} });
    if (input.operation === "cancel") {
      if (options.unknown && calls.filter(c=>c.operation==="cancel").length===1) return route.abort("failed");
      if (input.revision !== current.revision) return route.fulfill({status:409,json:{error:"changed",outcome:"rejected"}});
      current = { ...current, status: "cancelled", revision: current.revision + 1 };
    }
    return route.fulfill({ json: { data: options.malformed ? { ...current, id: spot } : current } });
  });
  return { calls, change: (value: Partial<typeof current>) => { current = { ...current, ...value }; } };
}
async function open(page: Page) { await page.goto("/booking"); await page.getByRole("button", { name: "Buchungslink hinzufügen", exact: true }).click({ trial: true }); }
async function add(page: Page, supplied = link) {
  await page.getByRole("button", { name: "Buchungslink hinzufügen", exact: true }).click();
  await page.getByLabel("Persönlicher Buchungslink", { exact: true }).fill(supplied);
  await page.getByRole("button", { name: "Link prüfen und speichern", exact: true }).click();
}
test("the actual Expo Booking tab imports a private link and renders original terms on a narrow phone", async ({page}) => {
  await page.setViewportSize({width:320,height:820});
  const urls: string[]=[]; page.on("request",request=>urls.push(request.url())); const fixture=await mock(page); await open(page); await add(page);
  await expect(page.getByRole("heading",{name:"Restaurant Testbetrieb",exact:true})).toBeVisible();
  await expect(page.getByText("Reservierung bestätigt",{exact:true})).toBeVisible();
  await expect(page.getByText("Deine ursprünglichen Hinweise.",{exact:true})).toBeVisible();
  await expect(page.getByText(/GMT\+1/).first()).toBeVisible();
  expect(urls.some(url=>url.includes(key))).toBe(false); expect(fixture.calls.every(c=>c.operation==="read")).toBe(true);
  const stored=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith("backyrd.booking.v1.")).map(k=>sessionStorage.getItem(k)).join("\n"));
  expect(stored).not.toContain("Testgast"); expect(stored).not.toContain("privacy@example.test");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).include('[data-testid="booking-screen"]').analyze()).violations).toEqual([]);
  await page.screenshot({path:test.info().outputPath("native-booking-phone.png"),fullPage:true});
});
test("pending native requests are not presented as confirmed",async({page})=>{
  await mock(page,{pending:true});await open(page);await add(page);
  await expect(page.getByText("Anfrage eingegangen",{exact:true})).toBeVisible();await expect(page.getByText("Reservierung bestätigt",{exact:true})).toHaveCount(0);
});
test("native cancellation reload retains the same unknown request and requires explicit confirmation",async({page})=>{
  const f=await mock(page,{unknown:true});await open(page);await add(page);
  await page.getByRole("button",{name:"Reservierung stornieren",exact:true}).click();
  expect(f.calls.filter(c=>c.operation==="cancel")).toHaveLength(0);
  await page.getByRole("button",{name:"Behalten",exact:true}).click();
  await page.getByRole("button",{name:"Reservierung stornieren",exact:true}).click();await page.getByRole("button",{name:"Ja, stornieren",exact:true}).click();
  await expect(page.getByText(/Der Ausgang der Stornierung ist unklar/)).toBeVisible();await page.reload();
  await page.getByRole("button",{name:"Buchung öffnen · Restaurant Testbetrieb",exact:true}).click();
  await expect(page.getByText(/Ein Stornierungsauftrag ist noch gespeichert/)).toBeVisible();
  expect(f.calls.filter(c=>c.operation==="cancel")).toHaveLength(1);
  await page.getByRole("button",{name:"Denselben Stornierungsauftrag wiederholen",exact:true}).click();
  await expect(page.getByText("Reservierung storniert",{exact:true})).toBeVisible();
  const writes=f.calls.filter(c=>c.operation==="cancel");expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);
});
test("the confirmation uses a fresh server revision and party size before cancelling",async({page})=>{
  const f=await mock(page);await open(page);await add(page);await expect(page.getByText("Reservierung bestätigt",{exact:true})).toBeVisible();
  f.change({party_size:4,revision:2});await page.getByRole("button",{name:"Reservierung stornieren",exact:true}).click();
  await expect(page.getByText(/4 Personen/)).toBeVisible();await page.getByRole("button",{name:"Ja, stornieren",exact:true}).click();
  await expect(page.getByText("Reservierung storniert",{exact:true})).toBeVisible();expect(f.calls.find(c=>c.operation==="cancel")?.revision).toBe(2);
});
test("removing a local link never cancels a reservation",async({page})=>{
  const f=await mock(page);await open(page);await add(page);await page.getByRole("button",{name:"Nur gespeicherten Link entfernen",exact:true}).click();
  await expect(page.getByText(/Die Reservierung bleibt bestehen/)).toBeVisible();await page.getByRole("button",{name:"Nur Link entfernen",exact:true}).click();
  await page.reload();await expect(page.getByText("Dein nächster guter Moment.",{exact:true})).toBeVisible();expect(f.calls.every(c=>c.operation==="read")).toBe(true);
});
test("unreadable device index does not masquerade as an empty booking list",async({page})=>{
  await mock(page);await open(page);await add(page);await expect(page.getByText("Reservierung bestätigt",{exact:true})).toBeVisible();
  await page.evaluate(()=>{const key=Object.keys(sessionStorage).find(k=>k.startsWith("backyrd.booking.v1.")&&k.endsWith(".index"));if(!key)throw Error("missing test index");sessionStorage.setItem(key,"broken");});await page.reload();
  await expect(page.getByText(/Der Buchungsspeicher konnte nicht zuverlässig/)).toBeVisible();await expect(page.getByText("Dein nächster guter Moment.",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Buchungsspeicher erneut laden",exact:true})).toBeVisible();
});
for(const mode of ["invalid","malformed"] as const)test(`a ${mode} capability response cannot create a native wallet entry`,async({page})=>{
  const f=await mock(page,{[mode]:true});await open(page);await add(page);await expect(page.getByText(mode==="invalid"?/Der Link ist gerade nicht nutzbar/:/Der aktuelle Buchungsstand konnte nicht geladen/)).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith("backyrd.booking.v1.")))).toBe(false);expect(f.calls.every(c=>c.operation==="read")).toBe(true);
});
test("an unrelated website link is rejected locally without transmitting its credential",async({page})=>{
  const f=await mock(page);await open(page);await add(page,link.replace("www.backyrd.ch","www.backyrd.ch.evil.test"));
  await expect(page.getByText(/Dieser Link ist kein gültiger persönlicher/)).toBeVisible();expect(f.calls).toHaveLength(0);await expect(page.getByLabel("Persönlicher Buchungslink",{exact:true})).toHaveValue("");
});
test("native durable-storage failure blocks cancellation before dispatch",async({page})=>{
  const f=await mock(page);await open(page);await add(page);await expect(page.getByText("Reservierung bestätigt",{exact:true})).toBeVisible();
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException("synthetic blocked storage");};});
  await page.getByRole("button",{name:"Reservierung stornieren",exact:true}).click();await page.getByRole("button",{name:"Ja, stornieren",exact:true}).click();
  await expect(page.getByText(/Der Buchungsspeicher konnte nicht zuverlässig/)).toBeVisible();expect(f.calls.filter(c=>c.operation==="cancel")).toHaveLength(0);
});
test("a no-longer-authorized link clears cached guest details but retains the scoped recovery entry",async({page})=>{
  const options={invalid:false};await mock(page,options);await open(page);await add(page);await expect(page.getByText("Testgast · 2 Personen",{exact:true})).toBeVisible();
  options.invalid=true;await page.getByRole("button",{name:"Aktuellen Stand prüfen",exact:true}).click();
  await expect(page.getByText(/Der Link ist gerade nicht nutzbar/)).toBeVisible();await expect(page.getByText("Testgast · 2 Personen",{exact:true})).toHaveCount(0);await expect(page.getByText("Reservierung bestätigt",{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith("backyrd.booking.v1.")))).toBe(true);
});
test("the signed-in six-item tab bar retains Booking and the moment action on a 320px phone",async({page})=>{
  await page.setViewportSize({width:320,height:820});await mock(page);
  const actor="00000000-0000-4000-8000-000000000099",encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url"),expires=Math.floor(Date.now()/1000)+3600;
  const user={id:actor,email:"native-test@booking.invalid",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},identities:[],created_at:"2026-01-01T00:00:00Z"};
  const session={access_token:`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:actor,role:"authenticated",exp:expires})}.synthetic-signature`,refresh_token:"synthetic-refresh",token_type:"bearer",expires_in:3600,expires_at:expires,user};
  await page.addInitScript(value=>{localStorage.setItem("sb-booking-mobile-test-auth-token",JSON.stringify(value));},session);
  await page.route("**/auth/v1/user",route=>route.fulfill({json:user}));await open(page);
  for(const label of ["Entdecken","Wohin","Orte","Momente","Booking"]){const element=page.getByText(label,{exact:true});await expect(element).toBeVisible();const box=await element.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(320);
    const clipping=await element.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();let parent:HTMLElement|null=node as HTMLElement;const failures:string[]=[];while(parent){const style=getComputedStyle(parent);if(["hidden","clip"].includes(style.overflowX)){const rect=parent.getBoundingClientRect();if(text.left<rect.left-1||text.right>rect.right+1)failures.push(parent.tagName);}parent=parent.parentElement;}return failures;});expect(clipping).toEqual([]);
  }
  const moment=page.getByRole("button",{name:"Moment mit Foto festhalten",exact:true});await expect(moment).toBeVisible();const box=await moment.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:test.info().outputPath("native-booking-signed-in-phone.png"),fullPage:true});
});
