import assert from "node:assert/strict";
import { test } from "node:test";
import { readOfficialSpotBasics } from "../src/official-spot-basics.mjs";
import { collectResearchEvidence, proveResearchEvidence } from "../src/research-evidence-policy.mjs";

test("linked official email passes the independent import proof; ambiguous and private contacts stay open", async () => {
  const spot = { website: "https://test-bistro.example/", name: "Test Bistro", locality: "Basel" };
  const contact = spot.website + "kontakt/";
  const observedAt = "2026-09-29T10:05:00Z";
  const email = "info@test-bistro.example";
  for (const { links, expected } of [
    { links: '<a href="mailto:info@test-bistro.example">E-Mail</a>', expected: email },
    { links: '<a href="mailto:info@test-bistro.example">Info</a><a href="mailto:kontakt@test-bistro.example">Kontakt</a>' },
    { links: '<a href="mailto:person@test-bistro.example">Person</a><!-- <a href="mailto:info@test-bistro.example">Info</a> -->' },
  ]) {
    const fetched = [];
    const fetchPage = async (url) => {
      fetched.push(url);
      return { url, contentType: "text/html", observedAt, body: url === spot.website
        ? '<h1>Unser Bistro in Basel</h1><a href="/kontakt/">Kontakt</a><a href="https://elsewhere.example/kontakt">Kontakt</a>'
        : "<h1>Test Bistro</h1><p>Teststrasse 2, Basel</p>" + links };
    };
    const [claim] = await readOfficialSpotBasics(spot, fetchPage);
    assert.deepEqual(fetched, [spot.website, contact]);
    assert.equal(claim?.value, expected);
    if (!claim) continue;
    assert.equal(claim.source.url, contact);
    const claims = [claim];
    const page = await fetchPage(spot.website);
    const evidence = await collectResearchEvidence({ ...spot, address: "Teststrasse 2", page, claims, fetchPage });
    const proof = proveResearchEvidence({
      claim, assessment: { uncertainty: "NONE" }, evidence, website: spot.website, page, claims,
      now: Date.parse(observedAt),
    });
    assert.equal(proof.eligible, true, proof.reason);
    assert.equal(proveResearchEvidence({
      claim: { ...claim, attributeKey: "identity.name", value: spot.name },
      assessment: { uncertainty: "NONE" }, evidence, website: spot.website, page, claims,
      now: Date.parse(observedAt),
    }).eligible, false);
  }
});

test("official contact fallback supplies phone and partial opening hours without filling unmentioned days", async () => {
  const website = "https://test-bistro.example/";
  const spot = { website, name: "Test Bistro", locality: "Basel", address: "Teststrasse 2" };
  const read = async (url) => ({
    url, contentType: "text/html", observedAt: "2026-11-18T10:00:00Z",
    body: url === website
      ? '<a href="/kontakt/">Kontakt</a>'
      : "<h1>Test Bistro</h1><p>Teststrasse 2</p><p>4055 Basel</p><p>T +41 79 271 73 60</p>" +
        "<p>Öffnungszeiten: Mo – Fr: 08:00 – 22:00 Uhr, ab 2026 Sa: 09:00 – 17.00</p>" +
        "<p>Küchenzeiten: So 10:00 – 14:00 Uhr</p>",
  });
  const claims = await readOfficialSpotBasics(spot, read);
  const phone = claims.find(claim => claim.attributeKey === "contact.phone");
  const hours = claims.find(claim => claim.attributeKey === "hours.regular");
  assert.equal(phone.value, "+41792717360");
  assert.deepEqual(hours.value.map(day => day.day), ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]);
  assert.match(hours.source.evidence, /ab 2026/);
  const page = await read(website);
  const evidence = await collectResearchEvidence({ ...spot, page, claims: [phone], fetchPage: read });
  assert.equal(proveResearchEvidence({
    website, page, claims: [phone], claim: phone, assessment: { uncertainty: "NONE" }, evidence,
    now: Date.parse(page.observedAt),
  }).eligible, true);
});
