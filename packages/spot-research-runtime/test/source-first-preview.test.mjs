import assert from "node:assert/strict";
import test from "node:test";
import { previewSpotSources } from "../src/source-first-preview.mjs";

const venue = { spotId: "test-spot", name: "Testhalle", locality: "Basel", address: "Testweg 5, 4000 Basel", website: "https://testhalle.example/", existingValues: {} };
const observedAt = "2026-11-18T10:00:00Z";
const page = (url, body) => ({ url, body, contentType: "text/html", observedAt });
const website = '<title>Kontakt – Testhalle Basel</title><p>Testhalle</p><p>Testweg 5, 4000 Basel</p><a href="mailto:hello@testhalle.example">E-Mail</a><a href="tel:+41615550001">Telefon</a>';
const alreadyKnown = { "contact.public_email": "hello@testhalle.example", "contact.phone": "+41615550001", "hours.regular": true, "operation.price_options": true };

test("a complete spot consumes no network calls", async () => {
  const forbidden = async () => assert.fail("No lookup expected");
  const result = await previewSpotSources({ ...venue, existingValues: alreadyKnown }, { fetchPage: forbidden, search: forbidden, selectPrice: forbidden });
  assert.equal(result.status, "COMPLETE_PROFILE");
  assert.equal(result.usage.estimatedUsd, 0);
});

test("a missing site uses one search and rejects an identically named directory", async () => {
  const source = "https://testhalle.example/";
  const directory = "https://directory.example/";
  const result = await previewSpotSources({ ...venue, website: null }, {
    fetchPage: async url => page(url, website),
    search: async query => {
      assert.match(query, /Testhalle Testweg 5/);
      return [directory, source];
    },
    selectPrice: async () => assert.fail("No price material"),
  });
  assert.deepEqual(result.proposals.map(item => item.attributeKey), ["contact.website", "contact.public_email", "contact.phone"]);
  assert.equal(result.proposals[0].url, source);
  assert.equal(result.usage.brave.calls, 1);
  assert.equal(result.usage.estimatedUsd, 0.005);
  assert.equal(result.usage.ai.calls, 0);
});

test("price selection accepts only the exact observed quote and leaves known fields alone", async () => {
  const result = await previewSpotSources({ ...venue, existingValues: { ...alreadyKnown, "operation.price_options": undefined } }, {
    fetchPage: async url => page(url, website + "<p>Ticket Erwachsene CHF 12</p><p>Ticket Kinder CHF 8</p>"),
    selectPrice: async () => assert.fail("Explicitly protected field should be skipped"),
  });
  assert.equal(result.status, "COMPLETE_PROFILE");
  const { "operation.price_options": _price, ...existingValues } = alreadyKnown;
  const priced = await previewSpotSources({ ...venue, existingValues }, {
    fetchPage: async url => page(url, website + "<p>Ticket Erwachsene CHF 12</p><p>Ticket Kinder CHF 8</p>"),
    selectPrice: async quotes => {
      assert.deepEqual(quotes, ["Ticket Erwachsene CHF 12", "Ticket Kinder CHF 8"]);
      return { index: 0, estimatedUsd: 0.003, tokens: { input: 500, output: 200 } };
    },
  });
  assert.equal(priced.proposals[0].value, "Ticket Erwachsene CHF 12");
  assert.equal(priced.proposals[0].review, true);
  assert.equal(priced.usage.estimatedUsd, 0.003);
});

test("reads the specific café branch on the operator's shared location page", async () => {
  const result = await previewSpotSources({ ...venue, name: "Café Frühling" }, {
    verifyVenue: true,
    fetchPage: async url => page(url, `<h2>Café Sommer</h2><p>Gartenweg 3, Basel</p>
      <p>Öffnungszeiten</p><p>Täglich 10:00–20:00</p>
      <h2>Café Frühling</h2><p>Testweg 5, Basel</p><p>fruehling@testhalle.example</p>
      <p>Öffnungszeiten</p><p>Montag bis Freitag: 8:00 bis 18:30 Uhr</p><p>Samstag und Sonntag: 9:00 bis 18:30 Uhr</p>`),
  });
  const hours = result.proposals.find(item => item.attributeKey === "hours.regular");
  assert.equal(hours?.value.length, 7);
  assert.equal(hours.value[0].intervals[0].start, "08:00");
  assert.equal(hours.value[6].intervals[0].start, "09:00");
});

