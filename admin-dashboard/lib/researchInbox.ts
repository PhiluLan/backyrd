import type { ResearchResult } from "./nuknukResearchDraft";

export const FOLLOWUP_KIND = "ADMIN_RESEARCH_FOLLOWUP";
export type InboxAnswer = { claimId?: string; knowledgeState?: string; value?: unknown; visibility?: string };
export type InboxDecision = { fingerprint: string; claimId: string | null; actorId: string; at: string; outcome: "KEPT_PROFILE" | "LEFT_UNKNOWN" };
export type InboxRow = {
  id: string; actor_id: string; spot_id: string; spot_name: string; status: string;
  created_at: string; updated_at: string; reviewed_at: string | null;
  export_document: { kind?: string; taskDecisions?: InboxDecision[]; pipeline?: { phase?: string; report?: { review?: Array<{attributeKey:string;reason?:string;explanation?:string}>; unresolved?: Array<{attributeKey:string;reason:string}>;errors?:string[] } } };
  result_document?: unknown;
};
export type InboxTask = ResearchResult & { fingerprint: string; jobIds: string[]; claimId: string | null; currentValue?: unknown; kind: "REVIEW" | "MISSING" };
export type InboxSpot = { spotId: string; name: string; updatedAt: string; tasks: InboxTask[]; running: boolean; failed: boolean; unavailable?: boolean; reports: number };
export const stableInboxValue = (value: unknown): string => JSON.stringify(value, (_key,item:unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
export const taskFingerprint = (result: ResearchResult) => stableInboxValue({attributeKey:result.attributeKey,value:result.value ?? null});

export function resultsFromInboxRow(row: InboxRow): ResearchResult[] {
  const doc = row.result_document as { results?: ResearchResult[]; research?: {spots?: Array<{spotId:string;claims?: Array<{attributeKey:string;value:unknown;source?:{url:string;evidence:string;observedAt?:string};supportingSources?:Array<{url:string;evidence:string;observedAt?:string}>}>;unresolved?:Array<{attributeKey:string;reason:string}>}>} } | null;
  if(row.export_document.kind === FOLLOWUP_KIND || row.export_document.kind === "NUKNUK_RESEARCH_DRAFT") return doc?.results ?? [];
  const spot=doc?.research?.spots?.find(spot=>spot.spotId===row.spot_id);
  const pipeline=row.export_document.pipeline;
  const reviewed=pipeline?.report?.review;
  const claims=(spot?.claims ?? []).filter(claim=>!pipeline || reviewed?.some(item=>item.attributeKey===claim.attributeKey));
  return [...claims.map(claim=>({attributeKey:claim.attributeKey,status:"REQUIRES_REVIEW",value:claim.value,
    reason:reviewed?.find(item=>item.attributeKey===claim.attributeKey)?.explanation ?? reviewed?.find(item=>item.attributeKey===claim.attributeKey)?.reason,
    citations:[claim.source,...(claim.supportingSources ?? [])].filter((source):source is NonNullable<typeof source>=>!!source)})),
    ...(pipeline?.report?.unresolved ?? spot?.unresolved ?? []).filter(gap=>gap.reason!=="Dieses Grundfeld wurde nicht recherchiert oder nicht mit einem Ergebnis geliefert.").map(gap=>({...gap,status:"UNKNOWN"}))];
}

/** Group identical proposals; keep distinct older questions and compare against today's profile. */
export function buildInboxSpot(rows: InboxRow[], answers: Record<string,InboxAnswer>, covered:(result:ResearchResult)=>boolean): InboxSpot {
  const sorted=[...rows].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const tasks=new Map<string,InboxTask>();
  const receipts=sorted.flatMap(row=>row.export_document.taskDecisions ?? []);
  const archivedProposals=new Map<string,string>();
  for(const row of sorted.filter(row=>row.reviewed_at))for(const result of resultsFromInboxRow(row)) {
    if(result.value===undefined)continue;
    const fingerprint=taskFingerprint(result);
    if(row.created_at>(archivedProposals.get(fingerprint) ?? ""))archivedProposals.set(fingerprint,row.created_at);
  }
  for(const row of sorted) {
    if(row.reviewed_at) continue;
    for(const result of resultsFromInboxRow(row)) {
      const answer=answers[result.attributeKey];
      const publicAnswer=answer?.visibility === "PUBLIC" ? answer : undefined;
      const missing=result.value===undefined;
      const questionsExisting=missing && /(?:bisherige?.*(?:plan|zeit)|widerspr|abweich|(?:vorhandene|bisherige).*(?:nicht.*bestätigt|falsch)|kein(?:en|e)? plausibl|nicht als aktueller)/i.test(result.reason ?? "");
      if(missing && !questionsExisting && publicAnswer && publicAnswer.knowledgeState && publicAnswer.knowledgeState!=="UNKNOWN") continue;
      if(!missing && covered(result)) continue;
      const fingerprint=taskFingerprint(result),claimId=publicAnswer?.claimId ?? null;
      if(row.created_at<=(archivedProposals.get(fingerprint) ?? ""))continue;
      if(receipts.some(receipt=>receipt.fingerprint===fingerprint && receipt.claimId===claimId)) continue;
      const existing=tasks.get(fingerprint);
      if(existing) { if(!existing.jobIds.includes(row.id))existing.jobIds.push(row.id);continue; }
      tasks.set(fingerprint,{...result,fingerprint,jobIds:[row.id],claimId,currentValue:publicAnswer?.value,kind:missing && !questionsExisting?"MISSING":"REVIEW"});
    }
  }
  const latest=sorted[0];
  const execution=sorted.find(row=>![FOLLOWUP_KIND,"NUKNUK_RESEARCH_DRAFT"].includes(row.export_document.kind ?? ""));
  return {spotId:latest.spot_id,name:latest.spot_name,updatedAt:sorted.reduce((latest,row)=>row.updated_at>latest?row.updated_at:latest,latest.updated_at),tasks:[...tasks.values()],reports:rows.length,
    running:rows.some(row=>["QUEUED","RUNNING"].includes(row.status)),
    failed:!!execution && !execution.reviewed_at && (execution.status === "FAILED" || !!execution.export_document.pipeline?.report?.errors?.length)};
}
