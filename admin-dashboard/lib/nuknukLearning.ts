import {
  isRecord,
  parseLearningCase,
  LEARNING_VERSION,
  learningTopics,
  learningSplits,
  type LearningCase,
  type LearningRun,
  type LearningEvent,
  type LearningTopic,
  type LearningSplit,
} from "../../packages/shared/src/nuknuk-learning";
export * from "../../packages/shared/src/nuknuk-learning";
export type CoverageRow = {
  topic: LearningTopic;
  split: LearningSplit;
  families: number;
  situations: number;
  approved: number;
  review: number;
  blocked: number;
  synthetic: number;
};
export function parseLearningPage(v: unknown): {
  rows: LearningCase[];
  coverage: CoverageRow[];
  pageSize: number;
} {
  if (
    !isRecord(v) ||
    v.version !== LEARNING_VERSION ||
    !Array.isArray(v.rows) ||
    v.rows.length > 51 ||
    !Array.isArray(v.coverage) ||
    v.coverage.length > 24 ||
    v.pageSize !== 50
  )
    throw Error("learning_page_invalid");
  for (const x of v.coverage)
    if (
      !isRecord(x) ||
      !Object.hasOwn(learningTopics, String(x.topic)) ||
      !Object.hasOwn(learningSplits, String(x.split)) ||
      [
        "families",
        "situations",
        "approved",
        "review",
        "blocked",
        "synthetic",
      ].some((k) => !Number.isSafeInteger(x[k]) || Number(x[k]) < 0)
    )
      throw Error("learning_coverage_invalid");
  return {
    rows: v.rows.map(parseLearningCase),
    coverage: v.coverage as CoverageRow[],
    pageSize: 50,
  };
}
export function parseLearningDetail(v: unknown): {
  case: LearningCase;
  history: LearningEvent[];
} {
  if (
    !isRecord(v) ||
    !Array.isArray(v.history) ||
    v.history.length > 50 ||
    v.history.some(
      (e) =>
        !isRecord(e) ||
        !Number.isSafeInteger(e.id) ||
        typeof e.event !== "string" ||
        typeof e.note !== "string" ||
        typeof e.created_at !== "string",
    )
  )
    throw Error("learning_detail_invalid");
  return {
    case: parseLearningCase(v.case),
    history: v.history as LearningEvent[],
  };
}
export function parseLearningRuns(v: unknown): LearningRun[] {
  if (
    !Array.isArray(v) ||
    v.length > 50 ||
    v.some(
      (r) =>
        !isRecord(r) ||
        typeof r.id !== "string" ||
        typeof r.title !== "string" ||
        !["prepared", "exported", "reported"].includes(String(r.state)) ||
        !["TRAIN_DEV", "TEST"].includes(String(r.kind)) ||
        typeof r.manifest_hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(r.manifest_hash) ||
        !Number.isSafeInteger(r.case_count),
    )
  )
    throw Error("learning_runs_invalid");
  return v as LearningRun[];
}
export async function verifyLearningExport(
  v: unknown,
): Promise<{ manifestBytes: string; manifestHash: string }> {
  if (
    !isRecord(v) ||
    typeof v.manifestBytes !== "string" ||
    v.manifestBytes.length > 20000000 ||
    typeof v.manifestHash !== "string"
  )
    throw Error("learning_export_invalid");
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(v.manifestBytes),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== v.manifestHash) throw Error("learning_export_hash_mismatch");
  const manifest: unknown = JSON.parse(v.manifestBytes);
  if (
    !isRecord(manifest) ||
    manifest.version !== LEARNING_VERSION ||
    !Array.isArray(manifest.rows) ||
    manifest.rows.length < 1 ||
    manifest.rows.some(
      (r) =>
        !isRecord(r) ||
        !["TRAIN", "DEV", "TEST"].includes(String(r.split)) ||
        (manifest.kind === "TRAIN_DEV" && r.split === "TEST") ||
        (manifest.kind === "TEST" && r.split !== "TEST"),
    )
  )
    throw Error("learning_export_split_invalid");
  return { manifestBytes: v.manifestBytes, manifestHash: v.manifestHash };
}
export function parseLearningReport(
  v: unknown,
  expectedHash: string,
): Record<string, unknown> {
  if (
    !isRecord(v) ||
    v.version !== "backyrd.nuknuk-learning-report@1" ||
    v.manifestHash !== expectedHash ||
    !(
      (typeof v.adapterHash === "string" &&
        /^[a-f0-9]{64}$/.test(v.adapterHash)) ||
      (v.adapterHash === null &&
        v.kind === "TRAINING_RECEIPT" &&
        ["FAILED", "TIMED_OUT"].includes(String(v.trainingStatus)))
    ) ||
    !["LOCAL_INFERENCE_COMPARISON", "TRAINING_RECEIPT"].includes(
      String(v.kind),
    ) ||
    !Array.isArray(v.rows) ||
    v.rows.length > 2000 ||
    v.productionActivated !== false ||
    JSON.stringify(v).length > 900000
  )
    throw Error("learning_report_invalid");
  return v;
}
