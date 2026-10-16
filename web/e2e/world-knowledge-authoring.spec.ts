import { SPOT_GROUPS, SPOT_TYPE_CATALOG, OFFER_CATALOG, AREA_CATALOG, emptyExperienceProfile, emptyExperienceConditions } from "@backyrd/world-knowledge-core";
import { getExperienceAuthoringQuestions } from "../../packages/world-knowledge-authoring-ui/src/experience-authoring";
import { experienceAnswerGuidance } from "../../packages/world-knowledge-authoring-ui/src/experience-answer-guidance";
import { expect, test, type Page } from "@playwright/test";

const spotId = "41000000-0000-4000-8000-000000000001";
const ownerId = "41000000-0000-4000-8000-000000000099";
const basicKeys = [
  "experience.profile", "description.discovery_source", "discovery.profile",
  "identity.name", "location.address_line1", "location.locality", "contact.public_email",
  "classification.primary_category", "classification.place_types", "offering.cuisines",
  "purpose.primary_visit", "operation.price_level", "operation.price_options", "hours.regular", "rule.age_access_conditions", "rule.external_food", "rule.external_drink",
];
const proKeys = [...basicKeys, "capacity.seats_total", "amenity.features"];

async function mockOwner(page: Page, tier: "OWNER_BASIC" | "OWNER_PRO", role: "VERIFIED_OWNER" | "ADMIN" = "VERIFIED_OWNER", seedAnswers:Record<string,unknown>={}, reviewState?: {notes: Array<{class:string;attributeKey:string;reasonCodes:string[]}>; conflicts: Array<{severity:string;attributeKeys:string[]}>}) {
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
    "classification.primary_category": {claimId:"classification-default",knowledgeState:"KNOWN_VALUE",value:"EAT"},
    ...seedAnswers,
    "identity.name": { claimId: "41000000-0000-4000-8000-000000000010", knowledgeState: "KNOWN_VALUE", value: "Volta Bräu" },
  };
  let manifest: null | { manifestHash: string; worldSnapshot: { spotId: string; conflicts: Array<{severity:string;attributeKeys:string[]}> } } = reviewState ? {manifestHash:"a".repeat(64),worldSnapshot:{spotId,conflicts:reviewState.conflicts}} : null;
  const detail = () => ({
    contractVersion: "backyrd.world-knowledge.product-authoring-detail@1.0",
    spotId, name: "Volta Bräu", status: "approved",
    actor: { role, entitlement: role === "ADMIN" ? "ADMIN" : tier, allowedAttributeKeys: role === "ADMIN" || tier === "OWNER_PRO" ? proKeys : basicKeys },
    answers, openConflicts: reviewState?.notes ?? [], manifest,
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
  return { submissions, detail };
}

async function openEditor(page:Page) {
 await page.goto(`/owner/spots/${spotId}`);
 await page.getByRole('button',{name:/03 Angebote/}).click();
}
async function reloadEditor(page:Page) {
 await page.reload();
 const entry=page.getByRole('button',{name:/03 Angebote/});
 await entry.waitFor({state:'visible'});await entry.click();
}

test("Owner wählt seinen Spot nach Namen statt per ID", async ({ page }, testInfo) => {
  await mockOwner(page, "OWNER_BASIC");
  await page.goto("/owner/world-knowledge");
  await expect(page.getByRole("navigation", { name: "Owner Navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Volta Bräu Basel/ })).toBeVisible();
  await expect(page.getByText("Spot-ID")).toHaveCount(0);
  await page.getByRole("button", { name: /Volta Bräu Basel/ }).click();
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dein Spotprofil" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-spot-editor-desktop.png"), fullPage: true });
});

test("Basis-Owner pflegt freigegebene Bereiche, während Pro-Bereiche sichtbar gesperrt bleiben", async ({ page }) => {
  const owner = await mockOwner(page, "OWNER_BASIC");
  await openEditor(page);
  await page.getByRole("button", { name: /09 Allgemeine Preise & Zahlung/ }).click();
  await page.getByLabel("Preislevel").selectOption("MEDIUM");
  await expect.poll(() => owner.submissions.length).toBe(1);
  expect(owner.submissions[0].p_attribute_key).toBe("operation.price_level");
  await page.getByRole("button", { name: /10 Platz & Reservierung/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toBeVisible();
  await expect(page.getByText("CHF 39.–")).toBeVisible();
  await expect(page.getByRole("link", { name: "Owner Pro entdecken" })).toHaveAttribute("href", `/owner/billing?spot=${spotId}`);
  await expect(page.getByText("Sitzplätze gesamt")).toHaveCount(0);
  await page.getByRole("button", { name: /11 Ausstattung & Zugang/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toBeVisible();
  await expect(page.getByText("CHF 39.–")).toBeVisible();
  await expect(page.getByText("Spot-ID")).toHaveCount(0);
});

test("Pro-Owner erhält die vom Server erlaubten Zusatzfelder", async ({ page }) => {
  await mockOwner(page, "OWNER_PRO");
  await openEditor(page);
  await page.getByRole("button", { name: /10 Platz & Reservierung/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toHaveCount(0);
  await expect(page.getByText("Sitzplätze gesamt", {exact:true})).toBeVisible();
});

test("Admin-Zugriff erklärt die Freigabe der Pro-Bereiche", async ({ page }) => {
  await mockOwner(page, "OWNER_BASIC", "ADMIN");
  await openEditor(page);
  await expect(page.getByText("Admin-Zugriff: Alle Bereiche sind für dich freigeschaltet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /10 Platz & Reservierung/ }).click();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: /2 Grundinformationen/ })).toHaveCount(0);
});

test("Die Spot-Pflege bleibt auf dem Smartphone lesbar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockOwner(page, "OWNER_BASIC");
  await openEditor(page);
  await expect(page.getByRole("heading", { name: "Volta Bräu" })).toBeVisible();
  await expect(page.getByRole("button",{name:"Alle Bereiche",exact:true})).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Bereiche der Spot-Pflege" })).toBeHidden();
  await outerStep(page,7);
  await expect(page.getByRole("heading", { name: "Platz & Reservierung" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mehr Tiefe für deinen Spot." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Weiter", exact: true })).toBeVisible();
  await page.locator(".owner-mobile-menu summary").click();
  await expect(page.getByRole("navigation", { name: "Owner Navigation mobil" })).toBeVisible();
  await page.locator(".owner-mobile-menu summary").click();
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

for (const mobile of [false,true]) test(`Konkrete Owner-Preise bleiben vollständig und bearbeitbar (${mobile?'mobil':'desktop'})`,async({page},testInfo)=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);
 await outerStep(page,5);
 const field=page.locator('[id="field-operation.price_options"]');
 await field.getByRole('button',{name:'+ Preis hinzufügen',exact:true}).click();
 await expect(field.getByLabel('Preis 1 Von',{exact:true})).toHaveValue('');
 await field.getByRole('button',{name:'Getränk',exact:true}).click();await field.getByRole('button',{name:'Snack / Kuchen',exact:true}).click();
 await field.getByLabel('Preis 1 Von',{exact:true}).fill('8.5');await field.getByLabel('Preis 1 Bis',{exact:true}).fill('12.5');
 await expect(field.getByRole('checkbox').nth(0)).not.toBeChecked();await expect(field.getByRole('checkbox').nth(1)).not.toBeChecked();
 await field.getByRole('checkbox').nth(0).check();await field.getByRole('checkbox').nth(1).check();
 await field.getByRole('button',{name:'Preise übernehmen',exact:true}).click();await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_attribute_key).toBe('operation.price_options');expect(owner.submissions[0].p_value).toMatchObject([{purposes:['DRINK','SNACK'],min:8.5,max:12.5,basis:'PER_PERSON',minimumAge:null,maximumAge:null,allOfferingsCovered:true,mandatoryFeesIncluded:true}]);
 await reloadEditor(page);await outerStep(page,5);
 await expect(field.getByLabel('Preis 1 Von',{exact:true})).toHaveValue('8.5');await expect(field.getByLabel('Preis 1 Bis',{exact:true})).toHaveValue('12.5');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile?390:1280);
 await page.screenshot({path:testInfo.outputPath(`comparable-prices-${mobile?'mobile':'desktop'}.png`),fullPage:true});
});

for(const mobile of [false,true])test(`Spotwissen Consent Review Reload ${mobile}`,async({page})=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 const owner=await mockOwner(page,'OWNER_BASIC');let published=0,prepared=0;
 const source='Gäste bauen selbst Moosterrarien.';
 await page.route('**/rest/v1/rpc/world_product_discovery_publish_source_v1',async route=>{published++;expect(JSON.parse(route.request().postData()??'{}').p_source_text).toBe(source);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sourceHash:'a'.repeat(64)})});});
 await page.route('**/api/world-knowledge/discovery',async route=>{prepared++;const input=JSON.parse(route.request().postData()??'{}');expect(Object.keys(input).sort()).toEqual(['consentToOpenAI','sourceHash','spotId']);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({requiresHumanReview:true,draft:{contractVersion:'backyrd.world-knowledge.discovery-profile@1.0',description:source,reviewed:false,offerings:[],assertions:[{id:'build',kind:'VISIT',concepts:['build moss terrariums'],offeringId:null,state:'PRESENT',evidence:source,conditions:null,validFrom:null,validUntil:null}]}})});});
 await openEditor(page);
 await expect(page.getByRole("heading",{name:"Mit KI aus vorhandenen Texten ausfüllen",exact:true})).toBeVisible();
 const field=page.locator('[id="field-discovery.profile"]');
 await field.getByLabel('Öffentlicher Beschreibungstext',{exact:true}).fill(source);
 await expect(field.getByRole('button',{name:'Vorschläge vorbereiten',exact:true})).toBeDisabled();
 await field.getByRole('checkbox').first().check();await field.getByRole('button',{name:'Vorschläge vorbereiten',exact:true}).click();
 await expect(field.getByText('Bedeutung: build moss terrariums')).toBeVisible();await expect(field.getByLabel('Suchbegriffe build',{exact:true})).toBeVisible();await expect(field.locator('summary')).toHaveCount(0);expect(published).toBe(1);expect(prepared).toBe(1);expect(owner.submissions).toHaveLength(0);
 await expect(field.getByRole('button',{name:'Geprüftes Wissen übernehmen',exact:true})).toBeDisabled();
 await field.getByRole('checkbox').last().check();await field.getByRole('button',{name:'Geprüftes Wissen übernehmen',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);expect(owner.submissions[0].p_value).toMatchObject({reviewed:true,description:source});
 await reloadEditor(page);await expect(field.getByLabel('Öffentlicher Beschreibungstext',{exact:true})).toHaveValue(source);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile?390:1280);
});


