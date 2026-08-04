import { createClient } from "npm:@supabase/supabase-js@2";
import {
  orchestrate,
  type ImageSymbolSignal,
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

function getResponseOutputText(raw: any): string {
  if (typeof raw?.output_text === "string") {
    return raw.output_text;
  }

  const chunks: string[] = [];

  for (const output of raw?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (
        content?.type === "output_text" &&
        typeof content?.text === "string"
      ) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n");
}

function safeJsonParse(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(value.slice(start, end + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

async function evaluateProhibitedSymbols(input: {
  openaiKey: string;
  imageUrls: string[];
}) {
  const empty: ImageSymbolSignal = {
    checked: false,
    matched: false,
    category: "none",
    confidence: 0,
    symbols: [],
    context: "none",
    reasonCodes: [],
  };

  if (input.imageUrls.length === 0) {
    return {
      signal: empty,
      raw: null,
      latency: 0,
      error: null,
    };
  }

  const started = Date.now();

  const imageParts = input.imageUrls
    .slice(0, 4)
    .map((url) => ({
      type: "input_image",
      image_url: url,
      detail: "low",
    }));

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        reasoning: {
          effort: "minimal",
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are a visual safety classifier. Detect only clearly visible prohibited extremist, terrorist, genocidal, racist, or hate-group symbols and insignia. Consider context. Historical, educational, journalistic, critical, museum, documentary, anti-extremist, or satirical use must not be treated as supportive. Do not infer ideology from ordinary flags, uniforms, religious symbols, tattoos, text, colors, or gestures unless the prohibited symbol itself is clearly visible. Return JSON only.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  'Classify the supplied image(s). Return exactly: {"matched":boolean,"category":"none|extremist_symbol|hate_symbol|terrorist_symbol|prohibited_symbol","confidence":number,"symbols":string[],"context":"none|supportive|neutral|historical|educational|critical|satirical|unclear","reason_codes":string[]}. Set matched=true only when a prohibited symbol is clearly visible and the context is supportive, neutral display, or unclear. Use confidence from 0 to 1.',
              },
              ...imageParts,
            ],
          },
        ],
        max_output_tokens: 350,
      }),
    },
  );

  const raw = await response.json().catch(() => null);
  const latency = Date.now() - started;

  if (!response.ok) {
    return {
      signal: empty,
      raw,
      latency,
      error:
        raw?.error?.code ??
        "symbol_classifier_provider_error",
    };
  }

  const parsed = safeJsonParse(
    getResponseOutputText(raw),
  );

  if (!parsed) {
    return {
      signal: empty,
      raw,
      latency,
      error: "symbol_classifier_invalid_json",
    };
  }

  const allowedCategories = new Set([
    "none",
    "extremist_symbol",
    "hate_symbol",
    "terrorist_symbol",
    "prohibited_symbol",
  ]);

  const allowedContexts = new Set([
    "none",
    "supportive",
    "neutral",
    "historical",
    "educational",
    "critical",
    "satirical",
    "unclear",
  ]);

  const category = allowedCategories.has(parsed.category)
    ? parsed.category
    : "none";

  const context = allowedContexts.has(parsed.context)
    ? parsed.context
    : "unclear";

  const confidence = Math.max(
    0,
    Math.min(1, Number(parsed.confidence ?? 0)),
  );

  const signal: ImageSymbolSignal = {
    checked: true,
    matched: Boolean(parsed.matched),
    category,
    confidence,
    symbols: Array.isArray(parsed.symbols)
      ? parsed.symbols.map(String).slice(0, 10)
      : [],
    context,
    reasonCodes: Array.isArray(parsed.reason_codes)
      ? parsed.reason_codes.map(String).slice(0, 20)
      : [],
  };

  return {
    signal,
    raw,
    latency,
    error: null,
  };
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

  const internalWorkerSecret =
    Deno.env.get("SAFETY_TEXT_WORKER_SECRET") ?? "";

  const suppliedWorkerSecret =
    req.headers.get("x-backyrd-worker-secret") ?? "";

  const isInternalWorker =
    internalWorkerSecret.length >= 32 &&
    suppliedWorkerSecret === internalWorkerSecret;

  const admin = createClient(supabaseUrl, serviceKey);

  let authenticatedUserId: string | null = null;

  if (!isInternalWorker) {
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

    const { data: userData } =
      await userClient.auth.getUser();

    authenticatedUserId = userData.user?.id ?? null;

    if (!authenticatedUserId) {
      return json(
        { ok: false, error: "not_authenticated" },
        401,
      );
    }
  }

  const body = await req.json().catch(() => null);
  const caseId = body?.caseId;
  const evaluationSource =
    typeof body?.source === "string"
      ? body.source
      : "interactive";

  const isTextOnlyEvaluation =
    evaluationSource ===
      "automatic_text_queue_v1";

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

  if (!content) {
    return json(
      { ok: false, error: "content_not_found" },
      404,
    );
  }

  if (
    !isInternalWorker &&
    content.actor_user_id !== authenticatedUserId
  ) {
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", authenticatedUserId)
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

  const imageUrls =
    isTextOnlyEvaluation
      ? []
      : Array.isArray(content.image_urls)
        ? content.image_urls
            .map(String)
            .filter(Boolean)
            .slice(0, 4)
        : [];

  const inputs: unknown[] = [];

  if (content.text_content) {
    inputs.push({
      type: "text",
      text: content.text_content,
    });
  }

  for (const url of imageUrls) {
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

  const moderationPromise = fetch(
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

  const symbolPromise = evaluateProhibitedSymbols({
    openaiKey,
    imageUrls,
  });

  const [moderationResponse, symbolEvaluation] =
    await Promise.all([
      moderationPromise,
      symbolPromise,
    ]);

  const raw = await moderationResponse
    .json()
    .catch(() => null);
  const latency = Date.now() - started;

  if (!moderationResponse.ok || !raw?.results?.[0]) {
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
    hasImages: imageUrls.length > 0,
    imageSymbolSignal: symbolEvaluation.signal,
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

  if (imageUrls.length > 0) {
    await admin.from("safety_signals").insert({
      case_id: caseId,
      signal_type: "image_symbol_classifier",
      provider: "openai",
      model: "gpt-5-mini",
      model_version:
        symbolEvaluation.raw?.model ?? null,
      categories: {
        prohibited_symbol:
          symbolEvaluation.signal.matched,
        category:
          symbolEvaluation.signal.category,
        context:
          symbolEvaluation.signal.context,
        symbols:
          symbolEvaluation.signal.symbols,
      },
      scores: {
        prohibited_symbol:
          symbolEvaluation.signal.matched
            ? symbolEvaluation.signal.confidence
            : 0,
        no_prohibited_symbol:
          symbolEvaluation.signal.matched
            ? 0
            : symbolEvaluation.signal.confidence,
      },
      flagged:
        symbolEvaluation.signal.matched,
      raw_response: symbolEvaluation.raw,
      latency_ms: symbolEvaluation.latency,
      error_code: symbolEvaluation.error,
    });
  }

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
          `evaluation_source=${evaluationSource}`,
          `text_only=${isTextOnlyEvaluation}`,
          `has_images=${imageUrls.length > 0}`,
          `symbol_checked=${symbolEvaluation.signal.checked}`,
          `symbol_matched=${symbolEvaluation.signal.matched}`,
          `symbol_context=${symbolEvaluation.signal.context}`,
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
        image_count: imageUrls.length,
        image_symbol_signal:
          symbolEvaluation.signal,
      },
    });

  return json({
    ok: true,
    caseId,
    decision,
    model: raw.model,
    policyVersion: policy.version,
    shadow: policy.status === "shadow",
    imageAnalysis: {
      imageCount: imageUrls.length,
      symbolSignal: symbolEvaluation.signal,
      symbolError: symbolEvaluation.error,
    },
  });
});
