import assert from "node:assert/strict";
import test from "node:test";
import { formatAdminError, safeSerializeError } from "../lib/adminErrors.ts";
import { buildVenuePayload, filterEventSpots, normalizeSpotSearch, validateEventInput, venueFieldsAfterTyping } from "../lib/eventAdmin.ts";

const spots = [
  { id: "volta", name: "Volta Bräu", address: "Elsässerstrasse 215", city: "Basel" },
  { id: "markthalle", name: "Markthalle Basel", address: "Steinentorberg 20", city: "Basel" },
  { id: "zurich", name: "Kultur Zürich", address: "Limmatstrasse 1", city: "Zürich" },
];

const validForm = {
  title: "Open Air", description: "", categories: ["MUSIC"], minimumAge: "", price: "", free: true,
  startDate: "2026-09-14", startTime: "16:00", endTime: "23:00",
};

test("bestehenden Spot tolerant nach Namen suchen und auswählen", () => {
  assert.equal(normalizeSpotSearch("Bräu STRASSE"), "brau strasse");
  assert.equal(filterEventSpots(spots, "volta brau")[0]?.id, "volta");
});

test("Spot anhand eines Adressteils finden", () => {
  assert.equal(filterEventSpots(spots, "steinentorberg")[0]?.id, "markthalle");
});

test("Trefferliste ist auf acht Einträge begrenzt", () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ id: String(index), name: `Spot ${index}`, address: null, city: null }));
  assert.equal(filterEventSpots(many, "spot").length, 8);
});

test("freien Veranstaltungsort ohne Spot-Verknüpfung speichern", () => {
  const venue = buildVenuePayload({ eventId: "event-1", selectedSpot: null, venueName: "Quartierhof", address: "Hofweg 8", now: "2026-09-06T10:00:00Z" });
  assert.equal(venue?.matched_spot_id, null);
  assert.equal(venue?.match_method, "UNMATCHED");
  assert.equal(venue?.name, "Quartierhof");
  assert.equal(venue?.source_venue_id, "event:event-1");
});

test("bestehender Spot bleibt explizit verknüpft", () => {
  const venue = buildVenuePayload({ eventId: "event-1", selectedSpot: spots[0], venueName: "anderer Text", address: "", now: "2026-09-06T10:00:00Z" });
  assert.equal(venue?.matched_spot_id, "volta");
  assert.equal(venue?.match_method, "SOURCE_ID");
  assert.equal(venue?.address_line, "Elsässerstrasse 215");
});

test("Textänderung nach einer Spot-Auswahl entfernt die alte spot_id", () => {
  assert.deepEqual(venueFieldsAfterTyping("Quartierhof"), { venueName: "Quartierhof", spotId: "" });
});

test("Entwurf und direktes Veröffentlichen teilen dieselbe gültige Eingabeprüfung", () => {
  assert.equal(validateEventInput(validForm), null);
});

test("Production-Constraint für leere Kategorien wird vor dem API-Aufruf verständlich abgefangen", () => {
  assert.equal(validateEventInput({ ...validForm, categories: [] }), "Bitte wähle mindestens eine Kategorie aus.");
});

test("strukturierte Supabase-Validierungsfehler werden deutsch formatiert", () => {
  const error = { code: "23514", message: "new row violates check constraint", details: "Failing row", hint: "events_v1_categories_check" };
  assert.equal(formatAdminError(error), "Bitte wähle mindestens eine gültige Kategorie aus.");
});

test("[object Object] erscheint niemals im UI", () => {
  const values = [{ message: "[object Object]" }, { unexpected: true }, Object.create(null)];
  for (const value of values) assert.doesNotMatch(formatAdminError(value), /\[object Object\]/);
  assert.doesNotMatch(JSON.stringify(safeSerializeError({ unexpected: true })), /\[object Object\]/);
});
