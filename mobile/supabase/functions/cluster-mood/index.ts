// supabase/functions/cluster-mood/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "cluster-mood-v5-rules-plus-ai";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Payload = { token_id: number; token: string; token_norm: string };

function normSpaces(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

async function setJob(tokenId: number, status: string, lastError?: string) {
  const { data: job } = await supabase
    .from("mood_cluster_jobs")
    .select("tries")
    .eq("token_id", tokenId)
    .maybeSingle();

  const tries = (job?.tries ?? 0) + 1;

  await supabase
    .from("mood_cluster_jobs")
    .update({
      status,
      tries,
      last_error: lastError ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("token_id", tokenId);
}

function extractOutputText(responsesJson: any): string {
  if (typeof responsesJson?.output_text === "string" && responsesJson.output_text.length) {
    return responsesJson.output_text;
  }
  return JSON.stringify(responsesJson);
}

function tryParseJsonObject(s: string): any | null {
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object") return obj;
  } catch {}

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(s.slice(start, end + 1));
      if (obj && typeof obj === "object") return obj;
    } catch {}
  }
  return null;
}

/**
 * Tiny rule layer for obvious cases.
 * This is NOT a fixed mood system — it's guardrails to avoid "misc" for clear semantics.
 */
function ruleCluster(tokenNorm: string): { cluster: string; confidence: number } | null {
  const t = tokenNorm;

  // relaxed-family
  if (["relaxed", "entspannt", "chill", "chillig", "relax"].includes(t)) {
    return { cluster: "chillig", confidence: 0.95 };
  }

  // cozy-family
  if (["cozy", "gemütlich", "gemuetlich", "kuschelig"].includes(t)) {
    return { cluster: "gemütlich", confidence: 0.95 };
  }

  // stylish-family
  if (["fancy", "chic", "stylish", "schick"].includes(t)) {
    return { cluster: "stylish", confidence: 0.9 };
  }

  // hyperlocal-family
  if (["hyperlocal", "lokal", "local"].includes(t)) {
    return { cluster: "lokal", confidence: 0.9 };
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as Payload;

    const tokenId = payload.token_id;
    const token = normSpaces(payload.token);
    const tokenNorm = normSpaces(payload.token_norm).toLowerCase();

    await setJob(tokenId, "processing", `${VERSION}: processing`);

    // 1) RULES FIRST
    const ruled = ruleCluster(tokenNorm);
    if (ruled) {
      const { error: rpcErr } = await supabase.rpc("upsert_cluster_and_map_token", {
        p_token_id: tokenId,
        p_cluster_name: ruled.cluster,
        p_confidence: ruled.confidence,
        p_source: "rule",
      });

      if (rpcErr) {
        await setJob(tokenId, "failed", `${VERSION}: rpc_error(rule): ${String(rpcErr.message ?? rpcErr)}`);
        return new Response(JSON.stringify({ ok: false, error: rpcErr, version: VERSION }), { status: 500 });
      }

      await setJob(tokenId, "done", `${VERSION}: done (rule ${ruled.cluster}, ${ruled.confidence})`);
      return new Response(
        JSON.stringify({ ok: true, token_id: tokenId, cluster_name: ruled.cluster, confidence: ruled.confidence, source: "rule", version: VERSION }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2) Load existing clusters for reuse
    const { data: clusters } = await supabase
      .from("mood_clusters")
      .select("name_norm")
      .order("name_norm", { ascending: true })
      .limit(200);

    const existingClusters = (clusters ?? []).map((c: any) => c.name_norm).filter(Boolean);

    // 3) AI for long tail
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content:
              "Du bist ein Clustering-Service für Mood-Tokens einer App.\n\n" +
              "Antworte NUR mit gültigem JSON, ohne Markdown.\n" +
              'Schema: {"cluster_name":"<lowercase 1-3 words>","confidence":0.0-1.0}.\n\n' +
              "Wähle nach Möglichkeit EINEN Cluster aus dieser Liste (reuse!):\n" +
              JSON.stringify(existingClusters) +
              "\n\n" +
              "Wenn keiner passt, erfinde einen neuen, kurzen Oberbegriff.\n" +
              "Nur wenn wirklich absolut unklar: cluster_name='misc' und confidence=0.4.\n\n" +
              "Wichtig: 'relaxed' ist NICHT unklar und sollte zu 'chillig' passen.",
          },
          {
            role: "user",
            content:
              `Token: "${token}"\n\n` +
              "Mappe den Token auf einen passenden Oberbegriff.\n\n" +
              "Beispiele:\n" +
              "- cozy, gemütlich, kuschelig -> gemütlich\n" +
              "- fancy, chic, stylish -> stylish\n" +
              "- relaxed, entspannt, chill -> chillig\n" +
              "- hyperlocal -> lokal\n",
          },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      await setJob(tokenId, "failed", `${VERSION}: openai_error: ${errText}`);
      return new Response(JSON.stringify({ ok: false, error: errText, version: VERSION }), { status: 500 });
    }

    const data = await r.json();
    const out = extractOutputText(data);
    const parsed = tryParseJsonObject(out);

    let clusterName = "misc";
    let confidence = 0.4;

    if (parsed?.cluster_name) clusterName = normSpaces(String(parsed.cluster_name)).toLowerCase();
    if (parsed?.confidence !== undefined) {
      const v = Number(parsed.confidence);
      if (Number.isFinite(v)) confidence = Math.max(0, Math.min(1, v));
    }

    const { error: rpcErr } = await supabase.rpc("upsert_cluster_and_map_token", {
      p_token_id: tokenId,
      p_cluster_name: clusterName,
      p_confidence: confidence,
      p_source: "ai",
    });

    if (rpcErr) {
      await setJob(tokenId, "failed", `${VERSION}: rpc_error(ai): ${String(rpcErr.message ?? rpcErr)}`);
      return new Response(JSON.stringify({ ok: false, error: rpcErr, version: VERSION }), { status: 500 });
    }

    await setJob(tokenId, "done", `${VERSION}: done (ai ${clusterName}, ${confidence})`);

    return new Response(
      JSON.stringify({ ok: true, token_id: tokenId, cluster_name: clusterName, confidence, source: "ai", version: VERSION }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), version: VERSION }), { status: 500 });
  }
});
