// supabase/functions/semantic-spot-search/index.ts

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY: string;
};

type MatchRow = {
  spot_id: string;
  name: string;
  city: string | null;
  category_name: string | null;
  similarity: number;
  document_text: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_LIMIT = 12;

function getEnv(): Env {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
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
  return Math.max(1, Math.min(Math.floor(parsed), 30));
}

function embeddingToSqlVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
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

async function callMatchRpc(
  env: Env,
  args: {
    queryEmbedding: number[];
    city?: string | null;
    limit: number;
    excludeSpotIds: string[];
  },
): Promise<MatchRow[]> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/backyrd_match_spot_embeddings_v13`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_query_embedding: embeddingToSqlVector(args.queryEmbedding),
        p_city: args.city ?? null,
        p_limit: args.limit,
        p_exclude_spot_ids: args.excludeSpotIds,
      }),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase semantic match failed ${response.status}: ${
        text || response.statusText
      }`,
    );
  }

  if (!text) return [];
  return JSON.parse(text) as MatchRow[];
}

function buildQueryText(input: {
  query: string;
  city?: string | null;
  moodA?: string | null;
  moodB?: string | null;
}): string {
  const parts = [
    input.query,
    input.city ? `City: ${input.city}` : null,
    input.moodA ? `Mood A: ${input.moodA}` : null,
    input.moodB ? `Mood B: ${input.moodB}` : null,
  ].filter(Boolean);

  return parts.join("\n");
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

    const query = String(body.query ?? "").trim();
    const city = body.city ? String(body.city).trim() : null;
    const moodA = body.moodA ? String(body.moodA).trim() : null;
    const moodB = body.moodB ? String(body.moodB).trim() : null;
    const limit = sanitizeLimit(body.limit);
    const excludeSpotIds = Array.isArray(body.excludeSpotIds)
      ? body.excludeSpotIds.map(String).filter(Boolean)
      : [];

    if (!query && !moodA && !moodB) {
      return jsonResponse(
        {
          ok: false,
          error: "Missing query, moodA or moodB",
        },
        400,
      );
    }

    const queryText = buildQueryText({
      query: query || `${moodA ?? ""} ${moodB ?? ""}`.trim(),
      city,
      moodA,
      moodB,
    });

    const embedding = await createEmbedding(env, queryText);

    const matches = await callMatchRpc(env, {
      queryEmbedding: embedding,
      city,
      limit,
      excludeSpotIds,
    });

    return jsonResponse({
      ok: true,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      queryText,
      city,
      limit,
      count: matches.length,
      matches: matches.map((match) => ({
        spot_id: match.spot_id,
        name: match.name,
        city: match.city,
        category_name: match.category_name,
        similarity: Number(match.similarity),
        preview: match.document_text.slice(0, 500),
      })),
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});