const outerStep=async(page:Page,index:number)=>{
 const labels=['03 Angebote','01 Name, Adresse & Kontakt','02 Was für ein Ort ist das?','07 Küche & Service','08 Atmosphäre & Besuch','09 Allgemeine Preise & Zahlung','06 Wann ist geöffnet?','10 Platz & Reservierung','11 Ausstattung & Zugang','12 Gespeichertes Profil prüfen'];
 const name=new RegExp(labels[index].replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 if((page.viewportSize()?.width??1280)<=760){
  await page.getByRole('button',{name:'Alle Bereiche',exact:true}).click();
  const target=page.getByRole('button',{name});if(await target.count())await target.click();
 }else await page.getByRole('navigation',{name:'Bereiche der Spot-Pflege'}).getByRole('button',{name}).click();
};
const guided=(page:Page)=>page.locator('.wk-guided-authoring');
const addFromCatalogue=async(page:Page,label:string)=>{
 await expect(guided(page).getByRole('group',{name:'Angebote und Bereiche pflegen',exact:true})).toBeVisible();
 const add=guided(page).getByRole('button',{name:/^(Weiteres Angebot hinzufügen|Raum oder Bereich hinzufügen)$/});if(await add.count())await add.click();
 const button=guided(page).getByRole('button',{name:`+ ${label}`,exact:true});if(await button.count()){await button.click();return;}
 const select=guided(page).getByLabel('Weiteres Angebot hinzufügen',{exact:true});if(await select.count()){await select.selectOption({label});return;}
 await guided(page).getByLabel('Weiteren Bereich hinzufügen',{exact:true}).selectOption({label});
};
const mainStep=async(page:Page,step:number)=>{
 if(step===3){await expect(guided(page).getByRole('heading',{name:'Vorhandene Küchenangaben einem Angebot zuordnen',exact:true})).toBeVisible();return;}
 if(step===4)return;
 const workspace=['OFFERS','AREAS','SPOT'][step];
 if(await guided(page).getAttribute('data-workspace')===workspace)return;
 const label=['03 Angebote','04 Räume & Bereiche','05 Gemeinsame Ausstattung & Anreise'][step]!;
 if((page.viewportSize()?.width??1280)<=760)await page.getByRole('combobox',{name:'Bereich auswählen',exact:true}).selectOption({label});
 else await page.getByRole('navigation',{name:'Bereiche der Spot-Pflege'}).getByRole('button',{name:new RegExp(label)}).click();
};
const part=async(page:Page,name:string)=>{
 const heading=name==='Preise'?guided(page).getByRole('heading',{name:/^Preise \(\d+\)$/}):guided(page).getByRole('heading',{name:name==='Angebotszeiten'?'Wann ist dieses Angebot erhältlich?':name,exact:true});
 await heading.scrollIntoViewIfNeeded();
};
const overview=async(page:Page)=>guided(page).getByRole('button',{name:'← Zur Übersicht',exact:true}).click();
const saveProfile=async(page:Page)=>{
 await guided(page).getByRole('button',{name:'Änderungen speichern',exact:true}).click();
};

for(const scenario of [
 {category:'RESTAURANT',area:'Terrasse',offer:'Mittagessen'},
 {category:'BAR',area:'Terrasse',offer:'Apéro / Snacks'},
 {category:'ZOO',area:'Tierhaus',offer:'Zoobesuch'},
 {category:'MUSEUM',area:'Cafébereich',offer:'Café'},
 {category:'SPORT',area:'Boulderbereich',offer:'Bouldern'},
])test(`Geführte Pflege speichert ${scenario.category} und erhält Verknüpfungen`,async({page})=>{
 const type={RESTAURANT:'RESTAURANT',BAR:'WINE_BAR',ZOO:'ZOO',MUSEUM:'MUSEUM',SPORT:'CLIMBING_GYM'}[scenario.category];const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:[type]}});await openEditor(page);
 await mainStep(page,1);await addFromCatalogue(page,scenario.area);await overview(page);
 await mainStep(page,0);await addFromCatalogue(page,scenario.offer);await guided(page).getByRole('checkbox',{name:scenario.area,exact:true}).check();
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {category:string;areas:Array<{id:string}>;offers:Array<{areaIds:string[]}>};expect(p.category).toBe(scenario.category==='RESTAURANT'?'EAT':scenario.category);expect(p.offers[0].areaIds).toEqual([p.areas[0].id]);
 await reloadEditor(page);await guided(page).getByLabel(`Angebot ${scenario.offer} bearbeiten`,{exact:true}).click();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue(scenario.offer);await expect(guided(page).getByRole('checkbox',{name:scenario.area,exact:true})).toBeChecked();
});

