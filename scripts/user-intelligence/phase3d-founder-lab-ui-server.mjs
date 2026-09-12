import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FounderLabService } from "./phase3d-founder-lab-service.mjs";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "phase3d-founder-lab-ui");
const defaultStatePath = path.join(root, ".local", "user-intelligence-phase3d-founder-ui-state.json");
const staticFiles = Object.freeze({ "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/styles.css": ["styles.css", "text/css; charset=utf-8"] });
const securityHeaders = Object.freeze({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" });

const json = (res, status, value) => { res.writeHead(status, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8" }); res.end(`${JSON.stringify(value)}\n`); };
const readJson = (req) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on("data", (chunk) => { size += chunk.length; if (size > 64 * 1024) { reject(Object.assign(new Error("Anfrage ist zu groß."), { code: "REQUEST_TOO_LARGE" })); req.destroy(); } else chunks.push(chunk); });
  req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(Object.assign(new Error("Die Anfrage enthält kein gültiges JSON."), { code: "INVALID_JSON" })); } }); req.on("error", reject);
});

export function startFounderLabUiServer({ port = 3221, host = "127.0.0.1", statePath = defaultStatePath, now } = {}) {
  if (host !== "127.0.0.1") throw new Error("founder_lab_must_bind_to_127.0.0.1");
  const service = new FounderLabService({ statePath, now }); service.ensure();
  const server = http.createServer(async (req, res) => {
    const activePort = server.address()?.port ?? port; const allowedHosts = new Set([`127.0.0.1:${activePort}`, `localhost:${activePort}`]);
    if (!allowedHosts.has(req.headers.host ?? "")) return json(res, 403, { ok: false, code: "HOST_REJECTED", message: "Das Founder Lab akzeptiert ausschließlich lokale Loopback-Anfragen." });
    const origin = req.headers.origin; if (req.method !== "GET" && origin && !new Set([`http://127.0.0.1:${activePort}`, `http://localhost:${activePort}`]).has(origin)) return json(res, 403, { ok: false, code: "ORIGIN_REJECTED", message: "Externe Browser-Ursprünge sind nicht erlaubt." });
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${activePort}`);
    try {
      if (req.method === "GET" && staticFiles[url.pathname]) { const [file, type] = staticFiles[url.pathname]; const body = fs.readFileSync(path.join(assets, file)); res.writeHead(200, { ...securityHeaders, "Content-Type": type }); return res.end(body); }
      if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, localOnly: true, productionAuthorized: false, host: "127.0.0.1" });
      if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, { ok: true, data: service.view() });
      if (req.method === "GET" && url.pathname === "/api/privacy-export") { const body = `${JSON.stringify(service.privacyExport(), null, 2)}\n`; res.writeHead(200, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=founder-lab-privacy-export.json" }); return res.end(body); }
      if (req.method === "POST") {
        const body = await readJson(req); let data;
        if (url.pathname === "/api/users") data = service.createUser(body.label);
        else if (url.pathname === "/api/select-user") data = service.selectUser(body.userId);
        else if (url.pathname === "/api/journey") data = service.startJourney(body);
        else if (url.pathname === "/api/actions") data = service.applyAction(body);
        else if (url.pathname === "/api/rebuild") data = service.rebuild(body.mode);
        else if (url.pathname === "/api/lifecycle") data = service.lifecycle(body.action, body.confirmed);
        else return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Unbekannte lokale Lab-Funktion." });
        return json(res, 200, { ok: true, data });
      }
      return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Diese lokale Lab-Seite existiert nicht." });
    } catch (error) {
      return json(res, 400, { ok: false, code: error.code ?? "LAB_REQUEST_REJECTED", message: error.message || "Die Handlung wurde sicher abgewiesen.", stateUnchanged: true, nextAction: error.nextAction ?? "Eingabe prüfen oder einen neuen Testnutzer anlegen." });
    }
  });
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}`, statePath, service })); });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const readArg = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
  if (process.argv.includes("--host")) { process.stderr.write("Das Founder Lab darf nur an 127.0.0.1 gebunden werden.\n"); process.exit(1); }
  const port = Number(readArg("--port") ?? 3221); const statePath = readArg("--state") ? path.resolve(readArg("--state")) : defaultStatePath; const localRoot = path.join(root, ".local");
  if (!Number.isInteger(port) || port < 0 || port > 65535) { process.stderr.write("Ungültiger lokaler Port.\n"); process.exit(1); }
  if (statePath !== localRoot && !statePath.startsWith(`${localRoot}${path.sep}`)) { process.stderr.write("Der lokale Lab-Store muss unter .local/ liegen.\n"); process.exit(1); }
  startFounderLabUiServer({ port, statePath }).then(({ url }) => {
    process.stdout.write(`\nBackyrd Founder User Lab ist bereit.\n${url}\n\nNur lokal · keine Production-Verbindung · keine Migration · kein Ranking.\n`);
  }).catch((error) => { process.stderr.write(`Founder Lab konnte nicht starten: ${error.message}\n`); process.exit(1); });
}
