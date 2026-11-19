import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const source = readFileSync(new URL("../../packages/shared/src/presentation/spot-experience.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const hermes = resolve("node_modules/react-native/sdks/hermesc", process.platform === "darwin" ? "osx-bin/hermes" : "linux64-bin/hermes");
const directory = mkdtempSync(join(tmpdir(), "backyrd-spot-copy-hermes-"));
try {
  const file = join(directory, "spot-copy.js");
  writeFileSync(file, `var exports = {};\n${compiled}\n
    Intl.ListFormat = undefined;
    function check(value, expected) { if (value !== expected) throw new Error(JSON.stringify({value:value, expected:expected})); }
    function copy(value) { return exports.spotExperienceDetailGroups([{key:'food.drink',label:'Getränke',value:value,condition:null}])[0].items[0]; }
    check(copy('Craft-Bier'), 'Hier gibt es Craft-Bier.');
    check(copy('Kaffee · Tee'), 'Hier gibt es Kaffee und Tee.');
    check(copy('Bier · Kaffee · Tee'), 'Hier gibt es Bier, Kaffee und Tee.');
    check(exports.spotExperienceDetailGroups([]).length, 0);
    var visit = exports.spotExperienceDetailGroups([{key:'participation.booking',label:'Reservation',value:'Erforderlich',condition:'Samstag'}]);
    check(visit[0].items[0], 'Eine Reservation ist erforderlich (Samstag).');
    var food = exports.spotExperienceDetailGroups([{key:'food.option',label:'Ernährung',value:'Glutenfreie Option · Anpassung auf Anfrage',condition:'Samstag'}]);
    check(food[0].entries[0].tags.length, 2);
    check(food[0].entries[0].tags[1], 'Anpassung auf Anfrage');
    check(food[0].entries[0].condition, 'Samstag');
    var result = exports.presentSpotExperience({contractVersion:'backyrd.world-knowledge.experience-profile@1.0',reviewed:true,offers:[{id:'tasting',name:'Degustation',prices:[{label:'Vier Biere',currency:'CHF',min:11,max:11,basis:'PER_PERSON'}],properties:[],schedule:[],areaIds:[]}],areas:[],properties:[]});
    check(result.offers[0].priceDetails[0].amount, '11 CHF');
    print('SPOT_COPY_HERMES_PASS');
  `);
  const result = spawnSync(hermes, [file], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SPOT_COPY_HERMES_PASS/);
  console.log("Spot consumer copy executes in Hermes without Intl.ListFormat.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