for(const width of [320,390])test(`Mehrfachauswahl in offenen Fragebereichen bei ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:844});const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);
 await addFromCatalogue(page,'Getränke');await part(page,'Getränke einschließlich alkoholfreier Auswahl');
 const drinks=guided(page).getByRole('region',{name:'Getränke einschließlich alkoholfreier Auswahl',exact:true});
 for(const label of ['Wein','Bier','Kaffee','alkoholfreie Getränke'])await drinks.getByRole('button',{name:label,exact:true}).click();
 for(const label of ['Wein','Bier','Kaffee','alkoholfreie Getränke'])await expect(drinks.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
 await overview(page);await mainStep(page,1);await addFromCatalogue(page,'Terrasse');await part(page,'Atmosphäre');
 const atmosphere=guided(page).getByRole('region',{name:'Atmosphäre',exact:true});for(const label of ['gemütlich','lebendig','gesellig'])await atmosphere.getByRole('button',{name:label,exact:true}).click();
 await expect(atmosphere.getByRole('button',{name:'gemütlich',exact:true})).toHaveAttribute('aria-pressed','true');await expect(atmosphere.getByRole('button',{name:'lebendig',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(guided(page).getByRole('heading',{name:'Preise (0)'})).toHaveCount(0);expect(await guided(page).locator('details details').count()).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:testInfo.outputPath(`guided-atmosphere-${width}.png`),fullPage:true});await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const p=owner.submissions[0].p_value as {areas:Array<{properties:Array<{key:string;value:unknown}>}>;offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.areas[0].properties.filter(x=>x.key==='atmosphere.character').map(x=>x.value)).toEqual(['gemütlich','lebhaft','gesellig']);expect(p.offers[0].properties.filter(x=>x.key==='food.drink')).toHaveLength(4);
 await reloadEditor(page);await mainStep(page,1);await guided(page).getByLabel('Bereich Terrasse bearbeiten',{exact:true}).click();await part(page,'Atmosphäre');for(const label of ['gemütlich','lebendig','gesellig'])await expect(guided(page).getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
 await guided(page).getByRole('button',{name:'gemütlich',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(2);const p2=owner.submissions[1].p_value as typeof p;expect(p2.areas[0].properties.map(x=>x.value)).toContain('lebhaft');expect(p2.areas[0].properties.map(x=>x.value)).not.toContain('gemütlich');
});

test('Offene Fragen erhalten den Entwurf und schützen den Wechsel zu anderen Angaben',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Mittag am Rhein');
 await expect(guided(page).getByRole('heading',{name:'Was kann man hier machen?',exact:true})).toBeVisible();
 await expect(guided(page).getByRole('heading',{name:'Preise (0)',exact:true})).toBeVisible();
 await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Mittag am Rhein');
 await expect(guided(page).getByRole('navigation',{name:'Abschnitt des Angebots'})).toHaveCount(0);
 await outerStep(page,1);await expect(page.locator('.wk-toast[role="status"]').filter({hasText:/ungespeicherte Änderungen/i})).toBeVisible();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Mittag am Rhein');
});

test('Einzelantworten ersetzen sich ohne andere Wünsche zu löschen',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');await part(page,'Reservation erforderlich?');const booking=guided(page).getByRole('region',{name:'Reservation erforderlich?',exact:true});await booking.getByRole('button',{name:'Erforderlich',exact:true}).click();await booking.getByRole('button',{name:'Nicht erforderlich',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.offers[0].properties.filter(x=>x.key==='participation.booking').map(x=>x.value)).toEqual(['Nicht erforderlich']);
});

test('Leere und ungültige Preise werden nicht gespeichert und der Entwurf bleibt erhalten',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');await part(page,'Preise');await addFromCatalogue(page,'Preis hinzufügen');await expect(page.getByLabel('Preis 1 Von',{exact:true})).toHaveValue('');await saveProfile(page);await expect(page.getByRole('alert').filter({hasText:/Bitte prüfe Namen/})).toBeVisible();expect(owner.submissions).toHaveLength(0);await guided(page).getByRole('button',{name:'Speichern & weiter',exact:true}).click();await expect(guided(page)).toHaveAttribute('data-workspace','OFFERS');expect(owner.submissions).toHaveLength(0);
 await part(page,'Preise');await page.getByLabel('Preisbezeichnung',{exact:true}).fill('Menü');await page.getByLabel('Preis 1 Von',{exact:true}).fill('30');await page.getByLabel('Preis 1 Bis',{exact:true}).fill('20');await saveProfile(page);expect(owner.submissions).toHaveLength(0);await part(page,'Preise');await expect(page.getByLabel('Preis 1 Bis',{exact:true})).toHaveValue('20');
 await page.getByLabel('Preis 1 Von',{exact:true}).fill('0');await page.getByLabel('Preis 1 Bis',{exact:true}).fill('0');await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
});

test('Verknüpfte Bereiche bleiben vor versehentlichem Entfernen geschützt',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');await guided(page).getByRole('button',{name:'Bereich anlegen: Terrasse',exact:true}).click();await overview(page);await mainStep(page,1);await guided(page).getByLabel('Bereich Terrasse bearbeiten',{exact:true}).click();await expect(guided(page).getByRole('button',{name:'Bereich entfernen',exact:true})).toBeDisabled();
});

test('Speicherfehler meldet keinen Erfolg und kann mit unverändertem Entwurf wiederholt werden',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');let fail=true;await page.route('**/rest/v1/rpc/world_product_owner_submit_claim_v1',async(route)=>{if(fail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'test unavailable'})});}else await route.fallback();});
 await openEditor(page);await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Mein Mittag');await saveProfile(page);await expect(guided(page).getByRole('alert')).toContainText('Speichern fehlgeschlagen');expect(owner.submissions).toHaveLength(0);fail=false;await guided(page).getByRole('button',{name:'Änderungen speichern',exact:true}).click();await expect.poll(()=>owner.submissions.length).toBe(1);
});

test('Gespeicherter Stand bleibt nach späterem Verwerfen erhalten',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Gespeichert');await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);if(await guided(page).getByRole('button',{name:'← Zur Übersicht',exact:true}).count())await overview(page);await mainStep(page,0);await guided(page).getByLabel('Angebot Gespeichert bearbeiten',{exact:true}).click();await page.getByLabel('Name des Angebots',{exact:true}).fill('Ungespeichert');await guided(page).getByRole('button',{name:'Ungespeicherten Entwurf verwerfen',exact:true}).click();if(await guided(page).getByRole('button',{name:'← Zur Übersicht',exact:true}).count())await overview(page);await mainStep(page,0);await guided(page).getByLabel('Angebot Gespeichert bearbeiten',{exact:true}).click();await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Gespeichert');
});

test('Bisherige allgemeine Angaben werden weiterhin bearbeitet und eindeutig erklärt',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await openEditor(page);await outerStep(page,5);await expect(page.getByText('Diese Angaben gelten für den gesamten Spot',{exact:true})).toBeVisible();await expect(page.locator('[id="field-operation.price_options"]')).toBeVisible();
});

test('Ungültiges gespeichertes Profil wird nicht leer überschrieben',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'broken',knowledgeState:'KNOWN_VALUE',value:{category:'BROKEN'}}});await openEditor(page);await expect(guided(page).getByRole('alert')).toContainText('nicht sicher geladen');await expect(guided(page).getByRole('button',{name:'Weiteres Angebot hinzufügen',exact:true})).toBeDisabled();expect(owner.submissions).toHaveLength(0);
});

test('Mehrfachauswahl erhält vorhandene bedingte und freie Angaben',async({page})=>{
 const p={...emptyExperienceProfile('BAR'),reviewed:true,offers:[{id:'drinks',kind:'DRINKS',name:'Getränke',areaIds:[],prices:[],schedule:[],validFrom:null,validUntil:null,properties:[{key:'food.drink',label:null,state:'KNOWN',value:'Wein',conditions:{...emptyExperienceConditions(),weekdays:[6]}},{key:'experience.activity',label:null,state:'KNOWN',value:'Bisheriger Sammeltext',conditions:emptyExperienceConditions()}]}]};
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'seed-profile',knowledgeState:'KNOWN_VALUE',value:p}});await openEditor(page);await guided(page).getByLabel('Angebot Getränke bearbeiten',{exact:true}).click();await part(page,'Getränke einschließlich alkoholfreier Auswahl');await guided(page).getByRole('button',{name:'Bier',exact:true}).click();await part(page,'Was kann man hier machen?');await expect(guided(page).locator('blockquote').filter({hasText:'Bisheriger Sammeltext'})).toBeVisible();await guided(page).getByRole('button',{name:'etwas trinken',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const saved=owner.submissions[0].p_value as typeof p;expect(saved.offers[0].properties).toEqual(expect.arrayContaining(p.offers[0].properties));expect(saved.offers[0].properties.map(v=>v.value)).toEqual(expect.arrayContaining(['Wein','Bier','Bisheriger Sammeltext','etwas trinken']));
});

test('Bisherige Küche wird nur dem ausdrücklich ausgewählten Angebot zugeordnet',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'offering.cuisines':{claimId:'cuisine',knowledgeState:'KNOWN_VALUE',value:['ITALIAN']}});await openEditor(page);await addFromCatalogue(page,'Mittagessen');await overview(page);await mainStep(page,3);await guided(page).getByLabel('Für welches Angebot gelten die Angaben?',{exact:true}).selectOption({label:'Angebot: Mittagessen'});await guided(page).getByRole('button',{name:'Zum Angebot hinzufügen',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {properties:unknown[];offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.properties).toEqual([]);expect(p.offers[0].properties).toEqual(expect.arrayContaining([expect.objectContaining({key:'food.cuisine',value:'Italienisch'})]));
});

test('Vorkenntnisse schliessen sich aus, Begleitung bleibt unabhängig',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);
 await addFromCatalogue(page,'Bouldern');await part(page,'Voraussetzungen und nötige Begleitung');
 const q=guided(page).getByRole('region',{name:'Voraussetzungen und nötige Begleitung',exact:true});
 await q.getByRole('button',{name:'Keine Vorkenntnisse',exact:true}).click();await q.getByRole('button',{name:'Begleitung erforderlich',exact:true}).click();await q.getByRole('button',{name:'Vorkenntnisse erforderlich',exact:true}).click();
 await expect(q.getByRole('button',{name:'Keine Vorkenntnisse',exact:true})).toHaveAttribute('aria-pressed','false');await expect(q.getByRole('button',{name:'Begleitung erforderlich',exact:true})).toHaveAttribute('aria-pressed','true');
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const p=owner.submissions[0].p_value as {offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.offers[0].properties.filter(p=>p.key==='participation.prerequisite').map(p=>p.value)).toEqual(['Begleitung erforderlich','Vorkenntnisse erforderlich']);
});
test('Innen und Aussen sind unabhängig vom Zweck des Bereichs pflegbar',()=>{const spec=experienceAnswerGuidance('location.setting','SPORT',undefined,'BOULDER_AREA');expect(spec?.kind).toBe('CHOICES');if(spec?.kind==='CHOICES')expect(spec.choices).toEqual(expect.arrayContaining(['drinnen','draussen']));});

test('Bewegungslandschaft speichert Bewegungsspiel und Klettern am selben Angebot',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const p={...emptyExperienceProfile('SPORT'),reviewed:true,offers:[{id:'kids-play',kind:'MOVEMENT_PLAY',name:'Bewegungslandschaft für Kinder',areaIds:[],prices:[],schedule:[],validFrom:null,validUntil:null,properties:[{key:'experience.activity',label:null,state:'KNOWN',value:'Bewegungsspiel',conditions:emptyExperienceConditions()},{key:'participation.minimum_age',label:null,state:'KNOWN',value:1,conditions:emptyExperienceConditions()}]}]};
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'seed-sport',knowledgeState:'KNOWN_VALUE',value:p}});
 await openEditor(page);await guided(page).getByLabel('Angebot Bewegungslandschaft für Kinder bearbeiten',{exact:true}).click();await part(page,'Was kann man hier machen?');
 const q=guided(page).getByRole('region',{name:'Was kann man hier machen?',exact:true});await expect(q.getByRole('button',{name:'Bewegungsspiel',exact:true})).toHaveAttribute('aria-pressed','true');await expect(q.getByRole('button',{name:'Klettern',exact:true})).toHaveAttribute('aria-pressed','false');
 await q.getByRole('button',{name:'Klettern',exact:true}).click();await expect(q.getByRole('button',{name:'Bewegungsspiel',exact:true})).toHaveAttribute('aria-pressed','true');await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const saved=owner.submissions[0].p_value as typeof p;expect(saved.offers).toHaveLength(1);expect(saved.offers[0].id).toBe('kids-play');expect(saved.offers[0].properties).toEqual(expect.arrayContaining([...p.offers[0].properties,expect.objectContaining({key:'experience.activity',value:'Klettern'})]));
 await reloadEditor(page);await guided(page).getByLabel('Angebot Bewegungslandschaft für Kinder bearbeiten',{exact:true}).click();await part(page,'Was kann man hier machen?');for(const name of ['Bewegungsspiel','Klettern'])await expect(guided(page).getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('Sportangebotstyp beschränkt Tätigkeiten nicht auf sein eigenes Label',()=>{
 for(const kind of ['MOVEMENT_PLAY','BOULDERING','CLIMBING','TRAINING','COURSE','CHILDREN_COURSE']){const spec=experienceAnswerGuidance('experience.activity','SPORT',kind);expect(spec?.kind).toBe('CHOICES');if(spec?.kind==='CHOICES'){expect(spec.multiple).toBe(true);expect(spec.choices).toEqual(expect.arrayContaining(['Bewegungsspiel','Klettern','Bouldern']));expect(new Set(spec.choices).size).toBe(spec.choices.length);}}
 const cafe=experienceAnswerGuidance('experience.activity','SPORT','CAFE');if(cafe?.kind==='CHOICES')expect(cafe.choices).not.toContain('Klettern');
});

test('Hotel übernimmt den Spottyp und kombiniert Übernachtung mit Bar ohne Pflegeart',async({page})=>{
 await page.setViewportSize({width:390,height:844});const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.primary_category':{knowledgeState:'KNOWN_VALUE',value:'STAY'},'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:['HOTEL']}});
 await openEditor(page);await expect(guided(page).getByText('Hotel',{exact:true})).toBeVisible();await expect(page.getByLabel('Art des Spots')).toHaveCount(0);
 await addFromCatalogue(page,'Übernachtung');await part(page,'Check-in ab');await guided(page).getByLabel('Check-in ab Wert').fill('15:00');await part(page,'Preise');await guided(page).getByRole('button',{name:'+ Preis hinzufügen',exact:true}).click();await guided(page).getByLabel('Preisbezeichnung').fill('Zimmer pro Nacht');await guided(page).getByLabel('Berechnung').selectOption('PER_ROOM_NIGHT');
 await guided(page).getByLabel('Preis 1 Von',{exact:true}).fill('160');await guided(page).getByLabel('Preis 1 Bis',{exact:true}).fill('160');await overview(page);
 await guided(page).getByRole('button',{name:'Weiteres Angebot hinzufügen',exact:true}).click();await guided(page).getByLabel('Weiteres Angebot hinzufügen').selectOption('DRINKS');await part(page,'Getränke einschließlich alkoholfreier Auswahl');await guided(page).getByRole('button',{name:'Wein',exact:true}).click();await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const p=owner.submissions[0].p_value as {category:string;properties:unknown[];offers:Array<{kind:string;properties:Array<{key:string;value:unknown}>;prices:Array<{basis:string}>}>};expect(p.category).toBe('STAY');expect(p.properties).toEqual([]);expect(p.offers.map(o=>o.kind)).toEqual(['OVERNIGHT_STAY','DRINKS']);expect(p.offers[0].prices[0].basis).toBe('PER_ROOM_NIGHT');expect(p.offers[0].properties).toEqual(expect.arrayContaining([expect.objectContaining({key:'stay.check_in',value:'15:00'})]));expect(p.offers[1].properties).toEqual(expect.arrayContaining([expect.objectContaining({key:'food.drink',value:'Wein'})]));
 await reloadEditor(page);await guided(page).getByLabel('Angebot Übernachtung bearbeiten',{exact:true}).click();await part(page,'Check-in ab');await expect(guided(page).getByLabel('Check-in ab Wert')).toHaveValue('15:00');
});

for(const group of SPOT_GROUPS)test(`Universelle Pflege ${group.id}: Vorschlag und Speicherung`,async({page})=>{
 const type=SPOT_TYPE_CATALOG.find(t=>t.group===group.id)!;const item=OFFER_CATALOG.find(o=>o.group===group.id);
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.primary_category':{knowledgeState:'KNOWN_VALUE',value:group.id},'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:[type.kind]}});
 await openEditor(page);await expect(guided(page).getByText(type.label,{exact:true})).toBeVisible();await expect(guided(page).getByRole('button',{name:'Weiteres Angebot hinzufügen',exact:true})).toBeVisible();
 if(item){await guided(page).getByRole('button',{name:'Weiteres Angebot hinzufügen',exact:true}).click();await guided(page).getByLabel('Weiteres Angebot hinzufügen').selectOption(item.kind);}else await addFromCatalogue(page,'Eigenes Angebot');
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);const p=owner.submissions[0].p_value as {offers:Array<{kind:string}>};expect(p.offers[0].kind).toBe(item?.kind??'OTHER');
});

test('Spottypen zeigen passende Vorschläge, suchen global und behalten zusätzliche Auswahl',async({page})=>{
 await page.setViewportSize({width:390,height:844});const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'classification.primary_category':{knowledgeState:'KNOWN_VALUE',value:'STAY'},'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:['HOTEL']}});
 await openEditor(page);await outerStep(page,2);const field=page.locator('[id="field-classification.place_types"]');await expect(field.getByRole('button',{name:'Hotel',exact:true})).toHaveAttribute('aria-pressed','true');await expect(field.getByRole('button',{name:'Weinbar',exact:true})).toHaveCount(0);
 await field.getByLabel('Auswahl durchsuchen').fill('Weinbar');await field.getByRole('button',{name:'Weinbar',exact:true}).click();await field.getByLabel('Auswahl durchsuchen').fill('');await expect(field.getByRole('button',{name:'Hotel',exact:true})).toHaveAttribute('aria-pressed','true');await expect(field.getByRole('button',{name:'Weinbar',exact:true})).toHaveAttribute('aria-pressed','true');
 await field.getByRole('button',{name:'Auswahl übernehmen',exact:true}).click();await expect.poll(()=>owner.submissions.length).toBe(1);expect(owner.submissions[0].p_value).toEqual(['HOTEL','WINE_BAR']);await reloadEditor(page);await outerStep(page,2);for(const name of ['Hotel','Weinbar'])await expect(field.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
});

for(const width of [320,390,1280])test(`Spot Studio startet mit verständlicher Aufgabenübersicht bei ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await mockOwner(page,'OWNER_BASIC');
 await page.goto(`/owner/spots/${spotId}`);
 await expect(page.getByRole('heading',{name:'Dein Spotprofil'})).toBeVisible();
 await expect(guided(page)).toHaveCount(0);
 await expect(page.getByRole('button',{name:/03 Angebote/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:testInfo.outputPath(`studio-home-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:/03 Angebote/}).click();
 await addFromCatalogue(page,'Mittagessen');await part(page,'Was kann man hier machen?');
 await expect(guided(page).getByRole('navigation',{name:'Abschnitt des Angebots'})).toHaveCount(0);
 await expect(guided(page).getByRole('heading',{name:'Preise (0)',exact:true})).toBeVisible();
 await guided(page).getByRole('button',{name:'essen gehen',exact:true}).click();
 await page.getByRole('button',{name:'Alle Bereiche',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Dein Entwurf ist noch nicht gespeichert'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Dein Spotprofil'})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath(`studio-offer-${width}.png`),fullPage:true});
 await saveProfile(page);await page.getByRole('button',{name:'Alle Bereiche',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Dein Spotprofil'})).toBeVisible();
});

test('Normale Profilfelder schützen ungespeicherte Eingaben und lassen sie bewusst verwerfen',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await outerStep(page,1);
 const field=page.locator('[id="field-identity.name"]');const input=field.getByRole('textbox');
 await input.fill('Neuer Spotname');await outerStep(page,2);
 await expect(input).toHaveValue('Neuer Spotname');await expect(field.getByText('Noch nicht gespeichert',{exact:true})).toBeVisible();
 await field.getByRole('button',{name:'Änderungen verwerfen',exact:true}).click();await expect(input).toHaveValue('Volta Bräu');
 await outerStep(page,2);await expect(page.getByRole('heading',{name:'Was für ein Ort ist das?',exact:true})).toBeVisible();
 expect(owner.submissions).toHaveLength(0);
});


test('Alle Angebots- und Bereichstypen vermeiden neue pauschale Zugangsfragen',()=>{
 for(const offer of OFFER_CATALOG){
  const questions=getExperienceAuthoringQuestions(offer.group,'OFFER',offer.kind);
  expect(questions.map(question=>question.key)).not.toContain('participation.accessibility');
  expect(questions.map(question=>question.key)).not.toContain('offer.feature');
  expect(questions.map(question=>question.key)).not.toContain('amenity.step_free');
 }
 for(const area of AREA_CATALOG)expect(getExperienceAuthoringQuestions(area.group,'AREA',undefined,area.kind).map(question=>question.key)).not.toContain('participation.accessibility');
 for(const group of SPOT_GROUPS){
  expect(getExperienceAuthoringQuestions(group.id,'SPOT').map(question=>question.key)).not.toContain('participation.accessibility');
  expect(getExperienceAuthoringQuestions(group.id,'AREA',undefined,'INDOOR').map(question=>question.key)).toContain('amenity.step_free');
 }
});

for(const width of [320,390,1280])test(`Zugangsangaben bleiben an ihrer Quelle ohne Doppeleingabe bei ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 const property=(key:string,value:string|boolean)=>({key,label:null,state:'KNOWN',value,conditions:emptyExperienceConditions()});
 const terraceAccess={...property('amenity.step_free',false),conditions:{...emptyExperienceConditions(),weekdays:[6]}};
 const profile={...emptyExperienceProfile('BAR'),reviewed:true,
  properties:[property('participation.accessibility','stufenfrei')],
  areas:[{id:'terrace',kind:'TERRACE',name:'Terrasse',properties:[terraceAccess]}, {id:'unlinked',kind:'INDOOR',name:'Nicht zugeordneter Saal',properties:[property('amenity.step_free',true)]}],
  offers:[{id:'dinner',kind:'DINNER',name:'Abendessen',areaIds:['terrace'],prices:[],schedule:[],validFrom:null,validUntil:null,properties:[property('participation.accessibility','mit Kinderwagen zugänglich')]}],
 };
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{
  'experience.profile':{claimId:'scoped',knowledgeState:'KNOWN_VALUE',value:profile},
  'accessibility.step_free_entrance':{claimId:'entrance',knowledgeState:'KNOWN_TRUE',value:true},
  'amenity.features':{claimId:'facilities',knowledgeState:'KNOWN_VALUE',value:['TOILET']},
 });
 await openEditor(page);
 await expect(guided(page).getByRole('navigation',{name:'Schritt der Angebote und Bereiche'})).toHaveCount(0);
 await guided(page).getByRole('button',{name:'Angebot Abendessen bearbeiten',exact:true}).click();
 await expect(guided(page).getByRole('button',{name:'Zugänglichkeit und Einschränkungen',exact:true})).toHaveCount(0);
 await guided(page).getByText(/Bereits erfasste Angaben ansehen/).click();
 const references=guided(page).locator('.wk-linked-knowledge');
 await expect(references.locator('[data-evidence-scope="SPOT"]').first()).toContainText('Ja');
 await expect(references.locator('[data-evidence-scope="AREA"]')).toContainText('Terrasse');
 await expect(references.locator('[data-evidence-scope="AREA"]')).toContainText('Nein');
 await expect(references.locator('[data-evidence-scope="AREA"]')).toContainText('Samstag');
 await expect(references.getByText('Nicht zugeordneter Saal',{exact:false})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath(`scoped-references-${width}.png`),fullPage:true});
 await page.getByLabel('Name des Angebots',{exact:true}).fill('Abendessen am Rhein');
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const saved=owner.submissions[0].p_value as typeof profile;
 expect(saved.properties).toEqual(profile.properties);
 expect(saved.areas).toEqual(profile.areas);
 expect(saved.offers[0].properties).toEqual(profile.offers[0].properties);
 expect(saved.offers[0].areaIds).toEqual(['terrace']);
 await overview(page);await mainStep(page,1);
 await guided(page).getByRole('button',{name:'Bereich Terrasse bearbeiten',exact:true}).click();
 await expect(guided(page).getByRole('button',{name:'Zugänglichkeit und Einschränkungen',exact:true})).toHaveCount(0);
 await part(page,'Ist dieser Bereich stufenlos erreichbar?');
 await expect(guided(page).getByRole('region',{name:'Ist dieser Bereich stufenlos erreichbar?',exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath(`scoped-area-${width}.png`),fullPage:true});
 await overview(page);await mainStep(page,2);
 await expect(guided(page).getByRole('button',{name:'Gibt es ein WC am Spot?',exact:true})).toHaveCount(0);
 await expect(guided(page).getByRole('button',{name:'Zugänglichkeit und Einschränkungen',exact:true})).toHaveCount(0);
});

test('Ein neuer Bereich speichert seinen Zugang ohne Aussage über Spot oder Angebot',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);
 await mainStep(page,1);await addFromCatalogue(page,'Terrasse');
 await part(page,'Ist dieser Bereich stufenlos erreichbar?');
 await guided(page).getByRole('region',{name:'Ist dieser Bereich stufenlos erreichbar?',exact:true}).getByRole('button',{name:'Nein',exact:true}).click();
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const saved=owner.submissions[0].p_value as {properties:unknown[];offers:unknown[];areas:Array<{properties:Array<{key:string;value:unknown}>}>};
 expect(saved.properties).toEqual([]);expect(saved.offers).toEqual([]);
 expect(saved.areas[0].properties).toEqual([expect.objectContaining({key:'amenity.step_free',value:false})]);
});

