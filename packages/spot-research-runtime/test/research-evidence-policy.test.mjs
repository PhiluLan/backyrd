import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesResearchMeaning,
  parseResearchAssessments,
  proveResearchEvidence,
  collectResearchEvidence,
} from "../src/research-evidence-policy.mjs";
const at = "2026-10-26T12:00:00Z",
  site = "https://example.org/",
  now = Date.parse(at);
const assessment = {
  attributeKey: "offering.groups",
  uncertainty: "MINOR",
  reason: "Mittag und Lunch bezeichnen hier das belegte Mittagessen.",
  bindings: {},
};
const source = {
  url: site,
  evidence: "Mittag",
  observedAt: at,
  trust: "OFFICIAL_PRIMARY",
};
const claim = {
  attributeKey: "offering.groups",
  knowledgeState: "KNOWN_VALUE",
  value: ["LUNCH"],
  source,
};
function prove(c = claim, a = assessment, text = c.source.evidence, current) {
  return proveResearchEvidence({
    claim: c,
    assessment: a,
    evidence: {
      pages: new Map([
        [
          site.slice(0, -1),
          {
            url: site,
            text,
            observedAt: at,
            hash: "a".repeat(64),
            format: "HTML",
          },
        ],
      ]),
      failures: [],
    },
    current,
    website: site,
    page: {
      url: site,
      redirectedFrom: [],
      body: text,
      observedAt: at,
      contentType: "text/html",
    },
    claims: [c],
    now,
  });
}
for (const word of [
  "Mittag",
  "Mittagessen",
  "Mittagsmenü",
  "Mittagskarte",
  "Business Lunch",
  "Lunch",
  "Mittagsverpflegung",
])
  test(`lunch synonym: ${word}`, () =>
    assert.equal(matchesResearchMeaning("LUNCH", word), true));
for (const word of ["Kein Mittagessen", "ohne Lunch", "Mittagspause"])
  test(`does not invent lunch: ${word}`, () =>
    assert.equal(matchesResearchMeaning("LUNCH", word), false));
test("minor uncertainty imports with evidence and explicit reason", () => {
  const result = prove();
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "SUPPORTED_WITH_MINOR_UNCERTAINTY");
  assert.equal(result.source.evidence, "Mittag");
});
test("major uncertainty is retained for review", () =>
  assert.equal(
    prove(claim, { ...assessment, uncertainty: "MAJOR" }).reason,
    "MAJOR_UNCERTAINTY",
  ));
test("a declared certainty cannot substitute for original evidence", () =>
  assert.equal(
    prove(claim, assessment, "Kein Abendessen").reason,
    "QUOTE_NOT_IN_SOURCE",
  ));
test("missing assessment is not silently authorized", () =>
  assert.equal(
    proveResearchEvidence({
      claim,
      evidence: { pages: new Map(), failures: [] },
      claims: [claim],
      website: site,
      page: {},
      now,
    }).reason,
    "ASSESSMENT_REQUIRED",
  ));
test("explicit unknown and private data remain protected", () => {
  assert.equal(
    prove(claim, assessment, "Mittag", {
      visibility: "PUBLIC",
      knowledgeState: "UNKNOWN",
    }).eligible,
    false,
  );
  assert.equal(
    prove(claim, assessment, "Mittag", {
      visibility: "PRIVATE",
      knowledgeState: "KNOWN_VALUE",
    }).eligible,
    false,
  );
});
test("assessment schema rejects fabricated keys and duplicate decisions", () => {
  assert.throws(() =>
    parseResearchAssessments(
      [{ ...assessment, attributeKey: "invented" }],
      [claim],
    ),
  );
  assert.throws(() =>
    parseResearchAssessments([assessment, assessment], [claim]),
  );
});
const scheduleClaim = (key = "hours.regular") => ({
  ...claim,
  attributeKey: key,
  value: [
    {
      day: "MONDAY",
      intervals: [
        { start: "11:00", end: "14:00" },
        { start: "18:00", end: "00:00" },
      ],
    },
    { day: "SUNDAY", intervals: [] },
  ],
  source: {
    ...source,
    evidence:
      "Montag bis Samstag 11.00 Uhr bis 14.00 Uhr / 18.00 Uhr bis 24.00 Uhr\nAn Sonntagen und Feiertagen geschlossen.",
  },
});
test("weekday ranges and midnight are supported", () =>
  assert.equal(prove(scheduleClaim()).eligible, true));
