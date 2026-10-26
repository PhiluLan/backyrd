import test from "node:test";
import assert from "node:assert/strict";
import { proveSafeResearchProperty } from "../src/research-safe-properties.mjs";
const at = "2026-10-26T12:00:00Z",
  now = Date.parse(at),
  site = "https://example.org/";
const html =
  '<main><h1>Fixture Restaurant</h1>Basel</main><footer><aside><p>Gerbergasse 11, 4001 Basel <a href="mailto:info@example.org">info@example.org</a><a href="tel:+41610000000">+41 61 000 00 00</a><a href="https://www.instagram.com/fixture/"><svg></svg></a></p></aside></footer>';
const claim = (key, value, source = site) => ({
  attributeKey: key,
  knowledgeState: "KNOWN_VALUE",
  value,
  source: { url: source, observedAt: at, trust: "OFFICIAL_PRIMARY" },
});
const input = (c, body = html) => ({
  page: { url: site, contentType: "text/html", body, observedAt: at },
  officialWebsite: site,
  name: "Fixture Restaurant",
  locality: "Basel",
  address: "Gerbergasse 11",
  claim: c,
  now,
});
test("visible contacts in footer-aside widgets and icon-only social links have independent proof", () => {
  for (const c of [
    claim("contact.public_email", "info@example.org"),
    claim("contact.phone", "+41610000000"),
    claim("contact.instagram", "https://www.instagram.com/fixture/"),
  ]) {
    const p = proveSafeResearchProperty(input(c));
    assert.equal(p.eligible, true);
    assert.match(p.sourceHash, /^[a-f0-9]{64}$/);
    assert.match(p.evidence, /keine manuelle Einzelprüfung/);
  }
});
test("model assertions are not proof: absent, multiple, hidden, script and comment contacts remain review-only", () => {
  const c = claim("contact.public_email", "fake@example.org");
  for (const extra of [
    "",
    '<a href="mailto:fake@example.org">fake@example.org</a>',
    '<div hidden><a href="mailto:fake@example.org">fake@example.org</a></div>',
    '<script>const contact="fake@example.org"</script>',
    '<!-- <a href="mailto:fake@example.org">fake@example.org</a> -->',
  ])
    assert.equal(
      proveSafeResearchProperty(input(c, html + extra)).eligible,
      false,
    );
});
test("identity must match the canonical venue and address, never just the model target", () => {
  for (const change of [
    { name: "Other Restaurant" },
    { locality: "Bern" },
    { address: "Otherstrasse 42" },
  ])
    assert.equal(
      proveSafeResearchProperty({
        ...input(claim("contact.phone", "+41610000000")),
        ...change,
      }).reason,
      "VENUE_IDENTITY_NOT_CONFIRMED",
    );
});
test("source host, subpage, freshness and official trust cannot be substituted", () => {
  const c = claim("contact.phone", "+41610000000");
  for (const changed of [
    { source: { ...c.source, url: "https://evil.org/" } },
    { source: { ...c.source, url: site + "other-branch" } },
    { source: { ...c.source, observedAt: "2025-01-01T00:00:00Z" } },
    { source: { ...c.source, trust: "CORROBORATED_SECONDARY" } },
  ])
    assert.equal(
      proveSafeResearchProperty(input({ ...c, ...changed })).eligible,
      false,
    );
});
test("only an observed same-site redirect can establish the canonical landing page", () => {
  const i = input(claim("contact.phone", "+41610000000", site + "de/"));
  i.page.url = site + "de/";
  i.page.redirectedFrom = [site];
  assert.equal(proveSafeResearchProperty(i).eligible, true);
  i.page.url = "https://evil.org/";
  assert.equal(proveSafeResearchProperty(i).eligible, false);
});
test("age, accessibility, price, description, website and derived location facts are not in the first safe-write lane", () => {
  for (const key of [
    "rule.age_access_conditions",
    "accessibility.step_free_entrance",
    "operation.price_level",
    "description.highlight",
    "contact.website",
    "location.timezone",
  ])
    assert.equal(
      proveSafeResearchProperty(input(claim(key, "value"))).reason,
      "FIELD_REQUIRES_REVIEW",
    );
});
test("social share links, post URLs and unconfirmed link-label contacts never auto-qualify", () => {
  for (const [key, value, anchor] of [
    [
      "contact.facebook",
      "https://facebook.com/sharer.php",
      '<a href="https://facebook.com/sharer.php">Share</a>',
    ],
    [
      "contact.instagram",
      "https://instagram.com/p/post",
      '<a href="https://instagram.com/p/post">Photo</a>',
    ],
    ["contact.phone", "+41610000000", '<a href="tel:+41610000000">Fax</a>'],
  ])
    assert.equal(
      proveSafeResearchProperty(
        input(
          claim(key, value),
          "<h1>Fixture Restaurant</h1>Basel Gerbergasse 11 " + anchor,
        ),
      ).eligible,
      false,
    );
});
test("an identity in HTML comments does not prove the venue", () => {
  assert.equal(
    proveSafeResearchProperty(
      input(
        claim("contact.phone", "+41610000000"),
        html.replace("Fixture Restaurant", "<!-- Fixture Restaurant -->"),
      ),
    ).eligible,
    false,
  );
});

test("a linked operator-group profile is not automatically a venue profile", () => {
  const c = claim(
    "contact.linkedin",
    "https://linkedin.com/company/operator-group/",
  );
  assert.equal(
    proveSafeResearchProperty(
      input(
        c,
        html +
          '<a href="https://linkedin.com/company/operator-group/">Our group</a>',
      ),
    ).eligible,
    false,
  );
});