test("reads a named brunch offer, treats last entry separately and discards example prices", async () => {
  const offer = "https://testhalle.example/brunch-basel";
  const result = await previewSpotSources(venue, {
    verifyVenue: true,
    fetchPage: async url => page(url, url === offer ?
      `<title>Brunch im Testhalle</title><h2>WANN</h2><p>Sonntags</p><p>9 - 15 Uhr</p>
       <p>Letzter Einlass 13 Uhr</p><p>Preis ab 14 Jahren</p><p>42.- CHF</p>
       <p>Alter in Jahren plus 8.- CHF</p><p>Beispiel: Kind 4 Jahre: 4+8 =CHF 12.-</p>`
      : website + '<a href="/brunch-basel">Testhalle Brunch</a>'),
    selectPrice: async () => assert.fail("Explicit prices should not need AI"),
  });
  assert.deepEqual(result.proposals.filter(item => item.attributeKey === "operation.price_options").map(item => item.value),
    [{ purpose: "MEAL", min: 42, max: 42, minimumAge: 14, occasion: "Brunch", days: ["SUNDAY"] }]);
  assert.deepEqual(result.proposals.find(item => item.attributeKey === "hours.regular")?.value,
    [{ day: "SUNDAY", intervals: [{ start: "09:00", end: "15:00" }] }]);
  assert.match(result.proposals.find(item => item.attributeKey === "hours.last_entry")?.evidence ?? "", /13 Uhr/u);
});

test("keeps meals and drinks separate and records dated closures without modifying weekly hours", async () => {
  const result = await previewSpotSources(venue, {
    verifyVenue: true,
    fetchPage: async url => page(url, website + `
      <p>Öffnungszeiten</p><p>Täglich 11:00–20:00</p>
      <p>Vom 19.11.2026 bis 20.11.2026 bleibt das Restaurant wegen Umbau geschlossen.</p>
      <h3>Speisekarte</h3><p>Tagessuppe CHF 9</p><p>Pizza CHF 28</p>
      <h3>Getränke</h3><p>Apfelsaft 5.50 CHF</p><p>Cocktail CHF 16</p><p>Gutschein CHF 100</p>`),
  });
  const values = key => result.proposals.filter(item => item.attributeKey === key).map(item => item.value);
  assert.deepEqual(values("operation.price_options"), [
    { purpose: "MEAL", min: 9, max: 28, minimumAge: null },
    { purpose: "DRINK", min: 5.5, max: 16, minimumAge: null },
  ]);
  assert.equal(values("hours.regular")[0].length, 7);
  assert.deepEqual(values("hours.special")[0], [
    { date: "2026-11-19", status: "CLOSED", intervals: [] },
    { date: "2026-11-20", status: "CLOSED", intervals: [] },
  ]);
});

test("seeks the operator again rather than promoting opening hours from a directory", async () => {
  const directory = "https://directory.example/reopening";
  const result = await previewSpotSources({ ...venue, website: directory }, {
    verifyVenue: true,
    fetchPage: async url => page(url, url === directory
      ? '<title>Testhalle – Wiedereröffnung</title><p>Testweg 5, Basel</p><p>Öffnungszeiten</p><p>Täglich 12:00–21:00</p>'
      : website + '<p>Öffnungszeiten</p><p>Täglich 09:00–14:00</p><p>Vorübergehend geschlossen.</p>'),
    search: async () => [venue.website],
  });
  assert.equal(result.proposals.find(item => item.attributeKey === "hours.regular")?.url, venue.website);
  assert.ok(result.proposals.some(item => item.attributeKey === "hours.closure_notice"));
});

