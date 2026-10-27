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

for (const word of ["Bankette", "Hochzeiten"])
  test(`celebration plural remains the same catalog meaning: ${word}`, () =>
    assert.equal(matchesResearchMeaning("PRIVATE_CELEBRATION", word), true));

for (const [value, quote] of [
  ["ITALIAN", "authentische italienische und römische Spezialitäten"],
  ["STEAK", "Rindsentrecôte auf Rucolabett"],
  ["SEAFOOD", "Knusprig frittierte Calamari, Gamberi und Gemüse"],
  ["DESSERTS", "DOLCI / NACHSPEISEN / DESSERTS"],
  ["GARDEN", "der idyllische Garten"],
  ["OUTDOOR_SEATING", "unsere Boulevardfläche und der idyllische Garten"],
  ["DINING_AREA", "Ihr italienisches Restaurant"],
])
  test(`catalogue meaning supports ${value} without manual scope review`, () => {
    const c = {
      ...claim,
      value: [value],
      source: { ...source, evidence: quote },
    };
    assert.equal(prove(c).eligible, true);
  });

const multilineSchedule =
  "Öffnungszeiten\nDienstag - Freitag\nMittagessen 11:30 Uhr - 14:00 Uhr\nMontag – Samstag\nAbendessen 18:30 Uhr bis 23:00 Uhr\nSonntag Geschlossen";
const multilineRows = dayKeysForTest();
function dayKeysForTest() {
  return [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ].map((day, i) => ({
    day,
    intervals:
      i === 6
        ? []
        : i === 0 || i === 5
          ? [{ start: "18:30", end: "23:00" }]
          : [
              { start: "11:30", end: "14:00" },
              { start: "18:30", end: "23:00" },
            ],
  }));
}
test("multiline weekday ranges combine lunch and evening blocks per day", () => {
  const c = {
    ...claim,
    attributeKey: "hours.regular",
    value: multilineRows,
    source: { ...source, evidence: multilineSchedule },
  };
  assert.equal(prove(c).eligible, true);
  c.value = structuredClone(multilineRows);
  c.value[0].intervals.unshift({ start: "11:30", end: "14:00" });
  assert.equal(prove(c).reason, "SCHEDULE_TIME_NOT_SUPPORTED");
});
test("kitchen fallback follows verified regular times, never generic kitchen marketing", () => {
  const c = {
    ...claim,
    attributeKey: "hours.kitchen",
    value: multilineRows,
    source: { ...source, evidence: multilineSchedule },
  };
  assert.equal(
    prove(c, assessment, multilineSchedule + "\nUnser Küchenteam freut sich.")
      .eligible,
    true,
  );
  assert.equal(
    prove(
      c,
      assessment,
      multilineSchedule + "\nKüchenzeiten: Dienstag bis Freitag 12:00–13:30",
    ).reason,
    "KITCHEN_SCOPE_NOT_SUPPORTED",
  );
});
test("disjoint windows never prove one continuous opening interval", () => {
  const c = scheduleClaim();
  c.value[0].intervals = [{ start: "11:00", end: "00:00" }];
  assert.equal(prove(c).reason, "SCHEDULE_TIME_NOT_SUPPORTED");
});
test("a day heading and following Ruhetag remain a closed day", () => {
  const c = {
    ...claim,
    attributeKey: "hours.regular",
    value: [{ day: "MONDAY", intervals: [] }],
    source: {
      ...source,
      evidence: "Montag und Dienstag und Mittwoch:\nRuhetag",
    },
  };
  assert.equal(prove(c).eligible, true);
});
test("an explicit array binding cannot borrow a different value from sibling evidence", () => {
  const c = {
    ...claim,
    value: ["ITALIAN"],
    source: { ...source, evidence: "Italienische Küche" },
    supportingSources: [{ ...source, evidence: "Französische Küche" }],
  };
  assert.equal(
    prove(
      c,
      { ...assessment, bindings: { "/0": 1 } },
      "Italienische Küche Französische Küche",
    ).eligible,
    false,
  );
});
test("a profile heading alone never proves prices", () => {
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value: {
      category: "EAT",
      properties: [],
      areas: [],
      offers: [
        {
          id: "lunch",
          name: "Mittagsmenü",
          kind: "LUNCH",
          properties: [],
          areaIds: [],
          schedule: [],
          prices: [
            {
              min: 29,
              max: 36,
              basis: "PER_ITEM",
              currency: "CHF",
              conditions: {
                weekdays: [],
                dayparts: [],
                event: null,
                validFrom: null,
                validUntil: null,
              },
              minimumAge: null,
              maximumAge: null,
            },
          ],
        },
      ],
    },
    source: { ...source, evidence: "Restaurant Mittagsmenü / Lunch CHF" },
  };
  assert.match(
    prove(c, { ...assessment, bindings: { "/offers/0": 0 } }).reason,
    /PROFILE_PRICE_NOT_SUPPORTED/,
  );
});

