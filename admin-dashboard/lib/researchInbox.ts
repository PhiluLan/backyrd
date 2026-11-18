import type { ResearchResult } from "./nuknukResearchDraft";

// Research reports present when the verified review inbox took over remain
// available to audit, but no longer take up space in the operational queue.
export const RESEARCH_INBOX_CUTOVER = "2026-11-17T16:49:31.000Z";
export const FOLLOWUP_KIND = "ADMIN_RESEARCH_FOLLOWUP";
export type InboxAnswer = { claimId?: string; knowledgeState?: string; value?: unknown; visibility?: string };
export type InboxDecision = { fingerprint: string; claimId: string | null; actorId: string; at: string; outcome: "KEPT_PROFILE" | "LEFT_UNKNOWN" };
export type ResearchProviderUsage = {
  model: string; inputTokens: number; cachedInputTokens: number | null; outputTokens: number;
  webSearchCalls: number; estimatedUsd: number | null; sourceCheckedProposals: number | null;
};
export type InboxRow = {
  id: string; actor_id: string; spot_id: string; spot_name: string; status: string;
  created_at: string; updated_at: string; reviewed_at: string | null; provider_response_id?: string | null; lease_expires_at?: string | null;
  export_document: { kind?: string; providerUsage?: ResearchProviderUsage; taskDecisions?: InboxDecision[]; pipeline?: { phase?: string; report?: { stored?: string[]; review?: Array<{attributeKey:string;reason?:string;explanation?:string}>; unresolved?: Array<{attributeKey:string;reason:string}>;errors?:string[] } } };
  result_document?: unknown;
};
export type InboxTask = ResearchResult & { fingerprint: string; jobIds: string[]; claimId: string | null; currentValue?: unknown };
export type StoredResearchField = { attributeKey: string; value: unknown };
export type InboxSpot = { spotId: string; name: string; latestReportAt: string; updatedAt: string; tasks: InboxTask[]; researchStatus: "QUEUED" | "RUNNING" | null; failed: boolean; unavailable?: boolean; reports: number };
export const stableInboxValue = (value: unknown): string => JSON.stringify(value, (_key,item:unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
export const taskFingerprint = (result: ResearchResult) => stableInboxValue({attributeKey:result.attributeKey,value:result.value ?? null});

function preparing(row: InboxRow): boolean {
  return row.export_document.kind === "AUTOMATIC_RESEARCH_REVIEW" &&
    row.export_document.pipeline?.phase !== "FINISHED" &&
    !!row.lease_expires_at && Date.parse(row.lease_expires_at) > Date.now();
}

function hasProposal(result: ResearchResult): boolean {
  return result.status === "REQUIRES_REVIEW" && result.value !== undefined && result.value !== null &&
    (typeof result.value !== "string" || !!result.value.trim());
}

export function resultsFromInboxRow(row: InboxRow): ResearchResult[] {
  if (preparing(row)) return [];
  const doc = row.result_document as { results?: ResearchResult[]; research?: {spots?: Array<{spotId:string;claims?: Array<{attributeKey:string;value:unknown;source?:{url:string;evidence:string;observedAt?:string};supportingSources?:Array<{url:string;evidence:string;observedAt?:string}>}>}>} } | null;
  if(row.export_document.kind === FOLLOWUP_KIND || row.export_document.kind === "NUKNUK_RESEARCH_DRAFT") return (doc?.results ?? []).filter(hasProposal);
  const spot=doc?.research?.spots?.find(spot=>spot.spotId===row.spot_id);
  const pipeline=row.export_document.kind === "AUTOMATIC_RESEARCH_REVIEW" && row.export_document.pipeline?.phase !== "FINISHED"
    ? undefined : row.export_document.pipeline;
  const reviewed=pipeline?.report?.review;
  const claims=(spot?.claims ?? []).filter(claim=>!pipeline || reviewed?.some(item=>item.attributeKey===claim.attributeKey));
  return claims.map(claim=>({attributeKey:claim.attributeKey,status:"REQUIRES_REVIEW",value:claim.value,
    reason:reviewed?.find(item=>item.attributeKey===claim.attributeKey)?.explanation ?? reviewed?.find(item=>item.attributeKey===claim.attributeKey)?.reason,
    citations:[claim.source,...(claim.supportingSources ?? [])].filter((source):source is NonNullable<typeof source>=>!!source)})).filter(hasProposal);
}

/** Group identical proposals; keep distinct older proposals and compare against today's profile. */
export function buildInboxSpot(rows: InboxRow[], answers: Record<string,InboxAnswer>, covered:(result:ResearchResult)=>boolean): InboxSpot {
  const sorted=[...rows].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const tasks=new Map<string,InboxTask>();
  const receipts=sorted.flatMap(row=>row.export_document.taskDecisions ?? []);
  const archivedProposals=new Map<string,string>();
  for(const row of sorted.filter(row=>row.reviewed_at))for(const result of resultsFromInboxRow(row)) {
    const fingerprint=taskFingerprint(result);
    if(row.created_at>(archivedProposals.get(fingerprint) ?? ""))archivedProposals.set(fingerprint,row.created_at);
  }
  for(const row of sorted) {
    if(row.reviewed_at) continue;
    for(const result of resultsFromInboxRow(row)) {
      const answer=answers[result.attributeKey];
      const publicAnswer=answer?.visibility === "PUBLIC" ? answer : undefined;
      if(covered(result)) continue;
      const fingerprint=taskFingerprint(result),claimId=publicAnswer?.claimId ?? null;
      if(row.created_at<=(archivedProposals.get(fingerprint) ?? ""))continue;
      if(receipts.some(receipt=>receipt.fingerprint===fingerprint && receipt.claimId===claimId)) continue;
      const existing=tasks.get(fingerprint);
      if(existing) { if(!existing.jobIds.includes(row.id))existing.jobIds.push(row.id);continue; }
      tasks.set(fingerprint,{...result,fingerprint,jobIds:[row.id],claimId,currentValue:publicAnswer?.value});
    }
  }
  const latest=sorted[0];
  const execution=sorted.find(row=>![FOLLOWUP_KIND,"NUKNUK_RESEARCH_DRAFT"].includes(row.export_document.kind ?? ""));
  const activeJob=sorted.find(row=>row.status==="QUEUED" || row.status==="RUNNING" || preparing(row));
  const researchStatus=activeJob
    ? activeJob.status==="RUNNING" || activeJob.provider_response_id ? "RUNNING" : "QUEUED"
    : null;
  return {spotId:latest.spot_id,name:latest.spot_name,latestReportAt:latest.created_at,updatedAt:sorted.reduce((latest,row)=>row.updated_at>latest?row.updated_at:latest,latest.updated_at),tasks:[...tasks.values()],reports:rows.length,
    researchStatus,
    failed:!!execution && !execution.reviewed_at && (execution.status === "FAILED" || !!execution.export_document.pipeline?.report?.errors?.length)};
}