test('Räume und gemeinsame Angaben haben eigene Einstiege auf der Startübersicht',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);
 await page.getByRole('button',{name:/04 Räume & Bereiche/}).click();
 await expect(guided(page)).toHaveAttribute('data-workspace','AREAS');
 await expect(guided(page).getByRole('button',{name:'Raum oder Bereich hinzufügen',exact:true})).toBeVisible();
 await expect(guided(page).getByRole('button',{name:'Weiteres Angebot hinzufügen',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Alle Bereiche',exact:true}).click();
 await page.getByRole('button',{name:/05 Gemeinsame Ausstattung/}).click();
 await expect(guided(page)).toHaveAttribute('data-workspace','SPOT');
});

for (const width of [390, 1280]) test(`Prüfnotizen erklären alte Speicherfassungen und öffnen die Angabe bei ${width}px`, async ({page}, testInfo) => {
  await page.setViewportSize({width,height:900});
  const note={class:"AUTHORITY_CONFLICT",attributeKey:"experience.profile",reasonCodes:["CONCURRENT_AUTHORITATIVE_CONFLICT"]};
  const owner=await mockOwner(page,"OWNER_PRO","ADMIN",{}, {notes:[note,note],conflicts:[]});
  await page.goto(`/owner/spots/${spotId}`);
  await page.locator(".wk-entry-audit > summary").click();
  const status=page.getByRole("region",{name:"Profilstatus und offene Angaben"});
  await expect(status.getByText("Die aktuelle Datenansicht enthält keine Widersprüche.",{exact:false})).toBeVisible();
  await expect(status.getByText("2 separate Prüfnotizen zu 1 Angabe")).toBeVisible();
  await expect(status.getByText(/innerhalb von fünf Minuten/)).toHaveCount(1);
  await expect(status.getByText(/kein Hinweis auf ein leeres Feld/)).toBeVisible();
  await status.getByRole("button",{name:"Angabe prüfen: Angebote und Bereiche",exact:true}).click();
  await expect(page.getByRole("button",{name:"Weiteres Angebot hinzufügen",exact:true})).toBeVisible();
  await expect(page.locator('[id="wk-editor-experience.profile"]')).toBeFocused();
  await expect(page.getByRole("heading",{name:"Was ist noch offen?",exact:true})).toBeHidden();
  await expect(page.locator(".wk-profile-status-toggle > summary")).toBeVisible();
  expect(owner.submissions).toHaveLength(0);
  await page.screenshot({path:testInfo.outputPath(`profile-review-${width}.png`),fullPage:true});
});

test("Profilstatus öffnet optionale Felder gezielt und schützt einen vorhandenen Entwurf", async ({page}) => {
  await mockOwner(page,"OWNER_PRO","ADMIN");
  await page.goto(`/owner/spots/${spotId}`);
  await page.locator(".wk-entry-audit > summary").click();
  const status=page.getByRole("region",{name:"Profilstatus und offene Angaben"});
  await status.locator("details").first().locator("summary").click();
  await status.getByRole("button",{name:"Öffnen: Öffentliche Spot-E-Mail",exact:true}).click();
  const field=page.locator('[id="wk-editor-contact.public_email"]');
  await expect(field).toBeFocused();
  await field.locator('input[type="email"]').fill("new@backyrd.test");
  await page.locator(".wk-profile-status-toggle > summary").click();
  await status.getByRole("button",{name:"Angabe prüfen: Art des Ortes",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:/Entwurf ist noch nicht gespeichert/})).toBeVisible();
  await expect(field.locator('input[type="email"]')).toHaveValue("new@backyrd.test");
});

