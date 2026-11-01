import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(
  fs.readFileSync(
    new URL("../../packages/shared/src/seasonal-events.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const lib = {};
new Function("exports", code)(lib);
const edition = {
  series_id: "series",
  edition_year: 2026,
  edition_start_date: "2026-10-24",
  edition_end_date: "2026-11-10",
};
test("seasonal date labels use Basel date, retain the archive and never imply 24-hour opening", () => {
  assert.equal(
    lib.seasonalDateLabel(edition, new Date("2026-10-23T22:30:00Z")),
    "Bis 10. November",
  );
  assert.equal(
    lib.seasonalDateLabel(edition, new Date("2026-10-22T12:00:00Z")),
    "Ab 24. Oktober",
  );
  assert.equal(
    lib.seasonalDateLabel(edition, new Date("2026-11-11T12:00:00Z")),
    "Beendet · 2026",
  );
  assert.equal(lib.seasonalDateLabel({}, new Date()), null);
});
test("one edition card retains ordinary concerts as separate dates", () => {
  const a = { ...edition, event_id: "a" },
    b = { event_id: "b" },
    c = { ...edition, event_id: "c" };
  assert.deepEqual(lib.groupSeasonalEvents([a, a, b, b, c]), [a, b, b, c]);
});
test("each place selects its current/next actual interval, not the first day of the whole edition", () => {
  const row = (venue, start, end) => ({
    venue_id: venue,
    start_at: start,
    end_at: end,
  });
  const old = row("one", "2026-10-24T10:00:00Z", "2026-10-24T21:00:00Z");
  const current = row("one", "2026-11-01T11:00:00Z", "2026-11-01T21:00:00Z");
  const future = row("one", "2026-11-02T11:00:00Z", "2026-11-02T21:00:00Z");
  const other = row("two", "2026-11-01T10:00:00Z", "2026-11-01T19:00:00Z");
  assert.deepEqual(
    lib.seasonalPlaceRows(
      [future, old, other, current],
      new Date("2026-11-01T12:00:00Z"),
    ),
    [old, current, other].filter((x) => x !== old),
  );
  assert.deepEqual(
    lib.seasonalPlaceRows([old, current], new Date("2026-11-12T12:00:00Z")),
    [current],
  );
});

test('researched Herbstmesse fixture has seven evidenced places and 114 bounded daily intervals',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('../../admin-dashboard/data/events/basler-herbstmesse-2026.json',import.meta.url),'utf8'));
 assert.equal(fixture.places.length,7);let count=0;
 for(const place of fixture.places){
  assert.match(place.sourceUrl,/^https:\/\/www\.herbstmesse\.ch\/fairgrounds\//);
  assert.ok(place.latitude>47.54&&place.latitude<47.58&&place.longitude>7.57&&place.longitude<7.62);
  assert.equal(place.endDate,place.key==='petersplatz'?'2026-11-10':'2026-11-08');
  for(let date=new Date(place.startDate+'T12:00:00Z');date<=new Date(place.endDate+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1)){
   const day=date.toISOString().slice(0,10);const exception=place.exceptions.find(e=>e.date===day);
   const hours=exception??place.hours.find(h=>h.weekdays.includes(date.getUTCDay()||7));
   assert.ok(hours);if(hours.closed)continue;
   if(day==='2026-10-24')assert.equal(hours.start,'12:00');
   assert.ok(hours.end>hours.start);count++;
  }
 }
 assert.equal(count,114);assert.equal(fixture.places.filter(p=>p.environment==='INDOOR').length,1);
});
