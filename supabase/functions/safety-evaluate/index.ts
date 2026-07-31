import { createClient } from "npm:@supabase/supabase-js@2";
import {
  orchestrate,
  type OpenAIModerationResult,
  type SafetyPolicy,
} from "../_shared/safety/orchestrator.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json(
      { ok: false, error: "method_not_allowed" },
      405,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !serviceKey || !openaiKey) {
    return json(
      { ok: false, error: "missing_server_secret" },
      500,
    );
  }

  const authHeader =
    req.headers.get("Authorization") ?? "";

  const userClient = createClient(
    supabaseUrl,
    serviceKey,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    },
  );

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData } =
    await userClient.auth.getUser();

  if (!userData.user) {
    return json(
      { ok: false, error: "not_authenticated" },
      401,
    );
  }

  const body = await req.json().catch(() => null);
  const caseId = body?.caseId;

  if (!caseId) {
    return json(
      { ok: false, error: "case_id_required" },
      400,
    );
  }

  const { data: caseRow, error: caseError } =
    await admin
      .from("safety_cases")
      .select(`
        id,
        case_status,
        policy_version_id,
        content:safety_content_items(
          id,
          content_type,
          text_content,
          image_urls,
          actor_user_id
        ),
        policy:safety_policy_versions(
          id,
          version,
          status,
          policy
        )
      `)
      .eq("id", caseId)
      .single();

  if (caseError || !caseRow) {
    return json(
      { ok: false, error: "case_not_found" },
      404,
    );
  }

  const content = Array.isArray(caseRow.content)
    ? caseRow.content[0]
    : caseRow.content;

  if (
    !content ||
    content.actor_user_id !== userData.user.id
  ) {
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.is_admin) {
      return json(
        { ok: false, error: "forbidden" },
        403,
      );
    }
  }

  await admin
    .from("safety_cases")
    .update({
      case_status: "evaluating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);

  const inputs: unknown[] = [];

  if (content.text_content) {
    inputs.push({
      type: "text",
      text: content.text_content,
    });
  }

  for (const url of content.image_urls ?? []) {
    inputs.push({
      type: "image_url",
      image_url: { url },
    });
  }

  if (!inputs.length) {
    return json(
      { ok: false, error: "empty_content" },
      400,
    );
  }

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
        input:
          inputs.length === 1 &&
          (inputs[0] as { type?: string })?.type === "text"
            ? (inputs[0] as { text: string }).text
            : inputs,
      }),
    },
  );

  const raw = await response.json().catch(() => null);
  const latency = Date.now() - started;

  if (!response.ok || !raw?.results?.[0]) {
    await admin.from("safety_signals").insert({
      case_id: caseId,
      signal_type: "specialized_moderation",
      provider: "openai",
      model: "omni-moderation-latest",
      latency_ms: latency,
      error_code:
        raw?.error?.code ?? "provider_error",
      raw_response: raw,
    });

    await admin
      .from("safety_cases")
      .update({
        case_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    return json(
      {
        ok: false,
        error: "moderation_provider_error",
        provider: raw,
      },
      502,
    );
  }

  const result =
    raw.results[0] as OpenAIModerationResult;

  const policyRelation = Array.isArray(caseRow.policy)
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
    result,
    policy,
    contentType: content.content_type,
    textContent: content.text_content,
  });

  await admin.from("safety_signals").insert({
    case_id: caseId,
    signal_type: "specialized_moderation",
    provider: "openai",
    model:
      raw.model ?? "omni-moderation-latest",
    model_version: raw.model ?? null,
    categories: result.categories,
    scores: result.category_scores,
    flagged: result.flagged,
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
      final_confidence: decision.confidence,
      decision_source:
        policy.status === "shadow"
          ? "automated_shadow"
          : "automated_policy",
      explanation_code:
        decision.reasonCodes[0],
      explanation_public:
        decision.caseStatus === "needs_review"
          ? "Der Inhalt wurde veröffentlicht und wird vorsorglich geprüft."
          : null,
      explanation_internal:
        [
          `Recommended=${decision.recommendedAction}`,
          `policy=${policy.version ?? "unknown"}`,
          `policy_category=${decision.policyCategory}`,
          `subcategory=${decision.subcategory}`,
        ].join("; "),
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);

  await admin
    .from("safety_decision_events")
    .insert({
      case_id: caseId,
      action: decision.finalAction,
      category: decision.category,
      severity: decision.severity,
      confidence: decision.confidence,
      source:
        policy.status === "shadow"
          ? "automated_shadow"
          : "automated_policy",
      policy_snapshot: policy,
      reason_codes: decision.reasonCodes,
      metadata: {
        recommended_action:
          decision.recommendedAction,
        policy_category:
          decision.policyCategory,
        policy_subcategory:
          decision.subcategory,
        policy_version:
          policy.version ?? null,
      },
    });

  return json({
    ok: true,
    caseId,
    decision,
    model: raw.model,
    policyVersion: policy.version,
    shadow: policy.status === "shadow",
  });
});