test("Prüfnotizen werden bei aktuellem Widerspruch nicht als konfliktfrei dargestellt", async ({page}) => {
  await mockOwner(page,"OWNER_PRO","ADMIN",{}, {notes:[{class:"USER_REPORT",attributeKey:"experience.profile",reasonCodes:["FUTURE_CODE"]}],conflicts:[{severity:"BLOCKING",attributeKeys:["experience.profile"]}]});
  await page.goto(`/owner/spots/${spotId}`);
  await page.locator(".wk-entry-audit > summary").click();
  const status=page.getByRole("region",{name:"Profilstatus und offene Angaben"});
  await expect(status.getByText(/1 Widerspruch in der aktuellen Datenansicht/)).toBeVisible();
  await expect(status.getByText(/genaue Ursache ist hier nicht verfügbar/)).toBeVisible();
  await expect(status.getByText(/enthält keine Widersprüche/)).toHaveCount(0);
});

for(const width of [390,1280])test(`Gleichwertige Hauptbereiche behalten einen gemeinsamen Entwurf bei ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);
 await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Mittagsmenü');
 await mainStep(page,1);await addFromCatalogue(page,'Terrasse');
 const access=guided(page).getByRole('region',{name:'Ist dieser Bereich stufenlos erreichbar?',exact:true});
 await expect(access.getByRole('button',{name:'Ja',exact:true})).toBeVisible();await access.getByRole('button',{name:'Ja',exact:true}).click();
 await expect(guided(page).getByRole('region',{name:'Atmosphäre',exact:true})).toBeVisible();
 await mainStep(page,2);
 const toilet=guided(page).getByRole('region',{name:'Gibt es ein WC am Spot?',exact:true});await expect(toilet.getByRole('button',{name:'Ja',exact:true})).toBeVisible();await toilet.getByRole('button',{name:'Ja',exact:true}).click();
 await expect(guided(page).getByRole('button',{name:'Gemeinsame Ausstattung öffnen',exact:true})).toHaveCount(0);
 await mainStep(page,0);if(await guided(page).getByRole('button',{name:'Angebot Mittagsmenü bearbeiten',exact:true}).count())await guided(page).getByRole('button',{name:'Angebot Mittagsmenü bearbeiten',exact:true}).click();
 await guided(page).getByRole('checkbox',{name:'Terrasse',exact:true}).check();
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_value).toMatchObject({offers:[{name:'Mittagsmenü',areaIds:[expect.any(String)]}],areas:[{name:'Terrasse',properties:expect.arrayContaining([expect.objectContaining({key:'amenity.step_free',value:true})])}],properties:expect.arrayContaining([expect.objectContaining({key:'amenity.toilet',value:true})])});
 await reloadEditor(page);await mainStep(page,2);await expect(guided(page).getByRole('region',{name:'Gibt es ein WC am Spot?',exact:true}).getByRole('button',{name:'Ja',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.screenshot({path:testInfo.outputPath(`open-shared-${width}.png`),fullPage:true});
 await page.screenshot({path:testInfo.outputPath(`open-shared-viewport-${width}.png`),fullPage:false});
});

test('Offene Wissensantworten speichern weder Nein noch einen Standardwert unbeabsichtigt',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');
 const booking=guided(page).getByRole('region',{name:'Reservation erforderlich?',exact:true});
 const state=booking.getByRole('group',{name:'Reservation erforderlich? Wissensstand',exact:true});
 await expect(state.getByRole('button',{name:'Noch unbekannt',exact:true})).toHaveAttribute('aria-pressed','false');
 await state.getByRole('button',{name:'Nicht relevant',exact:true}).click();
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 const profile=owner.submissions[0].p_value as {offers:Array<{properties:Array<{key:string;state:string;value:unknown}>}>};
 expect(profile.offers[0].properties).toEqual([{key:'participation.booking',label:null,state:'NOT_APPLICABLE',value:null,conditions:emptyExperienceConditions()}]);
});

test('Weiter führt über Räume und gemeinsame Ausstattung, ohne Antworten zu erfinden',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);
 await guided(page).getByRole('button',{name:'Zum nächsten Bereich',exact:true}).click();
 await expect(guided(page).getByRole('heading',{name:'Räume & Bereiche',exact:true})).toBeVisible();
 await guided(page).getByRole('button',{name:'Zum nächsten Bereich',exact:true}).click();
 await expect(guided(page).getByRole('heading',{name:'Gemeinsame Ausstattung & Anreise',exact:true})).toBeVisible();
 await expect(guided(page).getByRole('region',{name:'Gibt es ein WC am Spot?',exact:true})).toBeVisible();
 await guided(page).getByRole('button',{name:'Zum nächsten Bereich',exact:true}).click();
 await expect(page.locator('.wk-step-title').getByRole('heading',{name:'Wann ist geöffnet?',exact:true})).toBeVisible();
 expect(owner.submissions).toHaveLength(0);
 await outerStep(page,1);const email=page.getByLabel('Öffentliche Spot-E-Mail',{exact:true});
 await expect(email).toBeVisible();expect(await email.evaluate(element=>Boolean(element.closest('details')))).toBe(false);
 await expect(page.getByText('Weitere Angaben',{exact:true})).toHaveCount(0);
});


test('Hotelgäste werden nur bei belegtem Übernachtungskontext angeboten',()=>{
 const restaurant=experienceAnswerGuidance('participation.audience','EAT','LUNCH');
 const hotel=experienceAnswerGuidance('participation.audience','STAY','LUNCH');
 const mixed=experienceAnswerGuidance('participation.audience','EAT','LUNCH',undefined,{'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:['RESTAURANT','HOTEL']}});
 expect(restaurant?.kind==='CHOICES'&&restaurant.choices).not.toContain('Nur für Hotelgäste');
 for(const spec of [hotel,mixed])expect(spec?.kind==='CHOICES'&&spec.choices).toContain('Nur für Hotelgäste');
});

for(const width of [390,1280])test(`Speichern ohne Prüfhaken und anschließend weiter bei ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');
 await expect(guided(page).getByRole('checkbox',{name:'Ich habe die Änderungen geprüft.',exact:true})).toHaveCount(0);
 await expect(guided(page).getByRole('button',{name:'Nur für Hotelgäste',exact:true})).toHaveCount(0);
 await expect(guided(page).getByRole('button',{name:'Änderungen speichern',exact:true})).toBeEnabled();
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_value).toMatchObject({reviewed:true});
 await expect(guided(page).getByRole('button',{name:'Zum nächsten Bereich',exact:true})).toBeEnabled();
 await guided(page).getByRole('button',{name:'Zum nächsten Bereich',exact:true}).click();
 await expect(guided(page)).toHaveAttribute('data-workspace','AREAS');expect(owner.submissions).toHaveLength(1);
});

