import "server-only";
import { randomUUID } from "node:crypto";
import {
  AUTHORING_STEPS,
  AUTHORING_FIELDS,
  canonicalJson,
  createWorldResearchBatch,
  parseWorldResearchBatch,
  sha256,
  type WorldResearchBatchDocument,
  type ReviewedResearchClaim,
} from "@backyrd/world-knowledge-core";
import { fetchPublicSource } from "../../../packages/spot-research-runtime/src/nuknuk-sources.mjs";
import {
  proveSafeResearchProperty,
  SAFE_RESEARCH_KEYS,
  SAFE_RESEARCH_POLICY,
} from "../../../packages/spot-research-runtime/src/research-safe-properties.mjs";
import {
  collectResearchEvidence,
  parseResearchAssessments,
  proveResearchEvidence,
  RESEARCH_EVIDENCE_POLICY,
  type ResearchAssessment,
} from "../../../packages/spot-research-runtime/src/research-evidence-policy.mjs";
import { ResearchSaveError } from "../researchSaveFeedback";
import type { WorldResearchDetail } from "./worldResearchExport";

export const BASIC_RESEARCH_KEYS = AUTHORING_STEPS.find(
  (step) => step.id === "basics",
)!.attributeKeys;
export const COMPLETE_RESEARCH_KEYS = AUTHORING_FIELDS.map(
  (field) => field.attributeKey,
).filter((key) => key !== "state.current");
type AssessedDocument = WorldResearchBatchDocument & {
  research: WorldResearchBatchDocument["research"] & {
    assessments?: ResearchAssessment[];
  };
};
export type PipelineDecision = {
  attributeKey: string;
  outcome: "AUTO_READY" | "REVIEW" | "UNCHANGED";
  reason: string;
  uncertainty?: string;
  explanation?: string;
  sourceHash?: string;
  sourceUrl?: string;
};
export type PipelineReport = {
  policy: string;
  jobId: string;
  spotId: string;
  name: string;
  state: "COMPLETE" | "REVIEW_REQUIRED" | "SAVED_UNVERIFIED" | "FAILED";
  saveState: "STORED_VERIFIED" | "NOT_WRITTEN" | "SAVED_UNVERIFIED";
  stored: string[];
  unchanged: string[];
  review: PipelineDecision[];
  unresolved: Array<{ attributeKey: string; reason: string }>;
  decisions: PipelineDecision[];
  sourceFailures: Array<{ url: string; reason: string }>;
  errors: string[];
  completedAt: string;
  manifestHash?: string;
};
export type PipelineMetadata = {
  policy: string;
  inputHash: string;
  phase: "RECEIVED" | "PROVED" | "FINISHED";
  accepted: ReviewedResearchClaim[];
  decisions: PipelineDecision[];
  report?: PipelineReport;
};
export type PipelineJob = {
  id: string;
  actorId: string;
  spotId: string;
  document: WorldResearchBatchDocument;
  metadata: PipelineMetadata;
};
export interface SafeImportRepository {
  readSpot(spotId: string): Promise<WorldResearchDetail>;
  createOrRead(job: PipelineJob): Promise<PipelineJob>;
  acquire(jobId: string, leaseToken: string): Promise<boolean>;
  checkpoint(job: PipelineJob, leaseToken: string): Promise<void>;
  importClaims(
    spotId: string,
    batchId: string,
    manifestHash: string,
    claims: ReviewedResearchClaim[],
  ): Promise<void>;
  rebuild(
    spotId: string,
    idempotencyKey: string,
  ): Promise<{ manifestHash: string; worldSnapshot?: unknown }>;
  finish(
    job: PipelineJob,
    leaseToken: string,
    document: WorldResearchBatchDocument,
  ): Promise<void>;
}
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function currentDocument(
  document: WorldResearchBatchDocument,
  detail: WorldResearchDetail,
): WorldResearchBatchDocument {
  const current = createWorldResearchBatch({
    batchId: document.batch.batchId,
    createdAt: document.batch.createdAt,
    spots: [
      {
        spotId: detail.spotId,
        name: detail.name,
        locality:
          typeof detail.answers?.["location.locality"]?.value === "string"
            ? (detail.answers["location.locality"].value as string)
            : null,
        manifestHash: detail.manifest!.manifestHash!,
        existingValues: Object.fromEntries(
          Object.entries(detail.answers ?? {}).filter(
            (
              entry,
            ): entry is [
              string,
              {
                claimId: string;
                knowledgeState: string;
                value: unknown;
                visibility: string;
              },
            ] =>
              typeof entry[1].claimId === "string" &&
              typeof entry[1].knowledgeState === "string" &&
              entry[1].visibility === "PUBLIC",
          ),
        ),
      },
    ],
  });
  return {
    ...current,
    research: {
      ...current.research,
      ...((document as AssessedDocument).research.assessments
        ? { assessments: (document as AssessedDocument).research.assessments }
        : {}),
      spots: document.research.spots,
    },
  };
}
export async function processSafeResearchDocument(
  input: unknown,
  {
    actorId,
    repository,
    fetchPage = fetchPublicSource,
    now = () => Date.now(),
    readPdf,
  }: {
    actorId: string;
    repository: SafeImportRepository;
    fetchPage?: typeof fetchPublicSource;
    now?: () => number;
    readPdf?: (body: Uint8Array) => Promise<string>;
  },
): Promise<{ report: PipelineReport; document: WorldResearchBatchDocument }> {
  const parsed = parseWorldResearchBatch(input);
  if (parsed.batch.spots.length !== 1)
    throw new Error("research_pipeline_one_spot_required");
  const exported = parsed.batch.spots[0],
    research = parsed.research.spots[0],
    claims = parsed.validatedClaims.get(exported.spotId) ?? [];
  const rawResearch =
    input && typeof input === "object" && "research" in input
      ? (input as { research?: { assessments?: unknown } }).research
      : undefined;
  const assessments = parseResearchAssessments(
    rawResearch?.assessments,
    claims,
  );
  const policy = assessments ? RESEARCH_EVIDENCE_POLICY : SAFE_RESEARCH_POLICY;
  if (
    !assessments &&
    [...claims, ...research.unresolved].some(
      (item) => !BASIC_RESEARCH_KEYS.includes(item.attributeKey),
    )
  )
    throw new Error("research_pipeline_basics_only");
  // Do not persist the parser's runtime Map or unvalidated extra client members.
  const document: AssessedDocument = {
    contractVersion: parsed.contractVersion,
    purpose: parsed.purpose,
    batch: parsed.batch,
    fieldCatalog: parsed.fieldCatalog,
    research: {
      instructions: parsed.research.instructions,
      ...(assessments ? { assessments } : {}),
      spots: [
        { spotId: exported.spotId, claims, unresolved: research.unresolved },
      ],
    },
    exportHash: parsed.exportHash,
  };
  const detail = await repository.readSpot(exported.spotId);
  if (
    detail.spotId !== exported.spotId ||
    detail.name !== exported.name ||
    detail.actor?.role !== "ADMIN" ||
    detail.status !== "approved" ||
    !detail.manifest?.manifestHash
  )
    throw new Error("research_pipeline_identity_changed");
  let job = await repository.createOrRead({
    id: document.batch.batchId,
    actorId,
    spotId: exported.spotId,
    document,
    metadata: {
      policy,
      inputHash: sha256(document),
      phase: "RECEIVED",
      accepted: [],
      decisions: [],
    },
  });
  if (
    job.actorId !== actorId ||
    job.spotId !== exported.spotId ||
    job.metadata.inputHash !== sha256(document) ||
    job.metadata.policy !== policy
  )
    throw new Error("research_pipeline_job_binding_invalid");
  if (
    job.metadata.phase === "FINISHED" &&
    job.metadata.report &&
    !job.metadata.report.errors.length
  )
    return { report: job.metadata.report, document: job.document };
  const lease = randomUUID();
  if (!(await repository.acquire(job.id, lease)))
    throw new Error("research_pipeline_already_processing");
  const report: PipelineReport = {
    policy,
    jobId: job.id,
    spotId: exported.spotId,
    name: exported.name,
    state: "REVIEW_REQUIRED",
    saveState: "NOT_WRITTEN",
    stored: [],
    unchanged: [],
    review: [],
    unresolved: [...research.unresolved],
    decisions: [],
    sourceFailures: [],
    errors: [],
    completedAt: new Date(now()).toISOString(),
  };
  let latest = detail,
    writeAttempted = false;
  try {
    if (job.metadata.phase === "RECEIVED") {
      if (detail.manifest.manifestHash !== exported.manifestHash)
        throw new Error("research_pipeline_manifest_drift");
      let page: Awaited<ReturnType<typeof fetchPublicSource>> | null = null;
      const website = detail.answers?.["contact.website"];
      if (
        website?.knowledgeState === "KNOWN_VALUE" &&
        website.visibility === "PUBLIC" &&
        typeof website.value === "string" &&
        (assessments ||
          claims.some(
            (claim) =>
              SAFE_RESEARCH_KEYS.includes(claim.attributeKey) &&
              !detail.answers?.[claim.attributeKey],
          ))
      ) {
        // Fetch only the server-read canonical URL, never a client-supplied source.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            page = await fetchPage(website.value, {
              maxBytes: 2000000,
              maxRedirects: 2,
              timeoutMs: 10000,
              allowedWebsite: website.value,
            });
            break;
          } catch (cause) {
            if (
              attempt === 0 &&
              /timeout|socket|ECONNRESET|EAI_AGAIN|source_http_(?:408|429|5\d\d)/iu.test(
                cause instanceof Error ? cause.message : "",
              )
            )
              continue;
            report.sourceFailures.push({
              url: website.value,
              reason: "OFFICIAL_SOURCE_UNAVAILABLE",
            });
            break;
          }
        }
      }
      const evidence =
        assessments && page && typeof website?.value === "string"
          ? await collectResearchEvidence({
              page,
              website: website.value,
              name: detail.name,
              locality: String(
                detail.answers?.["location.locality"]?.value ?? "",
              ),
              address: String(
                detail.answers?.["location.address_line1"]?.value ?? "",
              ),
              claims: claims.filter(
                (claim) =>
                  !detail.answers?.[claim.attributeKey] ||
                  !equal(detail.answers[claim.attributeKey].value, claim.value),
              ),
              fetchPage,
              readPdf,
            })
          : null;
      if (evidence) report.sourceFailures.push(...evidence.failures);
      const decisions: PipelineDecision[] = [],
        accepted: ReviewedResearchClaim[] = [];
      for (const claim of claims) {
        const current = detail.answers?.[claim.attributeKey];
        if (
          current?.visibility === "PUBLIC" &&
          current.knowledgeState === claim.knowledgeState &&
          equal(current.value, claim.value)
        ) {
          decisions.push({
            attributeKey: claim.attributeKey,
            outcome: "UNCHANGED",
            reason: "CURRENT_VALUE_IDENTICAL",
          });
          continue;
        }
        if (
          assessments &&
          claim.attributeKey === "contact.website" &&
          current?.value &&
          page
        ) {
          const normalize = (url: string) =>
            new URL(url).href.replace(/\/$/u, "");
          if (
            typeof claim.value === "string" &&
            [website?.value, page.url, ...(page.redirectedFrom ?? [])]
              .filter((url): url is string => typeof url === "string")
              .map(normalize)
              .includes(normalize(claim.value))
          ) {
            decisions.push({
              attributeKey: claim.attributeKey,
              outcome: "UNCHANGED",
              reason: "OBSERVED_WEBSITE_REDIRECT_EQUIVALENT",
            });
            continue;
          }
        }
        if (current && !assessments) {
          decisions.push({
            attributeKey: claim.attributeKey,
            outcome: "REVIEW",
            reason: "EXISTING_VALUE_PROTECTED",
          });
          continue;
        }
        if (!detail.actor?.allowedAttributeKeys?.includes(claim.attributeKey)) {
          decisions.push({
            attributeKey: claim.attributeKey,
            outcome: "REVIEW",
            reason: "ATTRIBUTE_NOT_AUTHORIZED",
          });
          continue;
        }
        if (!page || typeof website?.value !== "string") {
          decisions.push({
            attributeKey: claim.attributeKey,
            outcome: "REVIEW",
            reason: SAFE_RESEARCH_KEYS.includes(claim.attributeKey)
              ? report.sourceFailures.length
                ? "OFFICIAL_SOURCE_UNAVAILABLE"
                : "OFFICIAL_SOURCE_NOT_VERIFIED"
              : "FIELD_REQUIRES_REVIEW",
          });
          continue;
        }
        if (assessments && evidence) {
          const proof = proveResearchEvidence({
            claim,
            assessment: assessments.find(
              (a) => a.attributeKey === claim.attributeKey,
            ),
            evidence,
            current,
            website: website.value,
            page,
            claims,
            now: now(),
          });
          decisions.push({
            attributeKey: claim.attributeKey,
            outcome: proof.eligible ? "AUTO_READY" : "REVIEW",
            reason: proof.reason,
            uncertainty: proof.uncertainty,
            explanation: proof.explanation,
            sourceHash: proof.sourceHash,
            sourceUrl: proof.url,
          });
          if (proof.eligible && proof.source)
            accepted.push({
              ...claim,
              source: proof.source,
              supportingSources: proof.supportingSources ?? [],
              supersedesClaimId: current?.claimId ?? null,
            });
          continue;
        }
        const proof = proveSafeResearchProperty({
          page,
          officialWebsite: website.value,
          name: detail.name,
          locality:
            typeof detail.answers?.["location.locality"]?.value === "string"
              ? (detail.answers["location.locality"].value as string)
              : null,
          address:
            typeof detail.answers?.["location.address_line1"]?.value ===
            "string"
              ? (detail.answers["location.address_line1"].value as string)
              : null,
          claim,
          now: now(),
        });
        if (!proof.eligible) {
          decisions.push({
            attributeKey: claim.attributeKey,
            outcome: "REVIEW",
            reason: proof.reason,
          });
          continue;
        }
        accepted.push({
          ...claim,
          source: {
            url: proof.url!,
            observedAt: proof.observedAt!,
            trust: "OFFICIAL_PRIMARY",
            evidence: proof.evidence!,
          },
          supportingSources: [],
          supersedesClaimId: null,
        });
        decisions.push({
          attributeKey: claim.attributeKey,
          outcome: "AUTO_READY",
          reason: proof.reason,
          sourceHash: proof.sourceHash,
          sourceUrl: proof.url,
        });
      }
      job = {
        ...job,
        metadata: { ...job.metadata, phase: "PROVED", accepted, decisions },
      };
      await repository.checkpoint(job, lease); // durable proof before any canonical write
    }
    report.decisions = job.metadata.decisions;
    report.unchanged = report.decisions
      .filter((d) => d.outcome === "UNCHANGED")
      .map((d) => d.attributeKey);
    report.review = report.decisions.filter((d) => d.outcome === "REVIEW");
    const mentioned = new Set(
      [...claims, ...report.unresolved].map((item) => item.attributeKey),
    );
    for (const key of assessments
      ? COMPLETE_RESEARCH_KEYS
      : BASIC_RESEARCH_KEYS)
      if (!mentioned.has(key) && !detail.answers?.[key])
        report.unresolved.push({
          attributeKey: key,
          reason:
            "Dieses Grundfeld wurde nicht recherchiert oder nicht mit einem Ergebnis geliefert.",
        });
    if (job.metadata.accepted.length) {
      // Re-read and the existing transactional RPC rechecks the latest claim ID
      // while holding the Spot row lock. Corrections bind the exact superseded claim.
      latest = await repository.readSpot(exported.spotId);
      if (
        latest.name !== detail.name ||
        ["contact.website", "location.locality", "location.address_line1"].some(
          (key) =>
            !equal(
              latest.answers?.[key]?.value ?? null,
              detail.answers?.[key]?.value ?? null,
            ),
        )
      )
        throw new Error("research_pipeline_identity_drift");
      const alreadyPresent = job.metadata.accepted.every((claim) => {
        const saved = latest.answers?.[claim.attributeKey];
        return (
          saved?.visibility === "PUBLIC" &&
          saved.knowledgeState === claim.knowledgeState &&
          equal(saved.value, claim.value)
        );
      });
      if (
        !alreadyPresent &&
        latest.manifest?.manifestHash !== exported.manifestHash
      )
        throw new Error("research_pipeline_manifest_drift");
      if (
        !alreadyPresent &&
        job.metadata.accepted.some(
          (claim) => now() - Date.parse(claim.source.observedAt) > 300000,
        )
      )
        throw new Error("research_pipeline_proof_expired");
      writeAttempted = true;
      if (!alreadyPresent)
        await repository.importClaims(
          exported.spotId,
          document.batch.batchId,
          latest.manifest!.manifestHash!,
          job.metadata.accepted,
        );
      const rebuilt = await repository.rebuild(
        exported.spotId,
        `research:${document.batch.batchId}:${exported.spotId}:safe-rebuild`,
      );
      latest = await repository.readSpot(exported.spotId);
      if (
        !rebuilt.manifestHash ||
        latest.manifest?.manifestHash !== rebuilt.manifestHash ||
        latest.manifest.worldSnapshot?.spotId !== exported.spotId ||
        !equal(latest.manifest.worldSnapshot, rebuilt.worldSnapshot)
      )
        throw new Error("PROFILE_READBACK_FAILED");
      for (const claim of job.metadata.accepted) {
        const saved = latest.answers?.[claim.attributeKey];
        if (
          !saved?.claimId ||
          saved.visibility !== "PUBLIC" ||
          saved.knowledgeState !== claim.knowledgeState ||
          !equal(saved.value, claim.value)
        )
          throw new Error("FIELD_READBACK_FAILED");
      }
      report.stored = job.metadata.accepted.map((claim) => claim.attributeKey);
      report.saveState = "STORED_VERIFIED";
      report.manifestHash = rebuilt.manifestHash;
    }
    report.state =
      report.review.length || (!assessments && report.unresolved.length)
        ? "REVIEW_REQUIRED"
        : "COMPLETE";
  } catch (cause) {
    report.errors.push(
      cause instanceof Error ? cause.message : "PIPELINE_FAILED",
    );
    report.state = writeAttempted ? "SAVED_UNVERIFIED" : "FAILED";
    report.saveState = writeAttempted ? "SAVED_UNVERIFIED" : "NOT_WRITTEN";
  }
  report.completedAt = new Date(now()).toISOString();
  latest = await repository.readSpot(exported.spotId).catch(() => latest);
  const refreshed = report.errors.length
    ? document
    : currentDocument(document, latest);
  job = {
    ...job,
    document: refreshed,
    metadata: {
      ...job.metadata,
      phase: report.errors.length ? job.metadata.phase : "FINISHED",
      report,
    },
  };
  try {
    await repository.finish(job, lease, refreshed);
  } catch {
    if (writeAttempted)
      throw new ResearchSaveError(
        "Der Speicherstand konnte nach dem Schreibversuch nicht bestätigt werden. Bitte denselben Auftrag erneut laden.",
        "SAVED_UNVERIFIED",
      );
    throw new Error("research_pipeline_receipt_not_saved");
  }
  return { report, document: refreshed };
}
