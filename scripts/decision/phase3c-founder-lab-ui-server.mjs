import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE3C_LAB_VERSIONS, contentHash, inspectFounderLabCohort, replayFounderDecisionLab, resolveFounderLabText, runFounderDecisionLab } from "../../packages/decision-vnext-core/dist/index.js";
import { parseFounderWorldCohortHandoff } from "../../packages/world-knowledge-core/dist/index.js";
import { createFounderLabStateStore } from "./phase3c-founder-lab-state.mjs";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "phase3c-founder-lab-ui");
const staticFiles = Object.freeze({ "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/styles.css": ["styles.css", "text/css; charset=utf-8"], "/cohort.css": ["cohort.css", "text/css; charset=utf-8"] });
const headers = Object.freeze({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" });
const send = (res, status, value) => { res.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8" }); res.end(`${JSON.stringify(value)}\n`); };
const readJson = (req, maxBytes = 128 * 1024) => new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on("data", (chunk) => { size += chunk.length; if (size > maxBytes) { reject(new Error("Anfrage zu groß")); req.destroy(); } else chunks.push(chunk); }); req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("Ungültige lokale Anfrage")); } }); req.on("error", reject); });
const assertOnly = (value, allowed) => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ungültige lokale Anfrage"); for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Nicht erlaubtes Feld: ${key}`); };
const requestFields = new Set(["requestId", "text", "tracking", "deviceCity", "userMode", "alternativeRequested", "rejectedCandidateIds"]);

function request(body) {
  return { contractVersion: PHASE3C_LAB_VERSIONS.request, requestId: body.requestId ?? "founder-ui-request", ephemeralText: body.text, deviceLocation: body.tracking === false ? { state: "DENIED", city: null } : { state: "AVAILABLE", city: body.deviceCity ?? "Basel" }, userMode: body.userMode ?? "NEUTRAL_MISSING", alternativeRequested: body.alternativeRequested ?? false, rejectedCandidateIds: body.rejectedCandidateIds ?? [] };
}

export function startPhase3CFounderLabServer({ port = 3223, host = "127.0.0.1", stateDirectory } = {}) {
  if (host !== "127.0.0.1") throw new Error("phase3c_lab_loopback_only");
  for (const [file] of Object.values(staticFiles)) if (!fs.existsSync(path.join(assets, file))) throw new Error(`phase3c_lab_artifact_missing:${file}`);
  const state = createFounderLabStateStore(stateDirectory); state.load();
  const activeHandoff = () => state.load()?.artifact ?? null;
  const cohortStatus = async () => { const stored = state.load(); const summary = await inspectFounderLabCohort(stored?.artifact); return { source: summary.cohort.source, spotCount: summary.spotCount, names: summary.names, importedAt: stored?.activatedAt ?? null, manifestValid: true, cohortId: summary.cohort.cohortId, handoffHash: stored?.artifact.handoffHash ?? null, cohortHash: summary.cohort.cohortHash, singleSpot: summary.spotCount === 1, stateDirectory: state.directory, productionAuthorized: false }; };
  const server = http.createServer(async (req, res) => {
    const activePort = server.address()?.port ?? port; const allowed = new Set([`127.0.0.1:${activePort}`, `localhost:${activePort}`]);
    if (!allowed.has(req.headers.host ?? "")) return send(res, 403, { ok: false, code: "HOST_REJECTED" });
    if (req.method !== "GET" && req.headers.origin && !new Set([`http://127.0.0.1:${activePort}`, `http://localhost:${activePort}`]).has(req.headers.origin)) return send(res, 403, { ok: false, code: "ORIGIN_REJECTED" });
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${activePort}`);
    try {
      if (req.method === "GET" && staticFiles[url.pathname]) { const [file, type] = staticFiles[url.pathname]; res.writeHead(200, { ...headers, "Content-Type": type }); return res.end(fs.readFileSync(path.join(assets, file))); }
      if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, localOnly: true, productionAuthorized: false, rawTextPersisted: false });
      if (req.method === "GET" && url.pathname === "/api/cohort") return send(res, 200, { ok: true, data: await cohortStatus() });
      if (req.method === "POST") {
        const body = await readJson(req, url.pathname.startsWith("/api/cohort/") ? 12 * 1024 * 1024 : 128 * 1024);
        if (url.pathname === "/api/cohort/preview") { assertOnly(body, new Set(["artifact"])); const artifact = parseFounderWorldCohortHandoff(body.artifact); const summary = await inspectFounderLabCohort(artifact); const previewHash = contentHash({ handoffHash: artifact.handoffHash, cohortHash: summary.cohort.cohortHash, spotCount: summary.spotCount, names: summary.names }); return send(res, 200, { ok: true, data: { previewHash, source: "FOUNDER_WORLD_COHORT", spotCount: summary.spotCount, names: summary.names, exportedAt: artifact.exportedAt, cohortId: artifact.manifest.cohortId, manifestValid: true, singleSpot: summary.spotCount === 1 } }); }
        if (url.pathname === "/api/cohort/import") { assertOnly(body, new Set(["artifact", "previewHash"])); const artifact = parseFounderWorldCohortHandoff(body.artifact); const summary = await inspectFounderLabCohort(artifact); const expected = contentHash({ handoffHash: artifact.handoffHash, cohortHash: summary.cohort.cohortHash, spotCount: summary.spotCount, names: summary.names }); if (body.previewHash !== expected) throw new Error("founder_cohort_preview_binding_mismatch"); state.save(artifact); return send(res, 200, { ok: true, data: await cohortStatus() }); }
        if (url.pathname === "/api/cohort/synthetic" || url.pathname === "/api/cohort/reset") { assertOnly(body, new Set()); state.reset(); return send(res, 200, { ok: true, data: await cohortStatus() }); }
        const input = request(body);
        if (url.pathname === "/api/resolve") { assertOnly(body, requestFields); return send(res, 200, { ok: true, data: resolveFounderLabText(input) }); }
        if (url.pathname === "/api/evaluate") { assertOnly(body, new Set([...requestFields, "corrections"])); return send(res, 200, { ok: true, data: await runFounderDecisionLab({ request: input, ...(body.corrections ? { corrections: body.corrections } : {}), ...(activeHandoff() ? { cohortHandoff: activeHandoff() } : {}) }) }); }
        if (url.pathname === "/api/replay") { assertOnly(body, new Set([...requestFields, "corrections", "result"])); return send(res, 200, { ok: true, data: await replayFounderDecisionLab(input, body.result, { ...(body.corrections ? { corrections: body.corrections } : {}), ...(activeHandoff() ? { cohortHandoff: activeHandoff() } : {}) }) }); }
      }
      return send(res, 404, { ok: false, code: "NOT_FOUND" });
    } catch (error) { return send(res, 400, { ok: false, code: "SAFE_REJECTION", message: error.message, stateUnchanged: true }); }
  });
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}` })); });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startPhase3CFounderLabServer().then(({ url }) => process.stdout.write(`Backyrd Founder Decision Lab: ${url}\nNur lokal · Cohort-Zustand außerhalb von Git · keine Production-Autorität.\n`)).catch((error) => { process.stderr.write(`Founder-Lab-Preflight fehlgeschlagen: ${error.code === "EADDRINUSE" ? "Port 3223 ist bereits belegt." : error.message}\n`); process.exit(1); });