test('Speichern und weiter speichert zuerst, bleibt bei Fehlern am Entwurf und erlaubt Wiederholung',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');let fail=true;
 await page.route('**/rest/v1/rpc/world_product_owner_submit_claim_v1',async route=>fail?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'test unavailable'})}):route.fallback());
 await openEditor(page);await addFromCatalogue(page,'Mittagessen');await page.getByLabel('Name des Angebots',{exact:true}).fill('Mein Mittag');
 await guided(page).getByRole('button',{name:'Speichern & weiter',exact:true}).click();
 await expect(guided(page).getByRole('alert')).toContainText('Speichern fehlgeschlagen');await expect(guided(page)).toHaveAttribute('data-workspace','OFFERS');expect(owner.submissions).toHaveLength(0);
 await expect(page.getByLabel('Name des Angebots',{exact:true})).toHaveValue('Mein Mittag');fail=false;
 await guided(page).getByRole('button',{name:'Speichern & weiter',exact:true}).click();
 await expect(guided(page)).toHaveAttribute('data-workspace','AREAS');expect(owner.submissions).toHaveLength(1);expect(owner.submissions[0].p_value).toMatchObject({offers:[{name:'Mein Mittag'}]});
});

test('Zurückgeänderte Namen erzeugen keinen scheinbar offenen Entwurf',async({page})=>{
 const profile={...emptyExperienceProfile('EAT'),reviewed:true,offers:[{id:'saved-lunch',kind:'LUNCH',name:'Mittagessen',areaIds:[],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null}]};
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'existing',knowledgeState:'KNOWN_VALUE',value:profile}});await openEditor(page);await guided(page).getByRole('button',{name:'Angebot Mittagessen bearbeiten',exact:true}).click();
 await page.getByLabel('Name des Angebots',{exact:true}).fill('Neu');await page.getByLabel('Name des Angebots',{exact:true}).fill('Mittagessen');
 await expect(guided(page).getByRole('button',{name:'Änderungen speichern',exact:true})).toBeDisabled();
 await guided(page).getByRole('button',{name:'Zum nächsten Bereich',exact:true}).click();await expect(guided(page)).toHaveAttribute('data-workspace','AREAS');expect(owner.submissions).toHaveLength(0);
});

