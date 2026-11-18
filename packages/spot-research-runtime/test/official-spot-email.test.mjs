import assert from "node:assert/strict";
import { test } from "node:test";
import { readOfficialSpotEmail } from "../src/official-spot-email.mjs";
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
    const claim = await readOfficialSpotEmail(spot, fetchPage);
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
