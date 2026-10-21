import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

export function createBookingTsLoader(base) {
  const require = createRequire(base);
  function compile(path, dependencies = {}, globals = {}, modules = new Map()) {
    const sourceUrl = new URL(path, base);
    if (modules.has(sourceUrl.href)) return modules.get(sourceUrl.href);
    const source = fs.readFileSync(sourceUrl, "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    modules.set(sourceUrl.href, exports);
    vm.runInNewContext(code, { exports, Buffer, URL, Headers, Request, Response, TextDecoder, AbortController, AbortSignal, setTimeout, clearTimeout, fetch, process: { env: {} }, require: name => name === "server-only" ? {} : dependencies[name] ?? (name.startsWith(".") && fs.existsSync(new URL(`${name}.ts`, sourceUrl)) ? compile(new URL(`${name}.ts`, sourceUrl), dependencies, globals, modules) : require(name)), ...globals });
    return exports;
  }
  return compile;
}