for (const [value, quote] of [
  ["ITALIAN", "Keine italienische Küche"],
  ["GARDEN", "Kein Garten"],
  ["OUTDOOR_SEATING", "Keine Terrasse"],
  ["STEAK", "Kein Rindsentrecôte"],
  ["SEAFOOD", "Keine Calamari"],
])
  test(`negated catalogue evidence stays review-only: ${quote}`, () =>
    assert.equal(
      prove({
        ...claim,
        value: [value],
        source: { ...source, evidence: quote },
      }).eligible,
      false,
    ));

test("menu currency may be stated once by the official restaurant, but an explicit foreign price is not relabelled", () => {
  const profile = {
    category: "EAT",
    properties: [],
    areas: [],
    offers: [
      {
        id: "lunch",
        name: "Mittagsmenü",
        kind: "LUNCH",
        properties: [],
        areaIds: [],
        schedule: [],
        prices: [
          {
            min: 29,
            max: 36,
            basis: "PER_ITEM",
            currency: "CHF",
            conditions: {
              weekdays: [],
              dayparts: [],
              event: null,
              validFrom: null,
              validUntil: null,
            },
            minimumAge: null,
            maximumAge: null,
          },
        ],
      },
    ],
  };
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value: profile,
    source: { ...source, evidence: "Restaurant Mittagsmenü 29 bis 36" },
    supportingSources: [{ ...source, evidence: "Unsere Preise in CHF" }],
  };
  const a = { ...assessment, bindings: { "/offers/0": 0 } };
  assert.equal(
    prove(c, a, "Restaurant Mittagsmenü 29 bis 36 Unsere Preise in CHF")
      .eligible,
    true,
  );
  c.source.evidence = "Restaurant Mittagsmenü EUR 29 bis 36";
  assert.match(
    prove(c, a, "Restaurant Mittagsmenü EUR 29 bis 36 Unsere Preise in CHF")
      .reason,
    /PROFILE_PRICE_NOT_SUPPORTED/,
  );
});

for (const [kind, label] of [
  ["WELLNESS_RELAXATION", "Wellness"],
  ["HAMMAM", "Hamam"],
  ["POOL_AREA", "Badewelten"],
  ["SAUNA_AREA", "Saunawelt"],
  ["SPA_TREATMENT", "Massage"],
  ["BATHING", "Erlebnisbad"],
])
  test(`wellness catalogue meaning: ${kind}`, () => {
    assert.equal(matchesResearchMeaning(kind, label), true);
    assert.equal(matchesResearchMeaning(kind, `Kein ${label}`), false);
  });

async function collectedProof(c, a, body, { pdfText } = {}) {
  const page = {
    url: site,
    body: `<p>Test Basel Teststrasse 1</p>${body}`,
    contentType: "text/html",
    observedAt: at,
    redirectedFrom: [],
  };
  const evidence = await collectResearchEvidence({
    page,
    website: site,
    name: "Test",
    locality: "Basel",
    address: "Teststrasse 1",
    claims: [c],
    fetchPage: async (url) => ({
      url,
      body: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      observedAt: at,
      redirectedFrom: [],
    }),
    readPdf: async () => pdfText,
  });
  return proveResearchEvidence({
    claim: c,
    assessment: a,
    evidence,
    website: site,
    page,
    claims: [c],
    now,
  });
}
for (const variant of ["Picknick", "Pick-\nnick", "Pick\u0002nick"])
  test(`PDF word wrapping preserves the same quote: ${JSON.stringify(variant)}`, async () => {
    const c = {
      ...claim,
      attributeKey: "rule.external_food",
      value: {
        policy: "CONDITIONAL",
        exceptions: ["Nur in der Picknick Ecke"],
      },
      source: {
        ...source,
        url: site + "rules.pdf",
        evidence: `Mitgebrachte Esswaren sind nur in der ${variant} Ecke gestattet.`,
      },
    };
    const result = await collectedProof(
      c,
      assessment,
      '<a href="rules.pdf">Hausordnung</a>',
      {
        pdfText:
          "Mitgebrachte Esswaren sind nur in der Pick-\nnick Ecke gestattet.",
      },
    );
    assert.equal(result.eligible, true, JSON.stringify(result));
  });
