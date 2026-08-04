import { createClient } from "npm:@supabase/supabase-js@2";
import {
  orchestrate,
  type OpenAIModerationResult,
  type SafetyPolicy,
} from "../_shared/safety/orchestrator.ts";

type Job = {
  job_id: string;
  case_id: string;
  content_item_id: string;
  image_index: number;
  image_reference: string;
  attempt_count: number;
};

const headers = {
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

type PreparedImage = {
  dataUrl: string;
  bucket: string | null;
  storagePath: string | null;
  mime: string;
  byteLength: number;
};

function storageBucketFor(
  entityType: string,
): string | null {
  switch (entityType) {
    case "social_post":
      return "social-post-media";
    case "review":
      return "review-photos";
    case "profile":
      return "profile-photos";
    case "spot_photo":
      return "spot-photos";
    default:
      return null;
  }
}

function parseSupabaseStorageUrl(
  value: string,
): { bucket: string; path: string } | null {
  try {
    const url = new URL(value);
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/authenticated/",
    ];

    const marker = markers.find((candidate) =>
      url.pathname.includes(candidate)
    );

    if (!marker) {
      return null;
    }

    const remainder =
      url.pathname.split(marker)[1] ?? "";
    const separator = remainder.indexOf("/");

    if (separator <= 0) {
      return null;
    }

    return {
      bucket: decodeURIComponent(
        remainder.slice(0, separator),
      ),
      path: remainder
        .slice(separator + 1)
        .split("/")
        .map(decodeURIComponent)
        .join("/"),
    };
  } catch {
    return null;
  }
}