test("Sunday closure does not make Monday closed", () => {
  const c = scheduleClaim();
  c.value[0].intervals = [];
  assert.equal(prove(c).reason, "CLOSED_DAY_NOT_SUPPORTED");
});
test("kitchen numbers cannot be borrowed as normal hours", () => {
  const c = scheduleClaim();
  c.source.evidence += "\nKüche Montag bis Samstag 11.30 Uhr bis 13.45 Uhr";
  assert.equal(prove(c).reason, "SCHEDULE_SCOPE_AMBIGUOUS");
});
test("a source from another venue never enters the evidence graph", async () => {
  let fetched = false;
  const data = await collectResearchEvidence({
    page: {
      url: site,
      body: "<main>Other restaurant</main>",
      contentType: "text/html",
      observedAt: at,
    },
    website: site,
    name: "Correct Restaurant",
    locality: "Basel",
    address: "Gerbergasse 11",
    claims: [claim],
    fetchPage: async () => {
      fetched = true;
      throw Error();
    },
  });
  assert.equal(fetched, false);
  assert.equal(data.failures[0].reason, "VENUE_IDENTITY_NOT_CONFIRMED");
});
test("a profile replacement cannot delete existing offers", () => {
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value: { category: "EAT", areas: [], offers: [], properties: [] },
    source: { ...source, evidence: "Restaurant" },
  };
  const current = {
    visibility: "PUBLIC",
    knowledgeState: "KNOWN_VALUE",
    value: { offers: [{ id: "existing" }], areas: [], properties: [] },
  };
  assert.equal(
    prove(c, assessment, "Restaurant", current).reason,
    "EXISTING_PROFILE_CONTENT_PROTECTED",
  );
});

test("official observed PDF redirects are followed, arbitrary same-host files are not", async () => {
  const root = {
    url: site,
    contentType: "text/html",
    observedAt: at,
    body: '<h1>Correct Restaurant</h1><p>Gerbergasse 11 Basel</p><a href="/pdfdownload/menu/">Speisekarte</a>',
  };
  const requested = {
    ...claim,
    source: {
      ...source,
      url: site + "uploads/menu.pdf",
      evidence: "Mittagsmenü",
    },
  };
  const requests = [];
  const e = await collectResearchEvidence({
    page: root,
    website: site,
    name: "Correct Restaurant",
    locality: "Basel",
    address: "Gerbergasse 11",
    claims: [requested],
    fetchPage: async (url) => {
      requests.push(url);
      assert.equal(url, site + "pdfdownload/menu");
      return {
        url: requested.source.url,
        redirectedFrom: [url],
        contentType: "application/pdf",
        body: Buffer.from("pdf"),
        observedAt: at,
      };
    },
    readPdf: async () => "Mittagsmenü",
  });
  assert.equal(requests.length, 1);
  assert.equal(e.pages.get(requested.source.url).format, "PDF");
  const injected = {
    ...requested,
    source: { ...source, url: site + "private/other.pdf" },
  };
  const denied = await collectResearchEvidence({
    page: {
      ...root,
      body: "<h1>Correct Restaurant</h1><p>Gerbergasse 11 Basel</p>",
    },
    website: site,
    name: "Correct Restaurant",
    locality: "Basel",
    address: "Gerbergasse 11",
    claims: [injected],
    fetchPage: async () => {
      throw Error("must not fetch unobserved links");
    },
  });
  assert.equal(denied.pages.has(injected.source.url), false);
});

test("legal pages are read only for missing public contact evidence, never for offers or terms", async () => {
  const root = {
    url: site,
    contentType: "text/html",
    observedAt: at,
    body: '<h1>Correct Restaurant</h1><p>Gerbergasse 11 Basel</p><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="/agb">AGB</a>',
  };
  const contact = {
    ...claim,
    attributeKey: "contact.public_email",
    value: "info@example.org",
    source: {
      ...source,
      url: site + "impressum",
      evidence: "info@example.org",
    },
  };
  let count = 0;
  const fetchPage = async (url) => {
    count++;
    assert.equal(url, site + "impressum");
    return { ...root, url, body: "<p>info@example.org</p>" };
  };
  const contactEvidence = await collectResearchEvidence({
    page: root,
    website: site,
    name: "Correct Restaurant",
    locality: "Basel",
    address: "Gerbergasse 11",
    claims: [contact],
    fetchPage,
  });
  assert.equal(count, 1);
  assert.equal(contactEvidence.pages.has(site + "impressum"), true);
  const offer = { ...claim, source: { ...source, url: site + "impressum" } };
  const offerEvidence = await collectResearchEvidence({
    page: root,
    website: site,
    name: "Correct Restaurant",
    locality: "Basel",
    address: "Gerbergasse 11",
    claims: [offer],
    fetchPage,
  });
  assert.equal(count, 1);
  assert.equal(offerEvidence.pages.has(site + "impressum"), false);
  for (const path of ["agb", "datenschutz"]) {
    const c = { ...contact, source: { ...source, url: site + path } };
    const e = await collectResearchEvidence({
      page: root,
      website: site,
      name: "Correct Restaurant",
      locality: "Basel",
      address: "Gerbergasse 11",
      claims: [c],
      fetchPage,
    });
    assert.equal(e.pages.has(site + path), false);
  }
});

