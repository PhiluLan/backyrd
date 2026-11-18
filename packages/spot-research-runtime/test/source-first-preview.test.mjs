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


test("empty HTML sources stay unavailable and cannot abort other venue results", async () => {
  const [unavailable, usable] = await Promise.all([
    previewSpotSources(venue, { fetchPage: async url => page(url, "<main><img src='logo.png'></main>") }),
    previewSpotSources(venue, { fetchPage: async url => page(url, website + "<h1><img src='logo.png'></h1>") }),
  ]);
  assert.equal(unavailable.status, "SOURCE_UNAVAILABLE");
  assert.equal(unavailable.sourcesRead, 0);
  assert.deepEqual(unavailable.proposals, []);
  assert.ok(usable.proposals.some(item => item.attributeKey === "contact.public_email"));
});

test("an image-only heading cannot abort a verified venue's visit classification", async () => {
  const html = '<h1><img src="logo.png"></h1><h2>Café Testhalle</h2><p>Testweg 5, 4000 Basel</p><p>Testhalle</p><p>Frühstück und Kaffee</p><p>hello@testhalle.example</p>';
  const result = await previewSpotSources({ ...venue, name: "Café Testhalle", crawlerCategory: "CAFE" }, {
    verifyVenue: true, fetchPage: async url => page(url, html),
  });
  assert.equal(result.status, "CHECKED");
  assert.equal(result.proposals.find(item => item.attributeKey === "classification.primary_category")?.value, "COFFEE_DAYTIME");
  assert.equal(result.proposals.find(item => item.attributeKey === "purpose.primary_visit")?.value, "EAT_DRINK");
});


test("directory subdomains with copied venue schema cannot become operator evidence", async () => {
  for (const domain of ["cafestjohann.restaurants-info.com", "speisekarte.menu", "basel-restaurants.ch", "where-to-eat.example"]) {
    const url = `https://${domain}/`;
    const html = '<title>Café Testhalle</title><p>Café Testhalle Testweg 5 Basel</p>' +
      `<script type="application/ld+json">${JSON.stringify({name:"Café Testhalle",url,address:{streetAddress:"Testweg 5"}})}</script>`;
    const r = await previewSpotSources({...venue,name:"Café Testhalle",website:url,crawlerCategory:"CAFE"}, {
      verifyVenue:true,fetchPage:async target=>page(target,html),
    });
    assert.equal(r.proposals.length,0,domain);
    assert.notEqual(r.status,"CHECKED",domain);
  }
});

test("verified operator body establishes restaurant and visit purpose without a brand heading", async () => {
  const r=await previewSpotSources({...venue,crawlerCategory:"RESTAURANT"},{verifyVenue:true,
    fetchPage:async url=>page(url,website+'<main><h1>Frisch auf dem Tisch</h1><p>Unser Restaurant serviert täglich wechselnde Tagesmenüs.</p></main>'),
  });
  assert.equal(r.proposals.find(p=>p.attributeKey==="classification.primary_category")?.value,"EAT");
  assert.equal(r.proposals.find(p=>p.attributeKey==="purpose.primary_visit")?.value,"EAT_DRINK");
});

test("reads observed official PDF price cards and keeps temporary menus out of permanent prices", async () => {
  const fetched=[];
  const card=venue.website+'speisen.pdf', weekly=venue.website+'wochenmenu.pdf';
  const r=await previewSpotSources({...venue,crawlerCategory:"RESTAURANT"},{verifyVenue:true,
    fetchPage:async url=>{fetched.push(url);return url.endsWith('.pdf')
      ? {...page(url,Buffer.from('%PDF-1.7')),contentType:'application/pdf'}
      : page(url,website+`<a href="${card}">Speisekarte</a><a href="${weekly}">Wochenmenü</a>`);},
    readDocument:async document=>{assert.equal(document.url,card);return 'Speisen\nPasta CHF 19.50\nRisotto CHF 26.00';},
  });
  const price=r.proposals.find(p=>p.attributeKey==='operation.price_options');
  assert.equal(price?.url,card);assert.deepEqual(price.value,{purpose:'MEAL',min:19.5,max:26,minimumAge:null});
  assert.ok(!fetched.includes(weekly));
});

test("follows one observed offer page to its official price card without duplicate requests", async () => {
  const counts=new Map();const offer=venue.website+'angebot',card=venue.website+'karte';
  const r=await previewSpotSources(venue,{verifyVenue:true,fetchPage:async url=>{
    counts.set(url,(counts.get(url)??0)+1);
    return page(url,website+(url===venue.website?`<a href="${offer}">Speisekarte und Angebot</a>`:url===offer?`<a href="${card}">Getränkekarte</a>`:'<p>Getränke</p><p>Espresso CHF 4.50</p><p>Cappuccino CHF 6.50</p>'));
  }});
  assert.equal(r.proposals.find(p=>p.attributeKey==='operation.price_options')?.value.purpose,'DRINK');
  assert.equal(counts.get(card),1);assert.ok([...counts.values()].every(count=>count===1));
});


test("supplements, bottle prices and unbound size rows are not per-person menu items", async () => {
 const r=await previewSpotSources(venue,{verifyVenue:true,fetchPage:async url=>page(url,website+
  '<p>Speisen</p><p>+ Honig 1.00</p><p>Toast CHF 9.50</p><p>Risotto CHF 24.00</p>'+
  '<p>Getränke</p><p>Espresso CHF 4.50</p><p>Spritz CHF 8.50</p><p>Haferdrink + 0.50</p><p>1 dl 9.00</p><p>Flasche 75 cl 72.00</p>')});
 assert.deepEqual(r.proposals.filter(p=>p.attributeKey==='operation.price_options').map(p=>[p.value.purpose,p.value.min,p.value.max]),[['MEAL',9.5,24],['DRINK',4.5,8.5]]);
});

test("museum price research does not import its separate restaurant menu", async () => {
 let pdfReads=0;const r=await previewSpotSources({...venue,name:'Museum Testhalle',crawlerCategory:'MUSEUM'},{verifyVenue:true,
  fetchPage:async url=>page(url,website.replaceAll('Testhalle','Museum Testhalle')+'<h1>Museum Testhalle</h1><p>Unsere Ausstellung</p><p>Eintrittspreise</p><p>Erwachsene: 18 CHF</p><a href="/bistro.pdf">Speisekarte Bistro</a>'),
  readDocument:async()=>{pdfReads++;return 'Getränke\nWein CHF 7.50\nChampagner CHF 145.00';}});
 assert.equal(pdfReads,0);assert.ok(r.proposals.filter(p=>p.attributeKey==='operation.price_options').every(p=>p.value.purpose==='ADMISSION'));
});