test('Angebotszeiten werden nur ausdrücklich übernommen und Gerichtsnamen bleiben einzelne Werte',async({page})=>{
 const hours=[{day:'MONDAY',intervals:[{start:'11:00',end:'23:00'}]},{day:'TUESDAY',intervals:[]}];
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'hours.regular':{claimId:'hours',knowledgeState:'KNOWN_VALUE',value:hours}});await openEditor(page);await addFromCatalogue(page,'Mittagessen');
 await expect(guided(page).getByText(/längere Beschreibungen werden hier nicht automatisch/)).toBeVisible();
 await guided(page).getByRole('textbox',{name:'Gerichte und Spezialitäten Wert',exact:true}).fill('Pad Thai');
 await expect(guided(page).getByLabel('Angebotszeit 1 Beginn',{exact:true})).toHaveCount(0);
 await guided(page).getByRole('button',{name:'Öffnungszeiten für dieses Angebot übernehmen',exact:true}).click();
 await expect(guided(page).getByLabel('Angebotszeit 1 Beginn',{exact:true})).toHaveValue('11:00');
 await guided(page).getByLabel('Angebotszeit 1 Ende',{exact:true}).fill('14:00');
 await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_attribute_key).toBe('experience.profile');
 expect(owner.submissions[0].p_value).toMatchObject({offers:[{schedule:[{weekday:1,start:'11:00',end:'14:00'}],properties:expect.arrayContaining([expect.objectContaining({key:'food.dish',value:'Pad Thai'})])}]});
 await expect(guided(page).getByRole('button',{name:'Öffnungszeiten für dieses Angebot übernehmen',exact:true})).toBeDisabled();
});

test('Bisherige Hotelgäste-Angaben bleiben bei einer anderen Korrektur erhalten',async({page})=>{
 const property={key:'participation.audience',label:null,state:'KNOWN',value:'Nur für Hotelgäste',conditions:emptyExperienceConditions()};
 const profile={...emptyExperienceProfile('EAT'),reviewed:true,offers:[{id:'existing-lunch',kind:'LUNCH',name:'Mittagessen',areaIds:[],properties:[property],prices:[],schedule:[],validFrom:null,validUntil:null}]};
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'experience.profile':{claimId:'existing',knowledgeState:'KNOWN_VALUE',value:profile}});await openEditor(page);await guided(page).getByRole('button',{name:'Angebot Mittagessen bearbeiten',exact:true}).click();
 await expect(guided(page).getByRole('button',{name:'Nur für Hotelgäste',exact:true})).toHaveCount(0);
 await expect(guided(page).locator('blockquote').filter({hasText:'Nur für Hotelgäste'})).toBeVisible();
 await page.getByLabel('Name des Angebots',{exact:true}).fill('Mittagsmenü');await saveProfile(page);await expect.poll(()=>owner.submissions.length).toBe(1);
 expect(owner.submissions[0].p_value).toMatchObject({offers:[{properties:[property]}]});
});


test('Mehrere Leistungen bleiben nach wiederholtem Speichern und Neuladen gespeichert',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);
 for(const label of ['Mittagessen','Abendessen','Brunch','Getränke','Musikveranstaltung']) {await addFromCatalogue(page,label);await overview(page);}
 await saveProfile(page);
 await expect(guided(page).getByRole('button',{name:'Änderungen speichern',exact:true})).toBeDisabled();
 await expect(guided(page).getByText('Ungespeicherte Änderungen',{exact:true})).toHaveCount(0);
 await guided(page).getByRole('button',{name:'Angebot Abendessen bearbeiten',exact:true}).click();await page.getByLabel('Name des Angebots',{exact:true}).fill('Abendkarte');await saveProfile(page);
 await expect(guided(page).getByRole('button',{name:'Änderungen speichern',exact:true})).toBeDisabled();
 await reloadEditor(page);await expect(guided(page).getByRole('button',{name:'Angebot Abendkarte bearbeiten',exact:true})).toBeVisible();
 expect(owner.submissions).toHaveLength(2);expect((owner.submissions[1].p_value as {offers:unknown[]}).offers).toHaveLength(5);
});