test("uses regular museum admission and applies a late-opening weekday override", async () => {
  const result = await previewSpotSources(venue, {
    verifyVenue: true,
    fetchPage: async url => page(url, website + `
      <h3>Öffnungszeiten</h3><p>Dienstag bis Sonntag 11–18 Uhr</p>
      <p>Donnerstags jeweils bis 21 Uhr geöffnet</p><p>Montag geschlossen</p>
      <h3>Eintrittspreise</h3><p>Erwachsene: 18 CHF</p>
      <p>Studierende und Lernende: 12 CHF</p><p>KulturLegi: 9 CHF</p>`),
  });
  assert.equal(result.proposals.find(item => item.attributeKey === "hours.regular").value[3].intervals[0].end, "21:00");
  assert.deepEqual(result.proposals.filter(item => item.attributeKey === "operation.price_options").map(item => item.value),
    [{ purpose: "ADMISSION", min: 18, max: 18, minimumAge: null }]);
});

test("keeps the main museum category and exhibition purpose separate from its cafe", async () => {
  const spot = { ...venue, name: "Museum Testhalle", crawlerCategory: "MUSEUM" };
  const result = await previewSpotSources(spot, {
    verifyVenue: true,
    fetchPage: async url => page(url, '<title>Museum Testhalle Basel</title>' +
      '<h1>Museum Testhalle</h1><p>Testweg 5, Basel</p><p>Besuchen Sie unsere Ausstellung zur Stadtgeschichte.</p>' +
      '<p>Im Museumsbistro gibt es Kaffee und Kuchen.</p>'),
  });
  const classification = result.proposals.find(item => item.attributeKey === "classification.primary_category");
  const purpose = result.proposals.find(item => item.attributeKey === "purpose.primary_visit");
  assert.equal(classification?.value, "CULTURE_ARTS");
  assert.equal(purpose?.value, "CULTURE_ARTS");
  assert.match(purpose.evidence, /Ausstellung/u);
});

test("keeps the main reason open when an official category has no activity evidence", async () => {
  const spot = { ...venue, name: "Museum Testhalle", crawlerCategory: "MUSEUM" };
  const result = await previewSpotSources(spot, {
    verifyVenue: true,
    fetchPage: async url => page(url, '<title>Museum Testhalle Basel</title><p>Testweg 5, Basel</p><p>Im Bistro: Kaffee und Kuchen.</p>'),
  });
  assert.equal(result.proposals.find(item => item.attributeKey === "classification.primary_category")?.value, "CULTURE_ARTS");
  assert.ok(!result.proposals.some(item => item.attributeKey === "purpose.primary_visit"));
});

test('redirect authorization runs before DNS and HTTP on every target', async () => {
 const {EventEmitter}=await import('node:events'); const {fetchPublicSource}=await import('../src/nuknuk-sources.mjs');
 const visited=[],authorized=[],resolved=[];
 const requestImpl=(url,_opts,callback)=>{
  const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
   visited.push(url); const res=new EventEmitter();res.statusCode=302;res.headers={location:'/private'};res.destroy=()=>req.emit('close');callback(res);
  });req.destroy=error=>req.emit('error',error);return req;
 };
 await assert.rejects(fetchPublicSource('https://example.org/old', {
  maxRedirects:2,requestImpl,resolve:async host=>{resolved.push(host);return [{address:'93.184.216.34'}];},
  authorizeUrl:async url=>{authorized.push(url);if(url.endsWith('/private'))throw new Error('ROBOTS_DISALLOWED');}
 }),/ROBOTS_DISALLOWED/);
 assert.deepEqual(authorized,['https://example.org/old','https://example.org/private']);
 assert.deepEqual(visited,['https://example.org/old']);assert.equal(resolved.length,1);
});
