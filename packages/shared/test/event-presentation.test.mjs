import assert from "node:assert/strict";
import test from "node:test";

import {
  eventCategoryLabel,
  eventImageCredit,
  eventPropertyLabels,
  eventSourceDisclaimer,
  eventSourceLabel,
  formatCompactOccurrenceDate,
  formatEventAddress,
  formatEventDateTime,
  humanizeRecurrence,
} from "../src/presentation/event.ts";

test("event categories are localized without changing canonical values", () => {
  assert.equal(eventCategoryLabel("SPORT"), "Sport");
  assert.equal(eventCategoryLabel("ACTIVITY"), "Aktivität");
  assert.equal(eventCategoryLabel("LEISURE"), "Freizeit");
});

test("manual provenance is replaced with consumer-safe attribution", () => {
  assert.equal(eventSourceLabel("MANUAL_ADMIN"), "Angaben vom Veranstalter");
  assert.match(eventSourceDisclaimer("manual_admin"), /^Angaben vom Veranstalter\./);
  assert.equal(
    eventImageCredit("manual_admin", "Vom Founder für dieses Event hochgeladen"),
    null,
  );
  assert.equal(eventImageCredit("eventfrog", "Foto: Veranstalter"), "Foto: Veranstalter");
});

test("recurrence summaries are natural and deterministic", () => {
  assert.equal(humanizeRecurrence("Alle 2 Wochen, Montag"), "Jeden zweiten Montag");
  assert.equal(humanizeRecurrence("Wöchentlich, Freitag"), "Jeden Freitag");
  assert.equal(
    humanizeRecurrence("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"),
    "Jeden zweiten Montag",
  );
  assert.equal(humanizeRecurrence("Alle 3 Wochen, Mittwoch"), "Alle 3 Wochen, jeweils mittwochs");
});

test("date copy includes the full start and end time in Basel", () => {
  assert.equal(
    formatEventDateTime("2026-09-14T14:00:00.000Z", "2026-09-14T21:00:00.000Z"),
    "Montag, 14. September · 16:00–23:00",
  );
  assert.equal(formatCompactOccurrenceDate("2026-09-28T14:00:00.000Z"), "28. Sept.");
});

test("event properties omit unknown values", () => {
  assert.deepEqual(eventPropertyLabels(14, true), ["Ab 14 Jahren", "Familiengeeignet"]);
  assert.deepEqual(eventPropertyLabels(null, null), []);
  assert.deepEqual(eventPropertyLabels(null, false), ["Nicht familiengeeignet"]);
});

test("addresses are localized and duplicate locality fragments are removed", () => {
  assert.equal(
    formatEventAddress({
      addressLine: "Voltastrasse 30, 4056 Basel, Schweiz, Basel",
      postalCode: "4056",
      city: "Basel",
      countryCode: "CH",
    }),
    "Voltastrasse 30, 4056 Basel, Schweiz",
  );
  assert.equal(
    formatEventAddress({
      addressLine: "Voltastrasse 30",
      postalCode: "4056",
      city: "Basel",
      countryCode: "CH",
    }),
    "Voltastrasse 30, 4056 Basel, Schweiz",
  );
});