test('Erfolgsmeldungen verschwinden nach zwei Sekunden, Fehler bleiben sichtbar',async({page})=>{
 await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');await saveProfile(page);
 const toast=page.locator('.wk-toast');await expect(toast).toBeVisible();await expect(toast).toHaveCount(0,{timeout:3500});
 await page.getByLabel('Name des Angebots',{exact:true}).fill('Mittagskarte');await saveProfile(page);await expect(toast).toBeVisible();await expect(toast).toHaveCount(0,{timeout:3500});
 await page.route('**/rest/v1/rpc/world_product_owner_submit_claim_v1',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'test unavailable'})}));
 await page.getByLabel('Name des Angebots',{exact:true}).fill('Fehlerentwurf');await saveProfile(page);await expect(guided(page).getByRole('alert')).toContainText('Speichern fehlgeschlagen');await expect(guided(page).getByRole('button',{name:'Änderungen speichern',exact:true})).toBeEnabled();
});

test('Abweichender zurückgelesener Inhalt meldet keinen Speichererfolg',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await addFromCatalogue(page,'Mittagessen');
 await page.route('**/rest/v1/rpc/world_product_authoring_detail_v1',async route=>{const data=structuredClone(owner.detail());delete data.answers['experience.profile'];await route.fulfill({json:data});});
 await saveProfile(page);await expect(guided(page).getByRole('alert')).toContainText('nicht vollständig zurückgelesen');
 await expect(guided(page).getByRole('button',{name:'Änderungen speichern',exact:true})).toBeEnabled();await expect(page.locator('.wk-toast.success')).toHaveCount(0);
});

test('Angebotsauswahl trennt Clubabend von Musikereignis und entfernt Gastronomie-Doppelung',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC');await openEditor(page);await guided(page).getByRole('button',{name:'Weiteres Angebot hinzufügen',exact:true}).click();
 const select=guided(page).getByLabel('Weiteres Angebot hinzufügen',{exact:true});
 await expect(select.locator('option[value="GASTRONOMY"]')).toHaveCount(0);await expect(select.locator('option[value="FULL_MEAL"]')).toHaveText('Essen (ohne Trennung nach Mahlzeit)');
 await select.selectOption('CLUB_NIGHT');await expect(guided(page).getByRole('button',{name:'Tanzen',exact:true})).toHaveAttribute('aria-pressed','true');await saveProfile(page);
 const profile=owner.submissions[0].p_value as {offers:Array<{kind:string;name:string;properties:Array<{key:string;value:unknown}>}>};
 expect(profile.offers[0]).toMatchObject({kind:'EVENT',name:'Clubabend / Tanzen',properties:[{key:'experience.activity',value:'Tanzen'}]});
 await reloadEditor(page);await expect(guided(page).getByRole('button',{name:'Angebot Clubabend / Tanzen bearbeiten',exact:true})).toBeVisible();
});

for(const width of [390,1280])test(`Neuer Einstieg zeigt eine klare Aktion und führt zur fehlenden Pflichtangabe bei ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await mockOwner(page,'OWNER_BASIC');await page.goto(`/owner/spots/${spotId}`);
 await expect(page.getByRole('heading',{name:'Dein Spotprofil',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Profil einrichten',exact:false})).toBeVisible();
 await expect(page.locator('.wk-task-card.featured')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Was ist noch offen?',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Profil einrichten',exact:false}).click();
 await expect(page.locator('.wk-field-with-usage:focus')).toHaveCount(1);await expect(page.locator('.wk-studio-home')).toHaveCount(0);
});


for(const width of [390,1280])test(`Abschnittsstatus zeigt Pflichtangaben, Bezug und konkrete optionale Lücken bei ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'location.address_line1':{knowledgeState:'KNOWN_VALUE',value:'Beispielstrasse 1'},'location.locality':{knowledgeState:'KNOWN_VALUE',value:'Basel'},...(width===1280?{'contact.public_email':{knowledgeState:'UNKNOWN',value:null}}:{})});
 await page.goto(`/owner/spots/${spotId}`);const row=page.locator('.wk-task-card').filter({hasText:'Grunddaten & Kontakt'});
 await expect(row).toContainText('Pflichtangaben vorhanden');await expect(row).toContainText('3 von 4 Feldern ausgefüllt');await expect(row).toContainText(width===1280?'1 bewusst unbekannt':'1 optional offen');
 await row.click();const status=page.getByRole('region',{name:'Stand dieses Abschnitts',exact:true});await expect(status).toContainText(width===1280?'Bewusst unbekannt:':'Optional ergänzbar:');await status.getByRole('button',{name:'Öffentliche Spot-E-Mail',exact:true}).click();await expect(page.locator('[id="wk-editor-contact.public_email"]')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

test('Küchenangaben sind beim Angebot offen sichtbar, nur im Entwurf und ohne doppelte Übernahme',async({page})=>{
 const owner=await mockOwner(page,'OWNER_BASIC','VERIFIED_OWNER',{'offering.cuisines':{knowledgeState:'KNOWN_VALUE',value:['ITALIAN']}});await openEditor(page);await addFromCatalogue(page,'Mittagessen');
 const reuse=page.getByRole('region',{name:'Vorhandene Küchenangaben zuordnen',exact:true});await expect(reuse).toBeVisible();await expect(reuse).toContainText('Gilt für: Mittagessen');await expect(reuse.locator('summary')).toHaveCount(0);
 await reuse.getByRole('button',{name:'Zum Angebot hinzufügen',exact:true}).click();expect(owner.submissions).toHaveLength(0);await expect(reuse.getByRole('button',{name:'Bereits zugeordnet',exact:true})).toBeDisabled();
 await saveProfile(page);expect(owner.submissions).toHaveLength(1);const p=owner.submissions[0].p_value as {offers:Array<{properties:Array<{key:string;value:unknown}>}>};expect(p.offers[0].properties.filter(x=>x.key==='food.cuisine'&&x.value==='Italienisch')).toHaveLength(1);
});


test('Altersregel sendet den vollständigen Datenbankvertrag und bleibt nach Neuladen erhalten',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const owner=await mockOwner(page,'OWNER_PRO');await openEditor(page);await outerStep(page,8);const age=page.locator('[id="field-rule.age_access_conditions"]');
 await age.getByRole('button',{name:'Keine Altersbeschränkung',exact:true}).click();await age.getByRole('button',{name:'Regel übernehmen',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);expect(owner.submissions[0].p_value).toMatchObject({notes:null,rules:[{mode:'NO_MINIMUM',minimumAge:null,accompaniment:'NONE'}]});
 await reloadEditor(page);await outerStep(page,8);await expect(age.getByRole('button',{name:'Keine Altersbeschränkung',exact:true})).toHaveAttribute('aria-pressed','true');
 await age.getByRole('button',{name:'Altersregel erfassen',exact:true}).click();await age.getByLabel('Mindestalter',{exact:true}).fill('18');await age.getByRole('button',{name:'Regel übernehmen',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(2);expect(owner.submissions[1].p_value).toMatchObject({notes:null,rules:[{mode:'GENERAL_MINIMUM',minimumAge:18}]});
});

for(const fieldKey of ['rule.external_food','rule.external_drink'])test(`Mitbringen-Regel ${fieldKey} speichert ohne erzwungene Ausnahme`,async({page})=>{
 const owner=await mockOwner(page,'OWNER_PRO');await openEditor(page);await outerStep(page,8);const field=page.locator(`[id="field-${fieldKey}"]`);
 await expect(field.getByLabel('Ausnahmen (optional)',{exact:true})).toHaveValue('');await field.getByRole('button',{name:'Regel übernehmen',exact:true}).click();
 await expect.poll(()=>owner.submissions.length).toBe(1);expect(owner.submissions[0].p_value).toEqual({policy:'NOT_ALLOWED',exceptions:[]});
 await reloadEditor(page);await outerStep(page,8);await expect(field.getByRole('combobox',{name:'Regel',exact:true})).toHaveValue('NOT_ALLOWED');await field.getByRole('combobox',{name:'Regel',exact:true}).selectOption('ALLOWED');await field.getByRole('button',{name:'Regel übernehmen',exact:true}).click();await expect.poll(()=>owner.submissions.length).toBe(2);expect(owner.submissions[1].p_value).toEqual({policy:'ALLOWED',exceptions:[]});
 await reloadEditor(page);await outerStep(page,8);await expect(field.getByRole('combobox',{name:'Regel',exact:true})).toHaveValue('ALLOWED');
});