test("room documentation with a plain Rooms label remains an observed source", async () => {
  const root = {
    url: site,
    contentType: "text/html",
    observedAt: at,
    body: '<h1>Correct Restaurant</h1><p>Gerbergasse 11 Basel</p><a href="/assets/rooms.pdf">Räume</a>',
  };
  const c = { ...claim, source: { ...source, url: site + "assets/rooms.pdf" } };
  const e = await collectResearchEvidence({
    page: root,
    website: site,
    name: "Correct Restaurant",
    locality: "Basel",
    address: "Gerbergasse 11",
    claims: [c],
    fetchPage: async (url) => ({
      url,
      contentType: "application/pdf",
      observedAt: at,
      body: Buffer.from("pdf"),
    }),
    readPdf: async () => "Runde Tische maximal 20 Personen",
  });
  assert.equal(e.pages.has(c.source.url), true);
});

test("a textual room detail cannot invent an unquoted capacity", () => {
  const p = {
    category: "EAT",
    properties: [],
    areas: [
      {
        id: "room",
        kind: "PRIVATE_ROOM",
        name: "Zunftsaal",
        properties: [
          {
            key: "custom.detail",
            state: "KNOWN",
            value: "Runde Tische maximal 400 Personen",
            conditions: {
              weekdays: [],
              dayparts: [],
              event: null,
              validFrom: null,
              validUntil: null,
            },
          },
        ],
      },
    ],
    offers: [],
  };
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value: p,
    source: {
      ...source,
      evidence: "Restaurant Zunftsaal Runde Tische maximal 20 Personen",
    },
  };
  const a = { ...assessment, bindings: { "/areas/0": 0 } };
  assert.equal(prove(c, a).eligible, false);
});

const existingProfile = () => ({
  contractVersion: "backyrd.world-knowledge.experience-profile@1.0",
  category: "EAT",
  reviewed: true,
  properties: [],
  areas: [
    {
      id: "restaurant",
      kind: "INDOOR",
      name: "Restaurant",
      properties: [
        {
          key: "custom.detail",
          label: "WLAN",
          state: "UNKNOWN",
          value: null,
          conditions: {
            weekdays: [],
            dayparts: [],
            event: null,
            validFrom: null,
            validUntil: null,
          },
        },
      ],
    },
  ],
  offers: [
    {
      id: "lunch",
      kind: "LUNCH",
      name: "Mittagessen",
      properties: [],
      areaIds: [],
      prices: [],
      schedule: [],
      validFrom: null,
      validUntil: null,
    },
  ],
});
const existingState = (value) => ({
  visibility: "PUBLIC",
  knowledgeState: "KNOWN_VALUE",
  value,
});
test("a grounded new area relation enriches an existing offer without re-proving untouched details", () => {
  const previous = existingProfile(),
    value = structuredClone(previous);
  value.offers[0].areaIds = ["restaurant"];
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value,
    source: { ...source, evidence: "Restaurant zum Mittagessen" },
  };
  const a = { ...assessment, bindings: { "/offers/0/areaIds": 0 } };
  assert.equal(
    prove(c, a, c.source.evidence, existingState(previous)).eligible,
    true,
  );
  assert.deepEqual(value.areas[0].properties, previous.areas[0].properties);
});
test("an ungrounded new relation is not accepted merely because the offer already exists", () => {
  const previous = existingProfile(),
    value = structuredClone(previous);
  value.offers[0].areaIds = ["restaurant"];
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value,
    source: { ...source, evidence: "Restaurant" },
  };
  assert.match(
    prove(
      c,
      { ...assessment, bindings: { "/offers/0/areaIds": 0 } },
      c.source.evidence,
      existingState(previous),
    ).reason,
    /PROFILE_RELATION_NOT_SUPPORTED/u,
  );
});
test("an existing detail slot can receive a freshly grounded correction", () => {
  const previous = existingProfile();
  previous.areas[0].properties = [
    {
      key: "offer.capacity",
      label: null,
      state: "KNOWN",
      value: 20,
      conditions: {
        weekdays: [],
        dayparts: [],
        event: null,
        validFrom: null,
        validUntil: null,
      },
    },
  ];
  const value = structuredClone(previous);
  value.areas[0].properties[0].value = 30;
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value,
    source: { ...source, evidence: "30 Personen" },
  };
  assert.equal(
    prove(
      c,
      { ...assessment, bindings: { "/areas/0/properties/0": 0 } },
      c.source.evidence,
      existingState(previous),
    ).eligible,
    true,
  );
});
test("enrichment cannot silently remove an existing detail or assigned area", () => {
  const previous = existingProfile(),
    value = structuredClone(previous);
  value.areas[0].properties = [];
  let c = {
    ...claim,
    attributeKey: "experience.profile",
    value,
    source: { ...source, evidence: "Restaurant Mittagessen" },
  };
  assert.equal(
    prove(c, assessment, c.source.evidence, existingState(previous)).reason,
    "EXISTING_PROFILE_CONTENT_PROTECTED",
  );
  previous.offers[0].areaIds = ["restaurant"];
  value.areas[0].properties = structuredClone(previous.areas[0].properties);
  assert.equal(
    prove(c, assessment, c.source.evidence, existingState(previous)).reason,
    "EXISTING_PROFILE_CONTENT_PROTECTED",
  );
});