test("PDF normalization cannot remove negation or alter a number", async () => {
  for (const quote of ["Esswaren sind gestattet.", "Eintritt ab 12 Jahren."]) {
    const c = {
      ...claim,
      source: { ...source, url: site + "rules.pdf", evidence: quote },
    };
    const result = await collectedProof(
      c,
      assessment,
      '<a href="rules.pdf">Hausordnung</a>',
      { pdfText: "Esswaren sind nicht-\ngestattet. Eintritt ab 16 Jahren." },
    );
    assert.equal(result.reason, "QUOTE_NOT_IN_SOURCE");
  }
});
test("conditional permission does not authorize an unconditional food policy", () => {
  const c = {
    ...claim,
    attributeKey: "rule.external_food",
    value: { policy: "ALLOWED", exceptions: [] },
    source: {
      ...source,
      evidence: "Esswaren sind nur in der Picknick Ecke gestattet.",
    },
  };
  assert.equal(prove(c).reason, "CONSUMPTION_SCOPE_NOT_SUPPORTED");
});
test("individual relation bindings preserve a second area's actual evidence", () => {
  const previous = existingProfile(),
    value = structuredClone(previous);
  value.offers[0].areaIds = ["restaurant"];
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value,
    source: { ...source, evidence: "Restaurant zum Mittagessen" },
  };
  assert.equal(
    prove(
      c,
      { ...assessment, bindings: { "/offers/0/areaIds/0": 0 } },
      c.source.evidence,
      existingState(previous),
    ).eligible,
    true,
  );
});
const wellnessProfile = () => ({
  ...existingProfile(),
  category: "WELLNESS_RELAXATION",
  areas: [],
  offers: [
    {
      ...existingProfile().offers[0],
      id: "pool",
      kind: "BATHING",
      name: "Badewelt",
      schedule: Array.from({ length: 7 }, (_, i) => ({
        weekday: i + 1,
        start: "10:00",
        end: "22:00",
      })),
    },
  ],
});
const hoursTable =
  "<table><tr><th>Bereich</th><th>Tag</th><th>Uhrzeit</th></tr><tr><td>Badewelten</td><td>täglich</td><td>10:00–22:00</td></tr><tr><td>Saunawelt</td><td><p>Mo–Do &amp; So</p><p>Fr–Sa</p><p>XXL letzter Samstag im Monat</p></td><td><p>10:00–22:00</p><p>10:00–23:00</p><p>10:00–00:00</p></td></tr></table>";
const hoursQuote =
  "Wellness Bereich Tag Uhrzeit Badewelten täglich 10:00–22:00 Saunawelt Mo–Do & So Fr–Sa XXL letzter Samstag im Monat 10:00–22:00 10:00–23:00 10:00–00:00";
test("parallel table columns retain daily and sauna weekday schedules", async () => {
  for (const sauna of [false, true]) {
    const value = wellnessProfile();
    if (sauna)
      Object.assign(value.offers[0], {
        kind: "SAUNA",
        name: "Saunawelt",
        schedule: Array.from({ length: 7 }, (_, i) => ({
          weekday: i + 1,
          start: "10:00",
          end: i === 4 || i === 5 ? "23:00" : "22:00",
        })),
      });
    const c = {
      ...claim,
      attributeKey: "experience.profile",
      value,
      source: { ...source, evidence: hoursQuote },
    };
    const a = { ...assessment, bindings: { "/offers/0": 0 } };
    const result = await collectedProof(c, a, "<p>Wellness</p>" + hoursTable);
    assert.equal(result.eligible, true, JSON.stringify(result));
    value.offers[0].schedule[0].end = "23:00";
    assert.equal(
      (await collectedProof(c, a, "<p>Wellness</p>" + hoursTable)).reason,
      "OFFER_SCHEDULE_NOT_SUPPORTED",
    );
  }
});
test("wraparound abbreviated days include Sunday through Thursday", () => {
  const c = {
    ...claim,
    attributeKey: "hours.regular",
    value: [
      { day: "SUNDAY", intervals: [{ start: "10:00", end: "22:00" }] },
      { day: "THURSDAY", intervals: [{ start: "10:00", end: "22:00" }] },
    ],
    source: { ...source, evidence: "So.–Do. 10:00–22:00" },
  };
  assert.equal(prove(c).eligible, true);
});

