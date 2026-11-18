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
