import { createClient } from "@supabase/supabase-js";

if (process.env.BACKYRD_GATE7_PRODUCTION_READS !== "AUTHORIZED_BOUNDED_READS") {
  throw new Error("explicit bounded Production read acknowledgement required");
}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const values = {};
const percentile = (rows, p) => [...rows].sort((a, b) => a - b)[Math.min(rows.length - 1, Math.ceil(rows.length * p) - 1)];
const summary = (rows) => ({ count: rows.length, p50Ms: Math.round(percentile(rows, 0.5)), p95Ms: Math.round(percentile(rows, 0.95)), maxMs: Math.round(Math.max(...rows)) });
async function timed(fn) { const started = performance.now(); const result = await fn(); return { ms: performance.now() - started, result }; }
async function series(name, count, fn) { const rows = []; for (let index = 0; index < count; index += 1) rows.push((await timed(fn)).ms); values[name] = summary(rows); }
async function burst(name, count, fn) {
  const started = performance.now();
  const rows = await Promise.all(Array.from({ length: count }, (_, index) => timed(() => fn(index))));
  values[name] = { ...summary(rows.map((row) => row.ms)), wallMs: Math.round(performance.now() - started), failures: rows.filter((row) => row.result?.error).length };
}

const catalog = await client.rpc("distribution_trust_spot_catalog_v1", { p_query: null, p_city: "Basel", p_limit: 160, p_surface: "discovery" });
if (catalog.error || !catalog.data?.length) throw catalog.error ?? new Error("catalog_empty");
const spotId = catalog.data[0].id;
await series("home_catalog", 20, () => client.rpc("distribution_trust_spot_catalog_v1", { p_query: null, p_city: "Basel", p_limit: 160, p_surface: "discovery" }));
await series("spot_search", 20, () => client.rpc("distribution_trust_spot_catalog_v1", { p_query: "cafe", p_city: "Basel", p_limit: 50, p_surface: "search" }));
await series("spot_detail", 20, () => client.rpc("backyrd_web_spot_detail_v1", { p_spot_id: spotId }));
await series("map", 20, () => client.rpc("distribution_trust_spot_catalog_v1", { p_query: null, p_city: "Basel", p_limit: 200, p_surface: "discovery" }));
await series("web_home", 15, async () => { const response = await fetch("https://www.backyrd.ch", { redirect: "follow" }); return { error: response.ok ? null : `http_${response.status}` }; });
await burst("mixed_10_concurrent", 10, (index) => client.rpc("distribution_trust_spot_catalog_v1", { p_query: index % 2 ? "bar" : null, p_city: "Basel", p_limit: 160, p_surface: index % 2 ? "search" : "discovery" }));
await burst("mixed_25_concurrent", 25, (index) => client.rpc("distribution_trust_spot_catalog_v1", { p_query: index % 2 ? "restaurant" : null, p_city: "Basel", p_limit: 160, p_surface: index % 2 ? "search" : "discovery" }));
process.stdout.write(`${JSON.stringify({ measuredAt: new Date().toISOString(), spotId, values }, null, 2)}\n`);
