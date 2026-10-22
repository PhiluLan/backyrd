import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/home-daypart.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);

const at = (hour, minute) => new Date(2026, 9, 22, hour, minute);
const { homeDaypart } = module.exports;
for (const [hour, minute, expected] of [
  [4, 59, "Nacht"], [5, 0, "Morgen"], [9, 0, "Morgen"],
  [9, 1, "Vormittag"], [11, 59, "Vormittag"], [12, 0, "Mittag"],
  [14, 0, "Mittag"], [14, 1, "Nachmittag"], [17, 0, "Nachmittag"],
  [17, 1, "Abend"], [22, 0, "Abend"], [22, 1, "Nacht"],
]) {
  assert.equal(homeDaypart(at(hour, minute)), expected, `${hour}:${String(minute).padStart(2, "0")}`);
}

console.log("Home daypart boundaries passed.");
