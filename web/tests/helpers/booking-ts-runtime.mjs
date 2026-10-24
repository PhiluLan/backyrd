import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

export function createBookingTsLoader(base) {
  const require = createRequire(base);
  return (path, dependencies = {}, globals = {}) => {
    const source = fs.readFileSync(new URL(path, base), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, Buffer, URL, Headers, Request, Response, TextDecoder, AbortSignal, setTimeout, clearTimeout, fetch, process: { env: {} }, require: name => name === "server-only" ? {} : dependencies[name] ?? require(name), ...globals });
    return exports;
  };
}
