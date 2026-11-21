import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const nodeRequire = createRequire(import.meta.url);
const modules = new Map();
// Contract tests run before the package build in CI. Load the actual catalog
// sources in one realm, preserving their canonical hashing and enum validation.
function loadWorldSource(file) {
  if (modules.has(file)) return modules.get(file);
  const result = {};
  modules.set(file, result);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInThisContext(`(function(exports,require){${code}\n})`, {
    filename: file,
  })(result, (name) =>
    name.startsWith(".")
      ? loadWorldSource(resolve(dirname(file), name.replace(/\.js$/, ".ts")))
      : nodeRequire(name),
  );
  return result;
}
const core = fileURLToPath(
  new URL("../../packages/world-knowledge-core/src/", import.meta.url),
);
const taxonomy = {
  ...loadWorldSource(resolve(core, "spot-catalog.ts")),
  ...loadWorldSource(resolve(core, "registry.ts")),
  ...loadWorldSource(resolve(core, "authoring-taxonomy.ts")),
};
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../lib/spot-profile-presentation.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports,
    Intl,
    Date,
    URL,
    require: (name) => {
      if (name === "@backyrd/world-knowledge-core/browser") return taxonomy;
      throw new Error(name);
    },
  },
);
const { fieldValue, contactHref, regularHours, specialHours, moreInfo } =
  exports;
const field = (attributeKey, value, knowledgeState = "KNOWN_VALUE") => ({
  attributeKey,
  value,
  knowledgeState,
});
test("consumer labels translate known enums without inventing unknown vocabulary", () => {
  assert.equal(
    fieldValue(field("classification.place_types", ["BAR", "BREWERY", "PUB"])),
    "Bar · Brauerei · Pub",
  );
  assert.equal(fieldValue(field("operation.price_level", "MEDIUM")), "Mittel");
  assert.equal(fieldValue(field("x", "FUTURE_INTERNAL_ENUM")), null);
  assert.equal(fieldValue(field("x", { secret: "raw" })), null);
  assert.equal(fieldValue(field("x", "BAR", "UNKNOWN")), null);
  assert.equal(
    fieldValue(field("accessibility.elevator", false, "KNOWN_FALSE")),
    "Nein",
  );
});
test("special hours keep closures, split windows and invalid dates distinct", () => {
  const rows = specialHours([
    { date: "2026-12-24", status: "CLOSED", intervals: [] },
    {
      date: "2026-12-25",
      status: "OPEN",
      intervals: [
        { start: "10:00", end: "12:00" },
        { start: "17:00", end: "23:00" },
      ],
    },
    { date: "2026-02-30", status: "CLOSED" },
    { date: "2026-12-26", status: "UNKNOWN" },
    {
      date: "2026-12-27",
      status: "OPEN",
      intervals: [{ start: "99:00", end: "23:00" }],
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "24. Dezember 2026");
  assert.equal(rows[0].hours, "Geschlossen");
  assert.equal(rows[1].hours, "10:00–12:00 · 17:00–23:00");
});
test("unknown, explicitly closed and overnight regular hours are not conflated", () => {
  const rows = regularHours([
    { day_of_week: "Montag", open_time: "", close_time: "" },
    { day_of_week: "Freitag", open_time: "17:00:00", close_time: "00:30:00" },
  ]);
  assert.equal(rows[0].hours, "Geschlossen");
  assert.equal(rows[1].hours, "Nicht bekannt");
  assert.equal(rows[4].hours, "17:00–00:30");
});
test("more information preserves supported context qualifiers and omits unsupported claims", () => {
  const rows = moreInfo([
    field("context.atmosphere", [
      {
        atmosphere: "COZY",
        conditions: {
          days: ["SATURDAY"],
          dayparts: ["EVENING"],
          area: "Terrasse",
        },
      },
      {
        atmosphere: "QUIET",
        conditions: { unrecognizedRule: "only sometimes" },
      },
    ]),
    field("rule.pet_access", {
      indoor: "ALLOWED",
      outdoor: "NOT_ALLOWED",
      notes: "Bitte an der Leine.",
    }),
    field("internal.private", "Private"),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].lines.join(), "Gemütlich · Samstag · Abends · Terrasse");
  assert.equal(
    rows[1].lines.join(" / "),
    "Drinnen: Erlaubt / Draussen: Nicht erlaubt / Bitte an der Leine.",
  );
});
test("contact actions reject executable URLs, credentials and email header injection", () => {
  assert.equal(contactHref("contact.website", "javascript:alert(1)"), null);
  assert.equal(
    contactHref("contact.website", "https://user:password@example.test"),
    null,
  );
  assert.equal(
    contactHref(
      "contact.public_email",
      "a@example.test?bcc=other@example.test",
    ),
    null,
  );
  assert.equal(
    contactHref("contact.phone", "+41 (61) 690 91 29"),
    "tel:+41616909129",
  );
  assert.equal(
    contactHref("contact.instagram", "@voltabraeu"),
    "https://instagram.com/voltabraeu",
  );
  assert.equal(
    contactHref("contact.tiktok", "@backyrd"),
    "https://tiktok.com/@backyrd",
  );
  assert.equal(
    contactHref("contact.website", "example.test"),
    "https://example.test/",
  );
});
