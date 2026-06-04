// supabase/functions/generate-spot-embeddings/index.ts

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY: string;
};

type MlDocumentRow = {
  spot_id: string;
  document_text: string;
  document_version: string;
  source_hash: string;
  attempts?: number;
};

type ProcessedRow = {
  spot_id: string;
  text_length: number;
  status: "embedded" | "failed" | "dry_run";
  error?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_LIMIT = 25;

function getEnv(): Env {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  return {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function sanitizeLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(parsed), 100));
}

function embeddingToSqlVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown_error";
  }
}

async function supabaseRest<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase REST failed ${response.status}: ${text || response.statusText}`,
    );
  }

  if (!text) return [] as T;
  return JSON.parse(text) as T;
}

async function supabaseRpc<T>(
  env: Env,
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase RPC ${functionName} failed ${response.status}: ${
        text || response.statusText
      }`,
    );
  }

  if (!text) return null as T;
  return JSON.parse(text) as T;
}

async function fetchQueuedDocuments(
  env: Env,
  limit: number,
): Promise<MlDocumentRow[]> {
  const rows = await supabaseRpc<MlDocumentRow[]>(
    env,
    "backyrd_claim_spot_embedding_jobs_v13",
    { p_limit: limit },
  );

  return rows ?? [];
}

async function fetchLegacyPendingDocuments(
  env: Env,
  limit: number,
): Promise<MlDocumentRow[]> {
  const rows = await supabaseRpc<MlDocumentRow[]>(
    env,
    "backyrd_get_pending_spot_embedding_documents_v13",
    { p_limit: limit },
  );

  return rows ?? [];
}

async function createEmbedding(env: Env, input: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      `OpenAI embeddings failed ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  const embedding = payload?.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Invalid embedding length: expected ${EMBEDDING_DIMENSIONS}, got ${
        Array.isArray(embedding) ? embedding.length : "non-array"
      }`,
    );
  }

  return embedding;
}

async function upsertEmbedding(
  env: Env,
  row: MlDocumentRow,
  embedding: number[],
): Promise<void> {
  await supabaseRest(env, "backyrd_spot_embeddings_v1?on_conflict=spot_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      spot_id: row.spot_id,
      embedding: embeddingToSqlVector(embedding),
      model_name: EMBEDDING_MODEL,
      model_dimensions: EMBEDDING_DIMENSIONS,
      document_version: row.document_version,
      source_hash: row.source_hash,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function markJobDone(env: Env, row: MlDocumentRow): Promise<void> {
  await supabaseRpc(env, "backyrd_mark_spot_embedding_job_done_v13", {
    p_spot_id: row.spot_id,
    p_source_hash: row.source_hash,
  });
}

async function markJobFailed(
  env: Env,
  row: MlDocumentRow,
  message: string,
): Promise<void> {
  await supabaseRpc(env, "backyrd_mark_spot_embedding_job_failed_v13", {
    p_spot_id: row.spot_id,
    p_error: message,
  });
}

async function processRow(
  env: Env,
  row: MlDocumentRow,
  useQueue: boolean,
): Promise<ProcessedRow> {
  try {
    if (!row.document_text || row.document_text.trim().length === 0) {
      throw new Error("empty_document_text");
    }

    const embedding = await createEmbedding(env, row.document_text);
    await upsertEmbedding(env, row, embedding);

    if (useQueue) {
      await markJobDone(env, row);
    }

    return {
      spot_id: row.spot_id,
      text_length: row.document_text.length,
      status: "embedded",
    };
  } catch (error) {
    const message = errorMessage(error);

    if (useQueue) {
      try {
        await markJobFailed(env, row, message);
      } catch {
        // Avoid hiding the original embedding error.
      }
    }

    return {
      spot_id: row.spot_id,
      text_length: row.document_text?.length ?? 0,
      status: "failed",
      error: message,
    };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const env = getEnv();

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const limit = sanitizeLimit(body.limit);
    const dryRun = Boolean(body.dryRun);

    // Default: new queue mode.
    // Fallback: legacy pending documents mode, useful for old docs without queue rows.
    const mode =
      typeof body.mode === "string" && body.mode.trim().length > 0
        ? body.mode.trim()
        : "queue";

    const useLegacy = mode === "legacy";
    const useQueue = !useLegacy;

    const pending = useLegacy
      ? await fetchLegacyPendingDocuments(env, limit)
      : await fetchQueuedDocuments(env, limit);

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dryRun: true,
        mode: useLegacy ? "legacy" : "queue",
        pending_count: pending.length,
        pending: pending.map((row) => ({
          spot_id: row.spot_id,
          document_version: row.document_version,
          text_length: row.document_text.length,
          source_hash: row.source_hash,
          attempts: row.attempts ?? null,
        })),
      });
    }

    const processed: ProcessedRow[] = [];

    for (const row of pending) {
      const result = await processRow(env, row, useQueue);
      processed.push(result);
    }

    const embeddedCount = processed.filter((row) => row.status === "embedded")
      .length;
    const failedCount = processed.filter((row) => row.status === "failed")
      .length;

    return jsonResponse({
      ok: failedCount === 0,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      mode: useLegacy ? "legacy" : "queue",
      requested_limit: limit,
      processed_count: processed.length,
      embedded_count: embeddedCount,
      failed_count: failedCount,
      processed,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: errorMessage(error),
      },
      500,
    );
  }
});