function sniffMime(
  bytes: Uint8Array,
  declared: string | null,
): string | null {
  const normalized =
    declared?.split(";")[0].trim().toLowerCase() ?? "";

  if ([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ].includes(normalized)) {
    return normalized;
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (signature === "GIF87a" || signature === "GIF89a") {
    return "image/gif";
  }

  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  return btoa(binary);
}

async function prepareImage(input: {
  admin: ReturnType<typeof createClient>;
  entityType: string;
  reference: string;
}): Promise<PreparedImage> {
  const parsed = parseSupabaseStorageUrl(input.reference);
  const bucket = parsed?.bucket ?? storageBucketFor(input.entityType);
  const storagePath = parsed?.path ?? (bucket ? input.reference : null);

  let blob: Blob;

  if (bucket && storagePath) {
    const { data, error } = await input.admin.storage
      .from(bucket)
      .download(storagePath);

    if (error || !data) {
      const message = error?.message ?? "unknown_storage_error";
      if (/not found|does not exist|404/i.test(message)) {
        throw new Error(`storage_object_missing:${bucket}:${message}`);
      }
      throw new Error(`storage_download_failed:${bucket}:${message}`);
    }

    blob = data;
  } else {
    const response = await fetch(input.reference, {
      headers: {
        Accept: "image/jpeg,image/png,image/webp,image/gif",
      },
    });

    if (!response.ok) {
      throw new Error(`external_image_download_failed:${response.status}`);
    }

    blob = await response.blob();
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = sniffMime(bytes, blob.type || null);

  if (!mime) {
    throw new Error(
      `unsupported_prepared_format:${blob.type || "unknown"}`,
    );
  }

  return {
    dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
    bucket: bucket ?? null,
    storagePath,
    mime,
    byteLength: bytes.length,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(
      { error: "method_not_allowed" },
      405,
    );
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");

  const openaiKey =
    Deno.env.get("OPENAI_API_KEY");

  const workerSecret =
    Deno.env.get("SAFETY_IMAGE_WORKER_SECRET");

  if (
    !supabaseUrl ||
    !serviceKey ||
    !openaiKey ||
    !workerSecret
  ) {
    return json(
      { error: "worker_environment_missing" },
      500,
    );
  }

  const suppliedSecret =
    request.headers.get(
      "x-backyrd-worker-secret",
    ) ?? "";

  if (suppliedSecret !== workerSecret) {
    return json(
      { error: "unauthorized" },
      401,
    );
  }

  const admin = createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const workerId = crypto.randomUUID();

  const { data, error } = await admin.rpc(
    "safety_claim_image_jobs_v1",
    {
      p_worker_id: workerId,
      p_limit: 3,
    },
  );

  if (error) {
    return json(
      {
        ok: false,
        error: "claim_failed",
        detail: error.message,
      },
      500,
    );
  }

  const jobs = (data ?? []) as Job[];
  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    try {
      const { data: caseRow, error: caseError } =
        await admin
          .from("safety_cases")
          .select(`
            id,
            policy_version_id,
            content:safety_content_items(
              id,
              content_type,
              entity_type,
              text_content,
              actor_user_id
            ),
            policy:safety_policy_versions(
              id,
              version,
              status,
              policy
            )
          `)
          .eq("id", job.case_id)
          .single();

      if (caseError || !caseRow) {
        throw new Error(
          `case_not_found:${
            caseError?.message ?? "unknown"
          }`,
        );
      }

      const content =
        Array.isArray(caseRow.content)
          ? caseRow.content[0]
          : caseRow.content;

      if (!content) {
        throw new Error("content_not_found");
      }

      const prepared =
        await prepareImage({
          admin,
          entityType: content.entity_type,
          reference: job.image_reference,
        });

      const moderationInput: unknown[] = [];

      if (
        typeof content.text_content === "string" &&
        content.text_content.trim()
      ) {
        moderationInput.push({
          type: "text",
          text: content.text_content,
        });
      }

      moderationInput.push({
        type: "image_url",
        image_url: {
          url: prepared.dataUrl,
        },
      });

      const started = Date.now();

      const response = await fetch(
        "https://api.openai.com/v1/moderations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "omni-moderation-latest",
            input: moderationInput,
          }),
        },
      );

      const raw =
        await response.json().catch(() => null);

      const latency = Date.now() - started;

      if (!response.ok || !raw?.results?.[0]) {
        const code =
          raw?.error?.code ??
          "moderation_provider_error";

        throw new Error(
          `${code}:${
            raw?.error?.message ??
            "provider_error"
          }`,
        );
      }

      const moderation =
        raw.results[0] as OpenAIModerationResult;

      const policyRelation =
        Array.isArray(caseRow.policy)
          ? caseRow.policy[0]
          : caseRow.policy;

      const policyPayload =
        policyRelation?.policy ?? {};

      const policy = {
        ...policyPayload,
        policy_id:
          policyPayload.policy_id ??
          policyRelation?.id ??
          "fallback",
        version:
          policyPayload.version ??
          policyRelation?.version ??
          "fallback",
        status:
          policyPayload.status ??
          policyRelation?.status ??
          "shadow",
      } as SafetyPolicy;

      const decision = orchestrate({
        result: moderation,
        policy,
        contentType: content.content_type,
        textContent: content.text_content,
        hasImages: true,
      });

      await admin.from("safety_signals").insert({
        case_id: job.case_id,
        signal_type:
          "image_multimodal_moderation",
        provider: "openai",
        model:
          raw.model ??
          "omni-moderation-latest",
        model_version: raw.model ?? null,
        categories: moderation.categories,
        scores: moderation.category_scores,
        flagged: moderation.flagged,
        raw_response: raw,
        latency_ms: latency,
      });

      await admin
        .from("safety_cases")
        .update({
          case_status: decision.caseStatus,
          final_action: decision.finalAction,
          final_category: decision.category,
          final_severity: decision.severity,
          final_confidence:
            decision.confidence,
          decision_source:
            policy.status === "shadow"
              ? "automated_shadow"
              : "automated_policy",
          explanation_code:
            decision.reasonCodes[0],
          explanation_public:
            decision.caseStatus ===
              "needs_review"
              ? "Das Bild wird vorsorglich geprüft."
              : null,
          explanation_internal: [
            `image_index=${job.image_index}`,
            `bucket=${prepared.bucket ?? "external"}`,
            `storage_path=${
              prepared.storagePath ?? "external"
            }`,
            `recommended=${
              decision.recommendedAction
            }`,
            `policy=${policy.version}`,
          ].join("; "),
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", job.case_id);

      await admin
        .from("safety_decision_events")
        .insert({
          case_id: job.case_id,
          action: decision.finalAction,
          category: decision.category,
          severity: decision.severity,
          confidence: decision.confidence,
          source:
            policy.status === "shadow"
              ? "automated_shadow"
              : "automated_policy",
          policy_snapshot: policy,
          reason_codes:
            decision.reasonCodes,
          metadata: {
            evaluation_type:
              "image_multimodal",
            image_index: job.image_index,
            bucket: prepared.bucket,
            storage_path:
              prepared.storagePath,
            recommended_action:
              decision.recommendedAction,
          },
        });

      const { error: completeError } =
        await admin.rpc(
          "safety_complete_image_job_v1",
          {
            p_job_id: job.job_id,
            p_result: {
              flagged: moderation.flagged,
              category: decision.category,
              severity: decision.severity,
              confidence:
                decision.confidence,
              case_status:
                decision.caseStatus,
              bucket: prepared.bucket,
            },
          },
        );

      if (completeError) {
        throw new Error(
          `complete_failed:${
            completeError.message
          }`,
        );
      }

      results.push({
        job_id: job.job_id,
        ok: true,
        flagged: moderation.flagged,
        case_status:
          decision.caseStatus,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const permanent =
        message.startsWith(
          "storage_object_missing:",
        ) ||
        message.startsWith(
          "unsupported_prepared_format:",
        ) ||
        message.startsWith(
          "invalid_image_format:",
        );

      await admin.rpc(
        "safety_fail_image_job_v1",
        {
          p_job_id: job.job_id,
          p_error: message,
          p_permanent: permanent,
        },
      );

      results.push({
        job_id: job.job_id,
        ok: false,
        permanent,
        error: message,
      });
    }
  }

  return json({
    ok: true,
    worker_id: workerId,
    claimed: jobs.length,
    results,
  });
});
