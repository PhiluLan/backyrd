export function createSpotResearchRepository(service) {
  const rpc = async (name, args) => {
    const { data, error } = await service.rpc(name, args);
    if (error) throw new Error(error.message || name);
    return data;
  };
  return Object.freeze({
    claim: (runnerId) => rpc("backyrd_claim_spot_research_job_v1", { p_runner_id: runnerId, p_lease_seconds: 60 }),
    beginAttempt: ({ jobId, leaseToken }) => rpc("backyrd_begin_spot_research_attempt_v1", { p_job_id: jobId, p_lease_token: leaseToken }),
    recordDisposition: ({ jobId, leaseToken }, response) => rpc("backyrd_record_spot_research_disposition_v1", { p_job_id: jobId, p_lease_token: leaseToken, p_provider_metadata: { providerResponseId: response.providerResponseId, providerStatus: response.providerStatus, inputTokens: response.usage?.inputTokens ?? 0, outputTokens: response.usage?.outputTokens ?? 0, totalTokens: response.usage?.totalTokens ?? 0, webSearchCalls: response.webSearchCalls ?? 0, transportLatencyMs: response.transportLatencyMs ?? 0, incompleteReason: response.incompleteReason ?? null, errorCode: response.errorCode ?? null } }),
    release: ({ jobId, leaseToken }, status, delaySeconds) => rpc("backyrd_release_spot_research_job_v1", { p_job_id: jobId, p_lease_token: leaseToken, p_provider_status: status, p_delay_seconds: delaySeconds }),
    fail: ({ jobId, leaseToken }, retryable, failureCode) => rpc("backyrd_fail_spot_research_job_v1", { p_job_id: jobId, p_lease_token: leaseToken, p_retryable: retryable, p_failure_code: failureCode }),
    finalize: ({ jobId, leaseToken }, proposals, metadata) => rpc("backyrd_finalize_spot_research_job_v1", { p_job_id: jobId, p_lease_token: leaseToken, p_proposals: proposals, p_provider_metadata: metadata }),
    async loadContext(claim) {
      const [spotResult, catalogResult, factsResult] = await Promise.all([
        service.from("spots").select("id,name,city,website").eq("id", claim.spotId).single(),
        service.from("backyrd_spot_fact_catalog_v1").select("field_key,value_kind,allowed_values,engine_role"),
        service.from("backyrd_spot_accepted_facts_v1").select("field_key,value,status").eq("spot_id", claim.spotId).in("status", ["ACTIVE", "UNKNOWN", "STALE"])
      ]);
      if (spotResult.error || !spotResult.data) throw new Error("research_source_load_failed");
      if (catalogResult.error || factsResult.error) throw new Error("research_source_load_failed");
      const website = claim.sourceScope?.officialWebsite;
      return {
        spot: { ...spotResult.data, website },
        catalog: catalogResult.data ?? [],
        acceptedFacts: (factsResult.data ?? []).map((row) => ({ fieldKey: row.field_key, value: row.value, status: row.status }))
      };
    }
  });
}
