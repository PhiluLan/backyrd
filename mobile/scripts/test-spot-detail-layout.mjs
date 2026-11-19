import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/spot/[id].tsx", import.meta.url), "utf8");
const experience = readFileSync(new URL("../components/spot/SpotExperience.tsx", import.meta.url), "utf8");
const main = source.slice(source.indexOf('<View style={styles.content}>'), source.indexOf('<Modal animationType="slide" presentationStyle="fullScreen"'));
let previous = -1;
for (const marker of ['<SpotEssentials', 'styles.addressBlock', '<SectionTitle>Kontakt', '>Öffnungszeiten</Text>', '>Sonderöffnungszeiten</Text>', '<SpotExperience', '<SpotMoodProfile', 'styles.moreInfoEntry', '<SectionTitle>Hier erlebt', '<SectionTitle>Rund um diesen Ort', 'styles.ownerBlock', '<SectionTitle>Stimmt etwas nicht?', '>Schreibe uns!</Text>']) {
  const position = main.indexOf(marker);
  assert.ok(position > previous, `Spot section order: ${marker}`);
  previous = position;
}
assert.ok(experience.indexOf('Das kannst du hier erleben') < experience.indexOf('Dein Platz vor Ort'));
assert.ok(experience.indexOf('Dein Platz vor Ort') < experience.indexOf('Gut zu wissen'));
assert.doesNotMatch(main, /<SectionTitle>(Fotos vom Ort|Über diesen Ort)/);
assert.match(source, /<AppText role="screenTitle" style=\{styles.heroTitle\}>\{spot.name\}/);

const syntax = ts.createSourceFile("spot.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(syntax) === "Pressable") {
    const attrs = node.attributes.properties;
    const label = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(syntax) === "accessibilityLabel" && attr.initializer?.text === "Schreibe uns zu diesem Ort");
    if (label) handler = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(syntax) === "onPress").initializer.expression.getText(syntax);
  }
  ts.forEachChild(node, visit);
}
visit(syntax);
assert.ok(handler);
let opened;
const spot = { id: "1101ee26-5046-4cdc-921a-5a3bd4cb5306", name: "Café & Bar? #Basel" };
vm.runInNewContext(`(${handler})()`, { spot, encodeURIComponent, openExternalUrl: url => { opened = url; } });
const mail = new URL(opened);
assert.equal(mail.protocol, "mailto:");
assert.equal(mail.pathname, "hello@backyrd.ch");
assert.equal(mail.searchParams.get("subject"), `Hinweis zu ${spot.name}`);
assert.match(mail.searchParams.get("body"), /https:\/\/www.backyrd.ch\/spots\/1101ee26-5046-4cdc-921a-5a3bd4cb5306/);
assert.equal([...mail.searchParams.keys()].length, 2);
console.log("Spot section order, sans-serif title and encoded support composer passed.");