const tariffTable =
  '<table><tr><th>Dauer pro Person</th><th colspan="2">Jugendliche 6–15 Jahre</th><th colspan="2">Badewelt ab 16 Jahre</th><th colspan="2">Badewelt + Sauna ab 16 Jahre</th></tr><tr><td></td><td>Mo–Fr</td><td>Sa &amp; So*</td><td>Mo–Fr</td><td>Sa &amp; So*</td><td>Mo–Fr</td><td>Sa &amp; So*</td></tr><tr><td>2 Stunden</td><td>CHF 31</td><td>CHF 33.50</td><td>CHF 36</td><td>CHF 38.50</td><td>CHF 38</td><td>CHF 40.50</td></tr></table>';
const tariffQuote =
  "Wellness Badewelt Dauer pro Person Jugendliche 6–15 Jahre Badewelt ab 16 Jahre Badewelt + Sauna ab 16 Jahre Mo–Fr Sa & So* Mo–Fr Sa & So* Mo–Fr Sa & So* 2 Stunden CHF 31 CHF 33.50 CHF 36 CHF 38.50 CHF 38 CHF 40.50";
test("tariff columns bind amount to duration, age, area and weekday", async () => {
  const value = wellnessProfile();
  value.offers[0].schedule = [];
  const price = {
    label: "2 Stunden · Erwachsene · Mo–Fr",
    currency: "CHF",
    min: 36,
    max: 36,
    basis: "PER_PERSON",
    minimumAge: 16,
    maximumAge: null,
    mandatoryFeesIncluded: null,
    includes: "",
    conditions: {
      weekdays: [],
      dayparts: [],
      event: "Mo–Fr",
      validFrom: null,
      validUntil: null,
    },
  };
  value.offers[0].prices = [price];
  const c = {
    ...claim,
    attributeKey: "experience.profile",
    value,
    source: { ...source, evidence: tariffQuote },
  };
  const a = { ...assessment, bindings: { "/offers/0": 0 } };
  assert.equal(
    (await collectedProof(c, a, "<p>Wellness Badewelt</p>" + tariffTable))
      .eligible,
    true,
  );
  for (const changes of [
    { min: 33.5, max: 33.5 },
    { minimumAge: 6, maximumAge: 15 },
    { conditions: { ...price.conditions, event: "Sa & So*" } },
    { label: "2 Stunden · Badewelt + Sauna · Mo–Fr" },
  ]) {
    const wrong = structuredClone(c);
    Object.assign(wrong.value.offers[0].prices[0], changes);
    assert.match(
      (await collectedProof(wrong, a, "<p>Wellness Badewelt</p>" + tariffTable))
        .reason,
      /PROFILE_PRICE_NOT_SUPPORTED/u,
    );
  }
});


test("catalogue place-type evidence supports its own profile category without inventing category words", () => {
  const c={...claim,attributeKey:"experience.profile",value:{category:"ACTIVITIES_PLAY",properties:[],areas:[],offers:[]},source:{...source,evidence:"Unsere Spielhalle bietet Spiel und Spass."}};
  assert.equal(prove(c).eligible,true);
  for(const text of ["Keine Spielhalle vorhanden.","Unser Restaurant bietet Mittagessen.","Nur Kontakt und Begleitpflicht."]){
    const wrong={...c,source:{...source,evidence:text}};
    assert.equal(prove(wrong).reason,"PROFILE_CATEGORY_NOT_SUPPORTED");
  }
  assert.equal(prove({...c,value:{...c.value,category:"STAY"}}).reason,"PROFILE_CATEGORY_NOT_SUPPORTED");
});

test("international optional trunk notation preserves the actual phone digits",()=>{
 for(const text of ["T +41(0)61 681 95 65", "Telefon +41 (0) 61 681 95 65", "Telefon +41 61 681 95 65"]){
   const c={...claim,attributeKey:"contact.phone",value:"+41616819565",source:{...source,evidence:text}};
   assert.equal(prove(c).eligible,true);
   assert.equal(prove({...c,value:"+41616819566"}).reason,"PHONE_NOT_SUPPORTED");
 }
 const wrong={...claim,attributeKey:"contact.phone",value:"+41616819565",source:{...source,evidence:"Telefon +41 61 681 95 56"}};
 assert.equal(prove(wrong).reason,"PHONE_NOT_SUPPORTED");
});
