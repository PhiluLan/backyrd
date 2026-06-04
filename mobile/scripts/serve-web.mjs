import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist");

const argPort = Number(process.argv[2]);
const port = Number.isFinite(argPort) && argPort > 0 ? argPort : 4173;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function safeResolve(requestUrl) {
  const pathname = decodeURIComponent((requestUrl || "/").split("?")[0]);
  const normalized = path.normalize(pathname).replace(/^\.+/, "");
  return path.join(distDir, normalized);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = contentTypes[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
  });

  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (!fs.existsSync(distDir)) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("dist/ fehlt. Bitte zuerst: npx expo export --platform web");
    return;
  }

  const requested = safeResolve(req.url || "/");

  if (requested.startsWith(distDir) && fs.existsSync(requested) && fs.statSync(requested).isFile()) {
    sendFile(res, requested);
    return;
  }

  // SPA fallback for deep links.
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    sendFile(res, indexPath);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Backyrd Web läuft auf http://localhost:${port}`);
});
