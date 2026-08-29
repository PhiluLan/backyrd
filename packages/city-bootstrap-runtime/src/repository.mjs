export function createCityBootstrapRepository({ baseUrl, serviceKey, fetchImpl = globalThis.fetch }) {
  if (!/^https:\/\//.test(baseUrl ?? "") || !serviceKey) throw new Error("city_bootstrap_repository_config_invalid");
  const root = baseUrl.replace(/\/$/, "");
  async function request(path, init = {}) {
    const response = await fetchImpl(`${root}/rest/v1/${path}`, { ...init, headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", ...(init.headers ?? {}) } });
    if (!response.ok) throw new Error(`city_bootstrap_repository_${response.status}:${(await response.text()).slice(0, 300)}`);
    if (response.status === 204) return null; return response.json();
  }
  const selectAll = async (table, columns, query = "") => {
    const rows = []; for (let offset = 0; ; offset += 1000) { const page = await request(`${table}?select=${encodeURIComponent(columns)}${query}&limit=1000&offset=${offset}`); rows.push(...page); if (page.length < 1000) return rows; }
  };
  const insert = (table, rows, resolution = "merge-duplicates", conflict = null) => request(`${table}${conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : ""}`, { method: "POST", headers: { prefer: `return=representation,resolution=${resolution}` }, body: JSON.stringify(rows) });
  return Object.freeze({
    loadExistingSpots: (city) => selectAll("spots", "id,name,address,lat,lng,website,phone,google_place_id,status,data_origin,category_id", `&city=eq.${encodeURIComponent(city)}&status=neq.archived`),
    loadCategories: () => selectAll("categories", "id,name"),
    loadRun: async (runKey) => (await selectAll("backyrd_city_bootstrap_runs_v1", "*", `&run_key=eq.${encodeURIComponent(runKey)}`))[0] ?? null,
    createRun: async (run) => (await insert("backyrd_city_bootstrap_runs_v1", run, "ignore-duplicates"))[0],
    persistCandidates: (rows) => insert("backyrd_city_bootstrap_candidates_v1", rows, "merge-duplicates", "run_id,identity_key"),
    persistEvidence: (rows) => rows.length ? insert("backyrd_city_bootstrap_evidence_v1", rows, "ignore-duplicates", "candidate_id,source_family,source_identity,evidence_fingerprint") : Promise.resolve([]),
    enqueueJobs: (rows) => rows.length ? insert("backyrd_city_bootstrap_jobs_v1", rows, "ignore-duplicates", "run_id,idempotency_key") : Promise.resolve([]),
    loadPublishableCandidates: async (runId, limit) => (await selectAll("backyrd_city_bootstrap_candidates_v1", "id,identity_key,lifecycle_state,enrichment_priority", `&run_id=eq.${runId}&lifecycle_state=eq.PRODUCT_ELIGIBLE&order=enrichment_priority.desc,identity_key.asc`)).slice(0,Math.max(1,Math.min(Number(limit),100))),
    loadCandidatesByState: async (runId, state, limit) => (await selectAll("backyrd_city_bootstrap_candidates_v1", "id,identity_key,lifecycle_state,enrichment_priority", `&run_id=eq.${runId}&lifecycle_state=eq.${encodeURIComponent(state)}&order=enrichment_priority.desc,identity_key.asc`)).slice(0,Math.max(1,Math.min(Number(limit),100))),
    status: async (runId) => {
      const [runs, candidates, jobs, reviews, costs] = await Promise.all([
        selectAll("backyrd_city_bootstrap_runs_v1", "*", `&id=eq.${runId}`), selectAll("backyrd_city_bootstrap_candidates_v1", "lifecycle_state,relevance_state,identity_state", `&run_id=eq.${runId}`), selectAll("backyrd_city_bootstrap_jobs_v1", "stage,state,failure_class,failure_code", `&run_id=eq.${runId}`), selectAll("backyrd_city_bootstrap_reviews_v1", "reason,priority,state", `&run_id=eq.${runId}`), selectAll("backyrd_city_bootstrap_cost_events_v1", "provider,stage,request_count,input_units,output_units,measured_cost_microunits,currency", `&run_id=eq.${runId}`)
      ]);
      return { run: runs[0] ?? null, candidates, jobs, reviews, costs };
    },
    rpc: (name, args) => request(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) })
  });
}
