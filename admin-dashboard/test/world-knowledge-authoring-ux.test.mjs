import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("authoring uses canonical schedules and rejects the former pseudo values", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/index.tsx");
  assert.match(source, /\[\["MONDAY", "Montag"\]/);
  assert.match(source, /type TimeInterval = \{ start: string; end: string \}/);
  assert.doesNotMatch(source, /<option value="BYO_FEE">/);
  assert.doesNotMatch(source, /<option value="CONDITIONAL">Unter Bedingungen<\/option><option value="UNKNOWN">/);
});

test("normal legacy review is human-readable and raw data stays in expert mode", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/index.tsx");
  assert.match(source, /Bisher vorhanden/);
  assert.match(source, /Neu in World Knowledge/);
  assert.match(source, /Format kann nicht sicher übernommen werden/);
  assert.match(source, /Technische Nachvollziehbarkeit/);
  assert.doesNotMatch(source, /<code>\{JSON\.stringify\(item\.value/);
});

test("validation and session errors stay inside the German authoring UI", async () => {
  const [source, page] = await Promise.all([
    read("packages/world-knowledge-authoring-ui/src/index.tsx"),
    read("admin-dashboard/app/world-knowledge/page.tsx"),
  ]);
  assert.match(source, /translateAuthoringError/);
  assert.match(source, /Deine lokale Sitzung ist abgelaufen/);
  assert.match(source, /sessionRecoveringAuthoringClient/);
  assert.match(source, /role=\{messageKind === "ERROR" \? "alert" : "status"\}/);
  assert.match(page, /authorizedWorldKnowledgePost/);
  assert.match(page, /sessionRecoveringAuthoringClient\(supabase, supabase\.auth\)/);
});

test("category-dependent taxonomy, section states and resilient schedules are visible product behavior", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/index.tsx");
  assert.match(source, /getAuthoringFieldsForContext/);
  assert.match(source, /getPlaceTypeConflict/);
  assert.match(source, /Bisher gespeicherte Auswahl passt nicht/);
  assert.match(source, /safeWeeklyRows/);
  assert.match(source, /FieldErrorBoundary/);
  assert.match(source, /Bewusst als unbekannt gespeichert/);
  assert.match(source, /Für die lokale Evaluation ausreichend/);
  assert.match(source, /Durch neue Angabe erledigt/);
  assert.match(source, /openLegacyCount/);
  assert.match(source, /legacyResolutionKey/);
  assert.match(source, /contact\.public_email/);
  assert.match(source, /offen ·/);
  assert.match(source, /Als offenen Vorschlag speichern/);
  assert.match(source, /engineAuthorized: false/);
});

test("normal rendering translates structured codes and reserves JSON for expert mode", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/index.tsx");
  assert.match(source, /TEMPORARILY_CLOSED: "Vorübergehend geschlossen"/);
  assert.match(source, /CONDITIONAL: "Unter Bedingungen"/);
  assert.match(source, /Hashes sind nur in der Expertensicht sichtbar/);
  assert.equal((source.match(/JSON\.stringify\(detail, null, 2\)/g) ?? []).length, 1);
});

test("context authoring keeps purpose, on-site offering and conditional observations separate", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/index.tsx");
  assert.match(source, /Zusatzangebot ist nicht der Hauptzweck/);
  assert.match(source, /Angebote lediglich in der Nähe werden hier nicht gespeichert/);
  assert.match(source, /Beziehung zum Spot/);
  assert.match(source, /Bedingungen hinzufügen/);
  assert.match(source, /<legend>Tageszeit/);
  assert.match(source, /Wochentage/);
  assert.match(source, /Alterskonstellation/);
  assert.match(source, /Begleitung/);
  assert.match(source, /<label>Betrieb/);
  assert.doesNotMatch(source, /option value="NEARBY"/);
});

test("product context, special hours and temporary state have low-friction, truthful choices", async () => {
  const [editor, product] = await Promise.all([
    read("packages/world-knowledge-authoring-ui/src/index.tsx"),
    read("packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx"),
  ]);
  assert.match(editor, /Was passt zu diesem Spot\?/);
  assert.match(editor, /aria-pressed=\{active\} onClick=\{\(\) => toggleSimple\(option\.value\)\}/);
  assert.match(editor, /Ausnahmen und Bedingungen bearbeiten/);
  assert.match(editor, /save\("KNOWN_VALUE", \[\]\)/);
  assert.match(editor, /Keine besonderen Zeiten vorhanden/);
  assert.match(editor, /Der normale, bis auf Weiteres geltende Betrieb steht bei den regulären Öffnungszeiten/);
  assert.match(product, /query\.trim\(\) \? 300 : 0/);
  assert.match(product, /wk-catalog-details/);
  assert.match(product, /Angaben gespeichert/);
});

test("older empty context encodings remain visibly selected without erasing real conditions", async () => {
  const source = await read("packages/world-knowledge-authoring-ui/src/context-choice.ts");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { isUnconditionalContextConditions: simple } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  assert.equal(simple({ dayparts: [], days: [], area: "", occasion: null, groupSize: { min: null, max: null }, ageContext: "", accompaniment: null, eventMode: null }), true);
  assert.equal(simple({ dayparts: ["EVENING"], days: [], area: null }), false);
  assert.equal(simple({ days: [], area: "Innenhof" }), false);
  assert.equal(simple({ groupSize: { min: 2, max: 4 } }), false);
  assert.equal(simple("invalid"), false);
});

test("Admin World reuses the existing Swiss Places lookup with explicit address confirmation", async () => {
  const [page, picker, product] = await Promise.all([
    read("admin-dashboard/app/world-knowledge/page.tsx"),
    read("admin-dashboard/app/world-knowledge/WorldAddressPicker.tsx"),
    read("packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx"),
  ]);
  assert.match(page, /addressPicker=\{WorldAddressPicker\}/);
  assert.match(picker, /libraries=places/);
  assert.match(picker, /componentRestrictions: \{ country: "ch" \}/);
  assert.match(picker, /Number\.isFinite\(latitude\)/);
  assert.match(picker, /onChange=\{\(\) => onSelectRef\.current\(null\)\}/);
  assert.match(product, /Adresse und Position speichern/);
  for (const key of ["location.address_line1", "location.locality", "location.country_code", "location.latitude", "location.longitude"]) {
    assert.ok(product.includes(key), `${key} must be saved through the authorized claim path`);
  }
  assert.match(product, /await saveField\(field, "KNOWN_VALUE", value\)/);
});

test("authoring writes rebuild and read the canonical snapshot without a normal-view file handoff", async () => {
  const [source, adminRoute, ownerRoute] = await Promise.all([
    read("packages/world-knowledge-authoring-ui/src/index.tsx"),
    read("admin-dashboard/app/api/world-knowledge/shadow/route.ts"),
    read("web/app/api/world-knowledge/shadow/route.ts"),
  ]);
  assert.match(source, /await rebuildAndReload\(detail\.spotId/);
  assert.match(source, /Kanonisch gelesener Snapshot ist aktuell/);
  assert.match(source, /Technischen Spot-Export erstellen/);
  assert.doesNotMatch(source, /className="wk-tools"><button[^>]+>Spot exportieren/);
  for (const route of [adminRoute, ownerRoute]) {
    assert.match(route, /createFounderWorldKnowledgeReader/);
    assert.match(route, /WORLD_KNOWLEDGE_PORT_VERSION/);
    assert.match(route, /readerSnapshot/);
  }
});
