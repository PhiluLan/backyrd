import assert from "node:assert/strict";
import test from "node:test";

import { EventfrogAdapter } from "../src/eventfrog-adapter.js";
import { matchVenue, normalizeText } from "../src/normalization.js";
import { BaselLiveAdapter, ProgOnlineAdapter } from "../src/pending-adapters.js";

const eventBase = {
  extSrcId: null,
  extId: null,
  groupId: "42",
  rubricId: 7,
  title: { de: "Basler Testkonzert" },
  url: "https://eventfrog.ch/de/p/test",
  organizerId: "9",
  organizerName: "Testveranstalter",
  presaleLink: "https://eventfrog.ch/de/tickets/test",
  emblemToShow: { url: "https://images.eventfrog.test/protected.jpg" },
  emblemCredits: "Test Photographer",
  cancelled: false,
  visible: true,
  published: true,
  agendaEntryOnly: false,
  littleTicketsLeft: false,
  soldOut: false,
  lowestTicketPrice: 20,
  locationIds: ["100"],
  locationAlias: { de: "Testhalle Basel" },
  modifyDate: "2026-09-05T12:00:00+02:00",
  shortDescription: { de: "<p>Ein echtes Testkonzert.</p>" },
  descriptionAsHTML: { de: "<p>Lange Beschreibung</p>" },
};

test("Eventfrog adapter produces one event with two deterministic occurrences", async () => {
  const fetchStub = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.pathname.endsWith("/events")) {
      return Response.json({
        totalNumberOfResources: 2,
        events: [
          { ...eventBase, id: "1", begin: "2026-09-12T19:00:00+02:00", end: "2026-09-12T21:00:00+02:00" },
          { ...eventBase, id: "2", begin: "2026-09-13T19:00:00+02:00", end: "2026-09-13T21:00:00+02:00" },
        ],
      });
    }
    if (url.pathname.endsWith("/locations")) {
      assert.deepEqual(url.searchParams.getAll("id"), ["100"]);
      return Response.json({
        totalNumberOfResources: 1,
        locations: [{
          id: "100",
          title: { de: "Testhalle Basel" },
          addressLine: "Testweg 1",
          zip: "4051",
          city: "Basel",
          country: "CH",
          lat: 47.5596,
          lng: 7.5886,
        }],
      });
    }
    if (url.pathname.endsWith("/rubrics")) {
      return Response.json({
        totalNumberOfResources: 1,
        rubrics: [{ id: 7, parentId: 0, title: { de: "Konzerte" } }],
      });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  const records = await new EventfrogAdapter("test-token", fetchStub).fetch({
    from: "2026-09-05T00:00:00+02:00",
    to: "2026-10-01T00:00:00+02:00",
  });

  assert.equal(records.length, 2);
  assert.equal(records[0]!.eventDedupeKey, records[1]!.eventDedupeKey);
  assert.notEqual(records[0]!.occurrenceDedupeKey, records[1]!.occurrenceDedupeKey);
  assert.equal(records[0]!.category, "MUSIC");
  assert.equal(records[0]!.shortDescription, "Ein echtes Testkonzert.");
  assert.equal(records[0]!.isFree, false);
  assert.equal(records[0]!.provenance.imageImported, false);
  assert.equal(Object.hasOwn(records[0]!, "imageUrl"), false);
  assert.equal(Object.hasOwn(records[0]!.rawPayload, "emblemToShow"), false);
  assert.equal(Object.hasOwn(records[0]!.rawPayload, "emblemCredits"), false);
});

test("venue matching is exact and leaves ambiguous names unmatched", () => {
  const venue = {
    sourceVenueId: "100",
    name: "Kaserne Basel",
    addressLine: "Klybeckstrasse 1b",
    postalCode: "4057",
    city: "Basel",
    countryCode: "CH",
    latitude: 47.568,
    longitude: 7.591,
  };
  const exact = matchVenue(venue, [{
    id: "spot-1",
    name: "Kaserne Basel",
    address: "Klybeckstrasse 1b, 4057 Basel, Schweiz",
    city: "Basel",
    lat: 47.568,
    lng: 7.591,
  }]);
  assert.deepEqual(exact, { spotId: "spot-1", method: "ADDRESS", confidence: 1 });

  const ambiguous = matchVenue(
    { ...venue, addressLine: null, postalCode: null, latitude: null, longitude: null },
    [
      { id: "a", name: "Kaserne Basel", address: null, city: "Basel", lat: null, lng: null },
      { id: "b", name: "Kaserne Basel", address: null, city: "Basel", lat: null, lng: null },
    ],
  );
  assert.deepEqual(ambiguous, { spotId: null, method: "UNMATCHED", confidence: null });
  assert.equal(normalizeText("  Théâtre & Café  "), "theatre und cafe");
});

test("contract-pending adapters never fall back to HTML", async () => {
  await assert.rejects(
    () => new ProgOnlineAdapter().fetch({ from: "2026-09-01", to: "2026-10-01" }),
    /contract|rights/i,
  );
  await assert.rejects(
    () => new BaselLiveAdapter().fetch({ from: "2026-09-01", to: "2026-10-01" }),
    /partnership/i,
  );
});
