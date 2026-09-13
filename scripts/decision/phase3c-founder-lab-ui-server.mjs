import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE3C_LAB_VERSIONS, replayFounderDecisionLab, resolveFounderLabText, runFounderDecisionLab } from "../../packages/decision-vnext-core/dist/index.js";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "phase3c-founder-lab-ui");
const staticFiles = Object.freeze({ "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/styles.css": ["styles.css", "text/css; charset=utf-8"] });
const headers = Object.freeze({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" });
const send = (res, status, value) => { res.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8" }); res.end(`${JSON.stringify(value)}\n`); };
const readJson = (req) => new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on("data", (chunk) => { size += chunk.length; if (size > 128 * 1024) { reject(new Error("Anfrage zu groß")); req.destroy(); } else chunks.push(chunk); }); req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("Ungültige lokale Anfrage")); } }); req.on("error", reject); });
const assertOnly = (value, allowed) => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ungültige lokale Anfrage"); for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Nicht erlaubtes Feld: ${key}`); };
const requestFields = new Set(["requestId", "text", "tracking", "deviceCity", "userMode", "alternativeRequested", "rejectedCandidateIds"]);

function request(body) {
  return { contractVersion: PHASE3C_LAB_VERSIONS.request, requestId: body.requestId ?? "founder-ui-request", ephemeralText: body.text, deviceLocation: body.tracking === false ? { state: "DENIED", city: null } : { state: "AVAILABLE", city: body.deviceCity ?? "Basel" }, userMode: body.userMode ?? "NEUTRAL_MISSING", alternativeRequested: body.alternativeRequested ?? false, rejectedCandidateIds: body.rejectedCandidateIds ?? [] };
}

export function startPhase3CFounderLabServer({ port = 3223, host = "127.0.0.1" } = {}) {
  if (host !== "127.0.0.1") throw new Error("phase3c_lab_loopback_only");
  const server = http.createServer(async (req, res) => {
    const activePort = server.address()?.port ?? port; const allowed = new Set([`127.0.0.1:${activePort}`, `localhost:${activePort}`]);
    if (!allowed.has(req.headers.host ?? "")) return send(res, 403, { ok: false, code: "HOST_REJECTED" });
    if (req.method !== "GET" && req.headers.origin && !new Set([`http://127.0.0.1:${activePort}`, `http://localhost:${activePort}`]).has(req.headers.origin)) return send(res, 403, { ok: false, code: "ORIGIN_REJECTED" });
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${activePort}`);
    try {
      if (req.method === "GET" && staticFiles[url.pathname]) { const [file, type] = staticFiles[url.pathname]; res.writeHead(200, { ...headers, "Content-Type": type }); return res.end(fs.readFileSync(path.join(assets, file))); }
      if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, localOnly: true, productionAuthorized: false, rawTextPersisted: false });
      if (req.method === "POST") {
        const body = await readJson(req); const input = request(body);
        if (url.pathname === "/api/resolve") { assertOnly(body, requestFields); return send(res, 200, { ok: true, data: resolveFounderLabText(input) }); }
        if (url.pathname === "/api/evaluate") { assertOnly(body, new Set([...requestFields, "corrections"])); return send(res, 200, { ok: true, data: await runFounderDecisionLab({ request: input, ...(body.corrections ? { corrections: body.corrections } : {}) }) }); }
        if (url.pathname === "/api/replay") { assertOnly(body, new Set([...requestFields, "corrections", "result"])); return send(res, 200, { ok: true, data: await replayFounderDecisionLab(input, body.result, body.corrections ? { corrections: body.corrections } : {}) }); }
      }
      return send(res, 404, { ok: false, code: "NOT_FOUND" });
    } catch (error) { return send(res, 400, { ok: false, code: "SAFE_REJECTION", message: error.message, stateUnchanged: true }); }
  });
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}` })); });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startPhase3CFounderLabServer().then(({ url }) => process.stdout.write(`Backyrd Founder Decision Lab: ${url}\nNur lokal · keine Speicherung · keine Production-Autorität.\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
